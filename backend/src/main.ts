import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';
import { RedisIoAdapter } from './infrastructure/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  
  let port = parseInt(process.env.PORT) || 3000;
  const maxRetry = 10;
  let retryCount = 0;

  const startServer = async (p: number) => {
    try {
      await app.listen(p, '0.0.0.0');
      console.log(`\x1b[32m[ZaloEdu] Backend is running on: http://localhost:${p}\x1b[0m`);
      console.log(`\x1b[33m[ZaloEdu] External access (Mobile): http://192.168.4.13:${p}\x1b[0m`);
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && retryCount < maxRetry) {
        console.warn(`\x1b[31m[ZaloEdu] Port ${p} is busy. Trying port ${p + 1}...\x1b[0m`);
        retryCount++;
        await startServer(p + 1);
      } else {
        console.error(`\x1b[31m[ZaloEdu] Failed to start server: ${err.message}\x1b[0m`);
        console.error(`\x1b[33mTip: Run "npm run kill-port" to free up port 3000.\x1b[0m`);
        process.exit(1);
      }
    }
  };

  await startServer(port);
}
bootstrap();
