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
  handleCallAccept(
    @MessageBody() data: { convId: string; toEmail: string; callId: string; meetingInfo?: any },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    
    const callerRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Accept] notifying caller ${data.toEmail} | CallId: ${data.callId}`);
    
    // 1. Thông báo cho người gọi
    this.server.to(callerRoom).emit('call:accept', { 
      convId: data.convId, 
      callId: data.callId,
      meetingInfo: data.meetingInfo 
    });

    // 2. [SENIOR] Thông báo cho các thiết bị khác của người nghe để tắt chuông (EXCLUDE SENDER)
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
  handleCallReject(
    @MessageBody() data: { convId: string; toEmail: string; callId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const callerRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Reject] ${data.toEmail} | CallId: ${data.callId}`);
    
    // 1. Thông báo cho người gọi
    this.server.to(callerRoom).emit('call:reject', { 
      convId: data.convId, 
      callId: data.callId,
      reason: data.reason 
    });

    // 2. [SENIOR] Thông báo dập chuông cho các thiết bị khác (EXCLUDE SENDER)
    const userEmail = client['user']?.email?.toLowerCase();
    if (userEmail) {
      const myRoom = `user#${userEmail}`;
      this.logger.log(`[Dismiss] notifying other devices of ${userEmail} via room: ${myRoom}`);
      client.broadcast.to(myRoom).emit('call:handled_elsewhere', { 
        convId: data.convId, 
        callId: data.callId, 
        reason: 'rejected' 
      });
      // Fallback
      client.broadcast.to(myRoom).emit('call:dismiss', { convId: data.convId, callId: data.callId, reason: 'rejected' });
    }
  }

  /**
   * Hệ thống/Client → Backend → Đối phương: Kết thúc do quá giờ
   */
  @SubscribeMessage('call:timeout')
  handleCallTimeout(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.server.to(targetRoom).emit('call:timeout', { convId: data.convId, callId: data.callId });
    
    // Đồng thời dismiss các thiết bị khác của target
    this.server.to(targetRoom).emit('call:dismiss', { convId: data.convId, callId: data.callId, reason: 'timeout' });
    this.server.to(targetRoom).emit('call:handled_elsewhere', { convId: data.convId, callId: data.callId, reason: 'timeout' });
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
  handleHangup(
    @MessageBody() data: { convId: string; toEmail: string; callId: string },
  ) {
    if (!data?.convId) return;
    this.logger.log(`[Hangup] ${data.convId} | CallId: ${data.callId}`);
    if (data.toEmail) {
      const targetRoom = `user#${data.toEmail.toLowerCase()}`;
      this.logger.log(`[Hangup] emitting to room: ${targetRoom}`);
      this.server.to(targetRoom).emit('call:hangup', { 
        convId: data.convId,
        callId: data.callId 
      });
    } else {
      // Fallback broadcast
      this.logger.warn(`[Hangup] No toEmail provided for hangup. Broadcasting to all (fallback).`);
      this.server.emit('call:hangup', { 
        convId: data.convId,
        callId: data.callId 
      });
    }
  }

  // ─── Video Upgrade Flow ────────────────────────────────────────────────────

  /** A → B: Yêu cầu chuyển sang video */
  @SubscribeMessage('call:upgrade_request')
  handleUpgradeRequest(
    @MessageBody() data: { convId: string; toEmail: string; fromProfile: any },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeRequest] → ${data.toEmail} - Broadcasting to: ${targetRoom}`);
    this.server.to(targetRoom).emit('call:upgrade_request', {
      convId: data.convId,
      fromProfile: data.fromProfile,
    });
  }

  /** B → A: Đồng ý upgrade video */
  @SubscribeMessage('call:upgrade_accepted')
  handleUpgradeAccepted(
    @MessageBody() data: { convId: string; toEmail: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeAccepted] → ${data.toEmail} - Broadcasting to: ${targetRoom}`);
    this.server.to(targetRoom).emit('call:upgrade_accepted', { convId: data.convId });
  }

  /** B → A: Từ chối upgrade video */
  @SubscribeMessage('call:upgrade_declined')
  handleUpgradeDeclined(
    @MessageBody() data: { convId: string; toEmail: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[UpgradeDeclined] → ${data.toEmail} - Broadcasting to: ${targetRoom}`);
    this.server.to(targetRoom).emit('call:upgrade_declined', { convId: data.convId });
  }
}
