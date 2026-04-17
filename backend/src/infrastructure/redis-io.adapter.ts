import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Logger } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: any;
  private readonly logger = new Logger(RedisIoAdapter.name);

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.error('REDIS_URL is not defined in environment variables');
      return;
    }

    this.logger.log(`Connecting to Redis for Socket.io Adapter: ${redisUrl.split('@')[1] || 'local'}`);

    const pubClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => this.logger.error('PubClient Redis Error', err));
    subClient.on('error', (err) => this.logger.error('SubClient Redis Error', err));

    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
