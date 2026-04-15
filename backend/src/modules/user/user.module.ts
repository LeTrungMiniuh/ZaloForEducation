import { Module, forwardRef } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

import { AuthModule } from "../auth/auth.module";
import { ChatModule } from "../chat/chat.module";

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => ChatModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
