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
    @Body() body: { conversationId: string; callId: string; type?: 'audio' | 'video' },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    if (!body.conversationId || !body.callId) throw new BadRequestException('conversationId and callId are required');

    this.logger.log(`[API] Create: convId=${body.conversationId}, callId=${body.callId}, type=${body.type}, user=${userEmail}`);
    
    // 1. Tạo meeting (không có attendee)
    await this.callService.createMeeting(body.conversationId, body.callId, userEmail, body.type || 'video');
    
    // 2. Caller tự join ngay để lấy attendee của mình
    return this.callService.joinMeeting(body.conversationId, body.callId, userEmail);
  }

  /**
   * Callee gọi endpoint này để join vào Chime meeting đã tạo.
   */
  @Post('join')
  async joinMeeting(
    @Body() body: { conversationId: string; callId: string },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    if (!body.conversationId || !body.callId) throw new BadRequestException('conversationId and callId are required');

    this.logger.log(`[API] Join: convId=${body.conversationId}, callId=${body.callId}, user=${userEmail}`);
    return this.callService.joinMeeting(body.conversationId, body.callId, userEmail);
  }

  /**
   * Bất kỳ bên nào cũng có thể gọi endpoint này để kết thúc meeting.
   */
  @Post('hangup')
  async hangupMeeting(
    @Body() body: { conversationId: string; callId: string },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    if (!body.callId) throw new BadRequestException('callId is required for hangup');

    this.logger.log(`[API] Hangup: convId=${body.conversationId}, callId=${body.callId}, user=${userEmail}`);
    return this.callService.hangupMeeting(body.conversationId, body.callId, userEmail);
  }
}
