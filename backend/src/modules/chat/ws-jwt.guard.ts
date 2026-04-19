import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { SessionService } from '../auth/session.service';
import { DeviceService } from '../auth/device.service';
import { DynamoDBService } from '../../infrastructure/dynamodb.service';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    private readonly db: DynamoDBService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn('No token found in handshake');
      throw new WsException('Unauthorized: Missing token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET') || 'zaloedu_secret',
      });

      // --- LOGIC: VERIFY SESSION ---
      if (payload.email && payload.deviceId) {
        // 1. Kiểm tra Redis
        const session = await this.sessionService.getSession(payload.email, payload.deviceId);
        if (!session) {
          throw new WsException('SESSION_INVALIDATED');
        }

        // 2. Kiểm tra DB Device Status
        const dbDevice = await this.deviceService.getDeviceStatus(payload.email, payload.deviceId);
        if (!dbDevice || dbDevice.status !== 'ACTIVE') {
          throw new WsException('SESSION_INVALIDATED');
        }

        // 3. Kiểm tra User Status
        const userRes = await this.db.docClient.send(new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${payload.email}`, SK: 'METADATA' }
        }));
        const user = userRes.Item;
        if (!user || user.status === 'LOCKED' || user.isDeleted === true) {
          throw new WsException('Unauthorized: Account locked or deleted');
        }
      }

      // Gắn payload vào client để dùng sau này
      client['user'] = payload;
      return true;
    } catch (err) {
      this.logger.error(`WS Authentication failed: ${err.message}`);
      throw new WsException(err.message === 'SESSION_INVALIDATED' ? 'SESSION_INVALIDATED' : 'Unauthorized: Invalid token');
    }
  }

  private extractToken(client: Socket): string | undefined {
    // Ưu tiên lấy từ auth handshake (standard Socket.io)
    const tokenFromAuth = client.handshake.auth?.token;
    if (tokenFromAuth) return tokenFromAuth;

    // Fallback lấy từ header Authorization
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      return type === 'Bearer' ? token : undefined;
    }

    return undefined;
  }
}
