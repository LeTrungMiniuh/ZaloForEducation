import type { Conversation, Message } from '@zalo-edu/shared';
import Swal from 'sweetalert2';
import { create } from 'zustand';
import api from '../services/api';
import type { Attachment } from '../utils/chatUtils';

type MuteSetting = true | 'until-open' | number;

const normalizeMutedConversations = (raw: any): Record<string, MuteSetting> => {
  if (!raw || typeof raw !== 'object') return {};
  const normalized: Record<string, MuteSetting> = {};

  Object.entries(raw).forEach(([convId, value]) => {
    if (value === true || value === 'until-open') {
      normalized[convId] = value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > Date.now()) {
      normalized[convId] = value;
      return;
    }
    if (value === false) return;
    // Backward compatibility for legacy payloads.
    if (value === 'manual') {
      normalized[convId] = true;
    }
  });

  return normalized;
};

interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Message[];
  isLoadingMessages: boolean;
  nextCursor: string | null;
  userProfiles: Record<string, any>;
  profileLoading: Set<string>;
  highlightedMessageId: string | null;
  previewImage: { url: string; name: string } | null;
  hiddenConversations: Record<string, string>;
  mutedConversations: Record<string, MuteSetting>;
  
  // Actions
  setConversations: (convs: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  setUserProfiles: (profiles: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  loadUserProfile: (email: string) => Promise<void>;
  setActiveConversation: (convId: string | null) => void;
  setMessages: (messages: Message[], nextCursor: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessage: (msgId: string, updates: Partial<Message>) => void;
  setHighlightedMessageId: (id: string | null) => void;
  jumpToMessage: (messageId: string) => void;
  setPreviewImage: (url: string | null, name?: string) => void;
  hideConversationWithPin: (convId: string, pin: string) => void;
  unhideConversationWithPin: (convId: string, pin: string) => boolean;
  isConversationHidden: (convId: string) => boolean;
  setConversationMuted: (convId: string, muted: boolean) => void;
  muteConversationFor: (convId: string, option: '1h' | '4h' | 'until-8am' | 'until-open' | 'manual') => void;
  clearConversationMuted: (convId: string) => void;
  toggleConversationMuted: (convId: string) => boolean;
  isConversationMuted: (convId: string) => boolean;
  
  // Async Thunks (Logic)
  fetchConversations: () => Promise<void>;
  fetchMessages: (convId: string, limit?: number) => Promise<void>;
  loadMoreMessages: (convId: string, limit?: number) => Promise<void>;
  sendMessageOptimistic: (convId: string, senderEmail: string, content: string, msgType?: string, attachments?: Attachment[], replyTo?: any, extraFields?: Record<string, any>) => Promise<void>;
  createGroupConversation: (name: string, members: string[]) => Promise<any>;
  startDirectChat: (targetEmail: string) => Promise<void>;
  clearHistory: (convId: string) => Promise<void>;
  localClearHistory: (convId: string) => void;
  markAsRead: (convId: string) => Promise<void>;
  setLocalRead: (convId: string) => void;
  deleteMessageOptimistic: (convId: string, messageId: string) => Promise<void>;
  patchMessageOptimistic: (convId: string, messageId: string, payload: any) => Promise<void>;
  setConversationAutoDelete: (convId: string, days: 1 | 7 | 30 | null) => Promise<void>;

  // Search
  isSearching: boolean;
  searchQuery: string;
  searchResults: { contacts: any[]; messages: any[]; files: any[] };
  searchHistory: string[];
  setSearchQuery: (q: string) => void;
  setIsSearching: (val: boolean) => void;
  performGlobalSearch: (query: string) => Promise<void>;
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  // Add Friend Modal
  isAddFriendModalOpen: boolean;
  setIsAddFriendModalOpen: (val: boolean) => void;
  isCreateGroupModalOpen: boolean;
  setIsCreateGroupModalOpen: (val: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  userProfiles: {},
  profileLoading: new Set(),
  highlightedMessageId: null,
  previewImage: null,
  hiddenConversations: JSON.parse(localStorage.getItem('hidden_conversations') || '{}'),
  mutedConversations: normalizeMutedConversations(JSON.parse(localStorage.getItem('muted_conversations') || '{}')),

  // Search Initial State
  isSearching: false,
  searchQuery: '',
  searchResults: { contacts: [], messages: [], files: [] },
  searchHistory: JSON.parse(localStorage.getItem('search_history') || '[]'),
  
  // Add Friend Modal State
  isAddFriendModalOpen: false,
  setIsAddFriendModalOpen: (val) => set({ isAddFriendModalOpen: val }),
  isCreateGroupModalOpen: false,
  setIsCreateGroupModalOpen: (val) => set({ isCreateGroupModalOpen: val }),
  
  // ... existing actions ...

  clearHistory: async (convId) => {
    try {
      await api.delete(`/chat/conversations/${encodeURIComponent(convId)}/history`);
      get().localClearHistory(convId);
    } catch (err) {
      console.error('Failed to clear history', err);
      throw err;
    }
  },

  localClearHistory: (convId) => {
    // 1. Kiểm tra nếu đang ở đúng hội thoại này, xóa sạch trạng thái active
    if (get().activeConvId === convId) {
      set({ activeConvId: null, messages: [], nextCursor: null });
    }

    // 2. Xóa hẳn hội thoại khỏi danh sách bên trái
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId)
    }));
  },

  setConversations: (updater) => set((state) => ({ 
    conversations: typeof updater === 'function' ? updater(state.conversations) : updater 
  })),

  setUserProfiles: (updater) => set((state) => ({
    userProfiles: typeof updater === 'function' ? updater(state.userProfiles) : updater
  })),

  loadUserProfile: async (email) => {
    if (!email || get().userProfiles[email] || get().profileLoading.has(email)) return;

    set((state) => ({ profileLoading: new Set(state.profileLoading).add(email) }));
    try {
      const res = await api.get(`/chat/friends/search`, { params: { email } });
      if (res.data?.found && res.data?.user) {
        get().setUserProfiles((prev) => ({
          ...prev,
          [email]: res.data.user,
        }));
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      set((state) => {
        const next = new Set(state.profileLoading);
        next.delete(email);
        return { profileLoading: next };
      });
    }
  },
  
  setActiveConversation: (convId) => {
    // Auto unmute when muted "until-open" and user opens this conversation.
    if (convId && get().mutedConversations[convId] === 'until-open') {
      get().clearConversationMuted(convId);
    }

    set({ activeConvId: convId, messages: [], nextCursor: null });
    if (convId) {
      get().fetchMessages(convId);
    }
  },

  setMessages: (messages, nextCursor) => set({ messages, nextCursor }),

  addMessage: (message) => set((state) => {
    const incomingConvId = message.conversationId || (message as any).convId;
    if (!incomingConvId) return state;

    const isActiveConversation = incomingConvId === state.activeConvId;

    // 1. Tránh trùng lặp tin nhắn dựa trên ID
    if (isActiveConversation && state.messages.find(m => m.id === message.id)) return state;

    // 2. Kiểm tra nếu tin nhắn này "trùng khớp" với một tin nhắn đang ở trạng thái 'sending' (Optimistic)
    // Điều này xảy ra khi Socket báo về nhanh hơn API response
    const optimisticIndex = isActiveConversation
      ? state.messages.findIndex(m =>
      (m.conversationId || (m as any).convId) === incomingConvId &&
      m.senderId === message.senderId && 
      m.content === message.content && 
      m.status === 'sending' &&
      Math.abs(new Date(m.createdAt).getTime() - new Date(message.createdAt).getTime()) < 10000 // Trong vòng 10s
    )
      : -1;

    let newMessages;
    if (optimisticIndex !== -1) {
      // "Hợp nhất" tin nhắn thật vào vị trí tin nhắn tạm
      newMessages = [...state.messages];
      newMessages[optimisticIndex] = { ...message, status: 'sent' };
    } else if (isActiveConversation) {
      newMessages = [...state.messages, message];
    } else {
      newMessages = state.messages;
    }
    
    // 3. Cập nhật Preview trong danh sách hội thoại và đẩy lên đầu
    const newConvs = [...state.conversations];
    const convIndex = newConvs.findIndex(c => c.id === incomingConvId);
    
    if (convIndex !== -1) {
      const updatedConv = {
        ...newConvs[convIndex],
        lastMessageContent: message.content,
        lastMessageSenderId: message.senderId,
        lastMessageTimestamp: new Date(message.createdAt).getTime(),
        updatedAt: message.createdAt,
      };
      
      newConvs.splice(convIndex, 1);
      newConvs.unshift(updatedConv);
    }
    
    return { 
      messages: newMessages,
      conversations: newConvs
    };
  }),

  markAsRead: async (convId) => {
    // 1. Optimistic Update
    set((state) => ({
      conversations: state.conversations.map((c) => 
        c.id === convId ? { ...c, lastReadAt: Date.now() } : c
      )
    }));
    get().setLocalRead(convId);

    // 2. Persist to Backend
    try {
      await api.patch(`/chat/conversations/${encodeURIComponent(convId)}/read`);
    } catch (err) {
      console.error('Failed to mark as read on server', err);
      // Optional: Rollback if critical, but for read status we usually don't need it
    }
  },

  setLocalRead: (convId) => set((state) => ({
    conversations: state.conversations.map((c) => 
      c.id === convId ? { ...c, lastReadAt: Date.now() } : c
    )
  })),

  updateMessage: (msgId, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === msgId ? { ...m, ...updates } : m)
  })),

  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),

  jumpToMessage: (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      get().setHighlightedMessageId(messageId);
      setTimeout(() => {
        if (get().highlightedMessageId === messageId) {
          get().setHighlightedMessageId(null);
        }
      }, 2000);
    } else {
      console.warn('Message not found in current view. It might be further up in history.');
      // Optional: Logic to fetch more messages could go here
    }
  },

  fetchConversations: async () => {
    try {
      const res = await api.get('/chat/conversations');
      set({ conversations: res.data });
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  },

  fetchMessages: async (convId, limit = 30) => {
    set({ isLoadingMessages: true });
    try {
      const res = await api.get(`/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}`);
      set({ 
        messages: res.data.messages, 
        nextCursor: res.data.nextCursor,
        isLoadingMessages: false 
      });
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error('Failed to fetch messages', err);
    }
  },

  loadMoreMessages: async (convId, limit = 20) => {
    const { nextCursor, messages } = get();
    if (!nextCursor) return;

    try {
      const res = await api.get(`/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}&cursor=${nextCursor}`);
      set({ 
        messages: [...res.data.messages, ...messages], // Prepend older messages
        nextCursor: res.data.nextCursor 
      });
    } catch (err) {
      console.error('Failed to load more messages', err);
    }
  },

  createGroupConversation: async (name, members) => {
    try {
      const res = await api.post('/chat/conversations/group', { name, members });
      // Reload conversations list
      get().fetchConversations();
      return res.data;
    } catch (err) {
      console.error('Failed to create group', err);
      throw err;
    }
  },

  sendMessageOptimistic: async (convId, senderEmail, content, msgType = 'text', attachments = [], replyTo = null, extraFields = {}) => {
    const tempId = `TEMP#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    
    // Categorize attachments
    const media = attachments.filter(a => a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')).map(a => ({
      url: a.dataUrl,
      dataUrl: a.dataUrl,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      isSticker: a.isSticker === true,
      isHD: a.isHD === true
    }));

    const files = attachments.filter(a => !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')).map(a => ({
      url: a.dataUrl,
      dataUrl: a.dataUrl,
      name: a.name,
      mimeType: a.mimeType,
      size: a.size
    }));

    const optimisticMsg: any = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: (msgType || (attachments.length > 0 ? 'media' : 'text')) as any,
      status: 'sending',
      createdAt: timestamp,
      media: media.length > 0 ? media : undefined,
      files: files.length > 0 ? files : undefined,
      replyTo: replyTo || undefined,
      ...extraFields,
    };

    // 1. Add Optimistically
    set((state) => {
      const newConvs = [...state.conversations];
      const convIndex = newConvs.findIndex(c => c.id === convId);
      if (convIndex !== -1) {
        const updatedConv = {
          ...newConvs[convIndex],
          lastMessageContent: (() => {
            if (msgType === 'contact_card') return '[Danh thiếp]';
            if (!content || content.startsWith('MSG#')) {
              if (media.length > 0) {
                if (media.some((item: any) => item.isSticker === true || String(item.mimeType || '').includes('sticker'))) return '[Sticker]';
                if (media.some((item: any) => item.isHD === true)) return '[Ảnh HD]';
                return '[Hình ảnh]';
              }
              if (files.length > 0) return '[Tệp tin]';
              return 'Tin nhắn mới';
            }
            return content;
          })(),
          lastMessageSenderId: senderEmail,
          lastMessageTimestamp: new Date(timestamp).getTime(),
          updatedAt: timestamp,
          lastReadAt: Date.now()
        };
        newConvs.splice(convIndex, 1);
        newConvs.unshift(updatedConv);
      }
      return {
        messages: state.activeConvId === convId ? [...state.messages, optimisticMsg] : state.messages,
        conversations: newConvs
      };
    });

    try {
      const res = await api.post(`/chat/conversations/${encodeURIComponent(convId)}/messages`, {
        content,
        type: msgType,
        media: media.length > 0 ? media : undefined,
        files: files.length > 0 ? files : undefined,
        replyTo: replyTo || undefined,
        ...extraFields,
      });

      // 2. Replace temp message with server ACK
      set((state) => {
        const stillExists = state.messages.some(m => m.id === tempId);
        if (!stillExists) return state;

        return {
          messages: state.messages.map(m => m.id === tempId ? { ...res.data, status: 'sent' } : m)
        };
      });
    } catch (err) {
      set((state) => ({
        messages: state.messages.map(m => m.id === tempId ? { ...m, status: 'error' } : m)
      }));
      console.error('Failed to send message', err);
    }
  },

  deleteMessageOptimistic: async (convId, messageId) => {
    // 1. Optimistic Update: Remove from UI immediately
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));

    // 2. Persist to Backend
    try {
      await api.patch(`/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`, {
        action: 'deleteForMe',
      });
    } catch (err) {
      console.error('Failed to delete message for me', err);
    }
  },

  patchMessageOptimistic: async (convId, messageId, payload) => {
    const { action } = payload;
    const userEmail = (get() as any).user?.email;

    // 1. Optimistic Updates
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;

        if (action === 'recall') {
          return { 
            ...m, 
            recalled: true, 
            content: 'Tin nhắn đã được thu hồi', 
            media: [], 
            files: [], 
            reactions: {} 
          };
        }
        if (action === 'pin' || action === 'unpin') {
          return { 
            ...m, 
            pinned: action === 'pin', 
            pinnedBy: action === 'pin' ? userEmail : null 
          };
        }
        if (action === 'react') {
          const { reactAction, emoji } = payload;
          const newReactions = { ...m.reactions };
          const users = newReactions[emoji] || [];

          if (reactAction === 'add') {
            newReactions[emoji] = [...users, userEmail];
          } else {
            newReactions[emoji] = users.filter((e: string) => e !== userEmail);
            if (newReactions[emoji].length === 0) delete newReactions[emoji];
          }

          return { ...m, reactions: newReactions };
        }
        return m;
      }),
    }));
    // 2. Persist to Backend
    try {
      const res = await api.patch(`/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`, payload);
      
      // Update with final server state
      set((state) => ({
        messages: state.messages.map(m => m.id === messageId ? res.data : m)
      }));
    } catch (err: any) {
      console.error(`Failed to patch message (${action})`, err);
      const errorMsg = err.response?.data?.message || 'Có lỗi xảy ra khi thực hiện thao tác này.';
      
      if (action === 'pin') {
        // Rollback optimistic update
        set((state) => ({
          messages: state.messages.map(m => m.id === messageId ? { ...m, pinned: false, pinnedBy: null } : m)
        }));

        Swal.fire({
          icon: 'error',
          title: 'Không thể ghim tin nhắn',
          text: errorMsg,
          confirmButtonColor: '#00418f',
          timer: 3000,
          timerProgressBar: true
        });
      }
    }
  },

  setConversationAutoDelete: async (convId, days) => {
    const prevConversations = get().conversations;

    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === convId
          ? {
              ...conversation,
              autoDeleteDays: days,
              autoDeleteUpdatedAt: new Date().toISOString(),
            }
          : conversation,
      ),
    }));

    try {
      const res = await api.patch(`/chat/conversations/${encodeURIComponent(convId)}/auto-delete`, {
        days,
      });

      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === convId
            ? {
                ...conversation,
                autoDeleteDays: res.data?.autoDeleteDays ?? days,
                autoDeleteUpdatedAt: res.data?.autoDeleteUpdatedAt || new Date().toISOString(),
              }
            : conversation,
        ),
      }));
    } catch (err) {
      console.error('Failed to update conversation auto-delete setting', err);
      set({ conversations: prevConversations });
      throw err;
    }
  },

  setPreviewImage: (url, name = 'image.png') => {
    if (!url) {
      set({ previewImage: null });
    } else {
      set({ previewImage: { url, name } });
    }
  },

  hideConversationWithPin: (convId, pin) => {
    if (!convId || !pin) return;
    set((state) => {
      const nextHidden = {
        ...state.hiddenConversations,
        [convId]: pin,
      };
      localStorage.setItem('hidden_conversations', JSON.stringify(nextHidden));
      return {
        hiddenConversations: nextHidden,
        activeConvId: state.activeConvId === convId ? null : state.activeConvId,
        messages: state.activeConvId === convId ? [] : state.messages,
        nextCursor: state.activeConvId === convId ? null : state.nextCursor,
      };
    });
  },

  unhideConversationWithPin: (convId, pin) => {
    const currentPin = get().hiddenConversations[convId];
    if (!currentPin || currentPin !== pin) return false;

    set((state) => {
      const nextHidden = { ...state.hiddenConversations };
      delete nextHidden[convId];
      localStorage.setItem('hidden_conversations', JSON.stringify(nextHidden));
      return { hiddenConversations: nextHidden };
    });
    return true;
  },

  isConversationHidden: (convId) => !!get().hiddenConversations[convId],

  setConversationMuted: (convId, muted) => {
    if (!convId) return;
    set((state) => {
      const nextMuted: Record<string, MuteSetting> = {
        ...state.mutedConversations,
      };

      if (muted) nextMuted[convId] = true;
      else delete nextMuted[convId];

      localStorage.setItem('muted_conversations', JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  muteConversationFor: (convId, option) => {
    if (!convId) return;

    const now = new Date();
    let nextSetting: MuteSetting = true;

    if (option === '1h') {
      nextSetting = Date.now() + 60 * 60 * 1000;
    } else if (option === '4h') {
      nextSetting = Date.now() + 4 * 60 * 60 * 1000;
    } else if (option === 'until-8am') {
      const until = new Date(now);
      until.setHours(8, 0, 0, 0);
      if (until.getTime() <= now.getTime()) {
        until.setDate(until.getDate() + 1);
      }
      nextSetting = until.getTime();
    } else if (option === 'until-open') {
      nextSetting = 'until-open';
    } else {
      nextSetting = true;
    }

    set((state) => {
      const nextMuted: Record<string, MuteSetting> = {
        ...state.mutedConversations,
        [convId]: nextSetting,
      };
      localStorage.setItem('muted_conversations', JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  clearConversationMuted: (convId) => {
    if (!convId) return;
    set((state) => {
      if (!(convId in state.mutedConversations)) return state;
      const nextMuted: Record<string, MuteSetting> = { ...state.mutedConversations };
      delete nextMuted[convId];
      localStorage.setItem('muted_conversations', JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  toggleConversationMuted: (convId) => {
    if (!convId) return false;
    let nextValue = false;
    set((state) => {
      const nextMuted: Record<string, MuteSetting> = {
        ...state.mutedConversations,
      };

      if (nextMuted[convId]) {
        delete nextMuted[convId];
        nextValue = false;
      } else {
        nextMuted[convId] = true;
        nextValue = true;
      }

      localStorage.setItem('muted_conversations', JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
    return nextValue;
  },

  isConversationMuted: (convId) => {
    if (!convId) return false;
    const setting = get().mutedConversations[convId];
    if (!setting) return false;
    if (setting === true || setting === 'until-open') return true;

    if (typeof setting === 'number') {
      if (Date.now() < setting) return true;
      // Auto clear expired mute.
      get().clearConversationMuted(convId);
      return false;
    }

    return false;
  },

  // Search Implementation
  setIsSearching: (val) => set({ isSearching: val }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  
  performGlobalSearch: async (query) => {
    const q = query.trim();
    if (q.length < 2) {
      set({ searchResults: { contacts: [], messages: [], files: [] } });
      return;
    }
    try {
      const res = await api.get(`/chat/search?q=${encodeURIComponent(query)}`);
      set({ searchResults: res.data });
    } catch (err) {
      console.error('Search failed', err);
    }
  },

  addToSearchHistory: (query) => {
    const q = query.trim();
    if (!q) return;
    set((state) => {
      const newHistory = [q, ...state.searchHistory.filter(h => h !== q)].slice(0, 10);
      localStorage.setItem('search_history', JSON.stringify(newHistory));
      return { searchHistory: newHistory };
    });
  },

  clearSearchHistory: () => {
    localStorage.removeItem('search_history');
    set({ searchHistory: [] });
  },

  startDirectChat: async (targetEmail) => {
    try {
      const res = await api.post('/chat/conversations/direct', { targetEmail });
      const conv = res.data;
      
      // Update conversations list if not present
      set((state) => {
        const exists = state.conversations.find(c => c.id === conv.id);
        if (!exists) {
          return { conversations: [conv, ...state.conversations] };
        }
        return state;
      });

      get().setActiveConversation(conv.id);
      set({ isSearching: false, searchQuery: '' });
    } catch (err) {
      console.error('Failed to start direct chat', err);
    }
  },
}));
