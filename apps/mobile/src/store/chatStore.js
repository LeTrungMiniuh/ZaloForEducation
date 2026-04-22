import { create } from "zustand";
import { apiRequest, chatGet, chatPost, normalizeApiResponse } from "../utils/api";

const memoryCache = new Map();
let storage = null;

try {
  // Expo Go does not provide Nitro native modules (MMKV v4), so this must be optional.
  // eslint-disable-next-line global-require
  const { MMKV } = require("react-native-mmkv");
  storage = new MMKV();
} catch (error) {
  // Expo Go fallback: keep using in-memory cache silently.
}

const MAX_CACHE = 50;

const safeJsonParse = (str, fallback = []) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// Helper to get/set from storage
const getCachedMessages = (convId) => {
  const key = `messages#${convId}`;
  if (!storage) return memoryCache.get(key) || [];
  const data = storage.getString(key);
  return data ? safeJsonParse(data, []) : [];
};

const setCachedMessages = (convId, messagesNewestFirst) => {
  const key = `messages#${convId}`;
  const payload = (Array.isArray(messagesNewestFirst) ? messagesNewestFirst : []).slice(0, MAX_CACHE);
  memoryCache.set(key, payload);
  if (storage) {
    storage.set(key, JSON.stringify(payload));
  }
};

const getMsgTime = (m) => {
  const t = m?.createdAt ? Date.parse(m.createdAt) : NaN;
  return Number.isFinite(t) ? t : 0;
};

// Standardizes order to newest-first (tin mới nhất ở đầu mảng)
const sortMessages = (arr) =>
  [...(arr || [])].sort((a, b) => {
    const ta = getMsgTime(a);
    const tb = getMsgTime(b);
    if (tb !== ta) return tb - ta;

    // fallback nếu createdAt thiếu hoặc bằng nhau
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });

const normalizeMessage = (message) => {
  if (!message || typeof message !== "object") return null;

  const conversationId = String(
    message.conversationId || message.convId || "",
  ).trim();

  const id = String(message.id || message.SK || "").trim();
  const senderId = String(message.senderId || message.sender_id || "").trim() || "unknown";

  // Giữ nguyên content nếu là object (cho multimedia/call), chỉ ép về string khi cần preview
  const content = typeof message.content === "string" ? message.content : message.content ?? "";

  if (!id || !conversationId) return null;

  return {
    ...message,
    id,
    conversationId,
    convId: conversationId,
    senderId,
    content,
    createdAt: message.createdAt || message.created_at || null,
  };
};

