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

export const userPlatformMap = new Map<string, string>();

@WebSocketGateway({
  cors: { origin: "*" },
})
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

  private async isConversationMember(convId: string, email: string) {
    const metadata = await this.chatService.getConversationMetadata(convId);
    if (!metadata || !Array.isArray(metadata.members)) return false;

    const normalizedEmail = email.toLowerCase();
    return metadata.members.some(
      (member) => String(member).toLowerCase() === normalizedEmail,
    );
  }

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
      userPlatformMap.delete(email);
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

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("join_room")
  async handleJoinRoom(
    @MessageBody() data: { convId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!data.convId) return;
    const user = client['user'];
    const email = user?.email;
    if (!email) return;

    const allowed = await this.isConversationMember(data.convId, email);
    if (!allowed) {
      this.logger.warn(
        `[SOCKET] Denied join_room for ${email} on conversation ${data.convId}`,
      );
      return;
    }

    const room = data.convId.toLowerCase(); // Chuẩn hóa room
    client.join(room);
    this.logger.log(`[SOCKET] Client ${client.id} joined room: ${room}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("join_identity")
  async handleJoinIdentity(
    @MessageBody() data: { email: string; deviceId: string; platform?: string },
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

      this.logger.log(`[SOCKET] User ${normalizedEmail} identified. Joined rooms: [${userRoom}], [${deviceId || 'no-device'}]`);

      // Update Presence to Online
      const presenceKey = `presence:${normalizedEmail}`;
      await this.redisService.set(presenceKey, 'online', 3600); // 1 hour TTL
      this.server.emit('presence_update', { email: normalizedEmail, status: 'online' });

      userPlatformMap.set(normalizedEmail, data.platform || 'web');

      this.logger.log(`User ${normalizedEmail} identified and is online [Platform: ${data.platform || 'web'}]`);
    }
  }

  async emitConversationUpdated(convId: string, updates: any) {
    const metadata = await this.chatService.getConversationMetadata(convId);
    if (metadata && Array.isArray(metadata.members)) {
      for (const member of metadata.members) {
        const userRoom = `user#${String(member).toLowerCase()}`;
        this.server.to(userRoom).emit('conversation:updated', { convId, updates });
      }
    }
    
    // Broadcast to the room for those currently in the chat
    const room = convId.toLowerCase();
    this.server.to(room).emit('conversation:updated', { convId, updates });
    this.logger.log(`[SOCKET] Emitted conversation:updated for ${convId} to all members`);
  }

  @SubscribeMessage("get_platform")
  handleGetPlatform(
    @MessageBody() data: { email: string },
    @ConnectedSocket() client: Socket,
  ): { platform: string } {
    if (!data?.email) return { platform: 'web' };
    return { platform: userPlatformMap.get(data.email.toLowerCase()) || 'web' };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("typing")
  async handleTyping(
    @MessageBody() data: { convId: string; isTyping: boolean },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const user = client['user'];
    if (!user || !data.convId) return;

    const allowed = await this.isConversationMember(data.convId, user.email);
    if (!allowed) return;

    const room = data.convId.toLowerCase();

    client.to(room).emit("typing_update", {
      convId: data.convId,
      email: user.email,
      isTyping: data.isTyping,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("leave_room")
  async handleLeaveRoom(
    @MessageBody() data: { convId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!data?.convId) return;
    const room = data.convId.toLowerCase();
    client.leave(room);
    this.logger.log(`[SOCKET] Client ${client.id} left room: ${room}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("sendMessage")
  async handleMessage(
    @MessageBody() data: { convId: string; message: any },
    @ConnectedSocket() socket: Socket,
  ): Promise<void> {
    const user = socket['user'];
    if (!user || !data?.convId || !data?.message) return;

    const allowed = await this.isConversationMember(data.convId, user.email);
    if (!allowed) return;

    const room = data.convId.toLowerCase();
    const safeMessage = {
      ...data.message,
      conversationId: data.message.conversationId || data.convId,
      senderId: data.message.senderId || user.email,
    };

    // 1. Broadcast message to everyone in the conversation room (for active chat UI)
    socket.to(room).emit("receiveMessage", safeMessage);

    // 2. [SENIOR] Broadcast to user-specific rooms (for Inbox/HomeScreen update & Notifications)
    const metadata = await this.chatService.getConversationMetadata(data.convId);
    if (metadata && Array.isArray(metadata.members)) {
      const senderEmail = user.email.toLowerCase();
      for (const member of metadata.members) {
        const memberEmail = String(member).toLowerCase();
        const userRoom = `user#${memberEmail}`;
        
        // Emit to user room so Inbox updates even if they are NOT in the chat room
        // We use this.server.to() to ensure ALL devices (including sender's other devices) get it.
        this.server.to(userRoom).emit("receiveMessage", safeMessage);

        // Also trigger a formal notification event for the Store (only for others)
        if (memberEmail !== senderEmail) {
          this.server.to(userRoom).emit("notification:new", {
            id: `NOTIF#${safeMessage.id || Date.now()}`,
            title: metadata.name || (metadata.type === 'direct' ? user.fullName || user.email : 'Tin nhắn mới'),
            message: typeof safeMessage.content === 'string' ? safeMessage.content : (safeMessage.content?.text || 'Bạn có tin nhắn mới'),
            at: safeMessage.createdAt || new Date().toISOString(),
            read: false,
            metadata: {
              conversationId: data.convId,
              messageId: safeMessage.id,
              senderId: user.email
            }
          });
        }
      }
    }
  }

  /**
   * [SENIOR] Notify members when a message is updated (Recall/React/Pin)
   */
  emitMessagePatched(convId: string, message: any) {
    const room = convId.toLowerCase();
    // Broadcast to the room so active viewers see it
    this.server.to(room).emit("message_patched", { convId, message });
    this.logger.log(`[SOCKET] Broadcasted message_patched for ${message.id} in ${convId}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("message_delivered")
  async handleMessageDelivered(
    @MessageBody() data: { convId: string; messageId: string },
    @ConnectedSocket() socket: Socket,
  ): Promise<void> {
    const user = socket['user'];
    if (!user || !data?.convId || !data?.messageId) return;
    
    // Asynchronously mark as delivered to avoid blocking socket thread
    this.chatService.markAsDelivered(user.email, data.convId, data.messageId).catch(err => {
      this.logger.error(`[SOCKET] Failed to mark message as delivered: ${err.message}`);
    });
  }

  notifyFriendRequest(email: string, payload: any) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("friend_request_received", payload);
    console.log(`Sent friend_request_received to room ${userRoom}`);
  }

  notifyFriendshipUpdate(email: string, payload: any) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("friendship_updated", payload);
    console.log(`Sent friendship_updated to room ${userRoom}`);
  }

  /**
   * Notify all devices of a user that a conversation has been read
   */
  emitConversationRead(email: string, convId: string) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("conversation_marked_read", { convId });
    // Tell the room that this user has read the chat
    this.server.to(convId.toLowerCase()).emit("participant_read", { convId, email, timestamp: Date.now() });
    this.logger.log(`Notified user ${email} that conversation ${convId} was read`);
  }

  // Gửi thông báo đăng xuất tới thiết bị đích (Đã gia cố để đảm bảo nhận được ở mọi màn hình)
  notifyForceLogout(email: string, targetDeviceId: string, reason?: string) {
    const normalizedEmail = email.toLowerCase();
    const userRoom = `user#${normalizedEmail}`;
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

  notifySecurityAlert(
    email: string,
    payload: {
      type: "NEW_DEVICE_LOGIN" | "PASSWORD_CHANGED";
      title: string;
      message: string;
      at?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("security_alert", {
      ...payload,
      at: payload.at || new Date().toISOString(),
    });
    this.logger.warn(
      `[SOCKET] security_alert emitted to ${userRoom}: ${payload.type}`,
    );
  }


  notifyHistoryCleared(email: string, convId: string) {
    const userRoom = `user#${email.toLowerCase()}`;
    this.server.to(userRoom).emit("history_cleared", { convId });
    console.log(`Sent history_cleared for ${convId} to room ${userRoom}`);
  }

  async emitGroupUpdated(convId: string, payload: any) {
    const metadata = await this.chatService.getConversationMetadata(convId);
    if (metadata && Array.isArray(metadata.members)) {
      for (const member of metadata.members) {
        const userRoom = `user#${String(member).toLowerCase()}`;
        this.server.to(userRoom).emit("group_updated", { convId, ...payload });
      }
    }

    const room = convId.toLowerCase();
    this.server.to(room).emit("group_updated", { convId, ...payload });
    this.logger.log(`[SOCKET] Broadcasted group_updated for ${convId} to all members`);
  }

  emitGroupDissolved(convId: string, actor: string) {
    const room = convId.toLowerCase();
    this.server.to(room).emit("group_dissolved", { convId, actor });
    this.logger.log(`[SOCKET] Broadcasted group_dissolved for ${convId}`);
  }
}
