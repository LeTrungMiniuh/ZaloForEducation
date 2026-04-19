import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType | null = null;
  private enabled = true;

  constructor() {
    const url = process.env.REDIS_URL;

    if (!url) {
      this.enabled = false;
      console.warn('[Redis] REDIS_URL is not defined; Redis features are disabled in this environment.');
      return;
    }

    const password = process.env.REDIS_PASSWORD;

    this.client = createClient({
      url,
      password: password,
      socket: {
        reconnectStrategy: (retries) => {
          const delay = Math.min(retries * 100, 10000); // Exponential backoff max 10s
          console.warn(`[Redis] Connection failed. Retrying in ${delay}ms... (Attempt ${retries})`);
          return delay;
        },
        connectTimeout: 10000,
      },
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.client.on('connect', () => console.log('[Redis] Connecting to server...'));
    this.client.on('ready', () => console.log('[Redis] Client is ready and authenticated.'));
    this.client.on('reconnecting', () => console.warn('[Redis] Client is trying to reconnect...'));
    this.client.on('error', (err) => console.error('[Redis] Client Error:', err.message));
    this.client.on('end', () => console.warn('[Redis] Client connection closed.'));
  }

  async onModuleInit() {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.connect();
    } catch (err) {
      console.error('[Redis] Initial connection failed:', err.message);
      this.enabled = false;
      try {
        await this.client.disconnect();
      } catch {
        // Ignore cleanup errors when Redis is unavailable.
      }
    }
  }

  async onModuleDestroy() {
    if (!this.enabled || !this.client) return;
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (!this.enabled || !this.client) return;
    if (ttlSeconds) {
      await this.client.set(key, value, {
        EX: ttlSeconds,
      });
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.enabled || !this.client) return null;
    const value = await this.client.get(key);
    return value as string | null;
  }

  async del(key: string) {
    if (!this.enabled || !this.client) return;
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    if (!this.enabled || !this.client) return 0;
    return await this.client.incr(key);
  }

  async sAdd(key: string, value: string) {
    if (!this.enabled || !this.client) return;
    await this.client.sAdd(key, value);
  }

  async sMembers(key: string): Promise<string[]> {
    if (!this.enabled || !this.client) return [];
    return await this.client.sMembers(key);
  }

  async sRem(key: string, value: string) {
    if (!this.enabled || !this.client) return;
    await this.client.sRem(key, value);
  }

  async expire(key: string, seconds: number) {
    if (!this.enabled || !this.client) return;
    await this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    if (!this.enabled || !this.client) return -1;
    return await this.client.ttl(key);
  }
}
