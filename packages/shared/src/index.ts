// Shared interfaces for ZaloEdu

export interface User {
  id: string; // USER#<email>
  email: string;
  fullName: string;
  gender: boolean;
  dataOfBirth: string;
  phone: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  album?: any[];
  address?: string;
  bio?: string;
  passwordHash: string;
  currentDeviceId?: string;
  googleId?: string;
  authProvider?: "LOCAL" | "GOOGLE";
  isVerified?: boolean;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "suspended" | "LOCKED" | "DELETED";
  isActive: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  lockedAt?: string;
}

export interface FileURL {
  fileName: string;
  fileType: string;
  fileUrl: string;
}

export interface Conversation {
  id: string; // CONV#<id>
  name?: string;
  avatar?: string;
  admin?: string; // string representing user email/id
  members: string[]; // array of user emails/ids
  type: "direct" | "group";
  lastMessage?: string; // messageId
  lastMessageContent?: string;
  lastMessageSenderId?: string;
  lastMessageTimestamp?: number;
  isDelete?: boolean;
  delete_history?: string[];
  approvedMembers?: boolean;
  listApprovedMembers?: string[];
  createdAt: string;
  updatedAt: string;
  partner?: string;
  online?: boolean;
  lastReadAt?: number;
  pinnedMessageIds?: string[];
}

export interface Friendship {
  id: string; // generated ID or combined string
  sender_id: string; // User email
  receiver_id: string; // User email
  status: "pending" | "accepted" | "declined" | "blocked";
  content?: string;
  type?: string;
  nickname?: string;
  closeFriend?: boolean;
  blockedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FriendSuggestion {
  email: string;
  fullName: string;
  avatarUrl?: string;
  mutualFriendCount: number;
  mutualFriends: string[];
  sharedGroups: string[];
  reasons: string[];
}

export interface Message {
  id: string; // MSG#<timestamp>#<randomId>
  conversationId: string;
  senderId: string;
  content: string;
  attachments?: string[];
  media?: FileURL[];
  files?: FileURL[];
  like?: string[]; // Array of user emails who liked
  seen?: string[]; // Array of user emails who saw
  status?: 'sending' | 'sent' | 'delivered' | 'seen' | 'error'; 
  replyTo?: any; // msg object or id
  recalled?: boolean;
  removed?: string[]; // user emails
  type: "text" | "image" | "video" | "file" | "system";
  createdAt: string;
  updatedAt?: string;
  pinned?: boolean;
  pinnedAt?: string;
  reactions?: Record<string, string[]>;
}

export interface OtpCode {
  id: string; // OTP#<email>
  code: string;
  type: "register" | "forgot_password";
  attempts: number;
  expiresAt: number; // TTL (Unix timestamp)
}

export interface UserSession {
  id: string; // SESSION#<deviceId>
  userId: string;
  isActive: boolean;
  lastActiveAt: string;
}

// Data Transfer Objects (DTOs)
export interface RegisterRequestDto {
  email: string;
  password?: string;
  fullName?: string;
  gender?: boolean;
  dataOfBirth?: string;
  phone?: string;
  otp?: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  platform?: "web" | "mobile";
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}