const normalizeConversation = (conv, currentUserEmail) => {
  if (!conv || typeof conv !== "object") return null;
  
  const id = String(conv.id || conv.PK || "").trim();
  if (!id) return null;

  let partner = conv.partner;
  if (conv.type === "direct" && !partner && Array.isArray(conv.members)) {
    partner = conv.members.find((m) => m !== currentUserEmail);
  }

  return {
    ...conv,
    id,
    partner,
    name: conv.name || "",
    avatar: conv.avatar || "",
    unreadCount: Number(conv.unreadCount || 0),
    updatedAt: conv.updatedAt || conv.created_at || new Date().toISOString(),
  };
};

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  fetchToken: 0,
  userProfiles: {}, 
  notifications: storage ? safeJsonParse(storage.getString("notifications"), []) : [],
  unreadNotificationCount: storage 
    ? safeJsonParse(storage.getString("notifications"), []).filter(n => !n.read).length 
    : 0,
  currentUserEmail: null,

  setCurrentUserEmail: (email) => set({ currentUserEmail: email?.toLowerCase() }),

  upsertProfiles: (newProfiles) => 
    set((state) => ({ 
      userProfiles: { ...state.userProfiles, ...newProfiles } 
    })),

  loadUserProfile: async (email) => {
    if (!email) return;
    const normalizedEmail = email.trim().toLowerCase();
    
    // Skip if current user or already loaded with full info
    const { currentUserEmail, userProfiles } = get();
    if (normalizedEmail === currentUserEmail) return;
    
    const existing = userProfiles[normalizedEmail];
    if (existing && (existing.fullName || existing.fullname)) return;

    try {
      let res = await chatGet("/friends/search", { email: normalizedEmail });
      
      // Fallback for different path structure if needed
      if (!res?.ok || !res?.found) {
        const fallbackRes = await apiRequest(`/api/chat/friends/search?email=${encodeURIComponent(normalizedEmail)}`);
        if (fallbackRes?.ok) {
          const data = fallbackRes.data || {};
          if (data.found && data.user) {
            res = { ok: true, found: true, user: data.user };
          }
        }
      }

      if (res?.ok && res?.found && res?.user) {
        set((state) => ({
          userProfiles: {
            ...state.userProfiles,
            [normalizedEmail]: {
              ...state.userProfiles[normalizedEmail],
              ...res.user,
              email: normalizedEmail
            }
          }
        }));
      }
    } catch (err) {
      console.warn(`[ChatStore] Load profile failed for ${normalizedEmail}`, err);
    }
  },

  getMessageConvId: (message) => {
    if (!message || typeof message !== "object") return null;
    return String(message.conversationId || message.convId || "").trim() || null;
  },

  setConversations: (updater) =>
    set((state) => {
      const next = typeof updater === "function" ? updater(state.conversations) : updater;
      return { conversations: Array.isArray(next) ? next : [] };
    }),

  setActiveConversation: (convId, targetId = null) => {
    const currentActiveId = get().activeConvId;
    const currentMessages = get().messages;

    if (currentActiveId === convId && targetId) {
      const exists = currentMessages.some(m => m.id === targetId || m.SK === targetId);
      if (exists) return;
    }

    if (currentActiveId === convId && !targetId) return;

    // Offline-first: Load from cache first
    const cached = targetId ? [] : getCachedMessages(convId);
    const fetchToken = get().fetchToken + 1;
    
    // Clear unreadCount locally
    const nextConversations = get().conversations.map(c => 
      c.id === convId ? { ...c, unreadCount: 0 } : c
    );

    set({ activeConvId: convId, conversations: nextConversations, messages: cached, nextCursor: null, fetchToken });

    if (convId) {
      get().fetchMessages(convId, 50, fetchToken, targetId);
    }
  },

  setMessages: (updater, nextCursor) =>
    set((state) => {
      const source = typeof updater === "function" ? updater(state.messages) : updater;
      const safeMessages = sortMessages(
        Array.isArray(source) ? source.map(normalizeMessage).filter(Boolean) : []
      );
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, safeMessages);
      }
      return {
        messages: safeMessages,
        nextCursor: nextCursor === undefined ? state.nextCursor : nextCursor,
      };
    }),

  addMessage: (message) =>
    set((state) => {
      const safeMessage = normalizeMessage(message);
      if (!safeMessage) return state;
      const incomingConvId = safeMessage.conversationId;

      const alreadyInMessages = state.messages.some((m) => m.id === safeMessage.id);

      // 1. Update conversations list (Jump to Top, Preview, Unread)
      const convIndex = state.conversations.findIndex((c) => c.id === incomingConvId);
      let nextConversations = [...state.conversations];
      if (convIndex !== -1) {
        const target = { ...nextConversations[convIndex] };
        const previewText = typeof safeMessage.content === "string" 
          ? safeMessage.content 
          : (safeMessage.content?.text || "[Tin nhắn]");

        target.lastMessage = safeMessage.id; 
        target.lastMessageContent = previewText;
        target.lastMessageSenderId = safeMessage.senderId;
        target.updatedAt = safeMessage.createdAt || new Date().toISOString();

        // Unread logic
        const isNotActive = state.activeConvId !== incomingConvId;
        const myEmail = get().currentUserEmail;
        const isFromOthers = safeMessage.senderId && myEmail && safeMessage.senderId !== myEmail;
        
        if (!alreadyInMessages && isNotActive && isFromOthers) {
          target.unreadCount = (target.unreadCount || 0) + 1;
        }

        nextConversations.splice(convIndex, 1);
        nextConversations.unshift(target);
      } else {
        // [SENIOR] If it's a NEW conversation not in our list, trigger a fetch
        get().fetchConversations();
      }

      // 2. Update active messages list if applicable
      const isActive = incomingConvId && state.activeConvId && incomingConvId.toLowerCase() === state.activeConvId.toLowerCase();
      
      if (!isActive) {
        return { conversations: nextConversations };
      }

      // Filter out optimistic duplicates
      const filteredMessages = state.messages.filter(
        (m) =>
          m.id !== safeMessage.id &&
          !(
            String(m.id).startsWith("TEMP#") &&
            m.content === safeMessage.content &&
            m.senderId === safeMessage.senderId
          ),
      );

      const nextMessages = sortMessages([safeMessage, ...filteredMessages]);
      setCachedMessages(incomingConvId, nextMessages);

      return { 
        messages: nextMessages,
        conversations: nextConversations 
      };
    }),
  
  upsertConversationLastMessage: (convId, content, senderId, isSystem, messageId) =>
    set((state) => {
      const convIndex = state.conversations.findIndex((c) => c.id === convId);
      if (convIndex === -1) return state;

      const nextConversations = [...state.conversations];
      const target = { ...nextConversations[convIndex] };
      
      target.lastMessage = messageId || target.lastMessage; 
      target.lastMessageContent = content;
      if (senderId) {
        target.lastMessageSenderId = senderId;
      }
      target.updatedAt = new Date().toISOString();

      nextConversations.splice(convIndex, 1);
      nextConversations.unshift(target);
      
      return { conversations: nextConversations };
    }),

  updateMessage: (msgId, updates) =>
    set((state) => {
      const nextMessages = state.messages.map((m) =>
        m.id === msgId ? { ...m, ...updates } : m,
      );
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, nextMessages);
      }
      return { messages: nextMessages };
    }),

  markReadLocal: (convId) => 
    set((state) => {
      const convIndex = state.conversations.findIndex(c => c.id === convId);
      if (convIndex === -1) return state;

      const nextConversations = [...state.conversations];
      nextConversations[convIndex] = { ...nextConversations[convIndex], unreadCount: 0 };

      return { conversations: nextConversations };
    }),

  fetchConversations: async () => {
    try {
      const res = await chatGet("/conversations");
      let data = [];
      if (Array.isArray(res?.data)) {
        data = res.data;
      } else if (res && typeof res === "object") {
        const numericKeys = Object.keys(res).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
        if (numericKeys.length > 0) {
          data = numericKeys.map(k => res[k]);
        }
      }

      const currentConversations = get().conversations;
      const currentUserEmail = get().currentUserEmail;

      const reconciled = data.map(rawConv => {
        const newConv = normalizeConversation(rawConv, currentUserEmail);
        if (!newConv) return null;

        const existing = currentConversations.find(c => c.id === newConv.id);
        if (existing) {
          // [SENIOR] Reconciliation logic: 
          // If local state is read (0) but server says unread (>0)
          // AND the last message ID hasn't changed, then it's a race condition.
          // Keep it read locally.
          if (existing.unreadCount === 0 && newConv.unreadCount > 0) {
            if (String(existing.lastMessage) === String(newConv.lastMessage)) {
              return { ...newConv, unreadCount: 0 };
            }
          }
        }
        return newConv;
      }).filter(c => c !== null);

      set({ conversations: reconciled });
      return reconciled;
    } catch (err) {
      console.error("Failed to fetch conversations", err);
      return [];
    }
  },

  fetchMessages: async (convId, limit = 30, requestToken = get().fetchToken, targetId = null) => {
    set({ isLoadingMessages: true });
    try {
      const queryParams = { limit };
      if (targetId) {
        queryParams.targetId = targetId;
      }

      const res = await chatGet(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        queryParams,
      );
      
      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false });
        return;
      }

      const payload = res?.data || {};
      const rawMessages = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [];
      const formattedMessages = sortMessages(rawMessages.map(normalizeMessage).filter(Boolean));

      set({
        messages: formattedMessages,
        nextCursor: payload?.nextCursor || null,
        isLoadingMessages: false,
      });
      setCachedMessages(convId, formattedMessages);
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to fetch messages", err);
    }
  },
  
  fetchMoreMessages: async (convId, limit = 30, requestToken = get().fetchToken) => {
    const { nextCursor, isLoadingMessages, activeConvId } = get();
    if (!nextCursor || isLoadingMessages || activeConvId !== convId) return;

    set({ isLoadingMessages: true });
    try {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        { limit, cursor: nextCursor }
      );

      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false });
        return;
      }

      const payload = res?.data || {};
      const rawMore = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [];
      const moreMessages = rawMore.map(normalizeMessage).filter(Boolean);

      set((state) => {
        const merged = sortMessages([...state.messages, ...moreMessages]);
        setCachedMessages(convId, merged);
        return {
          messages: merged,
          nextCursor: payload?.nextCursor || null,
          isLoadingMessages: false,
        };
      });
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to fetch more messages", err);
    }
  },

  sendMessageOptimistic: async (
    convId,
    senderEmail,
    content,
    msgType = "text",
    extraFields = {},
  ) => {
    const tempId = `TEMP#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    const optimisticMsg = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: msgType,
      status: "sending",
      createdAt: timestamp,
      ...extraFields,
    };

    set((state) => {
      let nextMessages = state.messages;
      if (state.activeConvId === convId) {
        nextMessages = sortMessages([optimisticMsg, ...state.messages]);
        setCachedMessages(convId, nextMessages);
      }

      const convIndex = state.conversations.findIndex((c) => c.id === convId);
      let nextConversations = [...state.conversations];
      if (convIndex !== -1) {
        const target = { ...nextConversations[convIndex] };
        const previewText = typeof content === "string" ? content : (content?.text || "[Tin nhắn]");
        target.lastMessage = tempId; 
        target.lastMessageContent = previewText;
        target.lastMessageSenderId = senderEmail;
        target.updatedAt = timestamp;
        
        nextConversations.splice(convIndex, 1);
        nextConversations.unshift(target);
      }

      return { 
        messages: nextMessages,
        conversations: nextConversations
      };
    });

    try {
      const res = await chatPost(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        {
          content,
          type: msgType,
          ...extraFields,
        },
      );
      const savedMessage = normalizeMessage(res?.data || res);

      if (!savedMessage) throw new Error("INVALID_MESSAGE_PAYLOAD");

      set((state) => {
        const nextMessages = state.messages.map((m) =>
          m.id === tempId ? { ...savedMessage, status: "sent" } : m,
        );
        if (state.activeConvId === convId) {
          setCachedMessages(convId, nextMessages);
        }
        return { messages: nextMessages };
      });
    } catch (err) {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, status: "error" } : m,
        ),
      }));
      console.error("Failed to send message", err);
    }
  },

  markNotificationsRead: (conversationId) =>
    set((state) => {
      const nextNotifications = state.notifications.map((n) => {
        // If conversationId is provided, only mark those matching
        if (conversationId) {
          const match = n.metadata?.conversationId === conversationId;
          return match ? { ...n, read: true } : n;
        }
        // Otherwise mark all
        return { ...n, read: true };
      });

      if (storage) {
        storage.set("notifications", JSON.stringify(nextNotifications));
      }

      return {
        notifications: nextNotifications,
        unreadNotificationCount: nextNotifications.filter((n) => !n.read).length,
      };
    }),

  addNotification: (notification) =>
    set((state) => {
      // [SENIOR] 1. Check for duplicates
      const msgId = notification.messageId || notification.metadata?.messageId;
      const isDuplicate = state.notifications.some(n => 
        n.id === notification.id || (msgId && n.metadata?.messageId === msgId)
      );
      if (isDuplicate) return state;

      // [SENIOR] 2. Skip message notifications for the ACTIVE conversation
      const convId = notification.conversationId || notification.metadata?.conversationId;
      if (convId && state.activeConvId === convId) {
        return state;
      }

      const newNotification = {
        id: notification.id || `notif#${Date.now()}#${Math.random().toString(36).slice(2, 5)}`,
        title: notification.title || "Thông báo mới",
        message: notification.content || notification.message || "",
        at: notification.at || new Date().toISOString(),
        read: false,
        type: notification.type || "text",
        metadata: {
          conversationId: convId,
          messageId: msgId,
          ...notification.metadata
        },
      };

      const nextNotifications = [newNotification, ...state.notifications].slice(0, 100);
      
      if (storage) {
        storage.set("notifications", JSON.stringify(nextNotifications));
      }

      return {
        notifications: nextNotifications,
        unreadNotificationCount: nextNotifications.filter(n => !n.read).length,
      };
    }),

  clearNotifications: () =>
    set(() => {
      if (storage) {
        storage.set("notifications", "[]");
      }
      return {
        notifications: [],
        unreadNotificationCount: 0,
      };
    }),
}));
