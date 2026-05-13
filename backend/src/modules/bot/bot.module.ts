import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { RagService } from './rag.service';
import { AuthModule } from '../auth/auth.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => ChatModule)],
  controllers: [BotController],
  providers: [BotService, RagService],
  exports: [BotService],
})
export class BotModule implements OnModuleInit {
  constructor(private readonly botService: BotService) {}

  async onModuleInit() {
    // Delay to ensure DynamoDB table is created by InfrastructureModule first
    setTimeout(async () => {
      try {
        await this.botService.ensureBotUser();
      } catch (err) {
        console.warn('[BotModule] Failed to seed bot user (will retry on first use):', err.message);
      }
    }, 3000);
  }
}
