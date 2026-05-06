import {
  type Conversation as SharedConversation,
  type Message as SharedMessage,
  BOT_EMAIL,
} from "@zalo-edu/shared";
import Swal from "sweetalert2";
import { create } from "zustand";
import api from "../services/api";
import { type Attachment, getMessagePreview } from "../utils/chatUtils";
import { registerReminderNotificationFromMessage, dismissWebNotificationsByConversation } from "../utils/reminderNotifications";

// Extend shared types with optional properties used in this store
export type Message = SharedMessage & {
  tagId?: string;
  status?: "sending" | "sent" | "delivered" | "seen" | "error";
  recalled?: boolean;
  pinned?: boolean;
  pinnedBy?: string | null;
  reactions?: Record<string, string[]>;
  payload?: any;
};

export type Conversation = SharedConversation & {
  tagId?: string;
  unreadCount?: number;
  lastReadAt?: number;
  autoDeleteDays?: number | null;
  autoDeleteUpdatedAt?: string;
};

const CONVERSATION_TAGS_KEY = "chat_conversation_tags";

const readConversationTags = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(CONVERSATION_TAGS_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeConversationTags = (map: Record<string, string>) => {
  localStorage.setItem(CONVERSATION_TAGS_KEY, JSON.stringify(map));
};

const getCurrentUserEmail = (): string => {
  try {
    const raw = localStorage.getItem("user") || "{}";
    const parsed = JSON.parse(raw);
    return String(parsed?.email || "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
};

export type MuteSetting = true | "until-open" | number;

const normalizeMutedConversations = (raw: any): Record<string, MuteSetting> => {
  if (!raw || typeof raw !== "object") return {};
  const normalized: Record<string, MuteSetting> = {};

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
    if (value === false) return;
    // Backward compatibility for legacy payloads.
    if (value === "manual") {
      normalized[convId] = true;
    }
  });

  return normalized;
};

const normalizeConversation = (
  conv: any,
  tags: Record<string, string>,
): Conversation => {
  return {
    ...conv,
    tagId: tags[conv.id] || conv.tagId || undefined,
    unreadCount: conv.unreadCount || 0,
  };
};

interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Message[];
  isLoadingMessages: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  searchResults: Message[];
  isSearching: boolean;
  isLocalSearching: boolean;
  userProfiles: Record<string, any>;
  profileLoading: Set<string>;
  highlightedMessageId: string | null;
  previewImage: { url: string; name: string } | null;
  hiddenConversations: Record<string, string>;
  mutedConversations: Record<string, MuteSetting>;
  pinnedMessagesCache: Record<string, Message>;
  archiveAssets: {
    media: { items: Message[]; cursor: string | null; loading: boolean };
    file: { items: Message[]; cursor: string | null; loading: boolean };
    link: { items: Message[]; cursor: string | null; loading: boolean };
  };

  // Actions
  setConversations: (
    convs: Conversation[] | ((prev: Conversation[]) => Conversation[]),
  ) => void;
  setUserProfiles: (
    profiles:
      | Record<string, any>
      | ((prev: Record<string, any>) => Record<string, any>),
  ) => void;
  loadUserProfile: (email: string) => Promise<void>;
  setActiveConversation: (convId: string | null) => void;
  setMessages: (messages: Message[], nextCursor: string | null, prevCursor?: string | null) => void;
  addMessage: (message: Message) => void;
  updateMessage: (msgId: string, updates: Partial<Message>) => void;
  setHighlightedMessageId: (id: string | null) => void;
  jumpToMessage: (messageId: string) => void;
  setPreviewImage: (url: string | null, name?: string) => void;
  hideConversationWithPin: (convId: string, pin: string) => void;
  unhideConversationWithPin: (convId: string, pin: string) => boolean;
  isConversationHidden: (convId: string) => boolean;
  setConversationMuted: (convId: string, muted: boolean) => void;
  muteConversationFor: (
    convId: string,
    option: "1h" | "4h" | "until-8am" | "until-open" | "manual",
  ) => void;
  clearConversationMuted: (convId: string) => void;
  toggleConversationMuted: (convId: string) => boolean;
  isConversationMuted: (convId: string) => boolean;

  updateConversationById: (
    convId: string,
    updates: Partial<Conversation> | ((prev: Conversation) => Conversation),
  ) => void;
  fetchConversations: () => Promise<void>;
  fetchConversation: (convId: string) => Promise<void>;
  fetchMessages: (convId: string, limit?: number) => Promise<void>;
  fetchMoreMessages: (convId: string, limit?: number) => Promise<void>;
  fetchArchiveAssets: (
    convId: string,
    type: "media" | "file" | "link",
    reset?: boolean,
  ) => Promise<void>;
  searchMessages: (convId: string, query: string) => Promise<void>;
  clearSearchResults: () => void;
  markAsRead: (convId: string) => Promise<void>;
  loadMoreMessages: (convId: string, limit?: number) => Promise<void>;
  loadNewerMessages: (convId: string, limit?: number) => Promise<void>;
  sendMessageOptimistic: (
    convId: string,
    senderEmail: string,
    content: string,
    msgType?: string,
    attachments?: Attachment[],
    replyTo?: any,
    extraFields?: Record<string, any>,
  ) => Promise<void>;
  createGroupConversation: (
    name: string,
    members: string[],
    avatar?: string,
  ) => Promise<any>;
  startDirectChat: (targetEmail: string) => Promise<void>;
  clearHistory: (convId: string) => Promise<void>;
  localClearHistory: (convId: string) => void;
  setLocalRead: (convId: string) => void;
  deleteMessageOptimistic: (convId: string, messageId: string) => Promise<void>;
  patchMessageOptimistic: (
    convId: string,
    messageId: string,
    payload: any,
  ) => Promise<void>;
  votePoll: (
    convId: string,
    messageId: string,
    optionIndex: number,
  ) => Promise<void>;
  closePoll: (convId: string, messageId: string) => Promise<void>;
  setConversationAutoDelete: (
    convId: string,
    days: 1 | 7 | 30 | null,
  ) => Promise<void>;
  fetchMessage: (convId: string, messageId: string) => Promise<void>;

  // Tagging
  tags: Array<{ id: string; name: string; color?: string }>;
  messageFilter: string;
  addTag: (tag: { id: string; name: string; color?: string }) => Promise<void>;
  editTag: (
    tagId: string,
    updates: Partial<{ name: string; color?: string }>,
  ) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
  assignTagToConversation: (convId: string, tagId?: string) => Promise<void>;
  removeTagFromConversation: (convId: string) => Promise<void>;
  assignTagToMessage: (
    convId: string,
    messageId: string,
    tagId?: string,
  ) => Promise<void>;
  removeTagFromMessage: (convId: string, messageId: string) => Promise<void>;
  setMessageFilter: (filter: string) => void;

  // Search
  searchQuery: string;
  searchResultsList: { contacts: any[]; messages: any[]; files: any[] };
  searchHistory: string[];
  setSearchQuery: (q: string) => void;
  setIsSearching: (val: boolean) => void;
  performGlobalSearch: (query: string) => Promise<void>;
  addToSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  // Modals
  isAddFriendModalOpen: boolean;
  setIsAddFriendModalOpen: (val: boolean) => void;
  isCreateGroupModalOpen: boolean;
  setIsCreateGroupModalOpen: (val: boolean) => void;

  // Group Management
  addMembers: (convId: string, members: string[]) => Promise<void>;
  removeMember: (convId: string, email: string) => Promise<void>;
  updateMemberRole: (
    convId: string,
    email: string,
    role: "member" | "deputy" | "owner",
  ) => Promise<void>;
  updateGroupInfo: (
    convId: string,
    data: { name?: string; avatar?: string },
  ) => Promise<void>;
  dissolveGroup: (convId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  prevCursor: null,
  searchResults: [],
  isSearching: false,
  isLocalSearching: false,
  userProfiles: {},
  profileLoading: new Set(),
  highlightedMessageId: null,
  archiveAssets: {
    media: { items: [], cursor: null, loading: false },
    file: { items: [], cursor: null, loading: false },
    link: { items: [], cursor: null, loading: false },
  },
  previewImage: null,
  hiddenConversations: JSON.parse(
    localStorage.getItem("hidden_conversations") || "{}",
  ),
  mutedConversations: normalizeMutedConversations(
    JSON.parse(localStorage.getItem("muted_conversations") || "{}"),
  ),
  pinnedMessagesCache: {},
  tags: JSON.parse(localStorage.getItem("chat_tags") || "[]"),
  messageFilter: "all",
  searchQuery: "",
  searchResultsList: { contacts: [], messages: [], files: [] },
  searchHistory: JSON.parse(localStorage.getItem("search_history") || "[]"),
  isAddFriendModalOpen: false,
  setIsAddFriendModalOpen: (val) => set({ isAddFriendModalOpen: val }),
  isCreateGroupModalOpen: false,
  setIsCreateGroupModalOpen: (val) => set({ isCreateGroupModalOpen: val }),

  setConversations: (updater) =>
    set((state) => ({
      conversations:
        typeof updater === "function" ? updater(state.conversations) : updater,
    })),

  updateConversationById: (convId, updater) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId
          ? typeof updater === "function"
            ? (updater as any)(c)
            : { ...c, ...updater }
          : c,
      ),
    })),

  setUserProfiles: (updater) =>
    set((state) => ({
      userProfiles:
        typeof updater === "function" ? updater(state.userProfiles) : updater,
    })),

  loadUserProfile: async (email) => {
    if (!email) return;
    const normalized = String(email).trim().toLowerCase();
    const existing = get().userProfiles[normalized];
    if (
      (existing && (existing.fullName || existing.fullname)) ||
      get().profileLoading.has(normalized)
    )
      return;

    set((state) => ({
      profileLoading: new Set(state.profileLoading).add(normalized),
    }));
    try {
      let res;
      try {
        res = await api.get(`/chat/friends/search`, {
          params: { email: normalized },
        });
      } catch {
        res = await api.get(`/api/chat/friends/search`, {
          params: { email: normalized },
        });
      }

      if (res.data?.found && res.data?.user) {
        const user = res.data.user;
        get().setUserProfiles((prev) => ({
          ...prev,
          [normalized]: { ...user, email: normalized },
        }));
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      set((state) => {
        const next = new Set(state.profileLoading);
        next.delete(normalized);
        return { profileLoading: next };
      });
    }
  },

  setActiveConversation: async (convId) => {
    // [FIX] Normalize the convId before setting it, to match what's in the conversations list
    let normalizedId = convId;
    if (convId && !convId.startsWith("CONV#") && convId !== "CONV#SYSTEM") {
      normalizedId = `CONV#${convId}`;
    }

    if (
      normalizedId === get().activeConvId &&
      !get().prevCursor &&
      !get().highlightedMessageId
    ) {
      return;
    }

    if (normalizedId && get().mutedConversations[normalizedId] === "until-open") {
      get().clearConversationMuted(normalizedId);
    }

    if (normalizedId) {
      dismissWebNotificationsByConversation(normalizedId);
    }

    set({
      activeConvId: normalizedId,
      messages: [],
      nextCursor: null,
      prevCursor: null,
      archiveAssets: {
        media: { items: [], cursor: null, loading: false },
        file: { items: [], cursor: null, loading: false },
        link: { items: [], cursor: null, loading: false },
      },
    });

    if (normalizedId) {
      // [FIX] Ensure metadata exists so Header renders
      const exists = get().conversations.some((c) => c.id === normalizedId);
      if (!exists) {
        await get().fetchConversation(normalizedId);
      }
      await get().fetchMessages(normalizedId);
    }
  },

  setMessages: (messages, nextCursor, prevCursor) => 
    set({ 
      messages, 
      nextCursor, 
      prevCursor: prevCursor !== undefined ? prevCursor : get().prevCursor 
    }),

  addMessage: (message) =>
    set((state) => {
      const incomingConvId = (message.conversationId || (message as any).convId || "").toLowerCase();
      if (!incomingConvId) return state;
      
      // Extreme normalization for comparison
      const normIncoming = incomingConvId.startsWith("conv#") ? incomingConvId : `conv#${incomingConvId}`;
      const activeConvId = (state.activeConvId || "").toLowerCase();
      const normActive = activeConvId.startsWith("conv#") ? activeConvId : `conv#${activeConvId}`;

      const isActiveConversation = normIncoming === normActive;

      // 1. Update preview and bump conversation to top
      const newConvs = [...state.conversations];
      const convIndex = newConvs.findIndex((c) => {
        const cid = c.id.toLowerCase();
        const normCid = cid.startsWith("conv#") ? cid : `conv#${cid}`;
        return normCid === normIncoming;
      });

      if (convIndex !== -1) {
        const isNotActive = !isActiveConversation;
        const myEmail = getCurrentUserEmail();
        const isFromOthers =
          message.senderId && myEmail && message.senderId !== myEmail;

        const updatedConv = {
          ...newConvs[convIndex],
          lastMessageContent:
            message.type === "system"
              ? String(message.content || "")
              : getMessagePreview(message),
          lastMessageSenderId: message.senderId,
          lastMessageTimestamp: new Date(message.createdAt).getTime(),
          updatedAt: message.createdAt,
          unreadCount:
            isNotActive && isFromOthers
              ? (newConvs[convIndex].unreadCount || 0) + 1
              : newConvs[convIndex].unreadCount,
        };

        newConvs.splice(convIndex, 1);
        newConvs.unshift(updatedConv);
      } else {
        get().fetchConversations();
      }

      if (!isActiveConversation) {
        return { conversations: newConvs };
      }

      // 2. Add to active messages with sorting and deduplication
      const currentMessages = state.messages;

      if (!message.id || !message.createdAt) {
        console.warn("[chatStore] Received malformed message", message);
        return { conversations: newConvs };
      }

      // Check if it's an update to a 'sending' message
      const optimisticIndex = currentMessages.findIndex(
        (m) =>
          m.senderId === message.senderId &&
          m.content === message.content &&
          m.status === "sending" &&
          Math.abs(
            new Date(m.createdAt).getTime() -
              new Date(message.createdAt).getTime(),
          ) < 10000,
      );

      let updatedMessages;
      if (optimisticIndex !== -1) {
        updatedMessages = [...currentMessages];
        updatedMessages[optimisticIndex] = { ...message, status: "sent" };
      } else if (!currentMessages.find((m) => m.id === message.id)) {
        updatedMessages = [...currentMessages, message];
      } else {
        return { conversations: newConvs };
      }

      // Always sort by ID (which contains timestamp) to ensure chronological order
      updatedMessages = updatedMessages
        .filter((m) => m && m.id && m.createdAt)
        .sort((a, b) => (a.id || "").localeCompare(b.id || ""));

      // 3. Update Archive Assets in real-time
      const updatedArchive = { ...state.archiveAssets };
      let archiveChanged = false;

      const hasMedia = (message.media && message.media.length > 0) || (message.type === 'image' || message.type === 'video');
      const hasFiles = (message.files && message.files.length > 0) || (message.type === 'file');
      const hasLinks = message.content && /https?:\/\/[^\s]+/.test(message.content);

      if (hasMedia) {
        updatedArchive.media = {
          ...updatedArchive.media,
          items: [message, ...updatedArchive.media.items]
        };
        archiveChanged = true;
      }
      if (hasFiles) {
        updatedArchive.file = {
          ...updatedArchive.file,
          items: [message, ...updatedArchive.file.items]
        };
        archiveChanged = true;
      }
      if (hasLinks) {
        updatedArchive.link = {
          ...updatedArchive.link,
          items: [message, ...updatedArchive.link.items]
        };
        archiveChanged = true;
      }

      return {
        messages: updatedMessages,
        conversations: newConvs,
        archiveAssets: archiveChanged ? updatedArchive : state.archiveAssets
      };
    }),

  markAsRead: async (convId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id.toLowerCase() === convId.toLowerCase() 
          ? { ...c, lastReadAt: Date.now(), unreadCount: 0 } 
          : c,
      ),
    }));
    get().setLocalRead(convId);
    try {
      await api.patch(`/chat/conversations/${encodeURIComponent(convId)}/read`);
    } catch (err) {
      console.error("Failed to mark as read on server", err);
    }
  },

  setLocalRead: (convId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id.toLowerCase() === convId.toLowerCase() ? { ...c, lastReadAt: Date.now() } : c,
      ),
    })),

  updateMessage: (msgId, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === msgId ? { ...m, ...updates } : m,
      ),
    })),

  setHighlightedMessageId: (id) => set({ highlightedMessageId: id }),

  jumpToMessage: async (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      set({ highlightedMessageId: messageId });
      setTimeout(() => {
        if (get().highlightedMessageId === messageId) {
          set({ highlightedMessageId: null });
        }
      }, 2000);
      return;
    }

    // Message not found, fetch context
    const activeConvId = get().activeConvId;
    if (!activeConvId) return;

    try {
      set({ isLoadingMessages: true });
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(activeConvId)}/messages?targetId=${encodeURIComponent(messageId)}`,
      );
      
      if (res.data && Array.isArray(res.data.messages)) {
        set((state) => {
          if (state.activeConvId !== activeConvId) return { isLoadingMessages: false };

          const fetched = res.data.messages.map((m: any) => ({
            ...m,
            id: m.id || m.SK,
          }));

          // Merge to avoid losing socket messages that arrived during fetch
          const fetchedIds = new Set(fetched.map(m => m.id));
          const merged = [...fetched];
          state.messages.forEach(m => {
            if (m && m.id && !fetchedIds.has(m.id)) {
              merged.push(m);
            }
          });

          return {
            messages: merged.sort((a: any, b: any) => (a.id || "").localeCompare(b.id || "")),
            nextCursor: res.data.nextCursor || null,
            prevCursor: res.data.prevCursor || null,
            isLoadingMessages: false,
          };
        });

        // After window is loaded, we can trigger the highlight
        set({ highlightedMessageId: messageId });
        setTimeout(() => set({ highlightedMessageId: null }), 3000);

        // [SENIOR] Parallel hydration of pinned messages & Smooth scroll after DOM update
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById(`msg-${messageId}`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 400); // Increased delay for DOM stability
        });
      }
    } catch (err: any) {
      console.error("Jump to message failed", err);
      set({ isLoadingMessages: false });
      
      const errorMsg = err.response?.data?.message || "Không thể nhảy đến tin nhắn này";
      
      Swal.fire({
        icon: 'info',
        title: 'Thông báo',
        text: errorMsg,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    }
  },

  fetchConversation: async (convId: string) => {
    console.debug(`[chatStore] fetchConversation called for: ${convId}`);
    try {
      const res = await api.get(`/chat/conversations/${encodeURIComponent(convId)}`);
      console.debug(`[chatStore] fetchConversation response for ${convId}:`, res.data);
      const conv = res.data;
      if (conv) {
        const convTagMap = readConversationTags();
        const normalized = normalizeConversation(
          { ...(conv || {}), id: conv?.id || conv?._id || conv?.convId },
          convTagMap,
        );
        set((state) => {
          const exists = state.conversations.find((c) => c.id === normalized.id);
          if (exists) return state;
          return { conversations: [normalized, ...state.conversations] };
        });
      }
    } catch (err) {
      console.error("Failed to fetch single conversation", err);
    }
  },

  fetchConversations: async () => {
    try {
      const [conversationRes, friendshipRes] = await Promise.all([
        api.get("/chat/conversations"),
        api.get("/chat/friends").catch(() => ({ data: [] })),
      ]);
      const convTagMap = readConversationTags();
      const conversations = Array.isArray(conversationRes.data)
        ? conversationRes.data.map((conv: any) =>
            normalizeConversation(conv, convTagMap),
          )
        : [];

      const myEmail = getCurrentUserEmail();
      const friendships = Array.isArray(friendshipRes.data)
        ? friendshipRes.data
        : [];

      const nicknameByEmail: Record<string, string> = {};
      friendships.forEach((friendship: any) => {
        const senderEmail = String(friendship?.sender_id || "")
          .trim()
          .toLowerCase();
        const receiverEmail = String(friendship?.receiver_id || "")
          .trim()
          .toLowerCase();
        const nickname = String(friendship?.nickname || "").trim();

        if (!myEmail) return;
        const otherEmail =
          senderEmail === myEmail
            ? receiverEmail
            : receiverEmail === myEmail
              ? senderEmail
              : "";
        if (otherEmail) nicknameByEmail[otherEmail] = nickname;
      });

      get().setUserProfiles((prev) => {
        const next: Record<string, any> = { ...prev };
        Object.entries(nicknameByEmail).forEach(([email, nickname]) => {
          const normalized = String(email).trim().toLowerCase();
          const existing = next[normalized] || { email: normalized };
          if (nickname) {
            next[normalized] = { ...existing, email: normalized, nickname };
          } else {
            const cleaned = { ...existing };
            delete (cleaned as any).nickname;
            next[normalized] = cleaned;
          }
        });
        return next;
      });

      set({ conversations });
    } catch (err) {
      console.error("Failed to fetch conversations", err);
    }
  },

  fetchMessages: async (convId, limit = 30) => {
    set({ isLoadingMessages: true });
    try {
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}`,
      );
      const rawMessages = res.data.messages || [];
      const formattedMessages = Array.isArray(rawMessages)
        ? rawMessages
            .filter(
              (m: any) =>
                m &&
                m.id &&
                m.createdAt &&
                !isNaN(new Date(m.createdAt).getTime()),
            )
        : [];

      set((state) => {
        if (state.activeConvId !== convId) return { isLoadingMessages: false };

        // Merge to avoid losing socket messages that arrived during fetch
        const fetchedIds = new Set(formattedMessages.map(m => m.id));
        const merged = [...formattedMessages];
        state.messages.forEach(m => {
          if (m && m.id && !fetchedIds.has(m.id)) {
            merged.push(m);
          }
        });

        return {
          messages: merged.sort((a: any, b: any) => (a.id || "").localeCompare(b.id || "")),
          nextCursor: res.data.nextCursor,
          prevCursor: res.data.prevCursor,
          isLoadingMessages: false,
        };
      });

      formattedMessages.forEach((message: any) => {
        registerReminderNotificationFromMessage(message, convId);
      });
    } catch (err) {
      set({ messages: [], nextCursor: null, prevCursor: null, isLoadingMessages: false });
    }
  },

  searchMessages: async (convId, query) => {
    if (!query.trim()) {
      set({ searchResults: [], isLocalSearching: false });
      return;
    }
    set({ isLocalSearching: true });
    try {
      const res = await api.get(`/chat/conversations/${encodeURIComponent(convId)}/search?q=${encodeURIComponent(query)}`);
      set({ searchResults: res.data || [], isLocalSearching: false });
    } catch (error) {
      console.error("[ChatStore] searchMessages error:", error);
      set({ searchResults: [], isLocalSearching: false });
    }
  },

  clearSearchResults: () => {
    set({ searchResults: [], isLocalSearching: false });
  },

  fetchMoreMessages: async (convId, limit = 30) => {
    const { nextCursor, isLoadingMessages } = get();
    if (!nextCursor || isLoadingMessages) return;

    set({ isLoadingMessages: true });
    try {
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}&cursor=${nextCursor}`,
      );
      const rawOlder = res.data.messages || [];
      const olderMessages = Array.isArray(rawOlder)
        ? [...rawOlder].reverse()
        : [];

      set((state) => {
        if (state.activeConvId !== convId) return { isLoadingMessages: false };

        // Use a Map to deduplicate and then sort
        const messageMap = new Map();
        state.messages.forEach((m) => {
          if (
            m &&
            m.id &&
            m.createdAt &&
            !isNaN(new Date(m.createdAt).getTime())
          ) {
            messageMap.set(m.id, m);
          }
        });
        olderMessages.forEach((m) => {
          if (
            m &&
            m.id &&
            m.createdAt &&
            !isNaN(new Date(m.createdAt).getTime())
          ) {
            messageMap.set(m.id, m);
          }
        });

        const merged = Array.from(messageMap.values()).sort(
          (a: any, b: any) => {
            const t1 = new Date(a.createdAt).getTime();
            const t2 = new Date(b.createdAt).getTime();
            if (isNaN(t1)) return 1;
            if (isNaN(t2)) return -1;
            return t1 - t2;
          },
        );

        return {
          messages: merged,
          nextCursor: res.data.nextCursor,
          isLoadingMessages: false,
        };
      });

      olderMessages.forEach((message: any) => {
        registerReminderNotificationFromMessage(message, convId);
      });
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to load more messages", err);
    }
  },

  loadMoreMessages: async (convId, limit = 40) => {
    const { nextCursor, isLoadingMessages } = get();
    if (!nextCursor || isLoadingMessages) return;

    set({ isLoadingMessages: true });
    try {
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}&cursor=${nextCursor}`,
      );
      const rawOlder = res.data.messages || [];
      const olderMessages = Array.isArray(rawOlder) ? rawOlder : [];

      set((state) => {
        if (state.activeConvId !== convId) return { isLoadingMessages: false };

        const currentMessages = state.messages;
        const currentIds = new Set(currentMessages.map((m: any) => m.id));
        
        // Filter out any duplicates from older messages
        const uniqueOlder = olderMessages.filter((m: any) => m && m.id && !currentIds.has(m.id));
        
        // Since olderMessages are fetched by cursor (backwards), we just need to ensure they are sorted correctly
        // and prepended to the current list.
        const sortedOlder = uniqueOlder.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return {
          messages: [...sortedOlder, ...currentMessages],
          nextCursor: res.data.nextCursor,
          isLoadingMessages: false,
        };
      });
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to load more messages", err);
    }
  },

  loadNewerMessages: async (convId, limit = 40) => {
    const { prevCursor, isLoadingMessages } = get();
    if (!prevCursor || isLoadingMessages) return;

    set({ isLoadingMessages: true });
    try {
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/messages?limit=${limit}&cursor=${prevCursor}&scanForward=true`,
      );
      const rawNewer = res.data.messages || [];
      const newerMessages = Array.isArray(rawNewer) ? rawNewer : [];

      set((state) => {
        if (state.activeConvId !== convId) return { isLoadingMessages: false };

        const currentMessages = state.messages;
        const currentIds = new Set(currentMessages.map((m: any) => m.id));
        
        const uniqueNewer = newerMessages.filter((m: any) => m && m.id && !currentIds.has(m.id));
        const sortedNewer = uniqueNewer.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return {
          messages: [...currentMessages, ...sortedNewer],
          prevCursor: res.data.nextCursor, // In scanForward, nextCursor is the "newer" one
          isLoadingMessages: false,
        };
      });
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error("Failed to load newer messages", err);
    }
  },

  createGroupConversation: async (name, members, avatar) => {
    try {
      const res = await api.post("/chat/conversations/group", {
        name,
        members,
        avatar,
      });
      const conv = res.data;

      // Ensure we add the new conversation to local state immediately
      try {
        const convTagMap = readConversationTags();
        const normalized = normalizeConversation(
          { ...(conv || {}), id: conv?.id || conv?._id || conv?.convId },
          convTagMap,
        );
        set((state) => {
          if (!state.conversations.find((c) => c.id === normalized.id)) {
            return { conversations: [normalized, ...state.conversations] };
          }
          return state;
        });
        // Activate the conversation right away so UI navigates into it
        const newConvId = normalized.id;
        if (newConvId) {
          get().setActiveConversation(newConvId);
        }
      } catch (e) {
        console.warn("Failed to optimistically add new group to state", e);
      }

      // Refresh full conversation list in background
      get().fetchConversations();
      return conv;
    } catch (err) {
      console.error("Failed to create group", err);
      throw err;
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

    const media = attachments
      .filter(
        (a) =>
          a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/"),
      )
      .map((a) => ({
        url: a.dataUrl,
        dataUrl: a.dataUrl,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
        isSticker: a.isSticker === true,
        isHD: a.isHD === true,
      }));

    const files = attachments
      .filter(
        (a) =>
          !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("video/"),
      )
      .map((a) => ({
        url: a.dataUrl,
        dataUrl: a.dataUrl,
        name: a.name,
        mimeType: a.mimeType,
        size: a.size,
      }));

    const optimisticMsg: any = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: (msgType || (attachments.length > 0 ? "media" : "text")) as any,
      status: "sending",
      createdAt: timestamp,
      media: media.length > 0 ? media : undefined,
      files: files.length > 0 ? files : undefined,
      replyTo: replyTo || undefined,
      ...extraFields,
    };

    const lowerConvId = (convId || "").toLowerCase();
    const normLowerConvId = lowerConvId.startsWith("conv#") ? lowerConvId : `conv#${lowerConvId}`;

    set((state) => {
      const newConvs = [...state.conversations];
      const convIndex = newConvs.findIndex((c) => {
        const cid = c.id.toLowerCase();
        const normCid = cid.startsWith("conv#") ? cid : `conv#${cid}`;
        return normCid === normLowerConvId;
      });
      if (convIndex !== -1) {
        const updatedConv = {
          ...newConvs[convIndex],
          lastMessageContent:
            optimisticMsg.type === "system"
              ? String(optimisticMsg.content || "")
              : getMessagePreview(optimisticMsg),
          lastMessageSenderId: senderEmail,
          lastMessageTimestamp: new Date(timestamp).getTime(),
          updatedAt: timestamp,
          lastReadAt: Date.now(),
        };
        newConvs.splice(convIndex, 1);
        newConvs.unshift(updatedConv);
      }
      const activeConvId = (state.activeConvId || "").toLowerCase();
      const normActive = activeConvId.startsWith("conv#") ? activeConvId : `conv#${activeConvId}`;
      
      return {
        messages:
          normActive === normLowerConvId
            ? [...state.messages, optimisticMsg]
            : state.messages,
        conversations: newConvs,
      };
    });

    try {
      const res = await api.post(
        `/chat/conversations/${encodeURIComponent(convId)}/messages`,
        {
          content,
          type: msgType,
          media: media.length > 0 ? media : undefined,
          files: files.length > 0 ? files : undefined,
          replyTo: replyTo || undefined,
          ...extraFields,
        },
      );

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...res.data, status: "sent" } : m,
        ),
      }));

      if (res.data?.payload?.reminder) {
        registerReminderNotificationFromMessage(res.data, convId);
      }
    } catch (err) {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, status: "error" } : m,
        ),
      }));
      console.error("Failed to send message", err);
    }
  },

  deleteMessageOptimistic: async (convId, messageId) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    try {
      await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        { action: "deleteForMe" },
      );
    } catch (err) {
      console.error("Failed to delete message", err);
    }
  },

  patchMessageOptimistic: async (convId, messageId, payload) => {
    const { action } = payload;
    const userEmail = getCurrentUserEmail();

    // 1. Optimistic UI update (Messages list - only if active)
    set((state) => ({
      messages:
        state.activeConvId === convId
          ? state.messages.map((m) => {
              if (m.id !== messageId) return m;

              if (action === "recall") {
                return {
                  ...m,
                  recalled: true,
                  content: "Tin nhắn đã được thu hồi",
                  media: [],
                  files: [],
                  reactions: {},
                };
              }
              if (action === "pin" || action === "unpin") {
                return {
                  ...m,
                  pinned: action === "pin",
                  pinnedBy: action === "pin" ? userEmail : null,
                };
              }
              if (action === "react") {
                const { reactAction, emoji } = payload;
                const newReactions = { ...m.reactions };
                const users = newReactions[emoji] || [];
                if (reactAction === "add") {
                  if (!users.includes(userEmail))
                    newReactions[emoji] = [...users, userEmail];
                } else {
                  newReactions[emoji] = users.filter(
                    (e: string) => e !== userEmail,
                  );
                  if (newReactions[emoji].length === 0)
                    delete newReactions[emoji];
                }
                return { ...m, reactions: newReactions };
              }
              return m;
            })
          : state.messages,
    }));

    // 2. Optimistic Metadata update (Conversation object - even if not active)
    if (action === "pin" || action === "unpin") {
      get().updateConversationById(convId, (prev) => {
        let pinnedMessageIds = [...(prev.pinnedMessageIds || [])];
        if (action === "pin") {
          if (!pinnedMessageIds.includes(messageId)) {
            pinnedMessageIds.unshift(messageId);
            // Limit to 3 if needed, but backend usually enforces this
            if (pinnedMessageIds.length > 3) pinnedMessageIds.pop();
          }
        } else {
          pinnedMessageIds = pinnedMessageIds.filter(
            (id: string) => id !== messageId,
          );
        }
        return { ...prev, pinnedMessageIds };
      });
    }

    try {
      const res = await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        payload,
      );

      // 3. Final update (Messages list - only if active)
      set((state) => ({
        messages:
          state.activeConvId === convId
            ? state.messages.map((m) => (m.id === messageId ? res.data : m))
            : state.messages,
      }));

      // 4. Final update (Conversation list - even if not active)
      if (res.data?.pinnedMessageIds) {
        get().updateConversationById(convId, {
          pinnedMessageIds: res.data.pinnedMessageIds,
        });
      }
    } catch (err: any) {
      console.error(`Failed to patch message (${action})`, err);

      // 5. Revert optimistic updates
      if (action === "pin") {
        set((state) => ({
          messages:
            state.activeConvId === convId
              ? state.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, pinned: false, pinnedBy: null }
                    : m,
                )
              : state.messages,
        }));

        get().updateConversationById(convId, (prev) => ({
          ...prev,
          pinnedMessageIds: (prev.pinnedMessageIds || []).filter(
            (id: string) => id !== messageId,
          ),
        }));

        Swal.fire({
          icon: "error",
          title: "Lỗi",
          text: err.response?.data?.message || "Không thể thực hiện ghim.",
        });
      }
    }
  },

  votePoll: async (convId, messageId, optionIndex: number) => {
    const userEmail = getCurrentUserEmail();
    let previousVote: string | undefined;

    // Optimistic update
    set((state) => ({
      messages: state.messages.map((m) => {
        const pollSource = m.payload?.poll || (m as any).poll;
        if (m.id !== messageId || !pollSource) return m;

        const votes = { ...(pollSource.votes || {}) };
        previousVote = votes[userEmail];
        votes[userEmail] = optionIndex.toString();

        const nextPoll = {
          ...pollSource,
          allowMultiple: false,
          votes,
        };

        return {
          ...m,
          payload: {
            ...m.payload,
            poll: nextPoll,
          },
        };
      }),
    }));

    // Send to backend
    try {
      const res = await api.post(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/poll/vote`,
        { optionIndex },
      );

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? res.data : m,
        ),
      }));
    } catch (err) {
      console.error("Failed to vote on poll", err);
      // Revert optimistic update
      set((state) => ({
        messages: state.messages.map((m) => {
          const pollSource = m.payload?.poll || (m as any).poll;
          if (m.id !== messageId || !pollSource) return m;

          const votes = { ...(pollSource.votes || {}) };
          if (previousVote === undefined) {
            delete votes[userEmail];
          } else {
            votes[userEmail] = previousVote;
          }

          return {
            ...m,
            payload: {
              ...m.payload,
              poll: {
                ...pollSource,
                votes,
              },
            },
          };
        }),
      }));
    }
  },

  closePoll: async (convId, messageId) => {
    // Optimistic update
    set((state) => ({
      messages: state.messages.map((m) => {
        const pollSource = m.payload?.poll || (m as any).poll;
        if (m.id !== messageId || !pollSource) return m;

        return {
          ...m,
          payload: {
            ...m.payload,
            poll: {
              ...pollSource,
              isClosed: true,
            },
          },
        };
      }),
    }));

    // Send to backend
    try {
      const res = await api.post(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}/poll/close`,
      );

      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? res.data : m,
        ),
      }));
    } catch (err) {
      console.error("Failed to close poll", err);
      // Revert optimistic update
      set((state) => ({
        messages: state.messages.map((m) => {
          const pollSource = m.payload?.poll || (m as any).poll;
          if (m.id !== messageId || !pollSource) return m;

          return {
            ...m,
            payload: {
              ...m.payload,
              poll: {
                ...pollSource,
                isClosed: false,
              },
            },
          };
        }),
      }));
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: err.response?.data?.message || "Không thể đóng bình chọn.",
      });
    }
  },

  setConversationAutoDelete: async (convId, days) => {
    const prevConversations = get().conversations;
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              autoDeleteDays: days,
              autoDeleteUpdatedAt: new Date().toISOString(),
            }
          : c,
      ),
    }));

    try {
      const res = await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/auto-delete`,
        { days },
      );
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                autoDeleteDays: res.data?.autoDeleteDays ?? days,
                autoDeleteUpdatedAt:
                  res.data?.autoDeleteUpdatedAt || new Date().toISOString(),
              }
            : c,
        ),
      }));
    } catch (err) {
      console.error("Failed to update auto-delete", err);
      set({ conversations: prevConversations });
      throw err;
    }
  },

  setPreviewImage: (url, name = "image.png") => {
    set({ previewImage: url ? { url, name } : null });
  },

  addTag: async (tag) => {
    const tags = [...get().tags, tag];
    localStorage.setItem("chat_tags", JSON.stringify(tags));
    set({ tags });
  },

  editTag: async (tagId, updates) => {
    const tags = get().tags.map((t: any) =>
      t.id === tagId ? { ...t, ...updates } : t,
    );
    localStorage.setItem("chat_tags", JSON.stringify(tags));
    set({ tags });
  },

  deleteTag: async (tagId) => {
    const tags = get().tags.filter((t: any) => t.id !== tagId);
    localStorage.setItem("chat_tags", JSON.stringify(tags));
    const nextMap = { ...readConversationTags() };
    Object.keys(nextMap).forEach((id) => {
      if (nextMap[id] === tagId) delete nextMap[id];
    });
    writeConversationTags(nextMap);
    set((state) => ({
      tags,
      messages: state.messages.map((m) =>
        m.tagId === tagId ? { ...m, tagId: undefined } : m,
      ),
      conversations: state.conversations.map((c) =>
        c.tagId === tagId ? { ...c, tagId: undefined } : c,
      ),
    }));
  },

  assignTagToConversation: async (convId, tagId) => {
    const map = { ...readConversationTags() };
    if (tagId) map[convId] = tagId;
    else delete map[convId];
    writeConversationTags(map);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, tagId } : c,
      ),
    }));
  },

  removeTagFromConversation: async (convId) =>
    get().assignTagToConversation(convId, undefined),

  assignTagToMessage: async (convId, messageId, tagId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, tagId } : m,
      ),
    }));
    try {
      await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        { action: "tag", tagId },
      );
    } catch (e) {
      console.debug("Backend tag failed", e);
    }
  },

  removeTagFromMessage: async (convId, messageId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, tagId: undefined } : m,
      ),
    }));
    try {
      await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
        { action: "untag" },
      );
    } catch (e) {
      console.debug("Backend untag failed", e);
    }
  },

  setMessageFilter: (filter) => set({ messageFilter: filter }),

  hideConversationWithPin: (convId, pin) => {
    if (!convId || !pin) return;
    set((state) => {
      const nextHidden = { ...state.hiddenConversations, [convId]: pin };
      localStorage.setItem("hidden_conversations", JSON.stringify(nextHidden));
      const lowerConvId = (convId || "").toLowerCase();
      const isActive = (state.activeConvId || "").toLowerCase() === lowerConvId;
      return {
        hiddenConversations: nextHidden,
        activeConvId: isActive ? null : state.activeConvId,
        messages: isActive ? [] : state.messages,
        nextCursor: isActive ? null : state.nextCursor,
      };
    });
  },

  unhideConversationWithPin: (convId, pin) => {
    const currentPin = get().hiddenConversations[convId];
    if (!currentPin || currentPin !== pin) return false;
    set((state) => {
      const nextHidden = { ...state.hiddenConversations };
      delete nextHidden[convId];
      localStorage.setItem("hidden_conversations", JSON.stringify(nextHidden));
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
      localStorage.setItem("muted_conversations", JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  muteConversationFor: (convId, option) => {
    if (!convId) return;
    const now = new Date();
    let nextSetting: MuteSetting = true;
    if (option === "1h") nextSetting = Date.now() + 60 * 60 * 1000;
    else if (option === "4h") nextSetting = Date.now() + 4 * 60 * 60 * 1000;
    else if (option === "until-8am") {
      const until = new Date(now);
      until.setHours(8, 0, 0, 0);
      if (until.getTime() <= now.getTime()) until.setDate(until.getDate() + 1);
      nextSetting = until.getTime();
    } else if (option === "until-open") nextSetting = "until-open";

    set((state) => {
      const nextMuted: Record<string, MuteSetting> = {
        ...state.mutedConversations,
        [convId]: nextSetting,
      };
      localStorage.setItem("muted_conversations", JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  clearConversationMuted: (convId) => {
    if (!convId) return;
    set((state) => {
      const nextMuted = { ...state.mutedConversations };
      delete nextMuted[convId];
      localStorage.setItem("muted_conversations", JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
  },

  toggleConversationMuted: (convId) => {
    if (!convId) return false;
    let val = false;
    set((state) => {
      const nextMuted: Record<string, MuteSetting> = {
        ...state.mutedConversations,
      };
      if (nextMuted[convId]) {
        delete nextMuted[convId];
        val = false;
      } else {
        nextMuted[convId] = true;
        val = true;
      }
      localStorage.setItem("muted_conversations", JSON.stringify(nextMuted));
      return { mutedConversations: nextMuted };
    });
    return val;
  },

  isConversationMuted: (convId) => {
    if (!convId) return false;
    const setting = get().mutedConversations[convId];
    if (!setting) return false;
    if (setting === true || setting === "until-open") return true;
    if (typeof setting === "number") {
      if (Date.now() < setting) return true;
      get().clearConversationMuted(convId);
    }
    return false;
  },

  setIsSearching: (val) => set({ isSearching: val }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  performGlobalSearch: async (query) => {
    const q = query.trim();
    if (q.length < 2) {
      set({ searchResultsList: { contacts: [], messages: [], files: [] } });
      return;
    }
    try {
      const res = await api.get(`/chat/search?q=${encodeURIComponent(q)}`);
      const data = res.data || { contacts: [], messages: [], files: [] };
      
      // Filter out bot from search results
      const filteredContacts = (data.contacts || []).filter((c: any) => {
        const email = String(c.email || "").toLowerCase();
        return email !== BOT_EMAIL && !email.includes('bot@zaloedu.system');
      });
      const filteredMessages = (data.messages || []).filter((m: any) => {
        const senderId = String(m.senderId || "").toLowerCase();
        return senderId !== BOT_EMAIL && !senderId.includes('bot@zaloedu.system');
      });

      set({ searchResultsList: { ...data, contacts: filteredContacts, messages: filteredMessages } });
    } catch (err) {
      console.error("Search failed", err);
    }
  },

  addToSearchHistory: (query) => {
    const q = query.trim();
    if (!q) return;
    set((state) => {
      const newHistory = [
        q,
        ...state.searchHistory.filter((h) => h !== q),
      ].slice(0, 10);
      localStorage.setItem("search_history", JSON.stringify(newHistory));
      return { searchHistory: newHistory };
    });
  },

  clearSearchHistory: () => {
    localStorage.removeItem("search_history");
    set({ searchHistory: [] });
  },

  startDirectChat: async (targetEmail) => {
    try {
      const res = await api.post("/chat/conversations/direct", { targetEmail });
      const conv = res.data;
      set((state) => {
        if (!state.conversations.find((c) => c.id === conv.id))
          return { conversations: [conv, ...state.conversations] };
        return state;
      });
      get().setActiveConversation(conv.id);
      set({ isSearching: false, searchQuery: "" });
    } catch (err) {
      console.error("Failed start direct chat", err);
    }
  },

  fetchMessage: async (convId, messageId) => {
    // [SENIOR] Check if already exists in state to avoid redundant waterfall requests
    if (get().messages.some((m) => m.id === messageId)) return;

    try {
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`,
      );
      if (res.data) {
        const msg = { ...res.data, id: res.data.id || res.data.SK };
        set((state) => ({
          pinnedMessagesCache: {
            ...state.pinnedMessagesCache,
            [messageId]: msg,
          },
        }));
      }
    } catch (err) {
      console.error("Failed to fetch single message", err);
    }
  },

  clearHistory: async (convId) => {
    try {
      await api.delete(
        `/chat/conversations/${encodeURIComponent(convId)}/history`,
      );
      get().localClearHistory(convId);
    } catch (err) {
      console.error("Failed to clear history", err);
      throw err;
    }
  },

  localClearHistory: (convId) => {
    if ((get().activeConvId || "").toLowerCase() === (convId || "").toLowerCase())
      set({ activeConvId: null, messages: [], nextCursor: null });
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id.toLowerCase() !== convId.toLowerCase()),
    }));
  },

  // Group Management Implementation
  addMembers: async (convId, members) => {
    try {
      await api.post(
        `/chat/conversations/${encodeURIComponent(convId)}/members`,
        { members },
      );
      get().fetchConversations();
    } catch (err) {
      console.error("Failed to add members", err);
      throw err;
    }
  },

  removeMember: async (convId, email) => {
    try {
      await api.delete(
        `/chat/conversations/${encodeURIComponent(convId)}/members/${encodeURIComponent(email)}`,
      );
      get().fetchConversations();
      // If I am the one who left/kicked, close the chat
      if (email === getCurrentUserEmail()) {
        set({ activeConvId: null, messages: [] });
      }
    } catch (err) {
      console.error("Failed to remove member", err);
      throw err;
    }
  },

  updateMemberRole: async (convId, email, role) => {
    try {
      await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}/roles`,
        { targetEmail: email, role },
      );
      get().fetchConversations();
    } catch (err) {
      console.error("Failed to update role", err);
      throw err;
    }
  },

  updateGroupInfo: async (convId, data) => {
    try {
      await api.patch(
        `/chat/conversations/${encodeURIComponent(convId)}`,
        data,
      );
      get().fetchConversations();
    } catch (err) {
      console.error("Failed to update group info", err);
      throw err;
    }
  },

  dissolveGroup: async (convId) => {
    try {
      await api.delete(`/chat/conversations/${encodeURIComponent(convId)}`);
      set({ activeConvId: null, messages: [] });
      get().fetchConversations();
    } catch (err) {
      console.error("Failed to dissolve group", err);
      throw err;
    }
  },

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
    }));

    try {
      const cursor = reset ? "" : current.cursor || "";
      const res = await api.get(
        `/chat/conversations/${encodeURIComponent(convId)}/assets?type=${type}&cursor=${encodeURIComponent(cursor)}`,
      );

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
        };
      });
    } catch (err) {
      console.error(`Failed to fetch archive assets for ${type}`, err);
      set((state) => ({
        archiveAssets: {
          ...state.archiveAssets,
          [type]: { ...state.archiveAssets[type], loading: false },
        },
      }));
    }
  },
}));
