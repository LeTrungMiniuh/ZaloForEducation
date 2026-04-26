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
  size?: number;
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
  autoDeleteDays?: 1 | 7 | 30 | null;
  autoDeleteUpdatedAt?: string;
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
  type: "text" | "image" | "video" | "file" | "system" | "contact_card" | "location" | "SYSTEM_CALL";
  contactCard?: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    phone?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    label?: string;
    isLive?: boolean;
    liveSessionId?: string;
    sentAt?: string;
    expiresAt?: string;
  };
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

// --- Unified Call Model ---

export type SystemCallStatus = 'calling' | 'ringing' | 'completed' | 'missed' | 'rejected' | 'canceled';

export interface SystemCallMetadata {
  callId: string;
  callType: 'audio' | 'video';
  callStatus: SystemCallStatus;
  callerId: string;
  receiverId: string;
  duration: number; // in seconds
}

export const CALL_UI = {
  colors: {
    missed: '#ef4444', // Consistent Red-500
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    actionBlue: '#0068FF',
  },
  spacing: {
    padding: '6px 12px',
    radius: '8px',
    gap: '6px',
  }
};

/**
 * Utility to format call duration into a high-fidelity string (Production Grade)
 * 45s -> "0:45"
 * 133s -> "2:13"
 * 3722s -> "1:02:02"
 */
export const formatCallDuration = (sec: number = 0): string => {
  if (sec <= 0) return '0:00';
  
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Bot types
export interface BotConversationResponse {
  convId: string;
  botEmail: string;
  botName: string;
}

// Bot constants — single source of truth
export const BOT_EMAIL = 'bot@zaloedu.system';
export const BOT_NAME = 'ZaloEdu AI';
export const BOT_AVATAR = 'https://img.freepik.com/free-vector/graident-ai-robot-vectorart_78370-4114.jpg?semt=ais_hybrid&w=740&q=80';
