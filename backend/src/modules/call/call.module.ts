import { Module, forwardRef } from '@nestjs/common';
import { ChimeSDKMeetingsClient } from '@aws-sdk/client-chime-sdk-meetings';
import { CallService } from './call.service';
import { CallController } from './call.controller';
import { CallGateway } from './call.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    forwardRef(() => AuthModule), // Dùng JwtAuthGuard trong CallController
  ],
  providers: [
    {
      provide: 'CHIME_CLIENT',
      useFactory: () => {
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID || '';
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || '';
        const sessionToken = process.env.AWS_SESSION_TOKEN;
        const region = process.env.AWS_REGION || 'ap-southeast-1';

        console.log(`[Chime] Initializing client — Region: ${region}, Key: ${accessKeyId.substring(0, 4)}****`);

        const config: any = {
          region,
          credentials: { accessKeyId, secretAccessKey },
        };

        if (sessionToken) {
          config.credentials.sessionToken = sessionToken;
        }

        return new ChimeSDKMeetingsClient(config);
      },
    },
    CallService,
    CallGateway,
  ],
  controllers: [CallController],
  exports: [CallService],
})
export class CallModule {}
