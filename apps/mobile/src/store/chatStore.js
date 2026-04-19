import { create } from "zustand";
import { apiRequest } from "../utils/api";

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

const normalizeApiPayload = (res) => {
  if (!res || typeof res !== "object") return res;
  if (Object.prototype.hasOwnProperty.call(res, "data")) return res.data;

  const numericKeys = Object.keys(res).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => res[key]);
  }

  const payload = { ...res };
  delete payload.ok;
  delete payload.status;
  return payload;
};

const normalizeApiResponse = (res) => ({
  ...res,
  data: normalizeApiPayload(res),
});

const normalizeMessage = (message) => {
  if (!message || typeof message !== "object") return null;

  const normalized = {
    ...message,
    id: String(message.id || "").trim(),
    senderId: String(message.senderId || message.sender_id || "").trim(),
    content: String(message.content || ""),
  };

  if (!normalized.id) return null;
  if (!normalized.senderId) normalized.senderId = "unknown";
  return normalized;
};

const chatGet = async (path, query) => {
  const queryString = query
    ? `?${Object.entries(query)
        .filter(
          ([, value]) =>
            value !== undefined && value !== null && String(value) !== "",
        )
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        )
        .join("&")}`
    : "";

  let res = await apiRequest(`/chat${path}${queryString}`);
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}${queryString}`);
  }
  return normalizeApiResponse(res);
};

const chatPost = async (path, body) => {
  let res = await apiRequest(`/chat${path}`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    });
  }
  return normalizeApiResponse(res);
};

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,

  setConversations: (update) =>
    set((state) => ({
      conversations: typeof update === "function" ? update(state.conversations) : (Array.isArray(update) ? update : []),
    })),

  setActiveConversation: (convId) => {
    if (get().activeConvId === convId) return;

    // Offline-first: Load từ cache trước
    const cached = getCachedMessages(convId);
    set({ activeConvId: convId, messages: cached, nextCursor: null });

    if (convId) {
      get().fetchMessages(convId);
    }
  },

  setMessages: (messages, nextCursor) => {
    const safeMessages = Array.isArray(messages)
      ? messages.map(normalizeMessage).filter(Boolean)
      : [];
    set({ messages: safeMessages, nextCursor });
    if (get().activeConvId) {
      setCachedMessages(get().activeConvId, safeMessages);
    }
  },

  addMessage: (message) =>
    set((state) => {
      const safeMessage = normalizeMessage(message);
      if (!safeMessage) return state;

      // Prevent adding if ID already exists
      if (state.messages.some((m) => m.id === safeMessage.id)) return state;

      // Optimistically remove any temporary message that matches this real one
      // (Same sender, same content, and ID starts with TEMP#)
      const filteredMessages = state.messages.filter(
        (m) =>
          !(
            String(m.id).startsWith("TEMP#") &&
            m.content === safeMessage.content &&
            m.senderId === safeMessage.senderId
          ),
      );

      const newMessages = [...filteredMessages, safeMessage];
      if (state.activeConvId)
        setCachedMessages(state.activeConvId, newMessages);
      return { messages: newMessages };
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

  fetchMessages: async (convId, limit = 30) => {
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
  ) => {
    const tempId = `TEMP#${Date.now()}`;
    const timestamp = new Date().toISOString();

    const optimisticMsg = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: msgType,
      status: "sending",
      createdAt: timestamp,
    };

    set((state) => ({ messages: [...state.messages, optimisticMsg] }));

    try {
      const res = await chatPost(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        {
          content,
          type: msgType,
        },
      );
      const savedMessage = normalizeMessage(res?.data || res);

      if (!savedMessage) {
        throw new Error("INVALID_MESSAGE_PAYLOAD");
      }

      set((state) => {
        // Check if the real message already exists (e.g., received via socket before API returned)
        const alreadyExists = state.messages.some(
          (m) => m.id === savedMessage.id && m.id !== tempId,
        );

        if (alreadyExists) {
          // If the real message is already there, just remove the temporary one
          return {
            messages: state.messages.filter((m) => m.id !== tempId),
          };
        }

        // Replace the temporary message with the real one
        return {
          messages: state.messages.map((m) =>
            m.id === tempId ? { ...savedMessage, status: "sent" } : m,
          ),
        };
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
}));
