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

  async createMeeting(conversationId: string, userEmail: string, type: 'audio' | 'video' = 'video') {
    this.logger.log(`Creating ${type} meeting for ${conversationId} by ${userEmail}`);

    try {
      // Idempotency check — nếu meeting cùng type đã tồn tại, tái sử dụng
      const existing = await this.redis.get(`call:${conversationId}`);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.callType === type) {
          this.logger.log(`Reusing existing ${type} meeting for ${conversationId}`);
          return parsed;
        }
        // Type mismatch — xóa session cũ và tạo mới
        this.logger.log(`Type mismatch (${parsed.callType} vs ${type}). Purging old session.`);
        await this.redis.del(`call:${conversationId}`);
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

      await this.redis.set(`call:${conversationId}`, JSON.stringify(result), 1800); // 30 min TTL
      return result;
    } catch (error) {
      this.logger.error(`AWS_CHIME_ERROR`, error.stack);
      throw new InternalServerErrorException(`AWS Chime Error: ${error.message}`);
    }
  }

  async joinMeeting(conversationId: string, userEmail: string) {
    this.logger.log(`User ${userEmail} joining ${conversationId}`);

    try {
      const meetingData = await this.redis.get(`call:${conversationId}`);
      if (!meetingData) {
        this.logger.warn(`Redis data NOT FOUND for key: call:${conversationId}`);
        throw new BadRequestException(`Meeting session not found for ${conversationId}`);
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

  async hangupMeeting(conversationId: string, userEmail: string) {
    this.logger.log(`Hangup ${conversationId} by ${userEmail}`);
    try {
      const meetingData = await this.redis.get(`call:${conversationId}`);
      if (meetingData) {
        const parsed = JSON.parse(meetingData);
        if (parsed.meeting?.MeetingId) {
          await this.chime.send(
            new DeleteMeetingCommand({ MeetingId: parsed.meeting.MeetingId }),
          );
        }
        await this.redis.del(`call:${conversationId}`);
      }
      return { success: true };
    } catch (error) {
      // Dù Chime lỗi vẫn xóa Redis để cleanup
      await this.redis.del(`call:${conversationId}`).catch(() => {});
      return { success: true };
    }
  }
}
