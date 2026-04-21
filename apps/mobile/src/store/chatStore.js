import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest, API_URL } from '../utils/api';
import SocketService from '../utils/socket';

// --- Storage Helper (AsyncStorage Fallback for NitroModules issue) ---
const storage = {
  keys: new Set(),
  cache: {},
  async init() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      this.keys = new Set(allKeys);
      const allData = await AsyncStorage.multiGet(allKeys);
      allData.forEach(([key, value]) => {
        this.cache[key] = value;
      });
    } catch (e) {
      console.warn("Storage init failed", e);
    }
  },
  getString(key) {
    return this.cache[key] || null;
  },
  set(key, value) {
    this.cache[key] = value;
    AsyncStorage.setItem(key, value).catch(e => console.warn("Failed to persist", e));
  }
};

// Initialize storage (Note: this is async, so first load might be empty)
storage.init();

// Helper to normalize muted conversations
const normalizeMutedConversations = (raw) => {
  if (!raw || typeof raw !== "object") return {};
  const normalized = {};

  Object.entries(raw).forEach(([convId, value]) => {
    if (value === true || value === "until-open") {
      normalized[convId] = value;
      return;
    }
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > Date.now()
    ) {
      normalized[convId] = value;
      return;
    }
  });

  return normalized;
};

// --- Normalization Helpers ---
const normalizeApiPayload = (res) => {
  if (!res || typeof res !== "object") return res;
  if (Object.prototype.hasOwnProperty.call(res, "data")) return res.data;
  const numericKeys = Object.keys(res).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    return numericKeys.sort((a, b) => Number(a) - Number(b)).map((key) => res[key]);
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

const normalizeMessage = (m) => {
  if (!m) return null;
  return {
    ...m,
    id: String(m.id || m._id || ""),
    createdAt: m.createdAt || m.created_at || new Date().toISOString(),
  };
};

// --- Cache Helpers (Sync wrapper around AsyncStorage) ---
const getCachedMessages = (convId) => {
  try {
    const raw = storage.getString(`messages_${convId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const setCachedMessages = (convId, messages) => {
  try {
    // Keep only last 50 messages in cache for performance
    storage.set(`messages_${convId}`, JSON.stringify(messages.slice(-50)));
  } catch (e) {
    console.warn("Failed to cache messages", e);
  }
};

// --- API Helpers ---
const chatGet = async (path, query) => {
  const queryString = query
    ? `?${Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")}`
    : "";
  let res = await apiRequest(`/chat${path}${queryString}`);
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}${queryString}`);
  }
  return normalizeApiResponse(res);
};

const chatUpload = async (fileUri, fileName, mimeType) => {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: fileName || `file_${Date.now()}`,
    type: mimeType || "application/octet-stream",
  });

  const token = await AsyncStorage.getItem("token");
  const res = await fetch(`${API_URL}/chat/uploads`, {
    method: "POST",
    body: formData,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  let data = {};
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { message: text };
  }
  return { ok: res.ok, status: res.status, data: data?.data || data };
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

const chatPatch = async (path, body) => {
  let res = await apiRequest(`/chat${path}`, {
    method: "PATCH",
    body: JSON.stringify(body || {}),
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: "PATCH",
      body: JSON.stringify(body || {}),
    });
  }
  return normalizeApiResponse(res);
};

const chatDelete = async (path) => {
  let res = await apiRequest(`/chat${path}`, {
    method: "DELETE",
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: "DELETE",
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
  userProfiles: {},
  profileLoading: new Set(),
  user: null,
  setUser: (user) => set({ user }),
  hiddenConversations: JSON.parse(
    storage?.getString("hidden_conversations") || "{}",
  ),
  mutedConversations: normalizeMutedConversations(
    JSON.parse(storage?.getString("muted_conversations") || "{}"),
  ),

  // Search
  isSearching: false,
  searchQuery: "",
  searchResults: { contacts: [], messages: [], files: [] },

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

    // Auto unmute "until-open"
    if (convId && get().mutedConversations[convId] === "until-open") {
      get().clearConversationMuted(convId);
    }

    // Offline-first: Load từ cache trước
    const cached = getCachedMessages(convId);
    const fetchToken = get().fetchToken + 1;
    set({
      activeConvId: convId,
      messages: cached,
      nextCursor: null,
      fetchToken,
    });

    if (convId) {
      get().fetchMessages(convId, 30, fetchToken);
      get().markAsRead(convId);
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

      // Update cache
      const cached = getCachedMessages(incomingConvId);
      if (!cached.some((m) => m.id === safeMessage.id)) {
        setCachedMessages(incomingConvId, [...cached, safeMessage]);
      }

      // Update preview and unread count
      const newConvs = [...state.conversations];
      const convIndex = newConvs.findIndex((c) => c.id === incomingConvId);
      if (convIndex !== -1) {
        const isActive = state.activeConvId === incomingConvId;
        const updatedConv = {
          ...newConvs[convIndex],
          lastMessageContent: safeMessage.content,
          lastMessageSenderId: safeMessage.senderId,
          lastMessageTimestamp: new Date(safeMessage.createdAt).getTime(),
          updatedAt: safeMessage.createdAt,
          unreadCount: isActive
            ? 0
            : (newConvs[convIndex].unreadCount || 0) +
              (safeMessage.senderId !== state.user?.email ? 1 : 0),
        };
        newConvs.splice(convIndex, 1);
        newConvs.unshift(updatedConv);
      }

      if (incomingConvId !== state.activeConvId) {
        return { conversations: newConvs };
      }

      // Prevent adding if ID already exists
      if (state.messages.some((m) => m.id === safeMessage.id)) {
        return { conversations: newConvs };
      }

      // Optimistically remove any temporary message
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

      return {
        messages: newMessages,
        conversations: newConvs,
      };
    }),

  markAsRead: async (convId) => {
    // 1. Optimistic Update
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, lastReadAt: Date.now(), unreadCount: 0 } : c,
      ),
    }));

    // 2. Persist to Backend
    try {
      await chatPatch(`/conversations/${encodeURIComponent(convId)}/read`);
    } catch (err) {
      console.error("Failed to mark as read on server", err);
    }
  },

  updateMessage: (msgId, updates) =>
    set((state) => {
      const nextMessages = state.messages.map((m) =>
        m.id === msgId ? { ...m, ...updates } : m,
      );
      if (state.activeConvId) setCachedMessages(state.activeConvId, nextMessages);
      return { messages: nextMessages };
    }),

  fetchConversations: async () => {
    try {
      const res = await chatGet("/conversations");
      const data = normalizeApiPayload(res) || [];
      set({ conversations: Array.isArray(data) ? data : [] });
      return data;
    } catch (err) {
      console.error("Failed to fetch conversations", err);
      return [];
    }
  },

  fetchMessages: async (
    convId,
    limit = 30,
    requestToken = get().fetchToken,
  ) => {
    set({ isLoadingMessages: true });
    try {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        { limit },
      );
      const payload = res?.data || {};
      const newMessages = (
        Array.isArray(payload?.messages)
          ? payload.messages
          : Array.isArray(payload)
            ? payload
            : []
      )
        .map(normalizeMessage)
        .filter(Boolean);

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

  loadMoreMessages: async (convId, limit = 20) => {
    const { nextCursor, messages } = get();
    if (!nextCursor) return;

    try {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        { limit, cursor: nextCursor },
      );
      const payload = res?.data || {};
      const olderMessages = (
        Array.isArray(payload?.messages) ? payload.messages : []
      )
        .map(normalizeMessage)
        .filter(Boolean);

      set({
        messages: [...olderMessages, ...messages],
        nextCursor: payload?.nextCursor || null,
      });
    } catch (err) {
      console.error("Failed to load more messages", err);
    }
  },

  sendMessageOptimistic: async (
    convId,
    senderEmail,
    content,
    msgType = "text",
    attachments = [],
    replyTo = null,
    extraFields = {},
  ) => {
    const tempId = `TEMP#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    // 1. Upload local attachments if any
    let processedAttachments = [];
    if (attachments && attachments.length > 0) {
      processedAttachments = await Promise.all(
        attachments.map(async (a) => {
          // If it's already a web URL, don't upload
          // This includes stickers and GIFs from remote sources
          if (!a.dataUrl || a.dataUrl.startsWith("http")) {
            return a;
          }
          
          try {
            const uploadRes = await chatUpload(a.dataUrl, a.name, a.mimeType);
            if (uploadRes.ok) {
              const data = uploadRes.data;
              return {
                ...a,
                url: data.fileUrl || data.url || a.dataUrl,
                dataUrl: data.fileUrl || data.url || a.dataUrl,
                name: data.name || a.name,
              };
            }
          } catch (err) {
            console.error("Upload failed for file", a.name, err);
          }
          return a;
        })
      );
    }

    const media = processedAttachments
      .filter(
        (a) =>
          a.mimeType?.startsWith("image/") || a.mimeType?.startsWith("video/"),
      )
      .map((a) => ({
        url: a.dataUrl,
        dataUrl: a.dataUrl,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        isSticker: a.isSticker === true,
      }));

    const files = processedAttachments
      .filter(
        (a) =>
          !a.mimeType?.startsWith("image/") &&
          !a.mimeType?.startsWith("video/"),
      )
      .map((a) => ({
        url: a.dataUrl,
        dataUrl: a.dataUrl,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      }));

    const optimisticMsg = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: msgType || (attachments.length > 0 ? "media" : "text"),
      status: "sending",
      createdAt: timestamp,
      media: media.length > 0 ? media : undefined,
      files: files.length > 0 ? files : undefined,
      replyTo: replyTo || undefined,
      ...extraFields,
    };

    set((state) => {
      const newConvs = [...state.conversations];
      const convIndex = newConvs.findIndex((c) => c.id === convId);
      if (convIndex !== -1) {
        const updatedConv = {
          ...newConvs[convIndex],
          lastMessageContent: content || "[Media]",
          lastMessageSenderId: senderEmail,
          lastMessageTimestamp: new Date(timestamp).getTime(),
          updatedAt: timestamp,
        };
        newConvs.splice(convIndex, 1);
        newConvs.unshift(updatedConv);
      }
      return {
        messages:
          state.activeConvId === convId
            ? [...state.messages, optimisticMsg]
            : state.messages,
        conversations: newConvs,
      };
    });

    try {
      const res = await chatPost(
        `/conversations/${encodeURIComponent(convId)}/messages`,
        {
          content,
          type: msgType,
          media: media.length > 0 ? media : undefined,
          files: files.length > 0 ? files : undefined,
          replyTo: replyTo || undefined,
          ...extraFields,
        },
      );
      const savedMessage = normalizeMessage(res?.data || res);

      if (!savedMessage) throw new Error("INVALID_MESSAGE_PAYLOAD");

      set((state) => {
        const alreadyExists = state.messages.some(
          (m) => m.id === savedMessage.id && m.id !== tempId,
        );
        let nextMessages;
        if (alreadyExists) {
          nextMessages = state.messages.filter((m) => m.id !== tempId);
        } else {
          nextMessages = state.messages.map((m) =>
            m.id === tempId ? { ...savedMessage, status: "sent" } : m,
          );
        }
        if (state.activeConvId === convId) return { messages: nextMessages };
        return state;
      });

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
      console.error("Failed to send message", err);
    }
  },

  deleteMessageOptimistic: async (convId, messageId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    try {
      await chatPatch(
        `/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        { action: "deleteForMe" },
      );
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  },

  patchMessageOptimistic: async (convId, messageId, payload) => {
    const { action } = payload;
    const userEmail = get().user?.email;

    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        if (action === "recall")
          return {
            ...m,
            recalled: true,
            content: "Tin nhắn đã được thu hồi",
            media: [],
            files: [],
            reactions: {},
          };
        if (action === "pin" || action === "unpin")
          return { ...m, pinned: action === "pin", pinnedBy: action === "pin" ? userEmail : null };
        if (action === "react") {
          const { reactAction, emoji } = payload;
          const newReactions = { ...(m.reactions || {}) };
          const users = newReactions[emoji] || [];
          if (reactAction === "add") newReactions[emoji] = [...users, userEmail];
          else {
            newReactions[emoji] = users.filter((e) => e !== userEmail);
            if (newReactions[emoji].length === 0) delete newReactions[emoji];
          }
          return { ...m, reactions: newReactions };
        }
        return m;
      }),
    }));

    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        payload,
      );
      get().updateMessage(messageId, res?.data || res);
    } catch (err) {
      console.error(`Failed to ${action} message`, err);
    }
  },

  loadUserProfile: async (email) => {
    if (!email || get().userProfiles[email] || get().profileLoading.has(email))
      return;
    set((state) => ({
      profileLoading: new Set(state.profileLoading).add(email),
    }));
    try {
      const res = await chatGet("/friends/search", { email });
      if (res?.found && res?.user) {
        set((state) => ({
          userProfiles: { ...state.userProfiles, [email]: res.user },
        }));
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      set((state) => {
        const next = new Set(state.profileLoading);
        next.delete(email);
        return { profileLoading: next };
      });
    }
  },

  createGroupConversation: async (name, members) => {
    try {
      const res = await chatPost("/conversations/group", { name, members });
      get().fetchConversations();
      return res?.data || res;
    } catch (err) {
      console.error("Failed to create group", err);
      throw err;
    }
  },

  startDirectChat: async (targetEmail) => {
    try {
      const res = await chatPost("/conversations/direct", { targetEmail });
      const conv = res?.data || res;
      set((state) => {
        const exists = state.conversations.find((c) => c.id === conv.id);
        if (!exists) return { conversations: [conv, ...state.conversations] };
        return state;
      });
      get().setActiveConversation(conv.id);
    } catch (err) {
      console.error("Failed to start direct chat", err);
    }
  },

  clearHistory: async (convId) => {
    try {
      await chatDelete(`/conversations/${encodeURIComponent(convId)}/history`);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== convId),
        activeConvId: state.activeConvId === convId ? null : state.activeConvId,
        messages: state.activeConvId === convId ? [] : state.messages,
      }));
    } catch (err) {
      console.error("Failed to clear history", err);
    }
  },

  setConversationAutoDelete: async (convId, days) => {
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(convId)}/auto-delete`,
        { days },
      );
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, autoDeleteDays: days } : c,
        ),
      }));
    } catch (err) {
      console.error("Failed to update auto-delete", err);
    }
  },

  // Muting
  clearConversationMuted: (convId) => {
    set((state) => {
      const next = { ...state.mutedConversations };
      delete next[convId];
      storage?.set("muted_conversations", JSON.stringify(next));
      return { mutedConversations: next };
    });
  },

  muteConversationFor: (convId, option) => {
    let nextSetting = true;
    if (option === "1h") nextSetting = Date.now() + 3600000;
    else if (option === "4h") nextSetting = Date.now() + 14400000;
    else if (option === "until-open") nextSetting = "until-open";

    set((state) => {
      const next = { ...state.mutedConversations, [convId]: nextSetting };
      storage?.set("muted_conversations", JSON.stringify(next));
      return { mutedConversations: next };
    });
  },

  // Hiding
  hideConversationWithPin: (convId, pin) => {
    set((state) => {
      const next = { ...state.hiddenConversations, [convId]: pin };
      storage?.set("hidden_conversations", JSON.stringify(next));
      return {
        hiddenConversations: next,
        activeConvId: state.activeConvId === convId ? null : state.activeConvId,
      };
    });
  },

  unhideConversationWithPin: (convId, pin) => {
    if (get().hiddenConversations[convId] !== pin) return false;
    set((state) => {
      const next = { ...state.hiddenConversations };
      delete next[convId];
      storage?.set("hidden_conversations", JSON.stringify(next));
      return { hiddenConversations: next };
    });
    return true;
  },

  // Search
  setIsSearching: (val) => set({ isSearching: val }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  performGlobalSearch: async (query) => {
    if (query.trim().length < 2) return;
    try {
      const res = await chatGet("/search", { q: query });
      set({ searchResults: res?.data || res });
    } catch (err) {
    }
  },

  // Reactions
  toggleReaction: (message, emoji) => {
    const userEmail = get().user?.email;
    if (!userEmail) return;
    const reactions = message.reactions || {};
    const users = reactions[emoji] || [];
    const reactAction = users.includes(userEmail) ? "remove" : "add";
    
    get().patchMessageOptimistic(message.conversationId || message.convId, message.id, {
      action: "react",
      reactAction,
      emoji,
    });
  },
}));
