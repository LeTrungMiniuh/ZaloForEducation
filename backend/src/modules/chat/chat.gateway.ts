import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { ChatService } from "./chat.service";
import { SessionService } from "../auth/session.service";

@WebSocketGateway({
  cors: { origin: "*" },
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
  ) {}

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
    if (data.email) {
      // --- NEW LOGIC: VERIFY SESSION ---
      if (data.deviceId) {
        const session = await this.sessionService.getSession(
          data.email,
          data.deviceId,
        );

        if (!session) {
          console.warn(
            `[SOCKET] Unauthorized identity join attempt: ${data.email} on ${data.deviceId}`,
          );
          // Gửi payload chuẩn để Client nhận diện được và logout
          client.emit("force_logout", {
            targetDeviceId: data.deviceId,
            message:
              "Phiên làm việc không hợp lệ hoặc đã bị chấm dứt. Vui lòng đăng nhập lại.",
            time: new Date().toLocaleTimeString("vi-VN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
          // Không disconnect ngay, để client nhận được event và tự xử lý
          return;
        }
      }

      const userRoom = `user#${data.email}`;
      client.join(userRoom);

      // Sếp yêu cầu: Tham gia vào room riêng của thiết bị để "đá" đích danh
      if (data.deviceId) {
        client.join(data.deviceId);
        console.log(`Client ${client.id} joined device room: ${data.deviceId}`);
      }

      console.log(
        `Client ${client.id} identified as ${data.email}, joined room ${userRoom}`,
      );
    }
  }

  @SubscribeMessage("sendMessage")
  handleMessage(@MessageBody() data: { convId: string; message: any }): void {
    // Broadcast message to everyone in the conversation room
    this.server.to(data.convId).emit("receiveMessage", data.message);
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
}
