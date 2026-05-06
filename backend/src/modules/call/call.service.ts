import { Injectable, Inject, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
  DeleteAttendeeCommand,
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
      // [FIX] Xóa meeting cũ của conversation nếu có (tránh rác trên AWS)
      const activeCallId = await this.redis.get(`call:active:${conversationId}`);
      if (activeCallId && activeCallId !== callId) {
        this.logger.log(`[Chime] Found old active call ${activeCallId} for conv ${conversationId}, cleaning up...`);
        await this.hangupMeeting(conversationId, activeCallId, 'system');
      }

      // [SENIOR] Idempotency check theo callId
      const existing = await this.redis.get(`call:session:${callId}`);
      if (existing) {
        this.logger.log(`Reusing existing session for CallId: ${callId}`);
        const parsed = JSON.parse(existing);
        return { 
          meeting: parsed.meeting, 
          callType: parsed.callType, 
          initiatorEmail: parsed.initiatorEmail 
        };
      }

      const meetingResponse = await this.chime.send(
        new CreateMeetingCommand({
          ClientRequestToken: callId, // [FIX] Dùng callId để AWS tự handle idempotency, không dùng uuidv4()
          MediaRegion: process.env.AWS_REGION || 'ap-southeast-1',
          ExternalMeetingId: conversationId,
        }),
      );

      // ✅ KHÔNG tạo Attendee ở đây
      const result = {
        meeting: meetingResponse.Meeting,
        callType: type,
        initiatorEmail: userEmail,
      };

      await this.redis.set(`call:session:${callId}`, JSON.stringify(result), 1800);
      await this.redis.set(`call:active:${conversationId}`, callId, 1800);
      await this.redis.set(`call:state:${callId}`, 'CALLING', 1800); // ✅ Thêm State Machine
      
      return result;
    } catch (error) {
      this.logger.error(`AWS_CHIME_ERROR`, error.stack);
      throw new InternalServerErrorException(`AWS Chime Error: ${error.message}`);
    }
  }

  async joinMeeting(conversationId: string, callId: string, userEmail: string) {
    this.logger.log(`[DEBUG-JOIN] ===== joinMeeting START =====`);
    this.logger.log(`[DEBUG-JOIN] conversationId: ${conversationId}`);
    this.logger.log(`[DEBUG-JOIN] callId: ${callId}`);
    this.logger.log(`[DEBUG-JOIN] userEmail: ${userEmail}`);

    try {
      const meetingData = await this.redis.get(`call:session:${callId}`);
      this.logger.log(`[DEBUG-JOIN] Redis session found: ${!!meetingData}`);

      if (!meetingData) {
        this.logger.warn(`Redis session NOT FOUND for CallId: ${callId}`);
        throw new BadRequestException(`Meeting session not found for this call ID`);
      }

      const parsed = JSON.parse(meetingData);
      this.logger.log(`[DEBUG-JOIN] MeetingId: ${parsed.meeting?.MeetingId}`);
      this.logger.log(`[DEBUG-JOIN] initiatorEmail: ${parsed.initiatorEmail}`);

      // ✅ [LIFECYCLE CONTROL] Kiểm tra state để chặn Race Condition
      const callState = await this.redis.get(`call:state:${callId}`);
      const isCaller = userEmail === parsed.initiatorEmail;

      if (!callState) {
        throw new BadRequestException('Call state not found');
      }

      if (isCaller) {
        if (callState !== 'CALLING' && callState !== 'ACCEPTED') {
          throw new BadRequestException(`Caller cannot join at state: ${callState}`);
        }
      } else {
        if (callState !== 'CALLING' && callState !== 'ACCEPTED') {
          this.logger.warn(`[LIFECYCLE BLOCK] Callee attempted to join invalid state. Current state: ${callState}`);
          throw new BadRequestException(`Callee cannot join at state: ${callState}`);
        }
        // ✅ [FIX] Callee gọi /call/join là biểu hiện của việc Accept.
        // Update state sang ACCEPTED để tránh Race Condition giữa Socket và HTTP.
        if (callState === 'CALLING') {
          await this.redis.set(`call:state:${callId}`, 'ACCEPTED', 1800);
        }
      }

      // [FIX] Xóa attendee cũ nếu còn (tránh statusCode: 4)
      const attendeeKey = `call:attendee:${callId}:${userEmail}`;
      const existingAttendeeStr = await this.redis.get(attendeeKey);
      this.logger.log(`[DEBUG-JOIN] Existing attendee in Redis: ${!!existingAttendeeStr}`);
      if (existingAttendeeStr) {
        const existingAttendee = JSON.parse(existingAttendeeStr);
        try {
          await this.chime.send(
            new DeleteAttendeeCommand({
              MeetingId: parsed.meeting.MeetingId,
              AttendeeId: existingAttendee.AttendeeId,
            }),
          );
          this.logger.log(`[Chime] Deleted old attendee ${existingAttendee.AttendeeId} for ${userEmail}`);
        } catch (e) {
          this.logger.warn(`[Chime] Old attendee already gone: ${e.message}`);
        }
        await this.redis.del(attendeeKey);
      }

      // Tạo Attendee mới
      const attendeeResponse = await this.chime.send(
        new CreateAttendeeCommand({
          MeetingId: parsed.meeting.MeetingId,
          ExternalUserId: userEmail,
        }),
      );

      await this.redis.set(attendeeKey, JSON.stringify(attendeeResponse.Attendee), 1800);

      this.logger.log(`[Chime] Created attendee ${attendeeResponse.Attendee?.AttendeeId} for ${userEmail}`);

      return {
        meeting: parsed.meeting,
        attendee: attendeeResponse.Attendee,
        callType: parsed.callType,
        initiatorEmail: parsed.initiatorEmail,
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
   * [SENIOR 10/10] Chốt sổ cuộc gọi theo cấu trúc Production-grade
   */
  async finalizeCallHistory(data: {
    convId: string;
    callId: string;
    caller: string;
    receiver: string;
    status: 'MISSED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
    callType: 'audio' | 'video';
    durationOverride?: number;
    endedAt?: string;
  }) {
    const { convId, callId, caller, receiver, status: inputStatus, callType, durationOverride, endedAt: endedAtInput } = data;
    
    // [SENIOR 10/10] Idempotency: Chỉ cho phép chốt sổ 1 lần duy nhất cho 1 callId
    const lockKey = `call:finalized:${callId}`;
    const alreadyFinalized = await this.redis.get(lockKey);
    if (alreadyFinalized) {
      this.logger.warn(`[Call-History] CallId ${callId} already finalized. Skipping duplicate.`);
      return null;
    }
    await this.redis.set(lockKey, 'true', 3600); // Khóa trong 1h

    const now = new Date().toISOString();
    const endedAt = endedAtInput || now;

    // 1. Lấy mốc thời gian bắt đầu
    const startStr = await this.redis.get(`call:start:${callId}`);
    const createdAt = startStr ? new Date(parseInt(startStr)).toISOString() : now;

    // 2. Tính toán duration & status (Ưu tiên Client, fallback Backend calculation)
    let durationSec = durationOverride || 0;
    let status = inputStatus;

    if (durationSec > 0) {
      status = 'COMPLETED'; // Nếu client bảo có duration -> Chắc chắn là đã kết nối
    } else if (status === 'COMPLETED' && startStr) {
      durationSec = Math.floor((new Date(endedAt).getTime() - parseInt(startStr)) / 1000);
    }

    this.logger.log(`[Call-History-10/10] Finalizing ${callId} | Status: ${status} | Dur: ${durationSec}s`);

    try {
      // 3. Gửi tin nhắn vào đoạn chat theo cấu trúc 10/10
      const callMsg = await this.messageService.sendMessage(
        convId,
        caller, // senderId = callerId
        callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại', // Descriptive content
        'SYSTEM_CALL', // Type chuẩn production
        [],
        [],
        null,
        { 
          callId, 
          callType,
          callStatus: status.toLowerCase(),
          callerId: caller,
          receiverId: receiver,
          participants: [caller, receiver], // Sẵn sàng cho group call
          duration: durationSec,
          createdAt,
          endedAt
        }
      );

      // Cleanup start time
      await this.redis.del(`call:start:${callId}`);

      return callMsg;
    } catch (err) {
      this.logger.error(`[Call-History] FAILED to save 10/10 history for ${callId}`, err);
    }
  }
}
