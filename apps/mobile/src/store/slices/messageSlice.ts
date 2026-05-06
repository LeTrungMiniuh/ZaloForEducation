import { StateCreator } from "zustand";
import { chatGet, chatPost, chatPatch, chatDelete } from "@/utils/api";
import { getCachedMessages, setCachedMessages, getCachedPinnedMessage, setCachedPinnedMessage } from "@/utils/chatCache";
import { normalizeMessage, sortMessages, dedupeMessagesById } from "../chatHelpers";
import { ChatStore } from "../chatStore";

export interface MessageSlice {
  activeConvId: string | null;
  messages: any[];
  isLoadingMessages: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  fetchToken: number;
  targetMessageId: string | null;
  
  // Local search
  localSearchResults: any[];
  isLocalSearching: boolean;
  pinnedMessagesCache: Record<string, any>; // [SENIOR] Memory cache for pinned messages
  archiveAssets: {
    media: { items: any[]; cursor: string | null; loading: boolean };
    file: { items: any[]; cursor: string | null; loading: boolean };
    link: { items: any[]; cursor: string | null; loading: boolean };
  };

  // Actions
  setTargetMessageId: (id: string | null) => void;
  setActiveConversation: (convId: string | null, targetId?: string | null) => void;
  fetchMessages: (convId: string, limit?: number, requestToken?: number, targetId?: string | null) => Promise<void>;
  fetchMoreMessages: (convId: string, limit?: number, requestToken?: number) => Promise<void>;
  fetchNewerMessages: (convId: string, limit?: number, requestToken?: number) => Promise<void>;
  fetchMessagesContext: (convId: string, targetId: string, token: number) => Promise<void>;
  setMessages: (updater: any, nextCursor?: string | null, prevCursor?: string | null) => void;
  addMessage: (message: any) => void;
  updateMessage: (msgId: string, updates: any) => void;
  sendMessageOptimistic: (convId: string, payload: { content: string, type: string, media?: any, files?: any, payload?: any, reminder?: any, replyTo?: any, extraFields?: any, skipApi?: boolean }) => Promise<string>;
  patchMessageOptimistic: (convId: string, messageId: string, data: any) => Promise<void>;
  deleteMessageOptimistic: (convId: string, messageId: string) => Promise<void>;
  clearHistory: (convId: string) => Promise<void>;
  fetchMessage: (convId: string, messageId: string) => Promise<any>;
  fetchArchiveAssets: (convId: string, type: "media" | "file" | "link", reset?: boolean) => Promise<void>;
  votePoll: (convId: string, messageId: string, optionIndex: number) => Promise<void>;
  closePoll: (convId: string, messageId: string) => Promise<void>;
  
  // Search
  searchMessages: (convId: string, query: string) => Promise<void>;
  clearLocalSearchResults: () => void;
}

