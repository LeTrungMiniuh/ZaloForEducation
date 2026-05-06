import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { GroupCallService } from "./group-call.service";

@WebSocketGateway({
  cors: { origin: "*" },
})
export class GroupCallGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GroupCallGateway.name);
  private waitForJoinTimeouts = new Map<string, any>();

  constructor(private readonly groupCallService: GroupCallService) {}
  
  onModuleInit() {
    // [SENIOR] Periodic cleanup of stale participants (every 20s)
    setInterval(() => {
      this.cleanupStaleParticipants();
    }, 20000);
  }

  async cleanupStaleParticipants() {
    try {
      const activeMeetings = await this.groupCallService.getActiveMeetings();
      for (const callId of activeMeetings) {
        const participants = await this.groupCallService.getParticipants(callId);
        const now = Date.now();
        
        for (const [attendeeId, p] of Object.entries(participants)) {
          // TTL is 60s
          if (now - (p as any).lastSeenAt > 60000) {
            this.logger.warn(`[Cleanup] Removing stale participant ${attendeeId} from ${callId}`);
            await this.groupCallService.leaveGroupMeeting("STALE", callId, attendeeId);
            
            // Notify others
            this.server.to(callId.toLowerCase()).emit("group-call:peer_left", {
              callId,
              attendeeId,
              userEmail: (p as any).email,
              isStale: true
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`[Cleanup] Error during stale participant cleanup: ${error.message}`);
    }
  }

  /**
   * [GROUP] Mời các thành viên trong nhóm vào cuộc gọi.
   */
  @SubscribeMessage("group-call:invite")
  handleGroupInvite(
    @MessageBody()
    data: {
      convId: string;
      fromEmail: string;
      recipients: string[];
      callerProfile: any;
      callType: "audio" | "video";
      callId: string;
    },
  ) {
    if (!data?.convId || !data?.callId || !data.recipients) return;

    this.logger.log(`[GroupInvite] ${data.fromEmail} calling ${data.recipients.length} peers in ${data.convId}`);

    data.recipients.forEach((email) => {
      const targetRoom = `user#${email.trim().toLowerCase()}`;
      this.server.to(targetRoom).emit("group-call:incoming", {
        convId: data.convId,
        fromEmail: data.fromEmail,
        callerProfile: data.callerProfile,
        groupName: (data as any).groupName,
        groupAvatar: (data as any).groupAvatar,
        callType: data.callType,
        callId: data.callId,
      });
    });

    // [SENIOR] Broadcast active call status to the whole room for header indicator
    this.server.to(data.convId.toLowerCase()).emit("group-call:active", {
      convId: data.convId,
      callId: data.callId,
      callType: data.callType,
      callerProfile: data.callerProfile,
    });
  }

  /**
   * [GROUP] Một thành viên chấp nhận cuộc gọi.
   */
  @SubscribeMessage("group-call:accept")
  async handleGroupAccept(
    @MessageBody()
    data: { convId: string; callId: string; toEmail: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`[GroupAccept] User in ${data.convId} accepted ${data.callId}`);

    // Thông báo cho các thiết bị khác của chính user này
    const userEmail = client["user"]?.email?.toLowerCase();
    if (userEmail) {
      const myRoom = `user#${userEmail}`;
      client.broadcast.to(myRoom).emit("group-call:handled_elsewhere", {
        convId: data.convId,
        callId: data.callId,
      });
    }

    // Đặt timer chờ join (Ghost Hangup protection) - 30s cho group
    const callId = data.callId;
    if (!this.waitForJoinTimeouts.has(callId)) {
      const timeout = setTimeout(async () => {
        this.logger.warn(`[GroupGhost] No one joined meeting ${callId} after 30s. Cleaning up.`);
        await this.groupCallService.endGroupMeeting(data.convId, callId);
        this.server.to(data.convId.toLowerCase()).emit("group-call:ended", { convId: data.convId, callId });
        this.waitForJoinTimeouts.delete(callId);
      }, 30000);
      this.waitForJoinTimeouts.set(callId, timeout);
    }
  }

  /**
   * [GROUP] Thông báo đã join thành công Chime (để xóa timer chờ).
   */
  @SubscribeMessage("group-call:peer_joined")
  async handleGroupPeerJoined(
    @MessageBody()
    data: { convId: string; callId: string; userEmail: string; attendeeId: string; participant?: any },
  ) {
    const callId = data.callId;
    this.logger.log(`[GroupPeerJoined] ${data.userEmail} joined ${callId} with ${data.attendeeId}`);

    // Xóa timer chờ
    const timeout = this.waitForJoinTimeouts.get(callId);
    if (timeout) {
      clearTimeout(timeout);
      this.waitForJoinTimeouts.delete(callId);
      this.logger.log(`[GroupGhost] Timer cleared for ${callId}`);
    }

    // Broadcast tới toàn nhóm
    this.server.to(data.convId.toLowerCase()).emit("group-call:peer_joined", {
      convId: data.convId,
      callId,
      userEmail: data.userEmail,
      attendeeId: data.attendeeId,
      participant: data.participant,
    });
  }

  /**
   * [GROUP] Một thành viên rời cuộc gọi.
   */
  @SubscribeMessage("group-call:hangup")
  async handleGroupHangup(
    @MessageBody()
    data: { convId: string; callId: string; userEmail: string; attendeeId: string },
  ) {
    this.logger.log(`[GroupHangup] ${data.userEmail} (${data.attendeeId}) leaving ${data.callId}`);

    const result = await this.groupCallService.leaveGroupMeeting(data.convId, data.callId, data.attendeeId);

    if (result.meetingDeleted) {
      this.logger.log(`[GroupLifecycle] Call ${data.callId} fully ended.`);
      this.server.to(data.convId.toLowerCase()).emit("group-call:ended", {
        convId: data.convId,
        callId: data.callId,
      });
    } else {
      // Thông báo cho những người còn lại
      this.server.to(data.convId.toLowerCase()).emit("group-call:peer_left", {
        convId: data.convId,
        callId: data.callId,
        userEmail: data.userEmail,
        attendeeId: data.attendeeId,
      });
    }
  }

  /**
   * [GROUP] Heartbeat để duy trì session.
   */
  @SubscribeMessage("group-call:heartbeat")
  async handleHeartbeat(
    @MessageBody()
    data: { callId: string; attendeeId: string },
  ) {
    await this.groupCallService.heartbeat(data.callId, data.attendeeId);
  }
}
