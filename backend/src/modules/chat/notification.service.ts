import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor() {
    // Sẽ cấu hình Firebase Admin SDK ở đây khi có API Key
  }

  /**
   * SEND PUSH NOTIFICATION
   * @param targetEmail Email người nhận
   * @param payload Dữ liệu thông báo (title, body, data)
   */
  async sendNotification(targetEmail: string, payload: { title: string; body: string; data?: any }) {
    this.logger.log(`[Notification] Preparing to send push to ${targetEmail}: ${payload.title}`);
    
    // TODO: 1. Lấy FCM Token từ DB của User
    // TODO: 2. Gọi Firebase Messaging SDK
    
    this.logger.log(`[Notification] Mock push sent to ${targetEmail}`);
    return true;
  }

  /**
   * BROADCAST TO MULTIPLE USERS
   */
  async broadcastNotification(emails: string[], payload: { title: string; body: string; data?: any }) {
    this.logger.log(`[Notification] Broadcasting to ${emails.length} users`);
    const promises = emails.map(email => this.sendNotification(email, payload));
    await Promise.all(promises);
  }
}
