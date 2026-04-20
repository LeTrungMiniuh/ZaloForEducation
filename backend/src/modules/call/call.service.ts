import { Injectable, Inject, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
} from '@aws-sdk/client-chime-sdk-meetings';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../infrastructure/redis.service';

@Injectable()
export class CallService {
  private readonly logger = new Logger(CallService.name);

  constructor(
    @Inject('CHIME_CLIENT') private readonly chime: ChimeSDKMeetingsClient,
    private readonly redis: RedisService,
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
      if (meetingData) {
        const parsed = JSON.parse(meetingData);
        if (parsed.meeting?.MeetingId) {
          this.logger.log(`[AWS] Deleting Chime Meeting: ${parsed.meeting.MeetingId}`);
          await this.chime.send(
            new DeleteMeetingCommand({ MeetingId: parsed.meeting.MeetingId }),
          );
        }
        await this.redis.del(sessionKey);
        await this.redis.del(`call:active:${conversationId}`);
      }
      return { success: true };
    } catch (error) {
      // Dù Chime lỗi vẫn xóa Redis để cleanup
      await this.redis.del(`call:active:${conversationId}`).catch(() => {});
      return { success: true };
    }
  }
}
