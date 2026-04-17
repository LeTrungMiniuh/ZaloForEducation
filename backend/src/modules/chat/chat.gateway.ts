import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { ChatService } from "./chat.service";
import { SessionService } from "../auth/session.service";
import { UseGuards, Logger, Inject, forwardRef } from "@nestjs/common";
import { WsJwtGuard } from "./ws-jwt.guard";
import { RedisService } from "../../infrastructure/redis.service";

@WebSocketGateway({
  cors: { origin: "*" },
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    private readonly redisService: RedisService,
  ) {}

  async handleConnection(client: Socket) {
    // Note: Guards don't automatically run on handleConnection in NestJS
    // We handle identification via join_identity for now, but presence starts here if possible
    this.logger.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    const user = client['user'];
    if (user && user.email) {
      const email = user.email.toLowerCase();
      const presenceKey = `presence:${email}`;
      await this.redisService.del(presenceKey);
      this.server.emit('presence_update', { email, status: 'offline' });
      this.logger.log(`User ${email} went offline (Presence DEL)`);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("join_qr_room")
  handleJoinQrRoom(
    @MessageBody() data: { qrCodeId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.join(data.qrCodeId);
    console.log(`Web Client ${client.id} joined QR room: ${data.qrCodeId}`);
  }

  @SubscribeMessage("join_room")
  handleJoinRoom(
    @MessageBody() data: { convId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    client.join(data.convId);
    console.log(`Client ${client.id} joined room: ${data.convId}`);
  }

  @SubscribeMessage("join_identity")
  async handleJoinIdentity(
    @MessageBody() data: { email: string; deviceId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const user = client['user']; // Payload from WsJwtGuard
    const email = user?.email || data.email;
    const deviceId = user?.deviceId || data.deviceId;

    if (email) {
      const normalizedEmail = email.toLowerCase();
      const userRoom = `user#${normalizedEmail}`;
      client.join(userRoom);

      if (deviceId) {
        client.join(deviceId);
      }

      // Update Presence to Online
      const presenceKey = `presence:${normalizedEmail}`;
      await this.redisService.set(presenceKey, 'online', 3600); // 1 hour TTL
      this.server.emit('presence_update', { email: normalizedEmail, status: 'online' });

      this.logger.log(`User ${normalizedEmail} identified and is online (Presence SET)`);
    }
  }

  @SubscribeMessage("typing")
  handleTyping(
    @MessageBody() data: { convId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ): void {
    const user = client['user'];
    if (!user || !data.convId) return;

    client.to(data.convId).emit("typing_update", {
      convId: data.convId,
      email: user.email,
      isTyping: data.isTyping,
    });
  }

  @SubscribeMessage("sendMessage")
  handleMessage(
    @MessageBody() data: { convId: string; message: any },
    @ConnectedSocket() socket: Socket,
  ): void {
    // Broadcast message to everyone in the conversation room EXCEPT the sender
    socket.to(data.convId).emit("receiveMessage", data.message);
  }

  /**
   * Notify all devices of a user that a conversation has been read
   */
  emitConversationRead(email: string, convId: string) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("conversation_marked_read", { convId });
    // Tell the room that this user has read the chat
    this.server.to(convId).emit("participant_read", { convId, email, timestamp: Date.now() });
    this.logger.log(`Notified user ${email} that conversation ${convId} was read`);
  }

  @SubscribeMessage("call:invite")
  handleCallInvite(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail?: string;
      callType?: "video" | "audio";
    },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.convId || !data?.fromEmail) return;

    const payload = {
      convId: data.convId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      callType: data.callType || "video",
      ts: Date.now(),
    };

    if (data.toEmail) {
      this.server.to(`user#${data.toEmail}`).emit("call:incoming", payload);
      return;
    }

    client.to(data.convId).emit("call:incoming", payload);
  }

  @SubscribeMessage("call:offer")
  handleCallOffer(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail?: string;
      offer: any;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.convId || !data?.fromEmail || !data?.offer) return;

    const payload = {
      convId: data.convId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      offer: data.offer,
      ts: Date.now(),
    };

    if (data.toEmail) {
      this.server.to(`user#${data.toEmail}`).emit("call:offer", payload);
      return;
    }

    client.to(data.convId).emit("call:offer", payload);
  }

  @SubscribeMessage("call:answer")
  handleCallAnswer(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail?: string;
      answer: any;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.convId || !data?.fromEmail || !data?.answer) return;

    const payload = {
      convId: data.convId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      answer: data.answer,
      ts: Date.now(),
    };

    if (data.toEmail) {
      this.server.to(`user#${data.toEmail}`).emit("call:answer", payload);
      return;
    }

    client.to(data.convId).emit("call:answer", payload);
  }

  @SubscribeMessage("call:ice")
  handleCallIce(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail?: string;
      candidate: any;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.convId || !data?.fromEmail || !data?.candidate) return;

    const payload = {
      convId: data.convId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      candidate: data.candidate,
      ts: Date.now(),
    };

    if (data.toEmail) {
      this.server.to(`user#${data.toEmail}`).emit("call:ice", payload);
      return;
    }

    client.to(data.convId).emit("call:ice", payload);
  }

  @SubscribeMessage("call:end")
  handleCallEnd(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      toEmail?: string;
      reason?: string;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!data?.convId || !data?.fromEmail) return;

    const payload = {
      convId: data.convId,
      fromEmail: data.fromEmail,
      toEmail: data.toEmail,
      reason: data.reason || "ended",
      ts: Date.now(),
    };

    if (data.toEmail) {
      this.server.to(`user#${data.toEmail}`).emit("call:end", payload);
      return;
    }

    client.to(data.convId).emit("call:end", payload);
  }

  // Gửi thông báo đăng xuất tới thiết bị đích (Đã gia cố để đảm bảo nhận được ở mọi màn hình)
  notifyForceLogout(email: string, targetDeviceId: string, reason?: string) {
    const userRoom = `user#${email}`;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // Nếu targetDeviceId là 'all', set all = true để đá toàn bộ
    const isLogoutAll = targetDeviceId === "all";

    const payload = {
      targetDeviceId: isLogoutAll ? undefined : targetDeviceId,
      all: isLogoutAll,
      message:
        reason ||
        (isLogoutAll
          ? "Tất cả các phiên làm việc đã bị đăng xuất."
          : "Phiên đăng nhập đã hết hạn hoặc bị thay thế bởi thiết bị khác."),
      time: timeStr,
    };

    // 1. Phát loa vào room chung của User (Gia cố: Luôn nhận được dù ở bất kỳ màn hình nào)
    this.server.to(userRoom).emit("force_logout", payload);

    // 2. Gửi đích danh vào room của thiết bị (Optimization — nhắm bắn trực tiếp)
    if (!isLogoutAll) {
      this.server.to(targetDeviceId).emit("force_logout", payload);
    }

    // 3. Backup (Legacy support)
    this.server.to(userRoom).emit(`force_logout_${email}`, payload);

    console.log(
      `[SOCKET] Force logout emitted to ${userRoom} (Target: ${targetDeviceId}) at ${timeStr}`,
    );
  }

  notifySessionsUpdate(email: string) {
    const userRoom = `user#${email}`;
    this.server.to(userRoom).emit("sessions_update", { timestamp: Date.now() });
    console.log(`Sent sessions_update to room ${userRoom}`);
  }

  notifyProfileUpdate(email: string, profile: any) {
    const userRoom = `user#${email}`;
    this.server.to(userRoom).emit("profile_update", { profile });
    console.log(`Sent profile_update to room ${userRoom}`);
  }

  notifyHistoryCleared(email: string, convId: string) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("history_cleared", { convId });
    console.log(`Sent history_cleared for ${convId} to room ${userRoom}`);
  }
}
