export interface Message {
  id: string;
  conversationId: string;
  convId: string;
  senderId: string;
  content: string;
  type: string;
  status?: 'sending' | 'sent' | 'error';
  createdAt: string | null;
  media?: any[];
  files?: any[];
  [key: string]: any;
}

export interface Conversation {
  id: string;
  partner?: string;
  name: string;
  avatar: string;
  unreadCount: number;
  updatedAt: string;
  lastMessage?: string;
  lastMessageContent?: string;
  lastMessageSenderId?: string;
  type?: 'direct' | 'group';
  members?: string[];
  [key: string]: any;
}

export interface UserProfile {
  email: string;
  fullName?: string;
  fullname?: string;
  avatar?: string;
  [key: string]: any;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  at: string;
  read: boolean;
  type: string;
  metadata?: {
    conversationId?: string;
    messageId?: string;
    [key: string]: any;
  };
}
