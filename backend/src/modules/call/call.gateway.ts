import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { userPlatformMap } from '../chat/chat.gateway';
import { CallService } from './call.service';

/**
 * CallGateway — Xử lý signaling cho cuộc gọi AWS Chime.
 *
 * QUAN TRỌNG: Gateway này chia sẻ cùng WebSocket server với ChatGateway.
 * Routing dựa vào Socket.IO room `user#<email>` đã được ChatGateway.join_identity setup sẵn.
 * KHÔNG dùng userSockets Map — hoàn toàn stateless.
 */
@WebSocketGateway({
  cors: { origin: '*' },
})
export class CallGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CallGateway.name);

  constructor(private readonly callService: CallService) {}

  // ─── Call Signaling ────────────────────────────────────────────────────────

  /**
   * Caller → Backend → Callee: Thông báo cuộc gọi đến
   * Payload: { convId, fromEmail, toEmail, callerProfile, callType, callId }
   */
  @SubscribeMessage('call:invite')
  handleCallInvite(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail: string;
      callerProfile: any;
      callType: 'audio' | 'video';
      callId: string; // [SENIOR] Thêm callId
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail || !data?.callId) return;
    
    const engine = 'chime';

    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Invite] ${data.fromEmail} → ${data.toEmail} | CallId: ${data.callId} | Engine: ${engine}`);

    this.server.to(targetRoom).emit('call:incoming', {
      convId: data.convId,
      fromEmail: data.fromEmail,
      callerProfile: data.callerProfile,
      callType: data.callType,
      callId: data.callId,
      engine,
    });
  }

  /**
   * Callee → Backend → Caller: Chấp nhận cuộc gọi
   * [SENIOR] Phát tín hiệu dismiss tới các thiết bị khác của callee
   */
  @SubscribeMessage('call:accept')
  async handleCallAccept(
    @MessageBody() data: { convId: string; toEmail: string; callId: string; meetingInfo?: any },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    
    const callerRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Accept] notifying caller ${data.toEmail} | CallId: ${data.callId}`);
    
    // 1. [UTMOST PRIORITY] Thông báo cho người gọi ngay lập tức
    this.server.to(callerRoom).emit('call:accept', { 
      convId: data.convId, 
      callId: data.callId,
      meetingInfo: data.meetingInfo 
    });

    // 2. [BACKGROUND] Mark start time for duration calculation
    this.callService.markCallStarted(data.callId).catch(e => this.logger.error('Failed to mark call start', e));

    // 3. [SENIOR] Thông báo cho các thiết bị khác của người nghe để tắt chuông (EXCLUDE SENDER)
    const userEmail = client['user']?.email?.toLowerCase();
    if (userEmail) {
      const myRoom = `user#${userEmail}`;
      this.logger.log(`[Dismiss] notifying other devices of ${userEmail} via room: ${myRoom}`);
      // Dùng broadcast để gửi cho tất cả TRỪ client hiện tại
      client.broadcast.to(myRoom).emit('call:handled_elsewhere', { 
        convId: data.convId, 
        callId: data.callId, 
        reason: 'accepted' 
      });
      // Fallback cho logic cũ
      client.broadcast.to(myRoom).emit('call:dismiss', { convId: data.convId, callId: data.callId, reason: 'accepted' });
    }
  }

  /**
   * Callee → Backend → Caller: Từ chối cuộc gọi
   */
  @SubscribeMessage('call:reject')
  async handleCallReject(
    @MessageBody() data: { convId: string; toEmail: string; callId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const callerRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Reject] ${data.toEmail} | CallId: ${data.callId}`);
    
    const fromEmail = client['user']?.email || 'system';

    // 1. [UTMOST PRIORITY] Thông báo cho người gọi ngay lập tức
    this.server.to(callerRoom).emit('call:reject', { 
      convId: data.convId, 
      callId: data.callId,
      reason: data.reason 
    });

    // 2. [SENIOR] Thông báo dập chuông cho các thiết bị khác (EXCLUDE SENDER)
    const userEmail = client['user']?.email?.toLowerCase();
    if (userEmail) {
      const myRoom = `user#${userEmail}`;
      client.broadcast.to(myRoom).emit('call:handled_elsewhere', { 
        convId: data.convId, 
        callId: data.callId, 
        reason: 'rejected' 
      });
      client.broadcast.to(myRoom).emit('call:dismiss', { convId: data.convId, callId: data.callId, reason: 'rejected' });
    }

    // 3. [BACKGROUND] Cleanup meeting & Save history
    (async () => {
      try {
        const now = new Date().toISOString();
        const session = await this.callService.getCallSession(data.callId);
        const initiator = session?.initiatorEmail || data.toEmail;
        const receiver = session ? (initiator === session.initiatorEmail ? fromEmail : session.initiatorEmail) : fromEmail;

        await this.callService.hangupMeeting(data.convId, data.callId, fromEmail);
        const callType = (session?.callType as 'audio' | 'video') || 'audio';
        
        const callMsg = await this.callService.finalizeCallHistory({
          convId: data.convId,
          callId: data.callId,
          caller: initiator,
          receiver: receiver,
          status: 'REJECTED',
          callType: callType,
          endedAt: now
        });

        if (callMsg) {
          const roomId = data.convId.toLowerCase();
          this.server.to(roomId).emit('receiveMessage', callMsg);
          // Update personal rooms for inbox refresh
          this.server.to(`user#${initiator.toLowerCase()}`).emit('receiveMessage', callMsg);
          this.server.to(`user#${receiver.toLowerCase()}`).emit('receiveMessage', callMsg);
        }
      } catch (e) {
        this.logger.error('Background cleanup for reject failed', e);
      }
    })();
  }

  /**
   * Hệ thống/Client → Backend → Đối phương: Kết thúc do quá giờ
   */
  @SubscribeMessage('call:timeout')
  async handleCallTimeout(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    const fromEmail = client['user']?.email || 'system';

    // 1. [UTMOST PRIORITY] Thông báo cho đối phương ngay lập tức
    this.server.to(targetRoom).emit('call:timeout', { convId: data.convId, callId: data.callId });
    this.server.to(targetRoom).emit('call:dismiss', { convId: data.convId, callId: data.callId, reason: 'timeout' });
    this.server.to(targetRoom).emit('call:handled_elsewhere', { convId: data.convId, callId: data.callId, reason: 'timeout' });

    // 2. [BACKGROUND] Cleanup & Save history
    (async () => {
      try {
        const now = new Date().toISOString();
        const session = await this.callService.getCallSession(data.callId);
        const initiator = session?.initiatorEmail || fromEmail;
        const receiver = session ? (initiator === session.initiatorEmail ? data.toEmail : session.initiatorEmail) : data.toEmail;

        await this.callService.hangupMeeting(data.convId, data.callId, fromEmail);
        const callType = (session?.callType as 'audio' | 'video') || 'audio';

        const callMsg = await this.callService.finalizeCallHistory({
          convId: data.convId,
          callId: data.callId,
          caller: initiator,
          receiver: receiver,
          status: 'MISSED',
          callType: callType,
          endedAt: now
        });

        if (callMsg) {
          const roomId = data.convId.toLowerCase();
          this.server.to(roomId).emit('receiveMessage', callMsg);
          this.server.to(`user#${initiator.toLowerCase()}`).emit('receiveMessage', callMsg);
          this.server.to(`user#${receiver.toLowerCase()}`).emit('receiveMessage', callMsg);
        }
      } catch (e) {
        this.logger.error('Background cleanup for timeout failed', e);
      }
    })();
  }

  /**
   * Callee → Backend → Caller: Thông báo callee đã join Chime meeting
   */
  @SubscribeMessage('call:peer_joined')
  handlePeerJoined(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.server.to(targetRoom).emit('call:peer_joined', { convId: data.convId, callId: data.callId });
  }

  // [MIGRATED] WebRTC P2P Signaling logic has been removed in favor of Chime-only architecture.

  /**
   * Bên nào kết thúc gọi → emit tới đối phương
   * Payload: { convId, toEmail, callId }
   */
  @SubscribeMessage('call:hangup')
  async handleHangup(
    @MessageBody() data: { convId: string; toEmail: string; callId: string; duration?: number; callType?: 'audio' | 'video' },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId) return;
    this.logger.log(`[Hangup] ${data.convId} | CallId: ${data.callId} | Dur: ${data.duration} | Type: ${data.callType}`);
    const fromEmail = client['user']?.email || 'system';

    // 1. [UTMOST PRIORITY] Thông báo cho đối phương gác máy ngay lập tức
    if (data.toEmail) {
      const targetRoom = `user#${data.toEmail.toLowerCase()}`;
      this.server.to(targetRoom).emit('call:hangup', { 
        convId: data.convId,
        callId: data.callId 
      });
    } else {
      this.server.emit('call:hangup', { convId: data.convId, callId: data.callId });
    }

    // 2. [BACKGROUND] Cleanup & Save history
    (async () => {
      try {
        const now = new Date().toISOString();
        const started = await this.callService.getCallStartTime(data.callId);
        const { session } = await this.callService.hangupMeeting(data.convId, data.callId, fromEmail);
        
        const initiator = session?.initiatorEmail || fromEmail;
        // Ưu tiên callType từ client, sau đó là session, cuối cùng mới là audio
        const callType = data.callType || (session?.callType as 'audio' | 'video') || 'audio';
        
        let receiver = data.toEmail || 'unknown';
        if (session && session.initiatorEmail === fromEmail) {
           receiver = data.toEmail || 'unknown';
        } else if (session) {
           receiver = fromEmail;
        }

        const isCaller = (initiator === fromEmail);
        let status: 'COMPLETED' | 'MISSED' | 'CANCELLED';

        if (started) {
          status = 'COMPLETED';
        } else if (isCaller) {
          status = 'CANCELLED';
        } else {
          status = 'MISSED';
        }

        const callMsg = await this.callService.finalizeCallHistory({
          convId: data.convId,
          callId: data.callId,
          caller: initiator, 
          receiver: receiver,
          status: status,
          callType: callType,
          durationOverride: data.duration,
          endedAt: now // [NEW] Ghi nhận thời điểm kết thúc chuẩn xác
        });

        if (callMsg) {
          const roomId = data.convId.toLowerCase();
          this.server.to(roomId).emit('receiveMessage', callMsg);
          this.server.to(`user#${initiator.toLowerCase()}`).emit('receiveMessage', callMsg);
          this.server.to(`user#${receiver.toLowerCase()}`).emit('receiveMessage', callMsg);
        }
      } catch (e) {
        this.logger.error('Background cleanup for hangup failed', e);
      }
    })();
  }

  // ─── Video Upgrade Flow ────────────────────────────────────────────────────

  /** A → B: Yêu cầu chuyển sang video */
  @SubscribeMessage('call:upgrade_request')
  handleUpgradeRequest(
    @MessageBody() data: { convId: string; toEmail: string; fromProfile: any; callId: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeRequest] → ${data.toEmail} | CallId: ${data.callId}`);
    this.server.to(targetRoom).emit('call:upgrade_request', {
      convId: data.convId,
      callId: data.callId,
      fromProfile: data.fromProfile,
    });
  }

  /** B → A: Đồng ý upgrade video */
  @SubscribeMessage('call:upgrade_accepted')
  handleUpgradeAccepted(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeAccepted] → ${data.toEmail} | CallId: ${data.callId}`);
    this.server.to(targetRoom).emit('call:upgrade_accepted', { 
      convId: data.convId,
      callId: data.callId 
    });
  }

  /** B → A: Từ chối upgrade video */
  @SubscribeMessage('call:upgrade_declined')
  handleUpgradeDeclined(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeDeclined] → ${data.toEmail} | CallId: ${data.callId}`);
    this.server.to(targetRoom).emit('call:upgrade_declined', { 
      convId: data.convId,
      callId: data.callId 
    });
  }
}
