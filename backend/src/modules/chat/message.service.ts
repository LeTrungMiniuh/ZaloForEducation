import { BadRequestException, Injectable } from "@nestjs/common";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Message } from "@zalo-edu/shared";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class MessageService {
  constructor(private readonly db: DynamoDBService) {}

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
      createdAt: timestamp,
    };

    // 1. Save Message
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: convId,
          SK: SK,
          ...newMessage,
        },
      }),
    );

    // 2. Update Conversation's lastMessage and updatedAt
    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
        UpdateExpression: "SET lastMessage = :sk, updatedAt = :time",
        ExpressionAttributeValues: {
          ":sk": SK,
          ":time": timestamp,
        },
      }),
    );

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
      action: "react" | "recall" | "pin" | "unpin";
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

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: convId, SK: messageId },
          UpdateExpression:
            "SET pinned = :pinned, pinnedBy = :pinnedBy, pinnedAt = :pinnedAt, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":pinned": pinned,
            ":pinnedBy": pinned ? userEmail : null,
            ":pinnedAt": pinned ? now : null,
            ":updatedAt": now,
          },
        }),
      );

      return {
        ...existing,
        pinned,
        pinnedBy: pinned ? userEmail : null,
        pinnedAt: pinned ? now : null,
        updatedAt: now,
      };
    }

    throw new BadRequestException("Unsupported patch action");
  }

  /**
   * GET MESSAGES FOR CONVERSATION
   */
  async getMessages(
    convId: string,
    limit: number = 50,
    lastEvaluatedKey?: any,
  ) {
    const params: any = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :msgPrefix)",
      ExpressionAttributeValues: {
        ":pk": convId,
        ":msgPrefix": "MSG#",
      },
      ScanIndexForward: false, // get newest first
      Limit: limit,
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await this.db.docClient.send(new QueryCommand(params));

    // Reverse to chronological order for UI
    const items = (result.Items || []) as Message[];
    return {
      messages: items.reverse(),
      lastEvaluatedKey: result.LastEvaluatedKey,
    };
  }
}
