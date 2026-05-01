import { StateCreator } from 'zustand';
import { chatGet, chatPost, chatPatch } from '../../utils/api';
import { 
  normalizeMessage, 
  sortMessages, 
  dedupeMessagesById 
} from '../chatHelpers';
import { getCachedMessages, setCachedMessages } from '../storage';
import { ChatStore } from '../chatStore';
import { getMessagePreview } from '../../utils/chatUtils';

export interface MessageSlice {
  messages: any[];
  isLoadingMessages: boolean;
  nextCursor: string | null;
  fetchToken: number;
  targetMessageId: string | null;
  setTargetMessageId: (id: string | null) => void;
  setActiveConversation: (convId: string | null, targetId?: string | null) => void;
  fetchMessages: (convId: string, limit?: number, requestToken?: number, targetId?: string | null) => Promise<void>;
  fetchMoreMessages: (convId: string, limit?: number, requestToken?: number) => Promise<void>;
  fetchMessagesContext: (convId: string, targetId: string, token: number) => Promise<void>;
  setMessages: (updater: any, nextCursor?: string | null) => void;
  addMessage: (message: any) => void;
  updateMessage: (msgId: string, updates: any) => void;
  sendMessageOptimistic: (convId: string, senderEmail: string, content: string, msgType?: string, extraFields?: any) => string;
  patchMessageOptimistic: (convId: string, messageId: string, data: any) => Promise<void>;
  deleteMessageOptimistic: (convId: string, messageId: string) => Promise<void>;
  fetchMessage: (convId: string, messageId: string) => Promise<void>;
  clearHistory: (convId: string) => Promise<void>;
}

