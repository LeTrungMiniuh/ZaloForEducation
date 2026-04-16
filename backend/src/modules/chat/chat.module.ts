import { forwardRef, Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";
import { MessageService } from "./message.service";
import { FriendshipService } from "./friendship.service";
import { ChatController } from "./chat.controller";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";

import { NotificationService } from "./notification.service";
import { WsJwtGuard } from "./ws-jwt.guard";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => UserModule)],
  controllers: [ChatController],
  providers: [ChatGateway, ChatService, MessageService, FriendshipService, NotificationService, WsJwtGuard],
  exports: [ChatGateway, ChatService, MessageService, FriendshipService, NotificationService, WsJwtGuard],
})
export class ChatModule {}
