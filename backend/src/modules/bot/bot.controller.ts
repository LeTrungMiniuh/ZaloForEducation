import { Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { BotService } from './bot.service';
import { BOT_EMAIL, BOT_NAME } from '@zalo-edu/shared';

@Controller('bot')
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  /**
   * POST /bot/conversation
   * Get or create a bot conversation for the current user.
   */
  @Post('conversation')
  async getOrCreateConversation(@Req() req: any) {
    const userEmail = req.user.email;
    // Ensure bot user exists before creating conversation
    await this.botService.ensureBotUser();
    const convId = await this.botService.getOrCreateBotConversation(userEmail);
    return { convId, botEmail: BOT_EMAIL, botName: BOT_NAME };
  }
}
