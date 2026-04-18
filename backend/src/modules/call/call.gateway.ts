import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

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
   * Payload: { convId, fromEmail, toEmail, callerProfile, callType }
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
    },
    @ConnectedSocket() client: Socket,
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[Invite] ${data.fromEmail} → ${data.toEmail} (${data.callType}) - Broadcasting to: ${targetRoom}`);

    this.server.to(targetRoom).emit('call:incoming', {
      convId: data.convId,
      fromEmail: data.fromEmail,
      callerProfile: data.callerProfile,
      callType: data.callType,
    });
  }

  /**
   * Callee → Backend → Caller: Thông báo callee đã join Chime meeting
   * Payload: { convId, toEmail }
   */
  @SubscribeMessage('call:peer_joined')
  handlePeerJoined(
    @MessageBody() data: { convId: string; toEmail: string },
  ) {
    if (!data?.convId || !data?.toEmail) return;
    const targetRoom = `user#${data.toEmail.toLowerCase()}`;
    this.logger.log(`[PeerJoined] notifying ${data.toEmail} at room: ${targetRoom}`);
    this.server.to(targetRoom).emit('call:peer_joined', { convId: data.convId });
  }

  /**
   * Bên nào kết thúc gọi → emit tới đối phương
   * Payload: { convId, toEmail }
   */
  @SubscribeMessage('call:hangup')
  handleHangup(
    @MessageBody() data: { convId: string; toEmail: string },
  ) {
    if (!data?.convId) return;
    this.logger.log(`[Hangup] ${data.convId}`);
    if (data.toEmail) {
      const targetRoom = `user#${data.toEmail.toLowerCase()}`;
      this.logger.log(`[Hangup] emitting to room: ${targetRoom}`);
      this.server.to(targetRoom).emit('call:hangup', { convId: data.convId });
    } else {
      // Fallback broadcast
      this.logger.warn(`[Hangup] No toEmail provided for hangup. Broadcasting to all (fallback).`);
      this.server.emit('call:hangup', { convId: data.convId });
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