export const createMessageSlice: StateCreator<ChatStore, [], [], MessageSlice> = (set, get) => ({
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  prevCursor: null,
  fetchToken: 0,
  targetMessageId: null,
  localSearchResults: [],
  isLocalSearching: false,
  pinnedMessagesCache: {},
  archiveAssets: {
    media: { items: [], cursor: null, loading: false },
    file: { items: [], cursor: null, loading: false },
    link: { items: [], cursor: null, loading: false },
  },

  setTargetMessageId: (id) => set({ targetMessageId: id } as any),

  setActiveConversation: (convId, targetId = null) => {
    const { fetchToken, activeConvId, conversations } = get();
    const newToken = fetchToken + 1;

    // 1. Handle Jump to Message (Data Windowing)
    if (targetId) {
      set({ 
        messages: [], 
        nextCursor: null, 
        prevCursor: null,
        targetMessageId: targetId,
        activeConvId: convId,
        fetchToken: newToken,
      } as any);
      if (convId) {
        get().fetchMessagesContext(convId, targetId, newToken);
      }
      return;
    }

    // 2. Normal conversation switch
    if (activeConvId === convId && !get().targetMessageId && !get().prevCursor) return;

    // Async cache loading to prevent blocking UI
    (async () => {
      const cached = await getCachedMessages(convId || "");
      if (get().activeConvId === convId && get().fetchToken === newToken) {
        set({ messages: cached } as any);
      }
    })();

    const nextConversations = (conversations || []).map((c: any) => 
      c.id === convId ? { ...c, unreadCount: 0 } : c
    );

    set({ 
      activeConvId: convId, 
      conversations: nextConversations, 
      messages: [], // Start with empty, cache will load async
      nextCursor: null, 
      prevCursor: null,
      fetchToken: newToken,
      targetMessageId: null,
      archiveAssets: {
        media: { items: [], cursor: null, loading: false },
        file: { items: [], cursor: null, loading: false },
        link: { items: [], cursor: null, loading: false },
      },
    } as any);

    if (convId) {
      get().fetchMessages(convId, 50, newToken);
    }
  },

  fetchMessages: async (convId, limit = 30, requestToken = get().fetchToken, targetId = null) => {
    set({ isLoadingMessages: true } as any);
    try {
      const queryParams: any = { limit };
      if (targetId) queryParams.targetId = targetId;

      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages`, queryParams);
      
      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false } as any);
        return;
      }

      if (res.ok && res.data) {
        get().setMessages(res.data.messages, res.data.nextCursor, res.data.prevCursor);
      }
      set({ isLoadingMessages: false } as any);
    } catch (err) {
      set({ isLoadingMessages: false } as any);
      console.error("Failed to fetch messages", err);
    }
  },

  fetchMoreMessages: async (convId, limit = 40, requestToken = get().fetchToken) => {
    const { nextCursor, isLoadingMessages, activeConvId } = get();
    if (!nextCursor || isLoadingMessages || activeConvId !== convId) return;

    set({ isLoadingMessages: true } as any);
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages`, { limit, cursor: nextCursor });

      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false } as any);
        return;
      }

      const payload = res?.data || {};
      const rawMore = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [];
      const moreMessages = rawMore.map(normalizeMessage).filter(Boolean);

      set((state) => {
        const currentMessages = state.messages;
        const currentIds = new Set(currentMessages.map((m: any) => m.id));
        
        const uniqueMore = moreMessages.filter((m: any) => m && !currentIds.has(m.id));
        const sortedMore = sortMessages(uniqueMore);

        const nextMessages = [...currentMessages, ...sortedMore];
        
        setCachedMessages(convId, nextMessages);
        return {
          messages: nextMessages,
          nextCursor: payload?.nextCursor || null,
          isLoadingMessages: false,
        } as any;
      });
    } catch (err) {
      set({ isLoadingMessages: false } as any);
      console.error("Failed to fetch more messages", err);
    }
  },

  fetchNewerMessages: async (convId, limit = 40, requestToken = get().fetchToken) => {
    const { prevCursor, isLoadingMessages, activeConvId } = get();
    if (!prevCursor || isLoadingMessages || activeConvId !== convId) return;

    set({ isLoadingMessages: true } as any);
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages`, { limit, cursor: prevCursor, scanForward: true });

      if (get().activeConvId !== convId || get().fetchToken !== requestToken) {
        set({ isLoadingMessages: false } as any);
        return;
      }

      const payload = res?.data || {};
      const rawMore = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [];
      const moreMessages = rawMore.map(normalizeMessage).filter(Boolean);

      set((state) => {
        const currentMessages = state.messages;
        const currentIds = new Set(currentMessages.map((m: any) => m.id));
        
        const uniqueMore = moreMessages.filter((m: any) => m && !currentIds.has(m.id));
        const sortedMore = sortMessages(uniqueMore);

        // Newer messages are prepended to our Newest-First array
        const nextMessages = [...sortedMore, ...currentMessages];
        
        setCachedMessages(convId, nextMessages);
        return {
          messages: nextMessages,
          prevCursor: payload?.nextCursor || null,
          isLoadingMessages: false,
        } as any;
      });
    } catch (err) {
      set({ isLoadingMessages: false } as any);
      console.error("Failed to fetch newer messages", err);
    }
  },

  fetchMessagesContext: async (convId, targetId, token) => {
    if (token !== get().fetchToken) return;
    set({ isLoadingMessages: true } as any);
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages`, { targetId });
      if (token !== get().fetchToken) return;
      if (res.ok && res.data) {
        get().setMessages(res.data.messages, res.data.nextCursor, res.data.prevCursor);
      }
      set({ isLoadingMessages: false } as any);
    } catch (err) {
      console.error("Failed to fetch messages context", err);
      set({ isLoadingMessages: false } as any);
    }
  },

  setMessages: (updater, nextCursor, prevCursor) =>
    set((state) => {
      const source = typeof updater === "function" ? updater(state.messages) : updater;
      const dedupped = dedupeMessagesById(Array.isArray(source) ? source : []);
      const safeMessages = sortMessages(dedupped.map(normalizeMessage).filter((m): m is any => !!m));
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, safeMessages);
      }
      return {
        messages: safeMessages,
        nextCursor: nextCursor === undefined ? state.nextCursor : nextCursor,
        prevCursor: prevCursor === undefined ? state.prevCursor : prevCursor,
      } as any;
    }),

  addMessage: (message) => {
    const normalized = normalizeMessage(message);
    if (!normalized) return;
    set((state) => {
      const exists = state.messages.some((m) => m.id === normalized.id);
      if (exists) return state;

      const nextMessages = sortMessages([normalized, ...state.messages]);
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, nextMessages);
      }

      // Update Archive Assets in real-time
      const updatedArchive = { ...state.archiveAssets };
      let archiveChanged = false;

      const hasMedia = (normalized.media && normalized.media.length > 0) || (normalized.type === 'image' || normalized.type === 'video');
      const hasFiles = (normalized.files && normalized.files.length > 0) || (normalized.type === 'file');
      const hasLinks = typeof normalized.content === 'string' && /https?:\/\/[^\s]+/.test(normalized.content);

      if (hasMedia) {
        updatedArchive.media = {
          ...updatedArchive.media,
          items: [normalized, ...updatedArchive.media.items]
        };
        archiveChanged = true;
      }
      if (hasFiles) {
        updatedArchive.file = {
          ...updatedArchive.file,
          items: [normalized, ...updatedArchive.file.items]
        };
        archiveChanged = true;
      }
      if (hasLinks) {
        updatedArchive.link = {
          ...updatedArchive.link,
          items: [normalized, ...updatedArchive.link.items]
        };
        archiveChanged = true;
      }

      return { 
        messages: nextMessages,
        archiveAssets: archiveChanged ? updatedArchive : state.archiveAssets
      } as any;
    });
  },

  updateMessage: (msgId, updates) =>
    set((state) => {
      const nextMessages = state.messages.map((m) =>
        m.id === msgId || m.SK === msgId ? { ...m, ...updates } : m
      );
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, nextMessages);
      }
      return { messages: nextMessages } as any;
    }),

  sendMessageOptimistic: async (convId, payload) => {
    const { content, type, media, files, payload: msgPayload, reminder, replyTo, extraFields, skipApi } = payload;
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const tempMsg = {
      id: tempId,
      SK: tempId,
      conversationId: convId,
      senderId: (get() as any).currentUserEmail,
      content,
      type,
      media: media || [],
      files: files || [],
      payload: msgPayload,
      reminder,
      replyTo,
      status: "sending",
      createdAt: timestamp,
      ...extraFields,
    };

    get().addMessage(tempMsg);

    if (skipApi) return tempId;

    try {
      const res = await chatPost(`/conversations/${encodeURIComponent(convId)}/messages`, {
        content,
        type,
        media,
        files,
        payload: msgPayload,
        reminder,
        replyTo,
        ...extraFields,
      });

      if (res.ok && res.data) {
        set((state) => {
          const nextMessages = state.messages.map((m) =>
            m.id === tempId ? normalizeMessage(res.data) : m
          );
          return { messages: nextMessages } as any;
        });
      } else {
        get().updateMessage(tempId, { status: "error" });
      }
    } catch (err) {
      get().updateMessage(tempId, { status: "error" });
    }
    return tempId;
  },

  patchMessageOptimistic: async (convId, messageId, data) => {
    // Optimistic update
    get().updateMessage(messageId, data);

    try {
      await chatPatch(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`, data);
    } catch (err) {
      console.error("Failed to patch message", err);
    }
  },

  deleteMessageOptimistic: async (convId, messageId) => {
    set((state) => {
      const nextMessages = state.messages.filter((m) => m.id !== messageId && m.SK !== messageId);
      if (state.activeConvId) {
        setCachedMessages(state.activeConvId, nextMessages);
      }
      return { messages: nextMessages } as any;
    });

    try {
      await chatDelete(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`);
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  },

  clearHistory: async (convId) => {
    try {
      await chatPost(`/conversations/${encodeURIComponent(convId)}/clear`, {});
      set({ messages: [], nextCursor: null, prevCursor: null } as any);
      setCachedMessages(convId, []);
    } catch (err) {
      console.error("Failed to clear history", err);
    }
  },

  fetchMessage: async (convId, messageId) => {
    // 1. Try Memory Cache
    const inCache = get().pinnedMessagesCache[messageId];
    if (inCache) return inCache;

    // 2. Try Disk Cache
    const onDisk = await getCachedPinnedMessage(messageId);
    if (onDisk) {
      set((state) => ({
        pinnedMessagesCache: { ...state.pinnedMessagesCache, [messageId]: onDisk }
      } as any));
      return onDisk;
    }

    // 3. Fetch from API
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`);
      if (res.ok && res.data) {
        const msg = normalizeMessage(res.data);
        // Save to both caches
        set((state) => ({
          pinnedMessagesCache: { ...state.pinnedMessagesCache, [messageId]: msg }
        } as any));
        setCachedPinnedMessage(messageId, msg);
        return msg;
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  searchMessages: async (convId, query) => {
    set({ isLocalSearching: true } as any);
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/search`, { q: query });
      if (res.ok && res.data) {
        set({ localSearchResults: (res.data as any[]).map(normalizeMessage) } as any);
      }
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      set({ isLocalSearching: false } as any);
    }
  },

  clearLocalSearchResults: () => set({ localSearchResults: [], isLocalSearching: false } as any),

  fetchArchiveAssets: async (convId, type, reset = false) => {
    const state = get();
    const current = state.archiveAssets[type];
    if (current.loading) return;
    if (!reset && current.items.length > 0 && !current.cursor) return;

    set((state) => ({
      archiveAssets: {
        ...state.archiveAssets,
        [type]: { ...state.archiveAssets[type], loading: true },
      },
    } as any));

    try {
      const cursor = reset ? "" : current.cursor || "";
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/assets`, { 
        type, 
        cursor: cursor || undefined 
      });

      if (res.ok && res.data) {
        set((state) => {
          const fetchedItems = res.data.items || [];
          const nextCursor = res.data.nextCursor || null;

          const updatedItems = reset
            ? fetchedItems
            : [...state.archiveAssets[type].items, ...fetchedItems];

          return {
            archiveAssets: {
              ...state.archiveAssets,
              [type]: {
                items: updatedItems,
                cursor: nextCursor,
                loading: false,
              },
            },
          } as any;
        });
      } else {
        set((state) => ({
          archiveAssets: {
            ...state.archiveAssets,
            [type]: { ...state.archiveAssets[type], loading: false },
          },
        } as any));
      }
    } catch (err) {
      console.error(`Failed to fetch archive assets for ${type}`, err);
      set((state) => ({
        archiveAssets: {
          ...state.archiveAssets,
          [type]: { ...state.archiveAssets[type], loading: false },
        },
      } as any));
    }
  },

  votePoll: async (convId, messageId, optionIndex) => {
    const { currentUserEmail } = get();
    if (!currentUserEmail) return;

    // Optimistic update
    set((state) => {
      const nextMessages = state.messages.map((m) => {
        if (m.id === messageId || m.SK === messageId) {
          // Poll might be in 'poll' or 'payload.poll'
          const target = m.payload?.poll || m.poll;
          if (!target) return m;

          const poll = { ...target };
          if (!poll.votes) poll.votes = {};
          poll.votes[currentUserEmail] = optionIndex;

          if (m.payload?.poll) {
            return { ...m, payload: { ...m.payload, poll } };
          } else {
            return { ...m, poll };
          }
        }
        return m;
      });
      return { messages: nextMessages } as any;
    });

    try {
      await chatPost(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/poll/vote`, {
        optionIndex
      });
    } catch (err) {
      console.error("Failed to vote poll", err);
    }
  },

  closePoll: async (convId, messageId) => {
    try {
      // Optimistic update
      set((state) => {
        const nextMessages = state.messages.map((m) => {
          if (m.id !== messageId && m.SK !== messageId) return m;

          const poll = m.payload?.poll;
          if (!poll) return m;

          return {
            ...m,
            payload: {
              ...(m.payload || {}),
              poll: {
                ...poll,
                isClosed: true,
              },
            },
          };
        });
        return { messages: nextMessages } as any;
      });

      // API call
      await chatPost(
        `/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/poll/close`,
        {},
      );
    } catch (err) {
      console.error("Failed to close poll", err);
    }
  },
});
