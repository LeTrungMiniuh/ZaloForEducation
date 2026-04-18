import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ChatService } from "./chat.service";
import { MessageService } from "./message.service";
import { FriendshipService } from "./friendship.service";
import { ChatGateway } from "./chat.gateway";
import { NotificationService } from "./notification.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProfileCompleteGuard } from "../auth/guards/profile-complete.guard";
import { UserService } from "../user/user.service";
import { S3Service } from "../../infrastructure/s3.service";

@Controller("chat")
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
export class ChatController {
  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => MessageService))
    private readonly messageService: MessageService,
    @Inject(forwardRef(() => FriendshipService))
    private readonly friendshipService: FriendshipService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly s3Service: S3Service,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    private readonly notificationService: NotificationService,
  ) {}

  // --- CONVERSATIONS ---
  @Get("conversations")
  async getInbox(@Req() req: any) {
    const email = req.user.email;
    return await this.chatService.getConversationsByUser(email);
  }

  @Get("search")
  async globalSearch(@Query("q") query: string, @Req() req: any) {
    return await this.chatService.globalSearch(query, req.user.email);
  }

  @Post("conversations/direct")
  async createDirect(@Body() body: { targetEmail: string }, @Req() req: any) {
    const email = req.user.email;
    return await this.chatService.createDirectConversation(
      email,
      body.targetEmail,
    );
  }

  @Post("conversations/group")
  async createGroup(
    @Body() body: { name: string; members: string[] },
    @Req() req: any,
  ) {
    const email = req.user.email;
    return await this.chatService.createGroupConversation(
      email,
      body.members,
      body.name,
    );
  }

  // --- MESSAGES ---
  @Get("conversations/:convId/messages")
  async getMessages(
    @Param("convId") convId: string,
    @Req() req: any,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    const email = req.user.email;
    let lastEvaluatedKey = undefined;
    if (cursor) {
      try {
        lastEvaluatedKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
      } catch (e) {
        throw new BadRequestException('Invalid pagination cursor');
      }
    }
    return await this.messageService.getMessages(convId, email, limit || 50, lastEvaluatedKey);
  }

  @Post("conversations/:convId/messages")
  async sendMessage(
    @Param("convId") convId: string,
    @Body()
    body: {
      content: string;
      type?: any;
      media?: any[];
      files?: any[];
      replyTo?: any;
    },
    @Req() req: any,
  ) {
    const email = req.user.email;
    const res = await this.messageService.sendMessage(
      convId,
      email,
      body.content,
      body.type,
      body.media,
      body.files,
      body.replyTo,
    );

    const normalizedConvId = convId.toLowerCase();

    // 1. BROADCAST REAL-TIME VIA SOCKET
    this.chatGateway.server.to(normalizedConvId).emit('receiveMessage', res);
    console.log(`[SOCKET] Broadcasted to room: ${normalizedConvId}`);

    // 2. BROADCAST REAL-TIME TO ALL MEMBERS' PERSONAL ROOMS (For conversation list updates)
    const convMetadata = await this.chatService.getConversationMetadata(convId);
    if (convMetadata && convMetadata.members) {
      for (const member of convMetadata.members) {
        // Emit to user#email room so all their devices update the "tab" preview
        const userRoom = `user#${member.toLowerCase()}`;
        this.chatGateway.server.to(userRoom).emit('receiveMessage', res);
        console.log(`[SOCKET] Broadcasted to user room: ${userRoom}`);
      }
    }

    // 3. SEND PUSH NOTIFICATION (FRAMEWORK READY)
    if (convMetadata) {
      const recipients = convMetadata.members.filter(m => m !== email);
      this.notificationService.broadcastNotification(recipients, {
        title: convMetadata.name || 'Tin nhắn mới',
        body: body.content || '[Hình ảnh/Tệp tin]',
        data: { convId, messageId: res.id }
      });
    }

    return res;
  }

  @Post("uploads")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadChatFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const folder = file.mimetype?.startsWith("image/")
      ? "chat/images"
      : "chat/files";
    const fileUrl = await this.s3Service.uploadFile(file, folder);

    return {
      name: file.originalname,
      fileName: file.originalname,
      mimeType: file.mimetype || "application/octet-stream",
      fileType: file.mimetype || "application/octet-stream",
      size: file.size,
      fileUrl,
      dataUrl: fileUrl,
    };
  }

  @Patch("conversations/:convId/messages/:messageId")
  async patchMessage(
    @Param("convId") convId: string,
    @Param("messageId") messageId: string,
    @Body()
    body: {
      action: "react" | "recall" | "pin" | "unpin" | "deleteForMe";
      reactAction?: "add" | "remove";
      emoji?: string;
      previousEmoji?: string;
    },
    @Req() req: any,
  ) {
    const email = req.user.email;
    const res = await this.messageService.patchMessage(
      convId,
      messageId,
      email,
      body,
    );

    // BROADCAST REAL-TIME VIA SOCKET
    if (body.action === 'react') {
      this.chatGateway.server.to(convId).emit('message_reaction', { 
        messageId, 
        reactions: res.reactions 
      });
    } else if (body.action === 'recall') {
      this.chatGateway.server.to(convId).emit('message_recalled', { 
        messageId, 
        conversationId: convId,
        recalledBy: email 
      });
    } else if (body.action === 'pin' || body.action === "unpin") {
      this.chatGateway.server.to(convId).emit('PIN_UPDATE', { 
        conversationId: convId,
        pinnedMessageIds: res.pinnedMessageIds
      });
      // Legacy support if needed
      this.chatGateway.server.to(convId).emit('message_pinned', { 
        messageId, 
        conversationId: convId,
        pinned: body.action === 'pin',
        pinnedBy: email 
      });
    }

    return res;
  }

  // --- FRIENDSHIPS ---
  @Get("friends")
  async getFriends(@Req() req: any) {
    const email = req.user.email;
    return await this.friendshipService.getFriendships(email);
  }

  @Get("friends/search")
  async searchFriend(@Req() req: any, @Query("email") email?: string) {
    const myEmail = req.user.email;
    const targetEmail = (email || "").trim().toLowerCase();

    if (!targetEmail) {
      throw new BadRequestException("Email is required");
    }

    if (targetEmail === myEmail.toLowerCase()) {
      const me = await this.userService.getUserProfile(myEmail);
      return {
        found: true,
        isSelf: true,
        user: me.profile,
        friendship: null,
      };
    }

    try {
      const profile = await this.userService.getUserProfile(targetEmail);
      const friendships = await this.friendshipService.getFriendships(myEmail);
      const friendship = friendships.find(
        (item) =>
          item.sender_id === targetEmail || item.receiver_id === targetEmail,
      );

      return {
        found: true,
        isSelf: false,
        user: profile.profile,
        friendship: friendship
          ? {
              senderEmail: friendship.sender_id,
              receiverEmail: friendship.receiver_id,
              status: friendship.status,
            }
          : null,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          found: false,
          isSelf: false,
          user: null,
          friendship: null,
        };
      }
      throw error;
    }
  }

  @Post("friends/request")
  async sendFriendRequest(
    @Body() body: { targetEmail: string },
    @Req() req: any,
  ) {
    const email = req.user.email;
    return await this.friendshipService.sendRequest(email, body.targetEmail);
  }

  @Post("friends/accept")
  async acceptFriendRequest(
    @Body() body: { senderEmail: string },
    @Req() req: any,
  ) {
    const email = req.user.email;
    return await this.friendshipService.acceptRequest(email, body.senderEmail);
  }

  @Delete("conversations/:id/history")
  async deleteChatHistory(@Param("id") id: string, @Req() req: any) {
    const email = req.user.email;
    const result = await this.messageService.clearHistory(id, email);
    this.chatGateway.notifyHistoryCleared(email, id);
    return result;
  }

  @Patch("conversations/:id/read")
  async markAsRead(@Param("id") id: string, @Req() req: any) {
    return await this.chatService.markConversationAsRead(id, req.user.email);
  }
}
