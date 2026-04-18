import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { FriendSuggestion, Friendship } from "@zalo-edu/shared";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";
import { UserService } from "../user/user.service";

@Injectable()
export class FriendshipService {
  constructor(
    private readonly db: DynamoDBService,
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly userService: UserService,
  ) {}

  private normalizeEmail(email: string) {
    return String(email || "")
      .trim()
      .toLowerCase();
  }

  private friendshipKey(email: string, friendEmail: string) {
    return {
      PK: `USER#${this.normalizeEmail(email)}`,
      SK: `FRIEND#${this.normalizeEmail(friendEmail)}`,
    };
  }

  private async getFriendshipRecord(email: string, friendEmail: string) {
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: this.friendshipKey(email, friendEmail),
      }),
    );

    return result.Item as Friendship | undefined;
  }

  private async emitFriendshipUpdate(email: string, payload: any) {
    this.chatGateway.notifyFriendshipUpdate(email, payload);
  }

  private async safeGetProfile(email: string) {
    try {
      const { profile } = await this.userService.getUserProfile(email);
      return profile;
    } catch {
      return null;
    }
  }

  private async updatePair(
    emailA: string,
    emailB: string,
    itemA: Record<string, any>,
    itemB: Record<string, any>,
  ) {
    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: itemA,
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: itemB,
            },
          },
        ],
      }),
    );

    await this.emitFriendshipUpdate(emailA, {
      email: emailB,
      updatedAt: new Date().toISOString(),
    });
    await this.emitFriendshipUpdate(emailB, {
      email: emailA,
      updatedAt: new Date().toISOString(),
    });
  }

  private async deletePair(emailA: string, emailB: string) {
    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: this.db.tableName,
              Key: this.friendshipKey(emailA, emailB),
            },
          },
          {
            Delete: {
              TableName: this.db.tableName,
              Key: this.friendshipKey(emailB, emailA),
            },
          },
        ],
      }),
    );
  }

  private buildSuggestions(
    email: string,
    acceptedFriends: Set<string>,
    mutualCounts: Map<
      string,
      { mutualFriends: Set<string>; sharedGroups: Set<string> }
    >,
  ): FriendSuggestion[] {
    return Array.from(mutualCounts.entries())
      .filter(
        ([candidateEmail]) =>
          candidateEmail !== email && !acceptedFriends.has(candidateEmail),
      )
      .sort((a, b) => {
        const left = a[1].mutualFriends.size + a[1].sharedGroups.size;
        const right = b[1].mutualFriends.size + b[1].sharedGroups.size;
        return right - left || a[0].localeCompare(b[0]);
      })
      .map(([candidateEmail, meta]) => ({
        email: candidateEmail,
        fullName: "",
        mutualFriendCount: meta.mutualFriends.size,
        mutualFriends: Array.from(meta.mutualFriends),
        sharedGroups: Array.from(meta.sharedGroups),
        reasons: [
          meta.mutualFriends.size > 0
            ? `${meta.mutualFriends.size} bạn chung`
            : "",
          meta.sharedGroups.size > 0
            ? `Cùng ${meta.sharedGroups.size} nhóm`
            : "",
        ].filter(Boolean),
      }));
  }

  /**
   * SEND FRIEND REQUEST
   */
  async sendRequest(senderEmail: string, receiverEmail: string) {
    const normalizedSender = this.normalizeEmail(senderEmail);
    const normalizedReceiver = this.normalizeEmail(receiverEmail);

    if (normalizedSender === normalizedReceiver)
      throw new BadRequestException("Cannot add yourself");

    const [senderRecord, receiverRecord] = await Promise.all([
      this.getFriendshipRecord(normalizedSender, normalizedReceiver),
      this.getFriendshipRecord(normalizedReceiver, normalizedSender),
    ]);

    if (
      senderRecord?.status === "blocked" ||
      receiverRecord?.status === "blocked"
    ) {
      throw new BadRequestException("This user is blocked");
    }

    if (
      senderRecord?.status === "accepted" ||
      receiverRecord?.status === "accepted"
    ) {
      throw new BadRequestException("Request already sent or already friends");
    }

    if (
      senderRecord?.status === "pending" ||
      receiverRecord?.status === "pending"
    ) {
      throw new BadRequestException("Request already sent or already friends");
    }

    const timestamp = new Date().toISOString();

    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedSender}`,
                SK: `FRIEND#${normalizedReceiver}`,
                sender_id: normalizedSender,
                receiver_id: normalizedReceiver,
                status: "pending",
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedReceiver}`,
                SK: `FRIEND#${normalizedSender}`,
                sender_id: normalizedSender,
                receiver_id: normalizedReceiver,
                status: "pending",
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            },
          },
        ],
      }),
    );

    const senderProfile = await this.safeGetProfile(normalizedSender);
    this.chatGateway.notifyFriendRequest(normalizedReceiver, {
      senderEmail: normalizedSender,
      receiverEmail: normalizedReceiver,
      senderProfile,
      createdAt: timestamp,
    });

    return { message: "Friend request sent successfully" };
  }

  /**
   * ACCEPT FRIEND REQUEST
   */
  async acceptRequest(userEmail: string, senderEmail: string) {
    const normalizedUser = this.normalizeEmail(userEmail);
    const normalizedSender = this.normalizeEmail(senderEmail);

    const receiverRecord = await this.getFriendshipRecord(
      normalizedUser,
      normalizedSender,
    );
    if (!receiverRecord || receiverRecord.status !== "pending") {
      throw new NotFoundException("Friend request not found");
    }

    const senderRecord = await this.getFriendshipRecord(
      normalizedSender,
      normalizedUser,
    );
    const timestamp = new Date().toISOString();

    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedUser}`,
                SK: `FRIEND#${normalizedSender}`,
                sender_id: normalizedSender,
                receiver_id: normalizedUser,
                status: "accepted",
                createdAt: receiverRecord.createdAt || timestamp,
                updatedAt: timestamp,
              },
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedSender}`,
                SK: `FRIEND#${normalizedUser}`,
                sender_id: normalizedSender,
                receiver_id: normalizedUser,
                status: "accepted",
                createdAt:
                  senderRecord?.createdAt ||
                  receiverRecord.createdAt ||
                  timestamp,
                updatedAt: timestamp,
              },
            },
          },
        ],
      }),
    );

    const senderProfile = await this.safeGetProfile(normalizedSender);
    const userProfile = await this.safeGetProfile(normalizedUser);
    await this.emitFriendshipUpdate(normalizedUser, {
      action: "accepted",
      otherEmail: normalizedSender,
      otherProfile: senderProfile,
      profile: userProfile,
      updatedAt: timestamp,
    });
    await this.emitFriendshipUpdate(normalizedSender, {
      action: "accepted",
      otherEmail: normalizedUser,
      otherProfile: userProfile,
      profile: senderProfile,
      updatedAt: timestamp,
    });

    return { message: "Friend request accepted" };
  }

  async rejectRequest(userEmail: string, senderEmail: string) {
    const normalizedUser = this.normalizeEmail(userEmail);
    const normalizedSender = this.normalizeEmail(senderEmail);

    const receiverRecord = await this.getFriendshipRecord(
      normalizedUser,
      normalizedSender,
    );
    if (!receiverRecord || receiverRecord.status !== "pending") {
      throw new NotFoundException("Friend request not found");
    }

    await this.deletePair(normalizedUser, normalizedSender);

    await this.emitFriendshipUpdate(normalizedUser, {
      action: "rejected",
      otherEmail: normalizedSender,
      updatedAt: new Date().toISOString(),
    });
    await this.emitFriendshipUpdate(normalizedSender, {
      action: "rejected",
      otherEmail: normalizedUser,
      updatedAt: new Date().toISOString(),
    });

    return { message: "Friend request rejected" };
  }

  async unfriend(userEmail: string, friendEmail: string) {
    const normalizedUser = this.normalizeEmail(userEmail);
    const normalizedFriend = this.normalizeEmail(friendEmail);

    const currentRecord = await this.getFriendshipRecord(
      normalizedUser,
      normalizedFriend,
    );
    if (!currentRecord) {
      throw new NotFoundException("Friend not found");
    }

    await this.deletePair(normalizedUser, normalizedFriend);

    const timestamp = new Date().toISOString();
    await this.emitFriendshipUpdate(normalizedUser, {
      action: "unfriended",
      otherEmail: normalizedFriend,
      updatedAt: timestamp,
    });
    await this.emitFriendshipUpdate(normalizedFriend, {
      action: "unfriended",
      otherEmail: normalizedUser,
      updatedAt: timestamp,
    });

    return { message: "Friend removed successfully" };
  }

  async blockUser(userEmail: string, blockedEmail: string) {
    const normalizedUser = this.normalizeEmail(userEmail);
    const normalizedBlocked = this.normalizeEmail(blockedEmail);

    if (normalizedUser === normalizedBlocked) {
      throw new BadRequestException("Cannot block yourself");
    }

    const timestamp = new Date().toISOString();
    const userRecord = await this.getFriendshipRecord(
      normalizedUser,
      normalizedBlocked,
    );
    const blockedRecord = await this.getFriendshipRecord(
      normalizedBlocked,
      normalizedUser,
    );

    await this.db.docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedUser}`,
                SK: `FRIEND#${normalizedBlocked}`,
                sender_id: userRecord?.sender_id || normalizedUser,
                receiver_id: userRecord?.receiver_id || normalizedBlocked,
                status: "blocked",
                blockedBy: normalizedUser,
                nickname: userRecord?.nickname,
                createdAt: userRecord?.createdAt || timestamp,
                updatedAt: timestamp,
              },
            },
          },
          {
            Put: {
              TableName: this.db.tableName,
              Item: {
                PK: `USER#${normalizedBlocked}`,
                SK: `FRIEND#${normalizedUser}`,
                sender_id: blockedRecord?.sender_id || normalizedUser,
                receiver_id: blockedRecord?.receiver_id || normalizedBlocked,
                status: "blocked",
                blockedBy: normalizedUser,
                createdAt: blockedRecord?.createdAt || timestamp,
                updatedAt: timestamp,
              },
            },
          },
        ],
      }),
    );

    await this.emitFriendshipUpdate(normalizedUser, {
      action: "blocked",
      otherEmail: normalizedBlocked,
      updatedAt: timestamp,
    });

    return { message: "User blocked successfully" };
  }

  async setNickname(userEmail: string, friendEmail: string, nickname: string) {
    const normalizedUser = this.normalizeEmail(userEmail);
    const normalizedFriend = this.normalizeEmail(friendEmail);
    const trimmedNickname = String(nickname || "").trim();

    const currentRecord = await this.getFriendshipRecord(
      normalizedUser,
      normalizedFriend,
    );
    if (!currentRecord) {
      throw new NotFoundException("Friend not found");
    }

    if (!trimmedNickname) {
      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: this.friendshipKey(normalizedUser, normalizedFriend),
          UpdateExpression: "SET updatedAt = :updatedAt REMOVE nickname",
          ExpressionAttributeValues: {
            ":updatedAt": new Date().toISOString(),
          },
        }),
      );
    } else {
      await this.db.docClient.send(
        new UpdateCommand({
          TableName: this.db.tableName,
          Key: this.friendshipKey(normalizedUser, normalizedFriend),
          UpdateExpression: "SET nickname = :nickname, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":nickname": trimmedNickname,
            ":updatedAt": new Date().toISOString(),
          },
        }),
      );
    }

    await this.emitFriendshipUpdate(normalizedUser, {
      action: "nickname_updated",
      otherEmail: normalizedFriend,
      nickname: trimmedNickname,
      updatedAt: new Date().toISOString(),
    });

    return { message: "Nickname updated successfully" };
  }

  /**
   * GET ALL FRIENDS (AND PENDING REQUESTS)
   */
  async getFriendships(email: string) {
    const result = await this.db.docClient.send(
      new QueryCommand({
        TableName: this.db.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${this.normalizeEmail(email)}`,
          ":skPrefix": "FRIEND#",
        },
      }),
    );

    return (result.Items || []) as Friendship[];
  }

  async getIncomingRequests(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const friendships = await this.getFriendships(normalizedEmail);
    const requests = friendships.filter(
      (friendship) =>
        friendship.status === "pending" &&
        friendship.receiver_id === normalizedEmail,
    );

    const profiles = await Promise.all(
      requests.map(async (request) => {
        const senderProfile = await this.safeGetProfile(request.sender_id);
        return {
          ...request,
          senderProfile,
        };
      }),
    );

    return profiles;
  }

  async getFriendSuggestions(email: string) {
    const normalizedEmail = this.normalizeEmail(email);
    const friendships = await this.getFriendships(normalizedEmail);
    const acceptedFriendships = friendships.filter(
      (item) => item.status === "accepted",
    );
    const acceptedFriends = new Set(
      acceptedFriendships.map((item) =>
        item.sender_id === normalizedEmail ? item.receiver_id : item.sender_id,
      ),
    );

    const mutualCounts = new Map<
      string,
      { mutualFriends: Set<string>; sharedGroups: Set<string> }
    >();

    for (const friendEmail of acceptedFriends) {
      const theirFriendships = await this.getFriendships(friendEmail);
      const theirAccepted = theirFriendships.filter(
        (item) => item.status === "accepted",
      );

      for (const friendship of theirAccepted) {
        const candidateEmail =
          friendship.sender_id === friendEmail
            ? friendship.receiver_id
            : friendship.sender_id;
        if (
          !candidateEmail ||
          candidateEmail === normalizedEmail ||
          acceptedFriends.has(candidateEmail)
        )
          continue;

        const existing = mutualCounts.get(candidateEmail) || {
          mutualFriends: new Set<string>(),
          sharedGroups: new Set<string>(),
        };
        existing.mutualFriends.add(friendEmail);
        mutualCounts.set(candidateEmail, existing);
      }
    }

    const conversations =
      await this.chatService.getConversationsByUser(normalizedEmail);
    const groupConversations = conversations.filter(
      (conversation) => conversation.type === "group",
    );

    for (const conversation of groupConversations) {
      for (const memberEmail of conversation.members || []) {
        const normalizedMember = this.normalizeEmail(memberEmail);
        if (
          !normalizedMember ||
          normalizedMember === normalizedEmail ||
          acceptedFriends.has(normalizedMember)
        )
          continue;

        const existing = mutualCounts.get(normalizedMember) || {
          mutualFriends: new Set<string>(),
          sharedGroups: new Set<string>(),
        };
        existing.sharedGroups.add(conversation.name || conversation.id);
        mutualCounts.set(normalizedMember, existing);
      }
    }

    const candidateEmails = Array.from(mutualCounts.keys());
    const profiles = await Promise.all(
      candidateEmails.map(async (candidateEmail) => {
        const profile = await this.safeGetProfile(candidateEmail);
        return [candidateEmail, profile] as const;
      }),
    );

    return candidateEmails
      .map((candidateEmail) => {
        const meta = mutualCounts.get(candidateEmail);
        const profile = profiles.find(
          ([emailValue]) => emailValue === candidateEmail,
        )?.[1];

        if (!meta || !profile) return null;

        const mutualFriends = Array.from(meta.mutualFriends);
        const sharedGroups = Array.from(meta.sharedGroups);

        return {
          email: candidateEmail,
          fullName: profile.fullName || candidateEmail,
          avatarUrl: profile.avatarUrl,
          mutualFriendCount: mutualFriends.length,
          mutualFriends,
          sharedGroups,
          reasons: [
            mutualFriends.length > 0 ? `${mutualFriends.length} bạn chung` : "",
            sharedGroups.length > 0 ? `Cùng ${sharedGroups.length} nhóm` : "",
          ].filter(Boolean),
        } as FriendSuggestion;
      })
      .filter(Boolean)
      .sort((left: any, right: any) => {
        const leftScore =
          (left?.mutualFriendCount || 0) + (left?.sharedGroups?.length || 0);
        const rightScore =
          (right?.mutualFriendCount || 0) + (right?.sharedGroups?.length || 0);
        return (
          rightScore - leftScore ||
          String(left?.fullName || "").localeCompare(
            String(right?.fullName || ""),
          )
        );
      })
      .slice(0, 12);
  }
}
