import { BatchGetCommand, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import { Conversation } from '@zalo-edu/shared';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBService } from '../../infrastructure/dynamodb.service';
import { ChatGateway } from './chat.gateway';
import { FriendshipService } from './friendship.service';

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
    if (email1 === email2) throw new BadRequestException('Cannot create chat with yourself');
    
    // Create a predictable conversation ID for 1-1 chats (e.g. sorted emails)
    const sorted = [email1, email2].sort();
    const convId = `CONV#DIRECT#${sorted[0]}#${sorted[1]}`;

    const exists = await this.db.docClient.send(new GetCommand({
      TableName: this.db.tableName,
      Key: { PK: convId, SK: 'METADATA' }
    }));

    if (exists.Item) {
      const userMapping = await this.db.docClient.send(new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email1}`, SK: convId }
      }));

      const conv = {
        ...exists.Item,
        lastReadAt: userMapping.Item?.lastReadAt || 0
      } as Conversation;
      
      const lastClearedAt = userMapping.Item?.lastClearedAt;
      if (lastClearedAt && conv.lastMessageTimestamp) {
        const clearTime = new Date(lastClearedAt).getTime();
        if (conv.lastMessageTimestamp <= clearTime) {
          return { ...conv, lastMessageContent: '', lastMessageSenderId: null, lastMessageTimestamp: 0 };
        }
      }
      return conv;
    }

    const newConv: Conversation = {
      id: convId,
      type: 'direct',
      members: [email1, email2],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Use TransactWrite to ensure all or nothing
    await this.db.docClient.send(new TransactWriteCommand({
      TransactItems: [
        // 1. The Conversation Metadata
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              PK: convId,
              SK: 'METADATA',
              ...newConv
            }
          }
        },
        // 2. Mapping for User 1
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              PK: `USER#${email1}`,
              SK: convId,
              type: 'direct',
              partner: email2,
              createdAt: newConv.createdAt
            }
          }
        },
        // 3. Mapping for User 2
        {
          Put: {
            TableName: this.db.tableName,
            Item: {
              PK: `USER#${email2}`,
              SK: convId,
              type: 'direct',
              partner: email1,
              createdAt: newConv.createdAt
            }
          }
        }
      ]
    }));

    return newConv;
  }

  /**
   * CREATE GROUP CONVERSATION
   */
  async createGroupConversation(adminEmail: string, members: string[], groupName: string) {
    const allMembers = Array.from(new Set([adminEmail, ...members]));
    if (allMembers.length < 3) throw new BadRequestException('Group must have at least 3 members');

    const rawId = uuidv4();
    const convId = `CONV#GROUP#${rawId}`;

    const newConv: Conversation = {
      id: convId,
      name: groupName,
      type: 'group',
      admin: adminEmail,
      members: allMembers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Construct TransactItems (Max 100 items per request in DynamoDB)
    const transactItems: any[] = [
      {
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: convId,
            SK: 'METADATA',
            ...newConv
          }
        }
      }
    ];

    for (const member of allMembers) {
      transactItems.push({
        Put: {
          TableName: this.db.tableName,
          Item: {
            PK: `USER#${member}`,
            SK: convId,
            type: 'group',
            name: groupName,
            createdAt: newConv.createdAt
          }
        }
      });
    }

    await this.db.docClient.send(new TransactWriteCommand({
      TransactItems: transactItems
    }));

    return newConv;
  }

  /**
   * GET USER CONVERSATIONS (INBOX)
   */
  async getConversationsByUser(email: string) {
    // Step 1: Find all conversation mappings for this user
    const mappingParams = new QueryCommand({
      TableName: this.db.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${email}`,
        ':skPrefix': 'CONV#'
      }
    });

    const mappingResult = await this.db.docClient.send(mappingParams);
    const mappings = mappingResult.Items || [];

    if (mappings.length === 0) return [];

    // Step 2: BatchGet all Conversation Metadata
    const keys = mappings.map(m => ({
      PK: m.SK as string,
      SK: 'METADATA'
    }));

    // Chunk arrays if > 100 max per Dynamo BatchGet
    const results: Conversation[] = [];
    
    // For simplicity, assuming < 100 conversations for MVP
    const batchResult = await this.db.docClient.send(new BatchGetCommand({
      RequestItems: {
        [this.db.tableName]: {
          Keys: keys
        }
      }
    }));

    const convs = batchResult.Responses?.[this.db.tableName] as Conversation[] || [];
    
    // Create lookups for mapping data
    const clearMap = new Map(mappings.map(m => [m.SK as string, m.lastClearedAt || ""]));
    const readMap = new Map(mappings.map(m => [m.SK as string, m.lastReadAt || 0]));

    // Map with latest message details and return sorted
    return convs
      .map((c) => {
        const lastClearedAt = clearMap.get(c.id);
        const lastReadAt = readMap.get(c.id) || 0;
        
        const sanitizedConv = { ...c, lastReadAt };

        if (sanitizedConv.autoDeleteDays && sanitizedConv.lastMessageTimestamp) {
          const expireMs = Number(sanitizedConv.autoDeleteDays) * 24 * 60 * 60 * 1000;
          const isExpired = Date.now() - sanitizedConv.lastMessageTimestamp >= expireMs;
          if (isExpired) {
            return {
              ...sanitizedConv,
              lastMessageContent: '',
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
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async markConversationAsRead(convId: string, email: string) {
    await this.db.docClient.send(new UpdateCommand({
      TableName: this.db.tableName,
      Key: { PK: `USER#${email}`, SK: convId },
      UpdateExpression: 'SET lastReadAt = :ts',
      ExpressionAttributeValues: {
        ':ts': Date.now()
      }
    }));

    // Notify all devices of this user
    this.chatGateway.emitConversationRead(email, convId);

    return { success: true };
  }

  async setConversationAutoDelete(convId: string, userEmail: string, days: number | null) {
    const allowedDays = [1, 7, 30];
    const normalizedDays = days == null || Number(days) === 0 ? null : Number(days);

    if (normalizedDays !== null && !allowedDays.includes(normalizedDays)) {
      throw new BadRequestException('Auto delete days must be 1, 7, 30 or null');
    }

    const metadata = await this.getConversationMetadata(convId);
    if (!metadata) {
      throw new BadRequestException('Conversation not found');
    }

    if (!Array.isArray(metadata.members) || !metadata.members.includes(userEmail)) {
      throw new BadRequestException('You are not a member of this conversation');
    }

    const now = new Date().toISOString();

    await this.db.docClient.send(new UpdateCommand({
      TableName: this.db.tableName,
      Key: { PK: convId, SK: 'METADATA' },
      UpdateExpression: 'SET autoDeleteDays = :days, autoDeleteUpdatedAt = :updatedAt, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':days': normalizedDays,
        ':updatedAt': now,
      },
    }));

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
    const res = await this.db.docClient.send(new GetCommand({
      TableName: this.db.tableName,
      Key: { PK: convId, SK: 'METADATA' }
    }));
    return res.Item as Conversation || null;
  }

  /**
   * GLOBAL SMART SEARCH
   */
  async globalSearch(query: string, userEmail: string) {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return { contacts: [], messages: [], files: [] };

    // 1. Get user's conversation scope
    const myConvs = await this.getConversationsByUser(userEmail);
    const myConvIds = myConvs.map(c => c.id);

    // 1.5 Get user's friends scope (REFACTORED: NO SCAN)
    const myFriendships = await this.friendshipService.getFriendships(userEmail);
    const acceptedFriendEmails = myFriendships
      .filter(f => f.status === 'accepted')
      .map(f => (f as any).SK.replace('FRIEND#', ''));

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
        const batchRes = await this.db.docClient.send(new BatchGetCommand({
          RequestItems: {
            [this.db.tableName]: {
              Keys: chunk.map(email => ({ PK: `USER#${email}`, SK: 'METADATA' })),
              // Security: Only fetch necessary fields
              ProjectionExpression: 'email, fullName, fullname, avatarUrl, urlAvatar, #s',
              ExpressionAttributeNames: { '#s': 'status' }
            }
          }
        }));
        if (batchRes.Responses && batchRes.Responses[this.db.tableName]) {
          allFriendMetadata.push(...batchRes.Responses[this.db.tableName]);
        }
      }

      // Filter friend metadata in memory based on query
      contactResults = allFriendMetadata
        .filter(u => {
          const name = (u.fullName || u.fullname || '').toLowerCase();
          const email = (u.email || '').toLowerCase();
          return name.includes(q) || email.includes(q);
        })
        .map(u => ({
          email: u.email || '',
          fullName: u.fullName || u.fullname || 'Người dùng',
          avatar: u.avatarUrl || u.urlAvatar || '',
          status: u.status || 'offline'
        }));
    }
    
    // 3. Search Messages & Files (REFACTORED: Parallel Query + Depth Limit)
    // We Query the latest 100 messages from each of the user's conversations
    const messageQueries = myConvIds.map(convId => 
      this.db.docClient.send(new QueryCommand({
        TableName: this.db.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': convId,
          ':skPrefix': 'MSG#'
        },
        Limit: 100,
        ScanIndexForward: false // Get latest messages first
      }))
    );

    const queryResults = await Promise.all(messageQueries);
    const allMessages = queryResults.flatMap(res => res.Items || []);

    // Smart Filtering in Memory (Case-Insensitive + Deep File Search)
    const matchedMessages = allMessages.filter(m => {
      const content = (m.content || '').toLowerCase();
      const hasTextMatch = content.includes(q);
      
      const media = Array.isArray(m.media) ? m.media : [];
      const files = Array.isArray(m.files) ? m.files : [];
      const hasFileMatch = [...media, ...files].some(f => 
        (f.name || f.fileName || '').toLowerCase().includes(q)
      );

      return hasTextMatch || hasFileMatch;
    });

    // Sort globally by newest
    matchedMessages.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Filter into text-only messages vs files for the response
    const searchMessages = matchedMessages
      .filter(m => (m.content || '').toLowerCase().includes(q))
      .map(m => ({
        id: m.SK,
        convId: m.PK,
        senderId: m.senderId,
        content: m.content,
        createdAt: m.createdAt
      }));

    const searchFiles = matchedMessages.flatMap(m => {
      const media = Array.isArray(m.media) ? m.media : [];
      const files = Array.isArray(m.files) ? m.files : [];
      const allItems = [...media, ...files];
      
      return allItems
        .filter(f => (f.name || f.fileName || '').toLowerCase().includes(q))
        .map(f => ({
          ...f,
          name: f.name || f.fileName || 'Tệp',
          messageId: m.SK,
          convId: m.PK,
          senderId: m.senderId,
          createdAt: m.createdAt
        }));
    });

    return {
      contacts: contactResults,
      messages: searchMessages,
      files: searchFiles
    };
  }
}
