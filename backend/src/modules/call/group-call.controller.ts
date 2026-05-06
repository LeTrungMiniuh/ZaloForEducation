import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  Logger,
  Get,
  Param,
} from '@nestjs/common';
import { GroupCallService } from './group-call.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('group-call')
export class GroupCallController {
  private readonly logger = new Logger(GroupCallController.name);

  constructor(private readonly groupCallService: GroupCallService) {}

  @Post('create')
  async createGroupMeeting(
    @Body() body: { conversationId: string; callId: string; type?: 'audio' | 'video'; initiatorProfile?: any },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    
    this.logger.log(`[GroupAPI] Create: convId=${body.conversationId}, callId=${body.callId}, user=${userEmail}`);
    
    await this.groupCallService.createGroupMeeting(
      body.conversationId, 
      body.callId, 
      userEmail, 
      body.type || 'video'
    );
    
    // [SENIOR] initiator profile
    const profile = { ...req.user, ...body.initiatorProfile };

    return this.groupCallService.joinGroupMeeting(
      body.conversationId, 
      body.callId, 
      userEmail,
      profile
    );
  }

  @Post('join')
  async joinGroupMeeting(
    @Body() body: { conversationId: string; callId: string; userProfile?: any },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    
    // [SENIOR] Combine JWT user with provided profile if any
    const profile = { ...req.user, ...body.userProfile };
    
    this.logger.log(`[GroupAPI] Join: convId=${body.conversationId}, callId=${body.callId}, user=${userEmail}`);
    return this.groupCallService.joinGroupMeeting(
      body.conversationId, 
      body.callId, 
      userEmail,
      profile
    );
  }

  @Post('hangup')
  async hangupGroupMeeting(
    @Body() body: { conversationId: string; callId: string; attendeeId: string },
    @Request() req: any,
  ) {
    const userEmail: string = req.user?.email;
    if (!userEmail) throw new BadRequestException('User email not found in token');
    
    this.logger.log(`[GroupAPI] Hangup: convId=${body.conversationId}, callId=${body.callId}, user=${userEmail}, attendee=${body.attendeeId}`);
    return this.groupCallService.leaveGroupMeeting(body.conversationId, body.callId, body.attendeeId);
  }

  @Get('active/:conversationId')
  async getActiveCall(@Param('conversationId') conversationId: string) {
    return this.groupCallService.getActiveCall(conversationId);
  }

  @Get('status/:callId')
  async getCallStatus(@Param('callId') callId: string) {
    const session = await this.groupCallService.getCallSession(callId);
    return {
      callId,
      isActive: !!session,
      isGroup: !!session?.isGroup,
      callType: session?.callType || 'video',
      conversationId: session?.conversationId || null
    };
  }
}
