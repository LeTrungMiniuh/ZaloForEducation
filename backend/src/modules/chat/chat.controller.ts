import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ChatService } from "./chat.service";
import { MessageService } from "./message.service";
import { FriendshipService } from "./friendship.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProfileCompleteGuard } from "../auth/guards/profile-complete.guard";
import { UserService } from "../user/user.service";
import { S3Service } from "../../infrastructure/s3.service";

@Controller("chat")
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly messageService: MessageService,
    private readonly friendshipService: FriendshipService,
    private readonly userService: UserService,
    private readonly s3Service: S3Service,
  ) {}

  // --- CONVERSATIONS ---
  @Get("conversations")
  async getInbox(@Req() req: any) {
    const email = req.user.email;
    return await this.chatService.getConversationsByUser(email);
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
    @Query("limit") limit: number,
  ) {
    return await this.messageService.getMessages(convId, limit || 50);
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
    return await this.messageService.sendMessage(
      convId,
      email,
      body.content,
      body.type,
      body.media,
      body.files,
      body.replyTo,
    );
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
      action: "react" | "recall" | "pin" | "unpin";
      reactAction?: "add" | "remove";
      emoji?: string;
      previousEmoji?: string;
    },
    @Req() req: any,
  ) {
    const email = req.user.email;
    return await this.messageService.patchMessage(
      convId,
      messageId,
      email,
      body,
    );
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
}
