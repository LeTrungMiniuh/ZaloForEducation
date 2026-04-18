import { BadRequestException, Injectable } from "@nestjs/common";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import { S3Service } from "../../infrastructure/s3.service";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { Message } from "@zalo-edu/shared";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class MessageService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly s3Service: S3Service,
  ) {}

  /**
   * SEND A NEW MESSAGE
   */
  async sendMessage(
    convId: string,
    senderEmail: string,
    content: string,
    type: Message["type"] = "text",
    media: any[] = [],
    files: any[] = [],
    replyTo?: any,
    extraFields: Record<string, any> = {},
  ) {
    const timestamp = new Date().toISOString();
    const msgId = uuidv4();
    // Sort key format: MSG#2026-04-10T...#uuid ensures chronological sorting in DynamoDB
    const SK = `MSG#${timestamp}#${msgId}`;

    const newMessage: Message = {
      id: SK,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type,
      media,
      files,
      replyTo,
      status: 'sent',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...extraFields,
    };

    // Fetch conversation metadata to get all members
    const metadata = await this.db.docClient.send(new GetCommand({
      TableName: this.db.tableName,
      Key: { PK: convId, SK: 'METADATA' }
    }));
    const members: string[] = metadata.Item?.members || [];

    const transactItems: any[] = [
      // 1. Save Message
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: convId,
            SK: SK,
            ...newMessage,
          },
        },
      },
      // 2. Update Conversation Metadata
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: convId, SK: "METADATA" },
          UpdateExpression: "SET lastMessage = :sk, lastMessageContent = :content, lastMessageSenderId = :senderId, lastMessageTimestamp = :ts, updatedAt = :time, listClearedAt = :cleared",
          ExpressionAttributeValues: {
            ":sk": SK,
            ":content": (() => {
              if (type === 'system') return content;
              if (!content || content.startsWith('MSG#')) {
                if (media && media.length > 0) return '[Hình ảnh]';
                if (files && files.length > 0) return '[Tệp tin]';
                return 'Tin nhắn mới';
              }
              return content.length > 100 ? content.substring(0, 97) + "..." : content;
            })(),
            ":senderId": senderEmail,
            ":ts": Date.now(),
            ":time": timestamp,
            ":cleared": {} // Reset deep cleanup metadata if needed? No, just keep simple for now
          },
        },
      },
      // 3. Update Sender Mapping (lastReadAt)
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${senderEmail}`, SK: convId },
          UpdateExpression: "SET updatedAt = :ts, lastReadAt = :readAt",
          ExpressionAttributeValues: {
            ":ts": timestamp,
            ":readAt": Date.now(),
          },
        },
      }
    ];

    // 4. Update other members' mappings (updatedAt) to show in their inbox
    for (const member of members) {
      if (member === senderEmail) continue;
      transactItems.push({
        Update: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${member}`, SK: convId },
          UpdateExpression: "SET updatedAt = :ts",
          ExpressionAttributeValues: {
            ":ts": timestamp,
          },
        },
      });
    }

    await this.db.docClient.send(new TransactWriteCommand({
      TransactItems: transactItems
    }));

    return newMessage;
  }

  /**
   * PATCH MESSAGE (REACTION / RECALL / PIN)
   */
  async patchMessage(
    convId: string,
    messageId: string,
    userEmail: string,
    payload: {
      action: "react" | "recall" | "pin" | "unpin" | "deleteForMe";
      reactAction?: "add" | "remove";
      emoji?: string;
      previousEmoji?: string;
    },
  ) {
    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: messageId },
      }),
    );

    const existing = existingRes.Item as any;
    if (!existing) {
      throw new BadRequestException("Message not found");
    }

    const now = new Date().toISOString();

    if (payload.action === "react") {
      if (!payload.emoji || !payload.reactAction) {
        throw new BadRequestException("Invalid reaction payload");
      }

      const reactions: Record<string, string[]> = {
        ...(existing.reactions || {}),
      };

      if (payload.reactAction === "remove") {
        const users = reactions[payload.emoji] || [];
        reactions[payload.emoji] = users.filter((email) => email !== userEmail);
        if (reactions[payload.emoji].length === 0)
          delete reactions[payload.emoji];
      } else {
        const currentEmoji = Object.entries(reactions).find(([, users]) =>
          users.includes(userEmail),
        )?.[0];

        const previousEmoji = payload.previousEmoji || currentEmoji;
        if (previousEmoji && previousEmoji !== payload.emoji) {
          const prevUsers = reactions[previousEmoji] || [];
          reactions[previousEmoji] = prevUsers.filter(
            (email) => email !== userEmail,
          );
          if (reactions[previousEmoji].length === 0)
            delete reactions[previousEmoji];
        }

        reactions[payload.emoji] = Array.from(
          new Set([...(reactions[payload.emoji] || []), userEmail]),
        );
      }

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: convId, SK: messageId },
          UpdateExpression:
            "SET reactions = :reactions, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":reactions": reactions,
            ":updatedAt": now,
          },
        }),
      );

      return {
        ...existing,
        reactions,
        updatedAt: now,
      };
    }

    if (payload.action === "recall") {
      if (existing.senderId !== userEmail) {
        throw new BadRequestException("Only sender can recall this message");
      }

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: convId, SK: messageId },
          UpdateExpression:
            "SET content = :content, recalled = :recalled, media = :media, files = :files, reactions = :reactions, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":content": "Tin nhắn đã được thu hồi",
            ":recalled": true,
            ":media": [],
            ":files": [],
            ":reactions": {},
            ":updatedAt": now,
          },
        }),
      );

      return {
        ...existing,
        content: "Tin nhắn đã được thu hồi",
        recalled: true,
        media: [],
        files: [],
        reactions: {},
        updatedAt: now,
      };
    }

    if (payload.action === "pin" || payload.action === "unpin") {
      const pinned = payload.action === "pin";

      // 1. Fetch current pinned list from METADATA
      const metadataRes = await this.db.docClient.send(new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: 'METADATA' }
      }));
      const metadata = metadataRes.Item as any;
      let pinnedMessageIds = metadata?.pinnedMessageIds || [];

      if (pinned) {
        if (pinnedMessageIds.includes(messageId)) return existing; // Already pinned
        if (pinnedMessageIds.length >= 3) {
          throw new BadRequestException("Đã đạt giới hạn 3 tin nhắn ghim. Vui lòng bỏ ghim tin nhắn cũ trước.");
        }
        pinnedMessageIds.unshift(messageId);
      } else {
        pinnedMessageIds = pinnedMessageIds.filter((id: string) => id !== messageId);
      }

      // 2. Transact update Message and Metadata
      await this.db.docClient.send(new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: this.db.tableName,
              Key: { PK: convId, SK: messageId },
              UpdateExpression: "SET pinned = :pinned, pinnedBy = :pinnedBy, pinnedAt = :pinnedAt, updatedAt = :updatedAt",
              ExpressionAttributeValues: {
                ":pinned": pinned,
                ":pinnedBy": pinned ? userEmail : null,
                ":pinnedAt": pinned ? now : null,
                ":updatedAt": now,
              },
            }
          },
          {
            Update: {
              TableName: this.db.tableName,
              Key: { PK: convId, SK: 'METADATA' },
              UpdateExpression: "SET pinnedMessageIds = :pinedIds, updatedAt = :updatedAt",
              ExpressionAttributeValues: {
                ":pinedIds": pinnedMessageIds,
                ":updatedAt": now,
              },
            }
          }
        ]
      }));

      // 3. Create System Message (Async, don't block response)
      const userRes = await this.db.docClient.send(new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail}`, SK: 'METADATA' }
      }));
      const userName = userRes.Item?.fullName || userRes.Item?.fullname || userEmail;
      
      const systemContent = pinned 
        ? `${userName} đã ghim một tin nhắn.` 
        : `${userName} đã bỏ ghim một tin nhắn.`;

      this.sendMessage(convId, 'system', systemContent, 'system', [], [], null, { systemActionBy: userEmail }).catch(e => console.error('Failed to send pin system message', e));

      return {
        ...existing,
        pinned,
        pinnedBy: pinned ? userEmail : null,
        pinnedAt: pinned ? now : null,
        updatedAt: now,
        pinnedMessageIds // Return new list for immediate update
      };
    }

    if (payload.action === "deleteForMe") {
      const removed = Array.from(new Set([...(existing.removed || []), userEmail]));

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: convId, SK: messageId },
          UpdateExpression: "SET removed = :removed, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":removed": removed,
            ":updatedAt": now,
          },
        }),
      );

      return {
        ...existing,
        removed,
        updatedAt: now,
      };
    }

    throw new BadRequestException("Unsupported patch action");
  }

  /**
   * MARK MESSAGE AS SEEN
   */
  async markAsSeen(convId: string, messageId: string, userEmail: string) {
    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: messageId },
      }),
    );

    const msg = existingRes.Item as Message;
    if (!msg) return null;

    const seen = Array.from(new Set([...(msg.seen || []), userEmail]));
    const status = seen.length > 1 ? 'seen' : msg.status; // Simple heuristic for seen

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: messageId },
        UpdateExpression: "SET seen = :seen, #status = :status, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":seen": seen,
          ":status": 'seen', // Mark as seen for simplicity if needed
          ":now": new Date().toISOString(),
        },
      }),
    );

    return { ...msg, seen, status: 'seen' };
  }

  /**
   * GET MESSAGES FOR CONVERSATION
   */
  async getMessages(
    convId: string,
    userEmail: string,
    limit: number = 50,
    lastEvaluatedKey?: any,
  ) {
    // 1. Get user's lastClearedAt timestamp for this conversation
    const userMapping = await this.db.docClient.send(new GetCommand({
      TableName: this.db.tableName,
      Key: { PK: `USER#${userEmail}`, SK: convId }
    }));
    
    const lastClearedAt = userMapping.Item?.lastClearedAt || "";
    const msgPrefix = `MSG#${lastClearedAt}`; // This will fetch messages > lastClearedAt

    const params: any = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND SK > :lastCleared",
      ExpressionAttributeValues: {
        ":pk": convId,
        ":lastCleared": msgPrefix,
      },
      ScanIndexForward: false, // get newest first
      Limit: limit,
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await this.db.docClient.send(new QueryCommand(params));
    const items = (result.Items || []) as Message[];
    
    // Filter out messages that the user has "deleted for me"
    const filteredItems = userEmail 
      ? items.filter(msg => !msg.removed?.includes(userEmail))
      : items;

    // Convert LastEvaluatedKey to a format easy for Frontend
    let nextCursor = null;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return {
      messages: filteredItems.reverse(), // Chronological order for frontend
      nextCursor,
    };
  }
  
  /**
   * CLEAR HISTORY FOR A CONVERSATION (SOFT DELETE FOR ME)
   */
  async clearHistory(convId: string, userEmail: string) {
    const timestamp = new Date().toISOString();

    // Update the User-Conversation mapping with lastClearedAt
    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail}`, SK: convId },
        UpdateExpression: "SET lastClearedAt = :ts",
        ExpressionAttributeValues: {
          ":ts": timestamp,
        },
      }),
    );

    // Call background cleanup (Deep Cleanup)
    this.performDeepCleanup(convId).catch(err => 
      console.error(`Deep cleanup failed for ${convId}:`, err)
    );

    return { success: true, lastClearedAt: timestamp };
  }

  /**
   * BACKGROUND CLEANUP: Delete messages and S3 files if ALL members have cleared history
   */
  private async performDeepCleanup(convId: string) {
    // 1. Get Conversation Metadata to find members
    const metadata = await this.db.docClient.send(new GetCommand({
      TableName: this.db.tableName,
      Key: { PK: convId, SK: 'METADATA' }
    }));

    const members: string[] = metadata.Item?.members || [];
    if (members.length === 0) return;

    // 2. Fetch all guest mappings for this conversation
    const mappingKeys = members.map(email => ({
      PK: `USER#${email}`,
      SK: convId
    }));

    const batchMappings = await this.db.docClient.send(new BatchGetCommand({
      RequestItems: {
        [this.db.tableName]: { Keys: mappingKeys }
      }
    }));

    const mappings = batchMappings.Responses?.[this.db.tableName] || [];
    
    // 3. Check if everyone has cleared history
    if (mappings.length < members.length) return; // Not everyone has a mapping (rare) or some haven't cleared yet (initially no lastClearedAt)
    
    const clearedTimestamps = mappings
      .map(m => m.lastClearedAt)
      .filter(ts => !!ts);

    if (clearedTimestamps.length < members.length) {
      // Not everyone has cleared yet
      return;
    }

    // 4. Find the oldest "clear point" among all members
    const sortedTs = clearedTimestamps.sort();
    const minClearedAt = sortedTs[0]; // The smallest (oldest) timestamp

    // 5. Query messages <= minClearedAt
    const queryParams = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND SK <= :minTs",
      ExpressionAttributeValues: {
        ":pk": convId,
        ":minTs": `MSG#${minClearedAt}`,
      },
    };

    const queryResult = await this.db.docClient.send(new QueryCommand(queryParams));
    const messagesToDelete = queryResult.Items || [];

    if (messagesToDelete.length === 0) return;

    console.log(`[DEEP CLEANUP] Found ${messagesToDelete.length} messages to permanently delete in ${convId}`);

    // 6. Delete files from S3 and messages from DB
    for (const msg of messagesToDelete) {
      // Delete Media
      if (msg.media && Array.isArray(msg.media)) {
        for (const item of msg.media) {
          if (item.url) await this.s3Service.deleteFile(item.url);
        }
      }
      // Delete Files
      if (msg.files && Array.isArray(msg.files)) {
        for (const item of msg.files) {
          if (item.url) await this.s3Service.deleteFile(item.url);
        }
      }
    }

    // 7. Batch Delete from DynamoDB
    const batches = [];
    for (let i = 0; i < messagesToDelete.length; i += 25) {
      batches.push(messagesToDelete.slice(i, i + 25));
    }

    for (const batch of batches) {
      const deleteRequests = batch.map((item) => ({
        DeleteRequest: {
          Key: { PK: item.PK, SK: item.SK },
        },
      }));

      await this.db.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.db.tableName]: deleteRequests,
          },
        }),
      );
    }

    console.log(`[DEEP CLEANUP] Successfully deleted ${messagesToDelete.length} messages and associated S3 files for ${convId}`);
  }
}
