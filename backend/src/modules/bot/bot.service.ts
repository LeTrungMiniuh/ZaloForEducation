import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DynamoDBService } from '../../infrastructure/dynamodb.service';
import { AiService, ChatMessage, ContentPart } from '../../infrastructure/ai/ai.service';
import { ChatGateway } from '../chat/chat.gateway';
import { MessageService } from '../chat/message.service';
import { ChatService } from '../chat/chat.service';
import { FriendshipService } from '../chat/friendship.service';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { RedisService } from '../../infrastructure/redis.service';
import { BotContextBuilder } from './bot.context';
import { PDFParse } from 'pdf-parse';
import { BOT_EMAIL, BOT_NAME, BOT_AVATAR } from '@zalo-edu/shared';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly db: DynamoDBService,
    private readonly aiService: AiService,
    private readonly messageService: MessageService,
    private readonly friendshipService: FriendshipService,
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
    private readonly chatGateway: ChatGateway,
  ) {
    this.contextBuilder = new BotContextBuilder(db, friendshipService, chatService);
  }

  private readonly contextBuilder: BotContextBuilder;

  /**
   * Ensure bot user exists in DynamoDB. Called once on module init.
   */
  async ensureBotUser(): Promise<void> {
    const existing = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${BOT_EMAIL}`, SK: 'METADATA' },
      }),
    );

    if (existing.Item) return;

    this.logger.log('Seeding bot user into DynamoDB...');
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: `USER#${BOT_EMAIL}`,
          SK: 'METADATA',
          email: BOT_EMAIL,
          fullName: BOT_NAME,
          avatarUrl: BOT_AVATAR,
          bio: 'Trợ lý AI giáo dục của ZaloEdu. Tôi có thể trả lời câu hỏi dựa trên dữ liệu hệ thống.',
          status: 'active',
          isActive: true,
          role: 'BOT',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    this.logger.log('Bot user seeded successfully.');
  }

  /**
   * Get or create a bot conversation for a user.
   * Returns the conversation ID.
   */
  async getOrCreateBotConversation(userEmail: string): Promise<string> {
    const sorted = [userEmail, BOT_EMAIL].sort();
    const convId = `CONV#DIRECT#${sorted[0]}#${sorted[1]}`;

    // Check if exists
    const existing = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: 'METADATA' },
      }),
    );

    if (existing.Item) return convId;

    // Create new bot conversation
    const timestamp = new Date().toISOString();
    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: convId,
                SK: 'METADATA',
                id: convId,
                type: 'direct',
                members: [userEmail, BOT_EMAIL],
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${userEmail}`,
                SK: convId,
                type: 'direct',
                partner: BOT_EMAIL,
                createdAt: timestamp,
              },
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${BOT_EMAIL}`,
                SK: convId,
                type: 'direct',
                partner: userEmail,
                createdAt: timestamp,
              },
            },
          },
        ],
      }),
    );

    return convId;
  }

  /**
   * Build the system prompt with user context.
   */
  private buildSystemPrompt(userContext: string): string {
    return (
      `Bạn là ${BOT_NAME}, trợ lý AI giáo dục tích hợp trong app ZaloEdu.\n` +
      `Bạn có thể truy cập dữ liệu người dùng trong hệ thống.\n` +
      `Trả lời bằng tiếng Việt, ngắn gọn, thân thiện.\n\n` +
      `${userContext}\n\n` +
      `QUY TẮC CHUNG:\n` +
      `- KHI NGƯỜI DÙNG HỎI VỀ: tên, email, phone, địa chỉ, bio, số bạn, danh sách bạn, số hội thoại → TRẢ LỜI DỰA TRÊN DỮ LIỆU Ở TRÊN.\n` +
      `- Ví dụ: "Mình có bao nhiêu bạn?" → đọc phần BẠN BÈ ở trên và trả lời chính xác.\n` +
      `- Ví dụ: "Số điện thoại của mình?" → đọc phần THÔNG TIN NGƯỜI DÙNG ở trên.\n` +
      `- Nếu người dùng chỉ chào hỏi (alo, hi, hello) → chào lại ngắn gọn rồi GỢI Ý họ có thể hỏi gì: xem thông tin tài khoản, số bạn bè, hội thoại, hoặc gửi ảnh/PDF bài học để phân tích.\n` +
      `- KHÔNG BAO GIỜ tiết lộ mật khẩu, token, googleId.\n` +
      `- Nếu dữ liệu trống (ví dụ: "Chưa có bạn bè") → nói đúng sự thật và gợi ý cách thêm bạn.\n\n` +
      `QUY TẮC PHÂN TÍCH ẢNH / PDF BÀI HỌC:\n` +
      `- Khi người dùng gửi kèm ảnh hoặc PDF → phân tích nội dung.\n` +
      `- Tóm tắt nội dung chính ngắn gọn.\n` +
      `- Liệt kê danh sách việc cần làm (to-do list) nếu có bài tập/yêu cầu.\n` +
      `- Nếu là tài liệu học tập:\n` +
      `  + Tóm tắt bằng BẢNG (Markdown table) khi có dữ liệu so sánh, phân loại.\n` +
      `  + Tóm tắt bằng SƠ ĐỒ TƯ DUY (text-based mindmap dùng → và cây phân nhánh) khi có cấu trúc khái niệm.\n` +
      `  + Trích xuất và trình bày CÔNG THỨC rõ ràng (dùng block code nếu cần).\n` +
      `- Nếu ảnh chứa bài viết/đề bài → đọc và giải thích, gợi ý hướng giải.\n` +
      `- Nếu PDF quá dài → tóm tắt phần quan trọng nhất, gợi ý đọc chi tiết từng phần.`
    );
  }

  /**
   * Handle an incoming message to the bot conversation.
   * Called by ChatController after saving the user's message.
   */
  async handleIncomingMessage(
    convId: string,
    userEmail: string,
    userMessage: string,
    media?: any[],
    files?: any[],
  ): Promise<any | null> {
    // Rate limit: 20 messages per user per minute
    const rateKey = `bot_rate:${userEmail}`;
    const count = parseInt(await this.redisService.get(rateKey) || '0');
    if (count >= 20) {
      const reply = await this.messageService.sendMessage(
        convId,
        BOT_EMAIL,
        'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi một chút rồi thử lại nhé!',
        'text',
      );
      this.emitBotMessage(convId, userEmail, reply);
      return reply;
    }
    await this.redisService.set(rateKey, String(count + 1), 60);

    try {
      // 1. Fetch user context from DynamoDB
      const userContext = await this.contextBuilder.build(userEmail);

      // 2. Fetch recent chat history (last 10 messages) for conversation continuity
      const recentMessages = await this.messageService.getMessages(convId, userEmail, 10);
      const historyMessages: ChatMessage[] = recentMessages.messages
        .filter((m: any) => !m.recalled)
        .map((m: any) => {
          const role = (m.senderId === BOT_EMAIL ? 'assistant' : 'user') as 'user' | 'assistant';
          // Include media/files from history messages so AI knows what was discussed
          const content = this.buildHistoryContent(role, m);
          return { role, content };
        })
        .reverse();

      // Remove the last message (it's the current user message, we'll add it fresh)
      if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === 'user') {
        historyMessages.pop();
      }

      // 3. Build user message content (multimodal: text + images + files)
      const userContent = await this.buildUserContent(userMessage, media, files);

      const messages: ChatMessage[] = [
        { role: 'system', content: this.buildSystemPrompt(userContext) },
        ...historyMessages.slice(-8), // Keep last 8 messages for context window
        { role: 'user', content: userContent },
      ];

      // 4. Call AI
      const aiResponse = await this.aiService.chat(messages);

      // 5. Save bot response as a message in DynamoDB
      const botMessage = await this.messageService.sendMessage(
        convId,
        BOT_EMAIL,
        aiResponse.text,
        'text',
      );

      // 6. Emit via WebSocket
      this.emitBotMessage(convId, userEmail, botMessage);

      return botMessage;
    } catch (error) {
      this.logger.error('Bot failed to generate response', error);

      // Send fallback message
      try {
        const fallback = await this.messageService.sendMessage(
          convId,
          BOT_EMAIL,
          'Xin lỗi, tôi gặp sự cố kỹ thuật. Vui lòng thử lại sau nhé!',
          'text',
        );
        this.emitBotMessage(convId, userEmail, fallback);
        return fallback;
      } catch (e) {
        this.logger.error('Failed to send fallback message', e);
        return null;
      }
    }
  }

  /**
   * Build content for a history message. Includes media/files from previous
   * messages so the AI can distinguish old attachments from the current one.
   * Only includes images (skip heavy PDFs in history to save tokens).
   */
  private buildHistoryContent(role: 'user' | 'assistant', msg: any): string | ContentPart[] {
    // Assistant messages are always text
    if (role === 'assistant') return msg.content || '';

    // User message with no attachments
    const msgMedia = msg.media || [];
    const msgFiles = msg.files || [];
    const hasMedia = msgMedia.length > 0;
    const hasImageFiles = msgFiles.some((f: any) =>
      (f.mimeType || f.fileType || '').startsWith('image/')
    );

    if (!hasMedia && !hasImageFiles) return msg.content || '';

    // Build multimodal history content (images only, skip PDFs to save tokens)
    const parts: ContentPart[] = [];
    const text = msg.content?.trim() || '[Đính kèm hình ảnh]';
    parts.push({ type: 'text', text: `[Tin nhắn cũ] ${text}` });

    for (const img of msgMedia) {
      const url = img.url || img.dataUrl || img.fileUrl;
      if (url) parts.push({ type: 'image_url', image_url: { url } });
    }
    for (const file of msgFiles) {
      const mt = file.mimeType || file.fileType || '';
      if (mt.startsWith('image/')) {
        const url = file.url || file.dataUrl || file.fileUrl;
        if (url) parts.push({ type: 'image_url', image_url: { url } });
      }
    }

    return parts;
  }

  /**
   * Build multimodal user content from text + media (images) + files (PDFs).
   * Returns string for text-only, or ContentPart[] when attachments present.
   * Images sent as image_url. PDFs: extract text, fallback to note.
   */
  private async buildUserContent(
    text: string,
    media?: any[],
    files?: any[],
  ): Promise<string | ContentPart[]> {
    const hasMedia = media && media.length > 0;
    const hasFiles = files && files.length > 0;

    if (!hasMedia && !hasFiles) return text;

    const parts: ContentPart[] = [];

    // Add text part with clear marker that this is a NEW attachment
    const prompt = text?.trim() || 'Phân tích nội dung đính kèm và tóm tắt bằng tiếng Việt.';
    parts.push({ type: 'text', text: `[TIN NHẮN MỚI - TỆP ĐÍNH KÈM] ${prompt}` });

    // Add image parts
    if (hasMedia) {
      for (const img of media) {
        const url = img.url || img.dataUrl || img.fileUrl;
        if (url) {
          parts.push({ type: 'image_url', image_url: { url } });
        }
      }
    }

    // Handle files: images as image_url, PDFs via text extraction + fallback
    if (hasFiles) {
      for (const file of files) {
        const url = file.url || file.dataUrl || file.fileUrl;
        const mimeType = file.mimeType || file.fileType || '';
        const fileName = file.fileName || file.name || 'tệp đính kèm';

        if (!url) continue;

        if (mimeType.startsWith('image/')) {
          // Image files: send as image_url
          parts.push({ type: 'image_url', image_url: { url } });
        } else if (mimeType === 'application/pdf' || url.toLowerCase().endsWith('.pdf')) {
          // PDFs: extract text, fallback to note
          const extractedText = await this.extractPdfText(url, fileName);
          parts.push({ type: 'text', text: extractedText });
        } else {
          // Other file types: text note
          parts.push({ type: 'text', text: `[Tệp đính kèm: ${fileName}] — định dạng chưa hỗ trợ đọc tự động.` });
        }
      }
    }

    return parts;
  }

  /**
   * Download PDF from URL and extract text.
   * Returns extracted text on success, fallback note on failure.
   */
  private async extractPdfText(url: string, fileName: string): Promise<string> {
    let parser: PDFParse | null = null;
    try {
      this.logger.log(`Attempting to download PDF for extraction: ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        this.logger.warn(`Failed to download PDF: ${url} (status ${response.status})`);
        return `[PDF đính kèm: ${fileName}] — không thể tải tệp (Lỗi ${response.status}).`;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Limit: skip PDFs larger than 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        return `[PDF đính kèm: ${fileName}] — tệp quá lớn (>5MB), không thể đọc tự động.`;
      }

      parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      const text = result.text?.trim();

      if (!text || text.length < 20) {
        return `[PDF đính kèm: ${fileName}] — PDF có thể là dạng ảnh quét, không thể trích xuất văn bản.`;
      }

      // Truncate if very long (keep ~3000 chars to stay within token limits)
      const maxLen = 3000;
      const truncated = text.length > maxLen
        ? text.substring(0, maxLen) + '\n\n[... PDF còn lại đã được cắt bớt ...]'
        : text;

      return `[Nội dung PDF: ${fileName}]\n${truncated}`;
    } catch (error) {
      this.logger.warn(`PDF text extraction failed for ${url}: ${error.message}`);
      return `[PDF đính kèm: ${fileName}] — không thể đọc nội dung tự động.`;
    } finally {
      await parser?.destroy().catch(() => {});
    }
  }

  /**
   * Emit bot message via WebSocket using multiple channels for reliability.
   */
  private emitBotMessage(convId: string, userEmail: string, message: any): void {
    const payload = {
      ...message,
      conversationId: message.conversationId || convId,
    };

    // Channel 1: Room broadcast (for anyone in the conversation room)
    this.chatGateway.server.to(convId).emit('receiveMessage', payload);

    // Channel 2: User-targeted broadcast
    const userRoom = `user#${userEmail}`;
    this.chatGateway.server.to(userRoom).emit('receiveMessage', payload);
  }
}
