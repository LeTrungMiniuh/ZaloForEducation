import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as fs from "fs";
import * as path from "path";
import { RedisIoAdapter } from "./infrastructure/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const port = parseInt(process.env.PORT || "3000", 10);

  try {
    await app.listen(port, "0.0.0.0");
    console.log(
      `\x1b[32m[ZaloEdu] Backend is running on: http://localhost:${port}\x1b[0m`,
    );
    console.log(
      `\x1b[33m[ZaloEdu] External access (Mobile): http://192.168.1.3:${port}\x1b[0m`,
    );
  } catch (err: any) {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\x1b[31m[ZaloEdu] Port ${port} is already in use. Free it or stop the process using it, then restart the backend.\x1b[0m`,
      );
    } else {
      console.error(
        `\x1b[31m[ZaloEdu] Failed to start server: ${err.message}\x1b[0m`,
      );
    }
    process.exit(1);
  }
}
bootstrap();
