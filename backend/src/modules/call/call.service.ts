import { Injectable, Inject, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../infrastructure/redis.service';
import { DynamoDBService } from '../../infrastructure/dynamodb.service';
import { MessageService } from '../chat/message.service';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    @Inject('CHIME_CLIENT') private readonly chime: ChimeSDKMeetingsClient,
    private readonly redis: RedisService,
    private readonly db: DynamoDBService,
    private readonly messageService: MessageService,
  ) {}

  async createMeeting(conversationId: string, callId: string, userEmail: string, type: 'audio' | 'video' = 'video') {
    this.logger.log(`Creating ${type} meeting for ${conversationId} (CallId: ${callId}) by ${userEmail}`);

    try {
      // [SENIOR] Idempotency check theo callId
      const existing = await this.redis.get(`call:session:${callId}`);
      if (existing) {
        this.logger.log(`Reusing existing session for CallId: ${callId}`);
        return JSON.parse(existing);
      }

      const meetingResponse = await this.chime.send(
        new CreateMeetingCommand({
          ClientRequestToken: uuidv4(),
          MediaRegion: process.env.AWS_REGION || 'ap-southeast-1',
          ExternalMeetingId: conversationId,
        }),
      );

      const attendeeResponse = await this.chime.send(
        new CreateAttendeeCommand({
          MeetingId: meetingResponse.Meeting?.MeetingId,
          ExternalUserId: userEmail,
        }),
      );

      const result = {
        meeting: meetingResponse.Meeting,
        attendee: attendeeResponse.Attendee,
        callType: type,
        initiatorEmail: userEmail, // [SENIOR] Fix reversed logic: lock the initiator
      };

      await this.redis.set(`call:session:${callId}`, JSON.stringify(result), 1800);
      // Đồng thời lưu vết cuộc gọi gần nhất của conversation để dễ cleanup
      await this.redis.set(`call:active:${conversationId}`, callId, 1800);
      return result;
    } catch (error) {
      this.logger.error(`AWS_CHIME_ERROR`, error.stack);
      throw new InternalServerErrorException(`AWS Chime Error: ${error.message}`);
    }
  }

  async joinMeeting(conversationId: string, callId: string, userEmail: string) {
    this.logger.log(`User ${userEmail} joining ${conversationId} (CallId: ${callId})`);
 
    try {
      const meetingData = await this.redis.get(`call:session:${callId}`);
      if (!meetingData) {
        this.logger.warn(`Redis session NOT FOUND for CallId: ${callId}`);
        throw new BadRequestException(`Meeting session not found for this call ID`);
      }

      const parsed = JSON.parse(meetingData);

      const attendeeResponse = await this.chime.send(
        new CreateAttendeeCommand({
          MeetingId: parsed.meeting.MeetingId,
          ExternalUserId: userEmail,
        }),
      );

      return {
        ...parsed,
        attendee: attendeeResponse.Attendee,
      };
    } catch (error) {
      if (error.name === 'NotFoundException') {
        this.logger.warn(`Stale meeting detected for ${conversationId}. Purging Redis.`);
        await this.redis.del(`call:${conversationId}`);
        throw new BadRequestException('Cuộc gọi này đã kết thúc hoặc không còn tồn tại.');
      }

      this.logger.error(`CALL_JOIN_FAIL for ${conversationId}`, error.stack);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(`AWS Join Error: ${error.message}`);
    }
  }

  async hangupMeeting(conversationId: string, callId: string, userEmail: string) {
    this.logger.log(`Hangup CallId: ${callId} (Conv: ${conversationId}) by ${userEmail}`);
    try {
      const sessionKey = `call:session:${callId}`;
      const meetingData = await this.redis.get(sessionKey);
      let session = null;
      if (meetingData) {
        session = JSON.parse(meetingData);
        if (session.meeting?.MeetingId) {
          this.logger.log(`[AWS] Deleting Chime Meeting: ${session.meeting.MeetingId}`);
          await this.chime.send(
            new DeleteMeetingCommand({ MeetingId: session.meeting.MeetingId }),
          );
        }
        await this.redis.del(sessionKey);
        await this.redis.del(`call:active:${conversationId}`);
        // [SENIOR] Clear start time after hangup
        await this.redis.del(`call:start:${callId}`);
      }
      return { success: true, session };
    } catch (error) {
      // Dù Chime lỗi vẫn xóa Redis để cleanup
      await this.redis.del(`call:active:${conversationId}`).catch(() => {});
      await this.redis.del(`call:start:${callId}`).catch(() => {});
      return { success: true, session: null };
    }
  }

  async getCallSession(callId: string) {
    const data = await this.redis.get(`call:session:${callId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * [SENIOR] Lưu mốc thời gian bắt đầu cuộc gọi để tính duration
   */
  async markCallStarted(callId: string) {
    const startTime = Date.now();
    await this.redis.set(`call:start:${callId}`, startTime.toString(), 3600);
    this.logger.log(`[Call-History] Call ${callId} started at ${startTime}`);
  }

  async getCallStartTime(callId: string): Promise<string | null> {
    return await this.redis.get(`call:start:${callId}`);
  }

  /**
   * [SENIOR] Chốt sổ cuộc gọi: Lưu DynamoDB + Gửi tin nhắn Chat
   */
  async finalizeCallHistory(data: {
    convId: string;
    callId: string;
    caller: string;
    receiver: string;
    status: 'MISSED' | 'REJECTED' | 'COMPLETED';
    callType: 'audio' | 'video';
  }) {
    const { convId, callId, caller, receiver, status, callType } = data;
    const now = Date.now();
    const timestamp = new Date().toISOString();

    // 1. Tính toán duration
    let durationSec = 0;
    if (status === 'COMPLETED') {
      const startStr = await this.redis.get(`call:start:${callId}`);
      if (startStr) {
        durationSec = Math.floor((now - parseInt(startStr)) / 1000);
      }
    }

    // 2. Format nội dung tin nhắn hệ thống theo chuẩn "Zalo/Messenger"
    let displayContent = '';
    const typeStr = callType === 'audio' ? 'thoại' : 'video';
    
    if (status === 'MISSED') {
      displayContent = `Cuộc gọi ${typeStr} lỡ`;
    } else if (status === 'REJECTED') {
      displayContent = `Cuộc gọi ${typeStr} bị từ chối`;
    } else {
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      displayContent = `Cuộc gọi ${typeStr} (${durationStr})`;
    }

    this.logger.log(`[Call-History] Finalizing: ${displayContent} | CallId: ${callId}`);

    try {
      // 3. Lưu vào DynamoDB (Partition Key: CONV#id, Sort Key: CALL#timestamp#id)
      await this.db.docClient.send(new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: `CONV#${convId}`,
          SK: `CALL#${timestamp}#${callId}`,
          type: 'CALL_HISTORY',
          callId,
          caller,
          receiver,
          status,
          callType,
          durationSec,
          content: displayContent,
          createdAt: timestamp
        }
      }));

      // 4. Gửi tin nhắn vào đoạn chat (SYSTEM_CALL Message)
      const callMsg = await this.messageService.sendMessage(
        convId,
        'system',
        displayContent,
        'SYSTEM_CALL',
        [],
        [],
        null,
        { 
          callId, 
          callType,
          callStatus: status.toLowerCase(),
          callerId: caller,
          receiverId: receiver,
          duration: durationSec
        }
      );

      // Cleanup start time
      await this.redis.del(`call:start:${callId}`);

      return callMsg;
    } catch (err) {
      this.logger.error(`[Call-History] FAILED to save history for ${callId}`, err);
    }
  }
}
