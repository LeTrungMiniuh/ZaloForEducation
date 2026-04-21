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

// Helper to get/set from storage
const getCachedMessages = (convId) => {
  const key = `messages#${convId}`;
  if (!storage) return memoryCache.get(key) || [];
  const data = storage.getString(key);
  return data ? JSON.parse(data) : [];
};

const setCachedMessages = (convId, messages) => {
  const key = `messages#${convId}`;
  const payload = messages.slice(-50);
  memoryCache.set(key, payload);
  if (storage) {
    storage.set(key, JSON.stringify(payload)); // Chỉ cache 50 tin mới nhất
  }
};

const normalizeMessage = (message) => {
  if (!message || typeof message !== "object") return null;

  const conversationId = String(
    message.conversationId || message.convId || "",
  ).trim();

  const normalized = {
    ...message,
    id: String(message.id || "").trim(),
    conversationId,
    convId: conversationId,
    senderId: String(message.senderId || message.sender_id || "").trim(),
    content: String(message.content || ""),
  };

  if (!normalized.id) return null;
  if (!normalized.senderId) normalized.senderId = "unknown";
  return normalized;
};



export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  fetchToken: 0,

  getMessageConvId: (message) => {
    if (!message || typeof message !== "object") return null;
    const convId = String(
      message.conversationId || message.convId || "",
    ).trim();
    return convId || null;
  },

  setConversations: (updater) =>
    set((state) => {
      const next =
        typeof updater === "function" ? updater(state.conversations) : updater;
      return { conversations: Array.isArray(next) ? next : [] };
    }),

  setActiveConversation: (convId) => {
    if (get().activeConvId === convId) return;

    // Offline-first: Load từ cache trước
    const cached = getCachedMessages(convId);
    const fetchToken = get().fetchToken + 1;
    set({ activeConvId: convId, messages: cached, nextCursor: null, fetchToken });

    if (convId) {
      get().fetchMessages(convId, 30, fetchToken);
    }
  },

  setMessages: (updater, nextCursor) =>
    set((state) => {
      const source =
        typeof updater === "function" ? updater(state.messages) : updater;
      const safeMessages = Array.isArray(source)
        ? source.map(normalizeMessage).filter(Boolean)
        : [];
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
      const incomingConvId = get().getMessageConvId(safeMessage);
      if (!incomingConvId) return state;

      // 1. Update Cache
      const cached = getCachedMessages(incomingConvId);
      if (!cached.some((m) => m.id === safeMessage.id)) {
        setCachedMessages(incomingConvId, [...cached, safeMessage]);
      }

      // 2. [SENIOR] Update conversations list (Jump to Top, Preview, Unread)
      const convIndex = state.conversations.findIndex((c) => c.id === incomingConvId);
      let nextConversations = [...state.conversations];
      if (convIndex !== -1) {
        const target = { ...nextConversations[convIndex] };
        
        // Only update if it's actually newer or if current lastMessage is older
        const timestamp = safeMessage.createdAt || new Date().toISOString();
        target.lastMessage = safeMessage.content;
        target.lastMessageContent = safeMessage.content;
        target.lastMessageSenderId = safeMessage.senderId;
        target.updatedAt = timestamp;

        // Unread logic
        const isNotActive = state.activeConvId !== incomingConvId;
        const isFromOthers = safeMessage.senderId !== "me" && safeMessage.senderId !== ""; // Simple shim, real check is usually email
        if (isNotActive && isFromOthers) {
          target.unreadCount = (target.unreadCount || 0) + 1;
        }

        nextConversations.splice(convIndex, 1);
        nextConversations.unshift(target);
      }

      // 3. Update active messages list if applicable
      if (incomingConvId !== state.activeConvId) {
        return { conversations: nextConversations };
      }

      if (state.messages.find((m) => m.id === safeMessage.id)) {
        return { conversations: nextConversations };
      }

      // Optimistically remove any temporary message that matches this real one
      const filteredMessages = state.messages.filter(
        (m) =>
          !(
            String(m.id).startsWith("TEMP#") &&
            m.content === safeMessage.content &&
            m.senderId === safeMessage.senderId
          ),
      );

      return { 
        messages: [...filteredMessages, safeMessage],
        conversations: nextConversations 
      };
    }),
  
  upsertConversationLastMessage: (convId, content, senderId) =>
    set((state) => {
      const convIndex = state.conversations.findIndex((c) => c.id === convId);
      if (convIndex === -1) return state;

      const nextConversations = [...state.conversations];
      const target = { ...nextConversations[convIndex] };
      
      target.lastMessage = content;
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
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === msgId ? { ...m, ...updates } : m,
      ),
    })),

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
      set({ conversations: data });
      return data;
    } catch (err) {
      console.error("Failed to fetch conversations", err);
      return [];
    }
  },

  fetchMessages: async (convId, limit = 30, requestToken = get().fetchToken) => {
    set({ isLoadingMessages: true });
    try {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        { limit },
      );
      const payload = res?.data || {};
      const newMessages = (Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload)
          ? payload
          : [])
        .map(normalizeMessage)
        .filter(Boolean);

      // Ignore stale responses when user switched conversations quickly.
      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false });
        return;
      }

      set({
        messages: newMessages,
        nextCursor: payload?.nextCursor || null,
        isLoadingMessages: false,
      });
      setCachedMessages(convId, newMessages);
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to fetch messages", err);
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

    const cached = getCachedMessages(convId);
    setCachedMessages(convId, [...cached, optimisticMsg]);

    set((state) => {
      // 1. Update internal messages list if active
      let nextMessages = state.messages;
      if (state.activeConvId === convId) {
        nextMessages = [...state.messages, optimisticMsg];
      }

      // 2. [SENIOR] Optimistic Jump to Top & Last Message Update
      const convIndex = state.conversations.findIndex((c) => c.id === convId);
      let nextConversations = [...state.conversations];
      if (convIndex !== -1) {
        const target = { ...nextConversations[convIndex] };
        target.lastMessage = content;
        target.lastMessageContent = content;
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

      if (!savedMessage) {
        throw new Error("INVALID_MESSAGE_PAYLOAD");
      }

      set((state) => ({
        messages:
          state.activeConvId === convId
            ? state.messages.map((m) =>
                m.id === tempId ? { ...savedMessage, status: "sent" } : m,
              )
            : state.messages,
      }));

      const currentCached = getCachedMessages(convId);
      setCachedMessages(
        convId,
        currentCached.map((m) =>
          m.id === tempId ? { ...savedMessage, status: "sent" } : m,
        ),
      );
    } catch (err) {
      set((state) => ({
        messages:
          state.activeConvId === convId
            ? state.messages.map((m) =>
                m.id === tempId ? { ...m, status: "error" } : m,
              )
            : state.messages,
      }));

      const currentCached = getCachedMessages(convId);
      setCachedMessages(
        convId,
        currentCached.map((m) =>
          m.id === tempId ? { ...m, status: "error" } : m,
        ),
      );
      console.error("Failed to send message", err);
    }
  },
}));
