import { Injectable, Logger, InternalServerErrorException, BadRequestException, Inject } from '@nestjs/common';
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  DeleteMeetingCommand,
  DeleteAttendeeCommand,
} from '@aws-sdk/client-chime-sdk-meetings';
import { RedisService } from '../../infrastructure/redis.service';
import { UserService } from '../user/user.service';
import { MessageService } from '../chat/message.service';
import { ChatGateway } from '../chat/chat.gateway';
import { forwardRef } from '@nestjs/common';

@Injectable()
export class GroupCallService {
  private readonly logger = new Logger(GroupCallService.name);
  constructor(
    @Inject('CHIME_CLIENT') private readonly chime: ChimeSDKMeetingsClient,
    private readonly redis: RedisService,
    private readonly userService: UserService,
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  /**
   * Tạo cuộc gọi nhóm mới hoặc lấy session hiện có.
   */
  async createGroupMeeting(conversationId: string, callId: string, initiatorEmail: string, type: 'audio' | 'video') {
    this.logger.log(`[GroupCall] Creating ${type} meeting for Group ${conversationId} by ${initiatorEmail}`);

    try {
      // 1. Idempotency check theo callId
      const sessionKey = `group-call:session:${callId}`;
      const existing = await this.redis.get(sessionKey);
      
      if (existing) {
        this.logger.log(`[GroupCall] Reusing existing session for ${callId}`);
        return JSON.parse(existing);
      }

      // 2. Tạo meeting trên AWS Chime
      const meetingResponse = await this.chime.send(
        new CreateMeetingCommand({
          ClientRequestToken: callId,
          MediaRegion: process.env.AWS_REGION || 'ap-southeast-1',
          ExternalMeetingId: conversationId,
        }),
      );

      const result = {
        meeting: meetingResponse.Meeting,
        callType: type,
        initiatorEmail,
        conversationId,
        isGroup: true,
      };

      // 3. Lưu session vào Redis (1800s = 30p)
      await this.redis.set(sessionKey, JSON.stringify(result), 1800);
      await this.redis.set(`group-call:active:${conversationId}`, callId, 1800);
      await this.redis.set(`group-call:state:${callId}`, 'CALLING', 1800);
      await this.redis.sAdd(`group-call:active-meetings`, callId);

      // [SENIOR] Send entry point message to chat thread
      await this.finalizeGroupCallHistory({
        convId: conversationId,
        callId: callId,
        caller: initiatorEmail,
        callType: type,
        status: 'ongoing',
      });

      return result;
    } catch (error) {
      this.logger.error(`[GroupCall] AWS_CHIME_ERROR`, error.stack);
      throw new InternalServerErrorException(`Group Call AWS Error: ${error.message}`);
    }
  }

  /**
   * Tham gia vào cuộc gọi nhóm hiện có.
   */
  async joinGroupMeeting(conversationId: string, callId: string, userEmail: string, userProfile?: any) {
    this.logger.log(`[GroupCall] User ${userEmail} joining ${callId}`);

    try {
      const sessionKey = `group-call:session:${callId}`;
      const meetingData = await this.redis.get(sessionKey);

      if (!meetingData) {
        throw new BadRequestException('Meeting session not found or ended');
      }

      const parsed = JSON.parse(meetingData);
      const meetingId = parsed.meeting.MeetingId;

      // 1. Tạo Attendee trên AWS Chime
      const attendeeResponse = await this.chime.send(
        new CreateAttendeeCommand({
          MeetingId: meetingId,
          ExternalUserId: userEmail,
        }),
      );

      const attendeeId = attendeeResponse.Attendee.AttendeeId;

      // 2. Track participant in unified Hash
      const participantsKey = `group-call:participants:${callId}`;
      
      // [SENIOR] Robust Identity Fallback: If profile is missing or incomplete, fetch from SSOT (UserService)
      let finalName = userProfile?.fullName || userProfile?.fullname || userProfile?.name;
      let finalAvatar = userProfile?.avatarUrl || userProfile?.avatar;

      if (!finalName || finalName.includes('@')) {
        try {
          const dbProfile = await this.userService.getUserProfile(userEmail);
          if (dbProfile?.profile) {
            finalName = dbProfile.profile.fullName;
            finalAvatar = dbProfile.profile.avatarUrl;
          }
        } catch (e) {
          this.logger.error(`[GroupCall] Failed to fetch DB profile for ${userEmail}: ${e.message}`);
        }
      }

      const lowerId = attendeeId.toLowerCase();
      const participantInfo = {
        email: userEmail.toLowerCase(),
        name: finalName || userEmail.split('@')[0],
        avatar: finalAvatar || null,
        attendeeId: lowerId,
        status: 'connected',
        joinedAt: new Date().toISOString(),
        lastSeenAt: Date.now(),
      };

      await this.redis.hSet(participantsKey, lowerId, JSON.stringify(participantInfo));
      await this.redis.expire(participantsKey, 1800); // 30 min session limit

      // Get all participants for SSOT
      const allParticipantsRaw = await this.redis.hGetAll(participantsKey);
      const participants: Record<string, any> = {};
      
      Object.entries(allParticipantsRaw).forEach(([id, data]) => {
        try {
          participants[id.toLowerCase()] = JSON.parse(data);
        } catch (e) {
          this.logger.error(`[GroupCall] Failed to parse participant data for ${id}`);
        }
      });

      this.logger.log(`[GroupCall] Redis SSOT for ${callId}: Count=${Object.keys(participants).length}`);

      // 3. Cập nhật state nếu là người đầu tiên accept
      const currentState = await this.redis.get(`group-call:state:${callId}`);
      if (currentState === 'CALLING') {
        await this.redis.set(`group-call:state:${callId}`, 'JOINED', 1800);
      }

      return {
        meeting: parsed.meeting,
        attendee: attendeeResponse.Attendee,
        callType: parsed.callType,
        participants: participants,
      };
    } catch (error) {
      this.logger.error(`[GroupCall] JOIN_FAIL for call ${callId} user ${userEmail}`, error.stack);
      throw new InternalServerErrorException(`Group Call Join Error: ${error.message}`);
    }
  }

  /**
   * Rời khỏi cuộc gọi nhóm (theo thiết bị/attendeeId).
   */
  async leaveGroupMeeting(conversationId: string, callId: string, attendeeId: string) {
    this.logger.log(`[GroupCall] Attendee ${attendeeId} leaving ${callId}`);

    try {
      const participantsKey = `group-call:participants:${callId}`;
      await this.redis.hDel(participantsKey, attendeeId);
      
      const remainingCount = await this.redis.hLen(participantsKey);
      this.logger.log(`[GroupCall] ${remainingCount} participants remaining for ${callId}`);

      // [SENIOR] Auto-end meeting if no one is left to keep header state clean
      if (remainingCount === 0) {
        this.logger.log(`[GroupCall] Meeting ${callId} is now empty. Ending session.`);
        await this.endGroupMeeting(conversationId, callId);
        return { meetingDeleted: true };
      }

      return { meetingDeleted: false };
    } catch (error) {
      this.logger.error(`[GroupCall] LEAVE_ERROR`, error.stack);
      return { meetingDeleted: false };
    }
  }

  /**
   * Kết thúc hoàn toàn cuộc gọi nhóm.
   */
  async endGroupMeeting(conversationId: string, callId: string) {
    this.logger.log(`[GroupCall] Ending meeting ${callId}`);

    try {
      const sessionKey = `group-call:session:${callId}`;
      const meetingData = await this.redis.get(sessionKey);
      
      if (meetingData) {
        const parsed = JSON.parse(meetingData);
        if (parsed.meeting?.MeetingId) {
          await this.chime.send(
            new DeleteMeetingCommand({ MeetingId: parsed.meeting.MeetingId }),
          );
        }

        // [SENIOR] Finalize call history for group chat
        await this.finalizeGroupCallHistory({
          convId: conversationId,
          callId: callId,
          caller: parsed.initiatorEmail,
          callType: parsed.callType || 'video',
        });
      }

      // Cleanup Redis
      await this.redis.del(sessionKey);
      await this.redis.del(`group-call:active:${conversationId}`);
      await this.redis.del(`group-call:state:${callId}`);
      await this.redis.del(`group-call:participants:${callId}`);
      await this.redis.del(`group-call:joined:${callId}`);
      await this.redis.sRem(`group-call:active-meetings`, callId);
    } catch (error) {
      this.logger.error(`[GroupCall] END_ERROR`, error.stack);
    }
  }

  /**
   * [SENIOR] Chốt sổ cuộc gọi nhóm và gửi tin nhắn vào chat
   */
  async finalizeGroupCallHistory(data: {
    convId: string;
    callId: string;
    caller: string;
    callType: 'audio' | 'video';
    status?: string;
  }) {
    const { convId, callId, caller, callType, status = 'completed' } = data;
    
    // [SENIOR] Prevent duplicate messages for the same callId
    const lockKey = `group-call:finalized:${callId}`;
    const alreadySent = await this.redis.get(lockKey);
    if (alreadySent) return null;
    await this.redis.set(lockKey, 'true', 3600);

    const now = new Date().toISOString();

    try {
      const callMsg = await this.messageService.sendMessage(
        convId,
        caller, 
        callType === 'video' ? 'Cuộc gọi video nhóm' : 'Cuộc gọi thoại nhóm',
        'SYSTEM_CALL',
        [],
        [],
        null,
        { 
          callId, 
          callType,
          callStatus: status,
          callerId: caller,
          isGroup: true,
          createdAt: now,
          endedAt: status === 'completed' ? now : undefined,
          // [SENIOR] Redundant for robustness across different frontend versions
          metadata: {
            callId,
            callType,
            callStatus: status,
            isGroup: true
          }
        }
      );

      this.chatGateway.emitReceiveMessage(convId, callMsg);
      return callMsg;
    } catch (err) {
      this.logger.error(`[GroupCall-History] FAILED to save history for ${callId}`, err);
    }
  }

  /**
   * Lấy thông tin cuộc gọi đang hoạt động cho hội thoại.
   */
  async getActiveCall(conversationId: string) {
    const callId = await this.redis.get(`group-call:active:${conversationId}`);
    if (!callId) return null;

    const sessionKey = `group-call:session:${callId}`;
    const meetingData = await this.redis.get(sessionKey);
    if (!meetingData) return null;

    const participantsKey = `group-call:participants:${callId}`;
    const participantsRaw = await this.redis.hGetAll(participantsKey);
    const participants: any[] = Object.values(participantsRaw).map(p => JSON.parse(p));

    return {
      callId,
      participants,
      participantCount: participants.length
    };
  }

  /**
   * Heartbeat để duy trì session và cập nhật trạng thái online.
   */
  async heartbeat(callId: string, attendeeId: string) {
    try {
      const participantsKey = `group-call:participants:${callId}`;
      const data = await this.redis.hGet(participantsKey, attendeeId);
      
      if (data) {
        const participant = JSON.parse(data);
        participant.lastSeenAt = Date.now();
        await this.redis.hSet(participantsKey, attendeeId, JSON.stringify(participant));
        // Refresh TTL for both participants and the session metadata
        await this.redis.expire(participantsKey, 1800);
        await this.redis.expire(`group-call:session:${callId}`, 1800);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getActiveMeetings(): Promise<string[]> {
    return await this.redis.sMembers(`group-call:active-meetings`);
  }

  async getParticipants(callId: string): Promise<Record<string, any>> {
    const raw = await this.redis.hGetAll(`group-call:participants:${callId}`);
    const participants: Record<string, any> = {};
    for (const [id, data] of Object.entries(raw)) {
      try {
        participants[id] = JSON.parse(data);
      } catch (e) {}
    }
    return participants;
  }

  async getCallSession(callId: string): Promise<any> {
    const data = await this.redis.get(`group-call:session:${callId}`);
    return data ? JSON.parse(data) : null;
  }
}
