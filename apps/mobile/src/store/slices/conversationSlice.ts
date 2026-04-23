import { StateCreator } from 'zustand';
import { chatGet } from '../../utils/api';
import { normalizeConversation } from '../chatHelpers';
import { ChatStore } from '../chatStore';

export interface ConversationSlice {
  conversations: any[];
  activeConvId: string | null;
  setConversations: (input: any) => void;
  markReadLocal: (convId: string) => void;
  fetchConversations: () => Promise<any[]>;
  upsertConversationLastMessage: (convId: string, content: string, senderId?: string, isSystem?: boolean, messageId?: string) => void;
}

export const createConversationSlice: StateCreator<ChatStore, [], [], ConversationSlice> = (set, get) => ({
  conversations: [],
  activeConvId: null,

  setConversations: (input) => {
    const current = Array.isArray(get().conversations) ? get().conversations : [];
    const resolved = typeof input === "function" ? input(current) : input;
    set({ conversations: Array.isArray(resolved) ? resolved : current } as any);
  },

  markReadLocal: (convId) => 
    set((state) => {
      const convIndex = state.conversations.findIndex(c => c.id === convId);
      if (convIndex === -1) return state;

      const nextConversations = [...state.conversations];
      nextConversations[convIndex] = { ...nextConversations[convIndex], unreadCount: 0 };

      return { conversations: nextConversations } as any;
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
          if (existing.unreadCount === 0 && newConv.unreadCount > 0) {
            if (String(existing.lastMessage) === String(newConv.lastMessage)) {
              return { ...newConv, unreadCount: 0 };
            }
          }
        }
        return newConv;
      }).filter(c => c !== null);

      set({ conversations: reconciled } as any);
      return reconciled;
    } catch (err) {
      console.error("Failed to fetch conversations", err);
      return [];
    }
  },

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
      
      return { conversations: nextConversations } as any;
    }),
});
