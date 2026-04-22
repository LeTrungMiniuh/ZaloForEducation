import { Logger } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/dynamodb.service';
import { ChatService } from '../chat/chat.service';
import { FriendshipService } from '../chat/friendship.service';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export class BotContextBuilder {
  private readonly logger = new Logger(BotContextBuilder.name);

  constructor(
    private readonly db: DynamoDBService,
    private readonly friendshipService: FriendshipService,
    private readonly chatService: ChatService,
  ) {}

  async build(userEmail: string): Promise<string> {
    const sections: string[] = [];

    sections.push(await this.fetchUserProfile(userEmail));
    sections.push(await this.fetchFriends(userEmail));
    sections.push(await this.fetchConversations(userEmail));

    return sections.filter(Boolean).join('\n\n');
  }

  private async fetchUserProfile(userEmail: string): Promise<string> {
    try {
      const userRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${userEmail}`, SK: 'METADATA' },
        }),
      );
      const u = userRes.Item;
      if (!u) return '';

      return (
        `=== THÔNG TIN NGƯỜI DÙNG ===\n` +
        `Họ tên: ${u.fullName || 'N/A'}\n` +
        `Email: ${u.email || 'N/A'}\n` +
        `Số điện thoại: ${u.phone || 'N/A'}\n` +
        `Địa chỉ: ${u.address || 'N/A'}\n` +
        `Bio: ${u.bio || 'N/A'}\n` +
        `Ngày tham gia: ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : 'N/A'}\n` +
        `Lần đăng nhập cuối: ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('vi-VN') : 'N/A'}`
      );
    } catch (err) {
      this.logger.warn('Failed to fetch user profile for context', err);
      return '';
    }
  }

  private async fetchFriends(userEmail: string): Promise<string> {
    try {
      const friendships = await this.friendshipService.getFriendships(userEmail);
      const accepted = friendships.filter((f) => f.status === 'accepted');
      const pending = friendships.filter((f) => f.status === 'pending');

      const friendList = accepted
        .map((f) => (f.sender_id === userEmail ? f.receiver_id : f.sender_id))
        .join(', ');

      return (
        `=== BẠN BÈ (${accepted.length} bạn) ===\n` +
        (friendList || 'Chưa có bạn bè') +
        (pending.length > 0 ? `\nLời mời kết bạn chờ xử lý: ${pending.length}` : '')
      );
    } catch (err) {
      this.logger.warn('Failed to fetch friendships for context', err);
      return '';
    }
  }

  private async fetchConversations(userEmail: string): Promise<string> {
    try {
      const convs = await this.chatService.getConversationsByUser(userEmail);
      const convSummary = convs
        .slice(0, 10)
        .map((c: any) => {
          const name = c.name || c.id?.substring(0, 20) || 'N/A';
          const type = c.type === 'group' ? '[Nhóm]' : '[Riêng]';
          return `${type} ${name}`;
        })
        .join('\n');

      return (
        `=== HỘI THOẠI (${convs.length} cuộc) ===\n` +
        (convSummary || 'Chưa có hội thoại')
      );
    } catch (err) {
      this.logger.warn('Failed to fetch conversations for context', err);
      return '';
    }
  }
}
