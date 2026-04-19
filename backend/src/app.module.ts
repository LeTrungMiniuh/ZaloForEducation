import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ChatModule } from './modules/chat/chat.module';
import { OtpModule } from './modules/otp/otp.module';
import { CallModule } from './modules/call/call.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: fs.existsSync('.env') ? '.env' : 'backend/.env',
    }),
    InfrastructureModule,
    AuthModule,
    UserModule,
    ChatModule,
    OtpModule,
    CallModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