export const createMessageSlice: StateCreator<ChatStore, [], [], MessageSlice> = (set, get) => ({
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,
  fetchToken: 0,
  targetMessageId: null,

  clearHistory: async (convId: string) => {
    try {
      await chatPost(`/conversations/${encodeURIComponent(convId)}/clear-history`, {});
      if (get().activeConvId === convId) {
        set({ messages: [] } as any);
      }
    } catch (err) {
      console.error("Failed to clear history", err);
      throw err;
    }
  },

  setTargetMessageId: (id) => set({ targetMessageId: id } as any),

  setActiveConversation: (convId, targetId = null) => {
    const currentActiveId = get().activeConvId;
    const currentMessages = get().messages;
    const currentTargetId = get().targetMessageId;

    if (currentActiveId === convId && targetId) {
      if (currentTargetId !== targetId) {
        set({ targetMessageId: targetId } as any);
      }
      const exists = currentMessages.some(m => m.id === targetId || m.SK === targetId);
      if (exists) return;
    }

    if (currentActiveId === convId && !targetId) return;

    const cached = targetId ? [] : getCachedMessages(convId || "");
    const fetchToken = get().fetchToken + 1;
    
    const nextConversations = get().conversations.map(c => 
      c.id === convId ? { ...c, unreadCount: 0 } : c
    );

    set({ 
      activeConvId: convId, 
      conversations: nextConversations, 
      messages: cached, 
      nextCursor: null, 
      fetchToken,
      targetMessageId: targetId
    } as any);

    if (convId) {
      if (targetId) {
        get().fetchMessagesContext(convId, targetId, fetchToken);
      } else {
        get().fetchMessages(convId, 50, fetchToken);
      }
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

      const payload = res?.data || {};
      const rawMessages = Array.isArray(payload?.messages) ? payload.messages : Array.isArray(payload) ? payload : [];
      const formattedMessages = sortMessages(rawMessages.map(normalizeMessage).filter(Boolean));

      set({
        messages: formattedMessages,
        nextCursor: payload?.nextCursor || null,
        isLoadingMessages: false,
      } as any);
      setCachedMessages(convId, formattedMessages);
    } catch (err) {
      set({ isLoadingMessages: false } as any);
      console.error("Failed to fetch messages", err);
    }
  },

  fetchMoreMessages: async (convId, limit = 30, requestToken = get().fetchToken) => {
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
        const merged = dedupeMessagesById([...state.messages, ...moreMessages]);
        const sorted = sortMessages(merged);
        setCachedMessages(convId, sorted);
        return {
          messages: sorted,
          nextCursor: payload?.nextCursor || null,
          isLoadingMessages: false,
        } as any;
      });
    } catch (err) {
      set({ isLoadingMessages: false } as any);
      console.error("Failed to fetch more messages", err);
    }
  },

  fetchMessagesContext: async (convId, targetId, token) => {
    if (token !== get().fetchToken) return;
    set({ isLoadingMessages: true } as any);
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages-context/${encodeURIComponent(targetId)}`);
      if (token !== get().fetchToken) return;
      if (res.ok && res.data) {
        get().setMessages(res.data.messages, res.data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to fetch messages context", err);
    } finally {
      if (token === get().fetchToken) {
        set({ isLoadingMessages: false } as any);
      }
    }
  },

  setMessages: (updater, nextCursor) =>
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
      } as any;
    }),

  addMessage: (message) =>
    set((state) => {
      const safeMessage = normalizeMessage(message);
      if (!safeMessage) return state;
      const incomingConvId = safeMessage.conversationId;

      const alreadyInMessages = state.messages.some((m) => m.id === safeMessage.id);

      const convIndex = state.conversations.findIndex((c) => c.id === incomingConvId);
      let nextConversations = [...state.conversations];
      if (convIndex !== -1) {
        const target = { ...nextConversations[convIndex] };
        const previewText = getMessagePreview(safeMessage);

        target.lastMessage = safeMessage.id;
        target.lastMessageContent = previewText;
        target.lastMessageSenderId = safeMessage.senderId;
        target.updatedAt = safeMessage.createdAt || new Date().toISOString();

        const isNotActive = state.activeConvId !== incomingConvId;
        const myEmail = get().currentUserEmail;
        const isFromOthers = safeMessage.senderId && myEmail && safeMessage.senderId !== myEmail;
        
        if (!alreadyInMessages && isNotActive && isFromOthers) {
          target.unreadCount = (target.unreadCount || 0) + 1;
        }

        nextConversations.splice(convIndex, 1);
        nextConversations.unshift(target);
      } else {
        get().fetchConversations();
      }

      const isActive = incomingConvId && state.activeConvId && incomingConvId.toLowerCase() === state.activeConvId.toLowerCase();
      if (!isActive) return { conversations: nextConversations } as any;

      const filteredMessages = state.messages.filter(
        (m) => m.id !== safeMessage.id && !(String(m.id).startsWith("TEMP#") && m.content === safeMessage.content && m.senderId === safeMessage.senderId)
      );

      const nextMessages = sortMessages([safeMessage, ...filteredMessages]);
      setCachedMessages(incomingConvId, nextMessages);

      return { messages: nextMessages, conversations: nextConversations } as any;
    }),

  updateMessage: (msgId, updates) =>
    set((state) => {
      const nextMessages = state.messages.map((m) => m.id === msgId ? { ...m, ...updates } : m);
      if (state.activeConvId) setCachedMessages(state.activeConvId, nextMessages);
      return { messages: nextMessages } as any;
    }),

  sendMessageOptimistic: (convId: string, senderEmail: string, content: string, msgType = "text", extraFields = {}) => {
    const tempId = `TEMP#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const attachments = extraFields.attachments || [];
    const media = attachments.filter((a: any) => a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/")).map((a: any) => ({
      url: a.dataUrl || a.uri, dataUrl: a.dataUrl || a.uri, name: a.name, mimeType: a.mimeType, size: a.size, isSticker: a.isSticker === true, isHD: a.isHD === true,
    }));
    const files = attachments.filter((a: any) => !a.mimeType.startsWith("image/") && !a.mimeType.startsWith("video/")).map((a: any) => ({
      url: a.dataUrl || a.uri, dataUrl: a.dataUrl || a.uri, name: a.name, mimeType: a.mimeType, size: a.size,
    }));

    const optimisticMsg = {
      id: tempId, conversationId: convId, senderId: senderEmail, content, type: (msgType === 'text' && (media.length > 0 || files.length > 0)) ? 'media' : msgType, status: "sending", createdAt: timestamp, media: media.length > 0 ? media : undefined, files: files.length > 0 ? files : undefined, ...extraFields,
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
        target.lastMessage = tempId; target.lastMessageContent = typeof content === "string" ? content : ((content as any)?.text || "[Tin nhắn]");
        target.lastMessageSenderId = senderEmail; target.updatedAt = timestamp;
        nextConversations.splice(convIndex, 1); nextConversations.unshift(target);
      }
      return { messages: nextMessages, conversations: nextConversations } as any;
    });

    // We don't await the API call here so the UI can continue immediately.
    // The background process should handle the actual API call once uploads are done.
    if (!extraFields.skipApi) {
      (async () => {
        try {
          const payload = { content: content || (media.length > 0 ? '[Hình ảnh]' : files.length > 0 ? '[Tệp tin]' : ''), type: optimisticMsg.type, media: media.length > 0 ? media : undefined, files: files.length > 0 ? files : undefined, ...extraFields };
          delete payload.attachments;
          delete payload.skipApi;
          const res = await chatPost(`/conversations/${encodeURIComponent(convId)}/messages`, payload);
          const savedMessage = normalizeMessage(res?.data || res);
          if (!savedMessage) throw new Error("INVALID_MESSAGE_PAYLOAD");
          set((state) => {
            const nextMessages = state.messages.map((m) => m.id === tempId ? { ...savedMessage, status: "sent" } : m);
            if (state.activeConvId === convId) setCachedMessages(convId, nextMessages);
            return { messages: nextMessages } as any;
          });
        } catch (err) {
          set((state) => ({ messages: state.messages.map((m) => m.id === tempId ? { ...m, status: "error" } : m) } as any));
        }
      })();
    }

    return tempId;
  },

  patchMessageOptimistic: async (convId, messageId, data) => {
    try {
      const res = await chatPatch(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`, data);
      if (res.ok && res.data) {
        set((state) => {
          const nextMessages = state.messages.map(m => m.id === messageId ? { ...m, ...res.data } : m);
          if (state.activeConvId === convId) setCachedMessages(convId, nextMessages);
          return { messages: nextMessages } as any;
        });
      }
    } catch (err) {}
  },

  deleteMessageOptimistic: async (convId, messageId) => {
    try {
      set((state) => {
        const nextMessages = state.messages.filter(m => m.id !== messageId);
        if (state.activeConvId === convId) setCachedMessages(convId, nextMessages);
        return { messages: nextMessages } as any;
      });
      await chatPatch(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`, { action: 'deleteForMe' });
    } catch (err) {}
  },
  
  fetchMessage: async (convId, messageId) => {
    try {
      const res = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages/${encodeURIComponent(messageId)}`);
      if (res.ok && res.data) {
        set((state) => {
          const exists = state.messages.some(m => m.id === messageId);
          if (exists) return state;
          const nextMessages = sortMessages([...state.messages, res.data]);
          if (state.activeConvId === convId) setCachedMessages(convId, nextMessages);
          return { messages: nextMessages } as any;
        });
      }
    } catch (err) {}
  },
});
