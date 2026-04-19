import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { CallService } from './call.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('call')
export class CallController {
  private readonly logger = new Logger(CallController.name);

  constructor(private readonly callService: CallService) {}

  /**
   * Caller gọi endpoint này để tạo/lấy Chime meeting.
   * JWT token được dùng để xác định email người tạo.
   */
  @Post('create')
  async createMeeting(
    @Body() body: { conversationId: string; type?: 'audio' | 'video' },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    if (!body.conversationId) throw new BadRequestException('conversationId is required');

    this.logger.log(`[API] Create: convId=${body.conversationId}, type=${body.type}, user=${userEmail}`);
    return this.callService.createMeeting(body.conversationId, userEmail, body.type || 'video');
  }

  /**
   * Callee gọi endpoint này để join vào Chime meeting đã tạo.
   */
  @Post('join')
  async joinMeeting(
    @Body() body: { conversationId: string },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    if (!body.conversationId) throw new BadRequestException('conversationId is required');

    this.logger.log(`[API] Join: convId=${body.conversationId}, user=${userEmail}`);
    return this.callService.joinMeeting(body.conversationId, userEmail);
  }

  /**
   * Bất kỳ bên nào cũng có thể gọi endpoint này để kết thúc meeting.
   */
  @Post('hangup')
  async hangupMeeting(
    @Body() body: { conversationId: string },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');

    this.logger.log(`[API] Hangup: convId=${body.conversationId}, user=${userEmail}`);
    return this.callService.hangupMeeting(body.conversationId, userEmail);
  }
}
