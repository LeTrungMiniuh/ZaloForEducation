import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  BadRequestException,
  Inject,
  Injectable,
  forwardRef,
} from "@nestjs/common";
import { Conversation } from "@zalo-edu/shared";
import { v4 as uuidv4 } from "uuid";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import { ChatGateway } from "./chat.gateway";
import { FriendshipService } from "./friendship.service";

@Injectable()
export class ChatService {
  constructor(
    private readonly db: DynamoDBService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    @Inject(forwardRef(() => FriendshipService))
    private readonly friendshipService: FriendshipService,
  ) {}

  /**
   * CREATE DIRECT CONVERSATION (1-1)
   */
  async createDirectConversation(email1: string, email2: string) {
    if (email1 === email2)
      throw new BadRequestException("Cannot create chat with yourself");

    // Create a predictable conversation ID for 1-1 chats (e.g. sorted emails)
    const sorted = [email1, email2].sort();
    const convId = `CONV#DIRECT#${sorted[0]}#${sorted[1]}`;

    const exists = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
      }),
    );

    if (exists.Item) {
      const userMapping = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${email1}`, SK: convId },
        }),
      );

      const conv = {
        ...exists.Item,
        lastReadAt: userMapping.Item?.lastReadAt || 0,
      } as Conversation;

      const lastClearedAt = userMapping.Item?.lastClearedAt;
      if (lastClearedAt && conv.lastMessageTimestamp) {
        const clearTime = new Date(lastClearedAt).getTime();
        if (conv.lastMessageTimestamp <= clearTime) {
          return {
            ...conv,
            lastMessageContent: "",
            lastMessageSenderId: null,
            lastMessageTimestamp: 0,
          };
        }
      }
      return conv;
    }

    const newConv: Conversation = {
      id: convId,
      type: "direct",
      members: [email1, email2],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Use TransactWrite to ensure all or nothing
    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          // 1. The Conversation Metadata
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: convId,
                SK: "METADATA",
                ...newConv,
              },
            },
          },
          // 2. Mapping for User 1
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${email1}`,
                SK: convId,
                type: "direct",
                partner: email2,
                createdAt: newConv.createdAt,
              },
            },
          },
          // 3. Mapping for User 2
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${email2}`,
                SK: convId,
                type: "direct",
                partner: email1,
                createdAt: newConv.createdAt,
              },
            },
          },
        ],
      }),
    );

    return newConv;
  }

  /**
   * CREATE GROUP CONVERSATION
   */
  async createGroupConversation(
    adminEmail: string,
    members: string[],
    groupName: string,
    avatar?: string,
  ) {
    const allMembers = Array.from(new Set([adminEmail, ...members]));
    if (allMembers.length < 3)
      throw new BadRequestException("Group must have at least 3 members");

    const rawId = uuidv4();
    const convId = `CONV#GROUP#${rawId}`;
    const now = new Date().toISOString();

    const newConv: Conversation = {
      id: convId,
      name: groupName,
      type: "group",
      admin: adminEmail,
      owner: adminEmail,
      avatar: avatar || "",
      deputies: [],
      members: allMembers,
      createdAt: now,
      updatedAt: now,
    };

    const transactItems: any[] = [
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: convId,
            SK: "METADATA",
            ...newConv,
          },
        },
      },
    ];

    for (const member of allMembers) {
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: `USER#${member}`,
            SK: convId,
            type: "group",
            name: groupName,
            createdAt: now,
          },
        },
      });
    }

    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
      }),
    );

    // Create system message for group creation
    const systemContent = JSON.stringify({
      action: "group_created",
      actor: adminEmail,
      groupName: groupName,
    });

    // We'll call messageService.sendMessage but we need to inject it or use gateway
    // For now, let's just emit the event or let the controller handle it
    // Actually, it's better if the controller calls sendMessage after creation

    return newConv;
  }

  async addMembersToGroup(
    convId: string,
    actorEmail: string,
    newMembers: string[],
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata || metadata.type !== "group")
      throw new BadRequestException("Group not found");

    // Permission check: Actor must be a member of the group (any member can add members)
    if (!metadata.members.includes(actorEmail))
      throw new BadRequestException("You are not a member of this group");

    const uniqueNewMembers = newMembers.filter(
      (m) => !metadata.members.includes(m),
    );
    if (uniqueNewMembers.length === 0) return metadata;

    const updatedMembers = [...metadata.members, ...uniqueNewMembers];
    const now = new Date().toISOString();

    const transactItems: any[] = [
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: convId, SK: "METADATA" },
          UpdateExpression: "SET #m = :members, updatedAt = :now",
          ExpressionAttributeNames: { "#m": "members" },
          ExpressionAttributeValues: {
            ":members": updatedMembers,
            ":now": now,
          },
        },
      },
    ];

    for (const member of uniqueNewMembers) {
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: `USER#${member}`,
            SK: convId,
            type: "group",
            name: metadata.name,
            createdAt: now,
          },
        },
      });
    }

    await this.db.docClient.send(
      new TransactWriteCommand({ TransactItems: transactItems }),
    );

    // Send system messages
    // Notify via socket
    this.chatGateway.emitGroupUpdated(convId, {
      members: updatedMembers,
      addedMembers: uniqueNewMembers,
      actor: actorEmail,
    });

    return { ...metadata, members: updatedMembers };
  }

  async removeMemberFromGroup(
    convId: string,
    actorEmail: string,
    targetEmail: string,
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata || metadata.type !== "group")
      throw new BadRequestException("Group not found");

    const isSelf = actorEmail === targetEmail;
    const isOwner =
      metadata.owner === actorEmail || metadata.admin === actorEmail;
    const isDeputy = (metadata.deputies || []).includes(actorEmail);

    const targetIsOwner =
      metadata.owner === targetEmail || metadata.admin === targetEmail;
    const targetIsDeputy = (metadata.deputies || []).includes(targetEmail);

    if (!isSelf) {
      // Kicking logic
      if (!isOwner && !isDeputy)
        throw new BadRequestException(
          "Chỉ trưởng nhóm hoặc phó nhóm mới có quyền xóa thành viên",
        );
      if (isDeputy && (targetIsOwner || targetIsDeputy))
        throw new BadRequestException(
          "Phó nhóm không thể xóa trưởng nhóm hoặc phó nhóm khác",
        );
      if (targetIsOwner)
        throw new BadRequestException("Không thể xóa trưởng nhóm");
    } else {
      // Leaving logic
      if (isOwner && metadata.members.length > 1) {
        throw new BadRequestException(
          "Trưởng nhóm phải chuyển quyền trưởng nhóm trước khi rời nhóm",
        );
      }
    }

    const updatedMembers = metadata.members.filter((m) => m !== targetEmail);
    const updatedDeputies = (metadata.deputies || []).filter(
      (m) => m !== targetEmail,
    );
    const now = new Date().toISOString();

    const transactItems: any[] = [
      {
        Update: {
          TableName: this.db.tableName,
          Key: { PK: convId, SK: "METADATA" },
          UpdateExpression:
            "SET #m = :members, deputies = :deputies, updatedAt = :now",
          ExpressionAttributeNames: { "#m": "members" },
          ExpressionAttributeValues: {
            ":members": updatedMembers,
            ":deputies": updatedDeputies,
            ":now": now,
          },
        },
      },
      {
        Delete: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${targetEmail}`, SK: convId },
        },
      },
    ];

    await this.db.docClient.send(
      new TransactWriteCommand({ TransactItems: transactItems }),
    );

    this.chatGateway.emitGroupUpdated(convId, {
      members: updatedMembers,
      removedMember: targetEmail,
      actor: actorEmail,
    });

    return { success: true };
  }

  async updateMemberRole(
    convId: string,
    actorEmail: string,
    targetEmail: string,
    role: "deputy" | "member" | "owner",
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata || metadata.type !== "group")
      throw new BadRequestException("Group not found");

    const isOwner =
      metadata.owner === actorEmail || metadata.admin === actorEmail;
    if (!isOwner)
      throw new BadRequestException(
        "Chỉ trưởng nhóm mới có quyền thay đổi vai trò",
      );

    if (!metadata.members.includes(targetEmail))
      throw new BadRequestException("Target is not a member");

    let updateExp = "SET updatedAt = :now";
    const expVals: any = { ":now": new Date().toISOString() };

    if (role === "owner") {
      updateExp += ", #owner = :target, #admin = :target";
      expVals[":target"] = targetEmail;
      // If promoting to owner, remove from deputies if they were one
      const updatedDeputies = (metadata.deputies || []).filter(
        (m) => m !== targetEmail,
      );
      updateExp += ", deputies = :deputies";
      expVals[":deputies"] = updatedDeputies;
    } else if (role === "deputy") {
      const deputies = new Set(metadata.deputies || []);
      deputies.add(targetEmail);
      updateExp += ", deputies = :deputies";
      expVals[":deputies"] = Array.from(deputies);
    } else {
      const deputies = (metadata.deputies || []).filter(
        (m) => m !== targetEmail,
      );
      updateExp += ", deputies = :deputies";
      expVals[":deputies"] = deputies;
    }

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
        UpdateExpression: updateExp,
        ExpressionAttributeNames:
          role === "owner"
            ? { "#owner": "owner", "#admin": "admin" }
            : undefined,
        ExpressionAttributeValues: expVals,
      }),
    );

    this.chatGateway.emitGroupUpdated(convId, {
      roleUpdated: { email: targetEmail, role },
      actor: actorEmail,
    });

    return { success: true };
  }

  async updateGroupSettings(
    convId: string,
    userEmail: string,
    settings: { isMuted?: boolean; isPinned?: boolean },
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata) throw new BadRequestException("Conversation not found");

    // We store settings in the mapping record (USER#email, SK: CONV#id)
    let updateExp = "SET updatedAt = :now";
    const expVals: any = { ":now": new Date().toISOString() };

    if (settings.isMuted !== undefined) {
      updateExp += ", isMuted = :muted";
      expVals[":muted"] = settings.isMuted;
    }
    if (settings.isPinned !== undefined) {
      updateExp += ", isPinned = :pinned";
      expVals[":pinned"] = settings.isPinned;
    }

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${userEmail}`, SK: convId },
        UpdateExpression: updateExp,
        ExpressionAttributeValues: expVals,
      }),
    );

    return { success: true };
  }

  async updateGroupInfo(
    convId: string,
    actorEmail: string,
    data: { name?: string; avatar?: string },
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata || metadata.type !== "group")
      throw new BadRequestException("Group not found");

    const isOwner =
      metadata.owner === actorEmail || metadata.admin === actorEmail;
    const isDeputy = (metadata.deputies || []).includes(actorEmail);

    if (data.avatar && !isOwner) {
      throw new BadRequestException(
        "Chỉ trưởng nhóm mới có quyền thay đổi ảnh nhóm",
      );
    }

    if (data.name && !isOwner && !isDeputy) {
      throw new BadRequestException(
        "Chỉ trưởng nhóm hoặc phó nhóm mới có quyền đổi tên nhóm",
      );
    }

    if (!data.name && !data.avatar) {
      throw new BadRequestException("Không có thay đổi nào để cập nhật");
    }

    let updateExp = "SET updatedAt = :now";
    const expVals: any = { ":now": new Date().toISOString() };

    if (data.name) {
      updateExp += ", #name = :name";
      expVals[":name"] = data.name;
    }
    if (data.avatar) {
      updateExp += ", avatar = :avatar";
      expVals[":avatar"] = data.avatar;
    }

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
        UpdateExpression: updateExp,
        ExpressionAttributeNames: data.name ? { "#name": "name" } : undefined,
        ExpressionAttributeValues: expVals,
      }),
    );

    // If name changed, we might want to update all user mappings too, but it's expensive.
    // Usually we fetch name from metadata.
    // For now, just emit the update.
    this.chatGateway.emitGroupUpdated(convId, {
      infoUpdated: data,
      actor: actorEmail,
    });

    return { success: true };
  }

  async dissolveGroup(convId: string, actorEmail: string) {
    const metadata = await this.getConversationMetadata(convId);
    if (!metadata || metadata.type !== "group")
      throw new BadRequestException("Group not found");

    const isOwner =
      metadata.owner === actorEmail || metadata.admin === actorEmail;
    if (!isOwner)
      throw new BadRequestException("Only owner can dissolve group");

    // In a real app, we'd delete all mappings and metadata.
    // For now, let's mark it as dissolved or delete.
    const transactItems: any[] = [
      {
        Delete: {
          TableName: this.db.tableName,
          Key: { PK: convId, SK: "METADATA" },
        },
      },
    ];

    for (const member of metadata.members) {
      transactItems.push({
        Delete: {
          TableName: this.db.tableName,
          Key: { PK: `USER#${member}`, SK: convId },
        },
      });
    }

    await this.db.docClient.send(
      new TransactWriteCommand({ TransactItems: transactItems }),
    );

    this.chatGateway.emitGroupDissolved(convId, actorEmail);

    return { success: true };
  }

  /**
   * GET USER CONVERSATIONS (INBOX)
   */
  async getConversationsByUser(email: string) {
    // Step 1: Find all conversation mappings for this user
    const mappingParams = new QueryCommand({
      TableName: this.db.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": `USER#${email}`,
        ":skPrefix": "CONV#",
      },
    });

    const mappingResult = await this.db.docClient.send(mappingParams);
    const mappings = mappingResult.Items || [];

    if (mappings.length === 0) return [];

    // Step 2: BatchGet all Conversation Metadata
    const keys = mappings.map((m) => ({
      PK: m.SK as string,
      SK: "METADATA",
    }));

    // Chunk arrays if > 100 max per Dynamo BatchGet
    const results: Conversation[] = [];

    // For simplicity, assuming < 100 conversations for MVP
    const batchResult = await this.db.docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [this.db.tableName]: {
            Keys: keys,
          },
        },
      }),
    );

    const convs =
      (batchResult.Responses?.[this.db.tableName] as Conversation[]) || [];

    // Create lookups for mapping data (now includes unreadCount from Mapping)
    const countMap = new Map(
      mappings.map((m) => [m.SK as string, m.unreadCount || 0]),
    );
    const clearMap = new Map(
      mappings.map((m) => [m.SK as string, m.lastClearedAt || ""]),
    );
    const readMap = new Map(
      mappings.map((m) => [m.SK as string, m.lastReadAt || 0]),
    );

    // Map with latest message details and return sorted
    return convs
      .map((c) => {
        const lastClearedAt = clearMap.get(c.id);
        const lastReadAt = readMap.get(c.id) || 0;
        const unreadCount = countMap.get(c.id) || 0;

        const sanitizedConv = { ...c, lastReadAt, unreadCount };

        if (
          sanitizedConv.autoDeleteDays &&
          sanitizedConv.lastMessageTimestamp
        ) {
          const expireMs =
            Number(sanitizedConv.autoDeleteDays) * 24 * 60 * 60 * 1000;
          const isExpired =
            Date.now() - sanitizedConv.lastMessageTimestamp >= expireMs;
          if (isExpired) {
            return {
              ...sanitizedConv,
              lastMessageContent: "",
              lastMessageSenderId: undefined,
              lastMessageTimestamp: 0,
            };
          }
        }

        if (lastClearedAt && c.lastMessageTimestamp) {
          const clearTime = new Date(lastClearedAt).getTime();
          if (c.lastMessageTimestamp <= clearTime) {
            // Mark for filtering
            return null;
          }
        }
        return sanitizedConv;
      })
      .filter((c): c is any => c !== null)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }

  async markConversationAsRead(
    email: string,
    convId: string,
    messageId?: string,
  ) {
    const metadata = await this.getConversationMetadata(convId);
    if (
      !metadata ||
      !Array.isArray(metadata.members) ||
      !metadata.members.includes(email)
    ) {
      throw new BadRequestException(
        "You are not a member of this conversation",
      );
    }

    const timestamp = new Date().toISOString();

    // Use Transaction to reset unreadCount and update Read Marker
    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          // 1. Reset Unread Count for this User-Conv mapping
          {
            Update: {
              TableName: this.db.tableName,
              Key: { PK: `USER#${email}`, SK: convId },
              UpdateExpression: "SET lastReadAt = :ts, unreadCount = :zero",
              ExpressionAttributeValues: {
                ":ts": timestamp,
                ":zero": 0,
              },
            },
          },
          // 2. [PRODUCTION] Update Global Read Marker for this member
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: convId,
                SK: `READ#${email}`,
                lastReadAt: timestamp,
                lastReadMessageId: messageId || null,
                updatedAt: timestamp,
              },
            },
          },
        ],
      }),
    );

    // Notify all devices of this user
    this.chatGateway.emitConversationRead(email, convId);

    return { success: true };
  }

  async markAsDelivered(email: string, convId: string, messageId: string) {
    const timestamp = new Date().toISOString();
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: convId,
          SK: `DELIVERED#${email}`,
          lastDeliveredMessageId: messageId,
          deliveredAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    );
    return { success: true };
  }

  async setConversationAutoDelete(
    convId: string,
    userEmail: string,
    days: number | null,
  ) {
    const allowedDays = [1, 7, 30];
    const normalizedDays =
      days == null || Number(days) === 0 ? null : Number(days);

    if (normalizedDays !== null && !allowedDays.includes(normalizedDays)) {
      throw new BadRequestException(
        "Auto delete days must be 1, 7, 30 or null",
      );
    }

    const metadata = await this.getConversationMetadata(convId);
    if (!metadata) {
      throw new BadRequestException("Conversation not found");
    }

    if (
      !Array.isArray(metadata.members) ||
      !metadata.members.includes(userEmail)
    ) {
      throw new BadRequestException(
        "You are not a member of this conversation",
      );
    }

    const now = new Date().toISOString();

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
        UpdateExpression:
          "SET autoDeleteDays = :days, autoDeleteUpdatedAt = :updatedAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":days": normalizedDays,
          ":updatedAt": now,
        },
      }),
    );

    return {
      convId,
      autoDeleteDays: normalizedDays,
      autoDeleteUpdatedAt: now,
    };
  }

  /**
   * GET CONVERSATION METADATA (WITH MEMBERS)
   */
  async getConversationMetadata(convId: string): Promise<Conversation | null> {
    const res = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: convId, SK: "METADATA" },
      }),
    );
    return (res.Item as Conversation) || null;
  }

  /**
   * GLOBAL SMART SEARCH
   */
  async globalSearch(query: string, userEmail: string) {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return { contacts: [], messages: [], files: [] };

    // 1. Get user's conversation scope
    const myConvs = await this.getConversationsByUser(userEmail);
    const myConvIds = myConvs.map((c) => c.id);

    // 1.5 Get user's friends scope (REFACTORED: NO SCAN)
    const myFriendships =
      await this.friendshipService.getFriendships(userEmail);
    const acceptedFriendEmails = myFriendships
      .filter((f) => f.status === "accepted")
      .map((f) => (f as any).SK.replace("FRIEND#", ""));

    // 2. Search Contacts (Only within friends)
    let contactResults = [];
    if (acceptedFriendEmails.length > 0) {
      // DynamoDB BatchGet is limited to 100 items per request
      const chunks = [];
      for (let i = 0; i < acceptedFriendEmails.length; i += 100) {
        chunks.push(acceptedFriendEmails.slice(i, i + 100));
      }

      const allFriendMetadata = [];
      for (const chunk of chunks) {
        const batchRes = await this.db.docClient.send(
          new BatchGetCommand({
            RequestItems: {
              [this.db.tableName]: {
                Keys: chunk.map((email) => ({
                  PK: `USER#${email}`,
                  SK: "METADATA",
                })),
                // Security: Only fetch necessary fields
                ProjectionExpression:
                  "email, fullName, fullname, avatarUrl, urlAvatar, #s",
                ExpressionAttributeNames: { "#s": "status" },
              },
            },
          }),
        );
        if (batchRes.Responses && batchRes.Responses[this.db.tableName]) {
          allFriendMetadata.push(...batchRes.Responses[this.db.tableName]);
        }
      }

      // Filter friend metadata in memory based on query
      contactResults = allFriendMetadata
        .filter((u) => {
          const name = (u.fullName || u.fullname || "").toLowerCase();
          const email = (u.email || "").toLowerCase();
          return name.includes(q) || email.includes(q);
        })
        .map((u) => ({
          email: u.email || "",
          fullName: u.fullName || u.fullname || "Người dùng",
          avatar: u.avatarUrl || u.urlAvatar || "",
          status: u.status || "offline",
        }));
    }

    // 3. Search Messages & Files (REFACTORED: Parallel Query + Depth Limit)
    // We Query the latest 100 messages from each of the user's conversations
    const messageQueries = myConvIds.map((convId) =>
      this.db.docClient.send(
        new QueryCommand({
          TableName: this.db.tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
          ExpressionAttributeValues: {
            ":pk": convId,
            ":skPrefix": "MSG#",
          },
          Limit: 100,
          ScanIndexForward: false, // Get latest messages first
        }),
      ),
    );

    const queryResults = await Promise.all(messageQueries);
    const allMessages = queryResults.flatMap((res) => res.Items || []);

    // Smart Filtering in Memory (Case-Insensitive + Deep File Search)
    const matchedMessages = allMessages.filter((m) => {
      const content = (m.content || "").toLowerCase();
      const hasTextMatch = content.includes(q);

      const media = Array.isArray(m.media) ? m.media : [];
      const files = Array.isArray(m.files) ? m.files : [];
      const hasFileMatch = [...media, ...files].some((f) =>
        (f.name || f.fileName || "").toLowerCase().includes(q),
      );

      return hasTextMatch || hasFileMatch;
    });

    // Sort globally by newest
    matchedMessages.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Filter into text-only messages vs files for the response
    // [SENIOR] EXCLUDE ALL SYSTEM-GENERATED MESSAGES (system, call logs, etc.)
    const EXCLUDED_MESSAGE_TYPES = ["system", "SYSTEM_CALL"];
    const searchMessages = matchedMessages
      .filter(
        (m) =>
          !EXCLUDED_MESSAGE_TYPES.includes(m.type) &&
          (m.content || "").toLowerCase().includes(q),
      )
      .map((m) => ({
        id: m.SK,
        convId: m.PK,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
      }));

    const searchFiles = matchedMessages.flatMap((m) => {
      if (EXCLUDED_MESSAGE_TYPES.includes(m.type)) return [];
      const media = Array.isArray(m.media) ? m.media : [];
      const files = Array.isArray(m.files) ? m.files : [];
      const allItems = [...media, ...files];

      return allItems
        .filter((f) => (f.name || f.fileName || "").toLowerCase().includes(q))
        .map((f) => ({
          ...f,
          name: f.name || f.fileName || "Tệp",
          messageId: m.SK,
          convId: m.PK,
          senderId: m.senderId,
          createdAt: m.createdAt,
        }));
    });

    // [SENIOR] HYDRATE SENDER PROFILES
    const uniqueSenders = new Set(
      [
        ...searchMessages.map((m) => m.senderId),
        ...searchFiles.map((f) => f.senderId),
      ].filter(Boolean),
    );

    const senderProfiles = {};
    if (uniqueSenders.size > 0) {
      const senderEmails = Array.from(uniqueSenders);
      const profileResults = await Promise.all(
        senderEmails.map((email) =>
          this.db.docClient.send(
            new GetCommand({
              TableName: this.db.tableName,
              Key: { PK: `USER#${email}`, SK: "METADATA" },
            }),
          ),
        ),
      );

      profileResults.forEach((res, idx) => {
        const p = res.Item;
        const email = senderEmails[idx];
        if (p) {
          senderProfiles[email] = {
            name: p.fullName || p.fullname || email,
            avatar: p.avatarUrl || p.urlAvatar || "",
          };
        } else {
          senderProfiles[email] = {
            name: email,
            avatar: "",
          };
        }
      });
    }

    // Standardize for Search V2: type/id/conversationId/sender
    const standardized = {
      contacts: contactResults.slice(0, 50).map((c) => ({
        type: "CONTACT",
        id: c.email,
        userId: c.email,
        email: c.email,
        fullName: c.fullName,
        avatarUrl: c.avatar,
        content: c.fullName || c.email,
        sender: {
          name: c.fullName || c.email,
          avatar: c.avatar,
        },
      })),
      messages: searchMessages.slice(0, 50).map((m) => ({
        type: "MESSAGE",
        id: m.id,
        conversationId: m.convId,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt,
        sender: senderProfiles[m.senderId] || { name: m.senderId, avatar: "" },
      })),
      files: searchFiles.slice(0, 50).map((f) => ({
        type: "FILE",
        id: f.messageId,
        messageId: f.messageId,
        conversationId: f.convId,
        senderId: f.senderId,
        name: f.name,
        size: f.size,
        createdAt: f.createdAt,
        sender: senderProfiles[f.senderId] || { name: f.senderId, avatar: "" },
      })),
    };
    return standardized;
  }
}
