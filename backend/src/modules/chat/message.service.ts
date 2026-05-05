import {
  BatchGetCommand,
  BatchWriteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { BadRequestException, Inject, Injectable, forwardRef, NotFoundException } from "@nestjs/common";
import { Message } from "@zalo-edu/shared";
import { v4 as uuidv4 } from "uuid";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import { S3Service } from "../../infrastructure/s3.service";
import { FriendshipService } from "./friendship.service";
import { ChatGateway } from "./chat.gateway";

@Injectable()
export class MessageService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly s3Service: S3Service,
    private readonly friendshipService: FriendshipService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  private normalizeConvId(id: string): { raw: string; prefixed: string; original: string; veryRaw: string } {
    const input = id.toUpperCase().startsWith("CONV#") ? id.substring(5) : id;
    let normalized = input;
    
    if (input.toUpperCase().startsWith("DIRECT#")) {
      const parts = input.split("#");
      if (parts.length >= 3) {
        const emails = parts.slice(1).map(e => e.toLowerCase()).sort();
        normalized = `DIRECT#${emails[0]}#${emails[1]}`;
      }
    } else if (input.toUpperCase().startsWith("GROUP#")) {
      normalized = `GROUP#${input.substring(6)}`;
    } else {
      normalized = input.toLowerCase();
    }

    return {
      raw: normalized,
      prefixed: `CONV#${normalized}`,
      original: id.toUpperCase().startsWith("CONV#") ? id : `CONV#${id}`,
      veryRaw: id,
    };
  }

  private async ensureConversationMember(convId: string, userEmail: string) {
    const { raw: rawId, prefixed: prefId, original: origId, veryRaw } = this.normalizeConvId(convId);
    const emailLower = userEmail.toLowerCase();
    
    console.debug(`[MessageService] ensureConversationMember checking: prefId=${prefId}, origId=${origId}, veryRaw=${veryRaw}, user=${emailLower}`);
    
    // 1. Try to find Metadata
    let metadataRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefId, SK: "METADATA" },
      }),
    );

    if (!metadataRes.Item && origId !== prefId) {
      metadataRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: origId, SK: "METADATA" },
        }),
      );
    }

    if (!metadataRes.Item && rawId !== prefId && rawId !== origId) {
      metadataRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: rawId, SK: "METADATA" },
        }),
      );
    }

    if (!metadataRes.Item) {
      console.error(`[MessageService] Metadata NOT FOUND for ${prefId}, ${origId} or ${rawId}`);
      throw new BadRequestException(`Không tìm thấy cuộc hội thoại: ${prefId}`);
    }

    const metadata = metadataRes.Item as any;
    const members: string[] = Array.isArray(metadata.members) ? metadata.members : [];

    // 2. Check membership (Case-Insensitive)
    const isMember = members.some(m => String(m).toLowerCase() === emailLower);
    if (!isMember) {
      console.error(`[MessageService] User ${emailLower} is not a member of ${prefId}. Members: ${JSON.stringify(members)}`);
      throw new BadRequestException("Bạn không phải là thành viên của cuộc hội thoại này");
    }

    return metadata;
  }

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
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);

    if (senderEmail !== "system") {
      await this.ensureConversationMember(prefixedConvId, senderEmail);
    }

    const timestamp = new Date().toISOString();
    const msgId = uuidv4();
    // Sort key format: MSG#2026-04-10T...#uuid ensures chronological sorting in DynamoDB
    const SK = `MSG#${timestamp}#${msgId}`;

    // --- FILTER FILES & MEDIA ---
    let filteredFiles = Array.isArray(files) ? [...files] : [];
    let audioUrl = (extraFields as any)?.audioUrl || null;
    let contactCard = (extraFields as any)?.contactCard || null;
    let location = (extraFields as any)?.location || null;

    if (filteredFiles.length > 0) {
      filteredFiles = filteredFiles.filter((f) => {
        const fileName = (f.name || "").toLowerCase();
        const mimeType = (f.mimeType || "").toLowerCase();

        // 1. Extract Contact Card data
        if (fileName === "contact.json") {
          try {
            if (!contactCard) {
              const data =
                typeof f.dataUrl === "string"
                  ? JSON.parse(f.dataUrl)
                  : f.dataUrl;
              contactCard = data;
            }
          } catch (e) {
            console.error("[MessageService] Failed to parse contact.json", e);
          }
          return false;
        }

        // 2. Extract Location data
        if (fileName === "location.json") {
          try {
            if (!location) {
              const data =
                typeof f.dataUrl === "string"
                  ? JSON.parse(f.dataUrl)
                  : f.dataUrl;
              location = data;
            }
          } catch (e) {
            console.error("[MessageService] Failed to parse location.json", e);
          }
          return false;
        }

        // 3. Extract audio recordings to top-level field and remove from files array
        if (mimeType.startsWith("audio/")) {
          if (!audioUrl) audioUrl = f.url || f.dataUrl;
          return false;
        }

        return true;
      });
    }

    const newMessage: any = {
      id: SK,
      conversationId: rawConvId,
      senderId: senderEmail,
      content,
      type,
      media,
      files: filteredFiles.length > 0 ? filteredFiles : undefined,
      audioUrl,
      contactCard,
      location,
      replyTo,
      status: "sent",
      createdAt: timestamp,
      updatedAt: timestamp,
      ...extraFields,
    };

    // Fetch conversation metadata to get all members
    const metadata = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: "METADATA" },
      }),
    );
    const members: string[] = metadata.Item?.members || [];

    // Block-check: if any recipient has blocked the sender OR there is any blocked relation, reject
    console.debug("[MessageService] members for conv", convId, members);
    for (const member of members) {
      if (member === senderEmail) continue;
      const eitherBlocked = await this.friendshipService.isAnyBlocked(
        senderEmail,
        member,
      );
      console.debug("[MessageService] block-check (either)", {
        convId,
        senderEmail,
        member,
        eitherBlocked,
      });
      if (eitherBlocked) {
        console.warn(
          "[MessageService] Sending blocked due to blocked relation: sender=%s member=%s conv=%s",
          senderEmail,
          member,
          convId,
        );
        throw new BadRequestException(
          "Một trong hai người đang chặn nhau. Không thể gửi tin nhắn.",
        );
      }
    }

    const transactItems: any[] = [
      // 1. Save Message
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: prefixedConvId,
            SK: SK,
            ...newMessage,
            conversationId: rawConvId,
          },
        },
      },
      // 2. Update Conversation Metadata
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: prefixedConvId, SK: "METADATA" },
          UpdateExpression:
            "SET lastMessage = :sk, lastMessageContent = :content, lastMessageSenderId = :senderId, lastMessageTimestamp = :ts, updatedAt = :time, listClearedAt = :cleared ADD totalMessages :inc",
          ExpressionAttributeValues: {
            ":sk": SK,
            ":content": (() => {
              if (type === "system") return content;
              if (type === "SYSTEM_CALL") {
                const callType = extraFields?.callType || "audio";
                return callType === "video"
                  ? "[Cuộc gọi video]"
                  : "[Cuộc gọi thoại]";
              }
              if (type === "contact_card") return "[Danh thiếp]";
              if (type === "location") return "[Vị trí]";
              if (!content || content.startsWith("MSG#")) {
                if (media && media.length > 0) {
                  const hasSticker = media.some((item: any) => {
                    const mime = String(
                      item?.mimeType || item?.fileType || "",
                    ).toLowerCase();
                    return mime.includes("sticker") || item?.isSticker === true;
                  });
                  if (hasSticker) return "[Sticker]";

                  const hasHDImage = media.some(
                    (item: any) => item?.isHD === true,
                  );
                  if (hasHDImage) return "[Ảnh HD]";

                  return "[Hình ảnh]";
                }
                if (files && files.length > 0) return "[Tệp tin]";
                return "Tin nhắn mới";
              }
              return content.length > 100
                ? content.substring(0, 97) + "..."
                : content;
            })(),
            ":senderId": senderEmail,
            ":ts": Date.now(),
            ":time": timestamp,
            ":cleared": {},
            ":inc": 1,
          },
        },
      },
      // 3. Update Sender Mapping (lastReadAt)
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${senderEmail.toLowerCase()}`, SK: prefixedConvId },
          UpdateExpression: "SET updatedAt = :ts, lastReadAt = :readAt",
          ExpressionAttributeValues: {
            ":ts": timestamp,
            ":readAt": timestamp,
          },
        },
      },
    ];

    // 4. Update other members' mappings (updatedAt & Atomic unreadCount)
    for (const member of members) {
      if (member === senderEmail) continue;
      transactItems.push({
        Update: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${String(member).toLowerCase()}`, SK: prefixedConvId },
          // [PRODUCTION] Atomic increment unreadCount
          UpdateExpression: "SET updatedAt = :ts ADD unreadCount :inc",
          ExpressionAttributeValues: {
            ":ts": timestamp,
            ":inc": 1,
          },
        },
      });
    }

    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
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
      action: "react" | "recall" | "pin" | "unpin" | "deleteForMe";
      reactAction?: "add" | "remove";
      emoji?: string;
      previousEmoji?: string;
    },
  ) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    const existing = existingRes.Item as any;
    if (!existing) {
      throw new BadRequestException("Message not found");
    }

    // [SENIOR] STRICT PARTITION VALIDATION
    if (existing.conversationId !== prefixedConvId) {
      throw new BadRequestException("Message does not belong to this conversation partition");
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
        reactions[payload.emoji] = [
          ...(reactions[payload.emoji] || []),
          userEmail,
        ];
      }

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: prefixedConvId, SK: messageId },
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
          Key: { PK: prefixedConvId, SK: messageId },
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
      const metadataRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: prefixedConvId, SK: "METADATA" },
        }),
      );
      const metadata = metadataRes.Item as any;
      let pinnedMessageIds = metadata?.pinnedMessageIds || [];

      if (pinned) {
        if (pinnedMessageIds.includes(messageId)) return existing; // Already pinned
        if (pinnedMessageIds.length >= 3) {
          throw new BadRequestException(
            "Đã đạt giới hạn 3 tin nhắn ghim. Vui lòng bỏ ghim tin nhắn cũ trước.",
          );
        }
        pinnedMessageIds.unshift(messageId);
      } else {
        pinnedMessageIds = pinnedMessageIds.filter(
          (id: string) => id !== messageId,
        );
      }

      // 2. Transact update Message and Metadata
      await this.db.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.db.tableName,
                Key: { PK: prefixedConvId, SK: messageId },
                UpdateExpression:
                  "SET pinned = :pinned, pinnedBy = :pinnedBy, pinnedAt = :pinnedAt, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                  ":pinned": pinned,
                  ":pinnedBy": pinned ? userEmail : null,
                  ":pinnedAt": pinned ? now : null,
                  ":updatedAt": now,
                },
              },
            },
            {
              Update: {
                TableName: this.db.tableName,
                Key: { PK: prefixedConvId, SK: "METADATA" },
                UpdateExpression:
                  "SET pinnedMessageIds = :pinedIds, updatedAt = :updatedAt",
                ExpressionAttributeValues: {
                  ":pinedIds": pinnedMessageIds,
                  ":updatedAt": now,
                },
              },
            },
          ],
        }),
      );

      // 3. Create System Message (Async, don't block response)
      const userRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${userEmail}`, SK: "METADATA" },
        }),
      );
      const userName =
        userRes.Item?.fullName || userRes.Item?.fullname || userEmail;

      const systemContent = pinned
        ? `${userName} đã ghim một tin nhắn.`
        : `${userName} đã bỏ ghim một tin nhắn.`;

      this.sendMessage(
        prefixedConvId,
        "system",
        systemContent,
        "system",
        [],
        [],
        null,
        { systemActionBy: userEmail },
      ).then((msg) => {
        this.chatGateway.emitReceiveMessage(prefixedConvId, msg);
      }).catch((e) => console.error("Failed to send pin system message", e));

      return {
        ...existing,
        pinned,
        pinnedBy: pinned ? userEmail : null,
        pinnedAt: pinned ? now : null,
        updatedAt: now,
        pinnedMessageIds, // Return new list for immediate update
      };
    }

    if (payload.action === "deleteForMe") {
      const removed = Array.from(
        new Set([...(existing.removed || []), userEmail]),
      );

      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: { PK: prefixedConvId, SK: messageId },
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

  async votePoll(
    prefixedConvId: string,
    messageId: string,
    userEmail: string,
    optionIndex: number,
  ) {
    await this.ensureConversationMember(prefixedConvId, userEmail);

    if (!Number.isInteger(optionIndex) || optionIndex < 0) {
      throw new BadRequestException("Invalid option index");
    }

    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    const existing = existingRes.Item as any;
    if (!existing) {
      throw new BadRequestException("Message not found");
    }

    const poll = existing?.payload?.poll || existing?.poll;
    if (!poll || !Array.isArray(poll.options) || poll.options.length < 2) {
      throw new BadRequestException("This message is not a valid poll");
    }

    if (poll.isClosed) {
      throw new BadRequestException("Bình chọn đã đóng. Không thể bình chọn.");
    }

    if (optionIndex >= poll.options.length) {
      throw new BadRequestException("Selected option is out of range");
    }

    const votes: Record<string, string> = { ...(poll.votes || {}) };
    // Allow changing vote - just update the user's vote
    votes[userEmail] = String(optionIndex);
    const updatedAt = new Date().toISOString();

    const payload = {
      ...(existing.payload || {}),
      poll: {
        ...poll,
        allowMultiple: false,
        votes,
      },
    };

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
        UpdateExpression: "SET payload = :payload, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":payload": payload,
          ":updatedAt": updatedAt,
        },
      }),
    );

    return {
      ...existing,
      payload,
      updatedAt,
    };
  }

  async closePoll(convId: string, messageId: string, userEmail: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    const existing = existingRes.Item as any;
    if (!existing) {
      throw new BadRequestException("Message not found");
    }

    const poll = existing?.payload?.poll || existing?.poll;
    if (!poll) {
      throw new BadRequestException("This message is not a valid poll");
    }

    // Check if user is the sender of the message
    if (
      String(existing.senderId || "")
        .trim()
        .toLowerCase() !==
      String(userEmail || "")
        .trim()
        .toLowerCase()
    ) {
      throw new BadRequestException(
        "Chỉ người tạo bình chọn mới có thể đóng nó.",
      );
    }

    if (poll.isClosed) {
      throw new BadRequestException("Bình chọn đã đóng rồi.");
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      ...(existing.payload || {}),
      poll: {
        ...poll,
        isClosed: true,
      },
    };

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
        UpdateExpression: "SET payload = :payload, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":payload": payload,
          ":updatedAt": updatedAt,
        },
      }),
    );

    return {
      ...existing,
      payload,
      updatedAt,
    };
  }

  /**
   * MARK MESSAGE AS SEEN
   */
  async markAsSeen(convId: string, messageId: string, userEmail: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const existingRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    const msg = existingRes.Item as Message;
    if (!msg) return null;

    const seen = Array.from(new Set([...(msg.seen || []), userEmail]));
    const status = seen.length > 1 ? "seen" : msg.status; // Simple heuristic for seen

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
        UpdateExpression:
          "SET seen = :seen, #status = :status, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":seen": seen,
          ":status": "seen", // Mark as seen for simplicity if needed
          ":now": new Date().toISOString(),
        },
      }),
    );

    return { ...msg, seen, status: "seen" };
  }

  async getMessage(convId: string, messageId: string, userEmail: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const res = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    const msg = res.Item as any;
    if (!msg) return null;

    return { ...msg, id: msg.id || msg.SK };
  }

  /**
   * GET MESSAGES FOR CONVERSATION
   */
  async getMessages(
    convId: string,
    userEmail: string,
    limit: number = 50,
    lastEvaluatedKey?: any,
    scanForward: boolean = false,
  ) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const metadataRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: "METADATA" },
      }),
    );
    const autoDeleteDays = Number(metadataRes.Item?.autoDeleteDays || 0);

    // 1. Get user's lastClearedAt timestamp for this conversation
    const userMapping = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail.toLowerCase()}`, SK: prefixedConvId },
      }),
    );

    const lastClearedAt = userMapping.Item?.lastClearedAt || "";
    const msgPrefix = `MSG#${lastClearedAt}`; // This will fetch messages > lastClearedAt

    const params: any = {
      TableName: this.db.tableName,
      KeyConditionExpression: scanForward 
        ? "PK = :pk AND SK > :lastCleared" 
        : "PK = :pk AND SK > :lastCleared", // Both use > lastCleared to respect clear history
      ExpressionAttributeValues: {
        ":pk": prefixedConvId,
        ":lastCleared": msgPrefix,
      },
      ScanIndexForward: false, // newest first
      Limit: limit,
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await this.db.docClient.send(new QueryCommand(params));
    const items = (result.Items || []) as Message[];

    // Filter out messages that the user has "deleted for me"
    let filteredItems = userEmail
      ? items.filter((msg) => !msg.removed?.includes(userEmail))
      : items;

    if ([1, 7, 30].includes(autoDeleteDays)) {
      const threshold = Date.now() - autoDeleteDays * 24 * 60 * 60 * 1000;
      filteredItems = filteredItems.filter((msg) => {
        const createdAtTs = new Date(msg.createdAt).getTime();
        return Number.isFinite(createdAtTs) && createdAtTs >= threshold;
      });
    }

    // Convert LastEvaluatedKey to a format easy for Frontend
    let nextCursor = null;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey),
      ).toString("base64");
    }

    return {
      messages: (filteredItems as any[])
        .map((msg) => ({ ...msg, id: msg.id || msg.SK }))
        .sort((a, b) => a.id.localeCompare(b.id)), // Force oldest-first (ascending)
      nextCursor,
    };
  }

  /**
   * CLEAR HISTORY FOR A CONVERSATION (SOFT DELETE FOR ME)
   */
  async clearHistory(convId: string, userEmail: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    const timestamp = new Date().toISOString();

    // Update the User-Conversation mapping with lastClearedAt
    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail.toLowerCase()}`, SK: prefixedConvId },
        UpdateExpression: "SET lastClearedAt = :ts",
        ExpressionAttributeValues: {
          ":ts": timestamp,
        },
      }),
    );

    // Call background cleanup (Deep Cleanup)
    this.performDeepCleanup(prefixedConvId).catch((err) =>
      console.error(`Deep cleanup failed for ${prefixedConvId}:`, err),
    );

    return { success: true, lastClearedAt: timestamp };
  }

  /**
   * BACKGROUND CLEANUP: Delete messages and S3 files if ALL members have cleared history
   */
  private async performDeepCleanup(convId: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    // 1. Get Conversation Metadata to find members
    const metadata = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: "METADATA" },
      }),
    );

    const members: string[] = metadata.Item?.members || [];
    if (members.length === 0) return;

    // 2. Fetch all guest mappings for this conversation
    const mappingKeys = members.map((email) => ({
      PK: `USER#${email}`,
      SK: rawConvId,
    }));

    const batchMappings = await this.db.docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [this.db.tableName]: { Keys: mappingKeys },
        },
      }),
    );

    const mappings = batchMappings.Responses?.[this.db.tableName] || [];

    // 3. Check if everyone has cleared history
    if (mappings.length < members.length) return; // Not everyone has a mapping (rare) or some haven't cleared yet (initially no lastClearedAt)

    const clearedTimestamps = mappings
      .map((m) => m.lastClearedAt)
      .filter((ts) => !!ts);

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
        ":pk": prefixedConvId,
        ":minTs": `MSG#${minClearedAt}`,
      },
    };

    const queryResult = await this.db.docClient.send(
      new QueryCommand(queryParams),
    );
    const messagesToDelete = queryResult.Items || [];

    if (messagesToDelete.length === 0) return;

    console.log(
      `[DEEP CLEANUP] Found ${messagesToDelete.length} messages to permanently delete in ${prefixedConvId}`,
    );

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

    console.log(
      `[DEEP CLEANUP] Successfully deleted ${messagesToDelete.length} messages and associated S3 files for ${prefixedConvId}`,
    );
  }

  /**
   * GET CONTEXT AROUND A MESSAGE (FOR SEARCH DEEP-LINKING)
   * Fetches messages from targetId UP TO a window, and provides nextCursor for OLDER.
   */
  async getMessagesContext(
    convId: string,
    messageId: string,
    userEmail: string,
    limit: number = 50,
  ) {
    const { raw: rawConvId, prefixed: prefixedConvId, original: originalConvId, veryRaw } = this.normalizeConvId(convId);
    console.debug(`[MessageService] getMessagesContext: checking membership for ${originalConvId}`);
    const metadata = await this.ensureConversationMember(originalConvId, userEmail);
    console.debug(`[MessageService] getMessagesContext: membership OK for ${originalConvId}`);

    // 1. Get user's lastClearedAt timestamp
    let userMapping = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail.toLowerCase()}`, SK: prefixedConvId },
      }),
    );
    
    if (!userMapping.Item && originalConvId !== prefixedConvId) {
      console.debug(`[MessageService] UserMapping not found for prefixed, trying original: ${originalConvId}`);
      userMapping = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${userEmail.toLowerCase()}`, SK: originalConvId },
        }),
      );
    }
    
    const lastClearedAt = userMapping.Item?.lastClearedAt || "";
    const msgPrefix = `MSG#${lastClearedAt}`;

    // 2. Fetch the target message
    console.debug(`[MessageService] getMessagesContext: searching target message ${messageId} in ${prefixedConvId}`);
    let targetRes = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: prefixedConvId, SK: messageId },
      }),
    );

    if (!targetRes.Item && originalConvId !== prefixedConvId) {
      console.debug(`[MessageService] Target message not found in prefixed, trying original: ${originalConvId}`);
      targetRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: originalConvId, SK: messageId },
        }),
      );
    }

    if (!targetRes.Item && rawConvId !== prefixedConvId && rawConvId !== originalConvId) {
      console.debug(`[MessageService] Target message not found in original, trying raw: ${rawConvId}`);
      targetRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: rawConvId, SK: messageId },
        }),
      );
    }

    if (!targetRes.Item && veryRaw !== prefixedConvId && veryRaw !== originalConvId && veryRaw !== rawConvId) {
      console.debug(`[MessageService] Target message not found in raw, trying veryRaw: ${veryRaw}`);
      targetRes = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: veryRaw, SK: messageId },
        }),
      );
    }

    const targetItem = targetRes.Item as any;
    if (!targetItem) {
      console.error(`[MessageService] Target message NOT FOUND in any PK format! SK: ${messageId}`);
      throw new BadRequestException(`Không tìm thấy tin nhắn: ${messageId}`);
    }

    // Use the PK where the target message was actually found
    const workingPK = targetRes.Item.PK || prefixedConvId;
    console.debug(`[MessageService] getMessagesContext: target message FOUND in PK: ${workingPK}`);

    if (lastClearedAt && targetItem.SK <= msgPrefix) {
      console.warn(`[MessageService] Target message is cleared: SK=${targetItem.SK}, clearedBefore=${msgPrefix}`);
      throw new BadRequestException("Tin nhắn này đã được xóa khỏi lịch sử trò chuyện của bạn");
    }

    // 3. Query messages OLDER than target (for nextCursor)
    const olderParams = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND SK BETWEEN :cleared AND :targetSk",
      ExpressionAttributeValues: {
        ":pk": workingPK,
        ":cleared": msgPrefix,
        ":targetSk": messageId,
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    // 4. Query messages NEWER than target (windowed for performance)
    const newerParams = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND SK > :targetSk",
      ExpressionAttributeValues: {
        ":pk": workingPK,
        ":targetSk": messageId,
      },
      ScanIndexForward: true,
      Limit: 50,
    };

    const [olderRes, newerRes] = await Promise.all([
      this.db.docClient.send(new QueryCommand(olderParams)),
      this.db.docClient.send(new QueryCommand(newerParams)),
    ]);

    const olderItems = (olderRes.Items || []) as any[];
    const newerItems = (newerRes.Items || []) as any[];

    // Result: [Older (oldest first)] + [Target] + [Newer (oldest first)]
    const combined = [
      ...olderItems.filter((m) => m.id !== messageId && m.SK !== messageId).reverse(),
      targetItem,
      ...newerItems,
    ];

    let nextCursor = null;
    if (olderRes.LastEvaluatedKey) {
      nextCursor = Buffer.from(
        JSON.stringify(olderRes.LastEvaluatedKey),
      ).toString("base64");
    }

    let prevCursor = null;
    if (newerRes.LastEvaluatedKey) {
      prevCursor = Buffer.from(
        JSON.stringify(newerRes.LastEvaluatedKey),
      ).toString("base64");
    }

    return {
      messages: (combined as any[])
        .filter((msg) => !msg.removed?.includes(userEmail))
        .map((msg) => ({ ...msg, id: msg.id || msg.SK })),
      nextCursor,
      prevCursor,
    };
  }

  async getConversationAssets(
    convId: string,
    userEmail: string,
    type: "media" | "file" | "link",
    limit = 50,
    cursor?: string,
  ) {
    const { prefixed: prefId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefId, userEmail);

    let filterExp = "";
    const expAttrNames: any = {};
    const expAttrValues: any = {
      ":pk": prefId,
      ":skPrefix": "MSG#",
    };

    // [FIX] Harden against invalid cursors from frontend (e.g. leaked from other conversations)
    if (cursor && !cursor.startsWith("MSG#")) {
      cursor = undefined;
    }

    if (type === "media") {
      filterExp = "attribute_exists(media) OR #t = :mediaType OR #t = :imgType OR #t = :vidType";
      expAttrNames["#t"] = "type";
      expAttrValues[":mediaType"] = "media";
      expAttrValues[":imgType"] = "image";
      expAttrValues[":vidType"] = "video";
    } else if (type === "file") {
      filterExp = "attribute_exists(files) OR #t = :fileType";
      expAttrNames["#t"] = "type";
      expAttrValues[":fileType"] = "file";
    } else if (type === "link") {
      filterExp = "contains(content, :http) AND #t = :textType";
      expAttrNames["#t"] = "type";
      expAttrValues[":http"] = "http";
      expAttrValues[":textType"] = "text";
    }

    const command = new QueryCommand({
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      FilterExpression: filterExp,
      ExpressionAttributeNames: Object.keys(expAttrNames).length > 0 ? expAttrNames : undefined,
      ExpressionAttributeValues: expAttrValues,
      Limit: limit * 5, // Overshoot limit to account for filtered items
      ScanIndexForward: false, // Newer first
      ExclusiveStartKey: cursor ? { PK: prefId, SK: cursor } : undefined,
    });

    const res = await this.db.docClient.send(command);
    let items = res.Items || [];

    // Final filtering for links to avoid system messages or false positives
    if (type === "link") {
      const urlRegex = /https?:\/\/[^\s]+/;
      items = items.filter(i => urlRegex.test(i.content || ""));
    }

    // Limit to requested count
    const sliced = items.slice(0, limit);

    return {
      items: sliced.map(m => ({ ...m, id: m.id || m.SK })),
      nextCursor: res.LastEvaluatedKey ? res.LastEvaluatedKey.SK : null,
    };
  }

  /**
   * SEARCH MESSAGES IN CONVERSATION - Case Insensitive
   */
  async searchMessages(convId: string, userEmail: string, query: string) {
    const { raw: rawConvId, prefixed: prefixedConvId } = this.normalizeConvId(convId);
    await this.ensureConversationMember(prefixedConvId, userEmail);

    // 1. Get user's lastClearedAt timestamp
    const userMapping = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail.toLowerCase()}`, SK: prefixedConvId },
      }),
    );
    const lastClearedAt = userMapping.Item?.lastClearedAt || "";
    const msgPrefix = `MSG#${lastClearedAt}`;

    const params: any = {
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND SK > :lastCleared", 
      ExpressionAttributeValues: {
        ":pk": prefixedConvId,
        ":lastCleared": msgPrefix,
      },
      ScanIndexForward: false, // newest first
    };

    const result = await this.db.docClient.send(new QueryCommand(params));
    const items = (result.Items || []) as any[];

    const lowerQuery = query.toLowerCase();

    // Filtering logic
    const filtered = items.filter((msg) => {
      // 1. Exclude system messages related to calls or "thu hồi"
      if (msg.type === "system" || msg.type === "SYSTEM_CALL" || msg.recalled) {
        return false;
      }

      // 2. Case insensitive content check
      const content = String(msg.content || "").toLowerCase();
      if (!content.includes(lowerQuery)) return false;

      // 3. Exclude if deleted for me
      if (msg.removed && Array.isArray(msg.removed) && msg.removed.includes(userEmail)) {
        return false;
      }

      return true;
    });

    return filtered.map((msg) => ({ ...msg, id: msg.id || msg.SK }));
  }
}
