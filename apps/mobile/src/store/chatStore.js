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

      const cached = getCachedMessages(incomingConvId);
      if (!cached.some((m) => m.id === safeMessage.id)) {
        setCachedMessages(incomingConvId, [...cached, safeMessage]);
      }

      if (incomingConvId !== state.activeConvId) {
        return state;
      }

      if (state.messages.find((m) => m.id === safeMessage.id)) return state;
      const newMessages = [...state.messages, safeMessage];
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
      const conversations = Array.isArray(res?.data) ? res.data : [];
      set({ conversations });
    } catch (err) {
      console.error("Failed to fetch conversations", err);
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
    };

    const cached = getCachedMessages(convId);
    setCachedMessages(convId, [...cached, optimisticMsg]);

    set((state) => {
      if (state.activeConvId !== convId) return state;
      return { messages: [...state.messages, optimisticMsg] };
    });

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
