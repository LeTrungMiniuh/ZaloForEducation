import { StateCreator } from 'zustand';
import { chatGet, apiPost, chatPatch, apiDelete, apiPatch } from '../../utils/api';
import { normalizeConversation } from '../chatHelpers';
import { ChatStore } from '../chatStore';

export interface ConversationSlice {
  conversations: any[];
  activeConvId: string | null;
  setConversations: (input: any) => void;
  markReadLocal: (convId: string) => void;
  fetchConversations: () => Promise<any[]>;
  upsertConversationLastMessage: (convId: string, content: string, senderId?: string, isSystem?: boolean, messageId?: string) => void;
  mutedConversations: Record<string, any>;
  isConversationMuted: (convId: string) => boolean;
  muteConversationFor: (convId: string, duration: '1h' | '4h' | 'until-8am' | 'until-open' | boolean) => void;
  clearConversationMuted: (convId: string) => void;
  startDirectChat: (targetEmail: string) => Promise<string>;
  addMembers: (convId: string, memberEmails: string[]) => Promise<void>;
  removeMember: (convId: string, memberEmail: string) => Promise<void>;
  updateMemberRole: (convId: string, memberEmail: string, role: 'owner' | 'deputy' | 'member') => Promise<void>;
  updateGroupInfo: (convId: string, updates: { name?: string; avatar?: string }) => Promise<void>;
  dissolveGroup: (convId: string) => Promise<void>;
  setPinConversation: (convId: string, isPinned: boolean) => Promise<boolean>;
  setHiddenConversation: (convId: string, isHidden: boolean) => Promise<boolean>;
}

export const createConversationSlice: StateCreator<ChatStore, [], [], ConversationSlice> = (set, get) => ({
  conversations: [],
  activeConvId: null,
  mutedConversations: {},

  addMembers: async (convId, memberEmails) => {
    await apiPost(`/chat/conversations/${encodeURIComponent(convId)}/members`, { members: memberEmails });
    await get().fetchConversations();
  },

  removeMember: async (convId, memberEmail) => {
    await apiDelete(`/chat/conversations/${encodeURIComponent(convId)}/members/${encodeURIComponent(memberEmail)}`);
    if (memberEmail === get().currentUserEmail) {
      set((state) => ({
        conversations: state.conversations.filter(c => c.id !== convId),
        activeConvId: state.activeConvId === convId ? null : state.activeConvId
      } as any));
    } else {
      await get().fetchConversations();
    }
  },

  updateMemberRole: async (convId, memberEmail, role) => {
    await apiPatch(`/chat/conversations/${encodeURIComponent(convId)}/roles`, { targetEmail: memberEmail, role });
    await get().fetchConversations();
  },

  updateGroupInfo: async (convId, updates) => {
    await chatPatch(`/conversations/${encodeURIComponent(convId)}`, updates);
    await get().fetchConversations();
  },

  dissolveGroup: async (convId) => {
    await apiPost(`/chat/conversations/group/${encodeURIComponent(convId)}/dissolve`, {});
    set((state) => ({
      conversations: state.conversations.filter(c => c.id !== convId),
      activeConvId: state.activeConvId === convId ? null : state.activeConvId
    } as any));
  },

  startDirectChat: async (targetEmail: string) => {
    const normalizedTarget = targetEmail.trim().toLowerCase();
    const myEmail = get().currentUserEmail?.toLowerCase();
    
    // Find existing
    const existing = get().conversations.find(c => 
      c.type === 'direct' && 
      Array.isArray(c.members) && 
      c.members.map((m: string) => m.toLowerCase()).includes(normalizedTarget)
    );

    if (existing) return existing.id;

    // Create new via backend if needed, but for now we can just use the direct chat ID pattern
    // The backend usually creates it when first message is sent or explicitly.
    // Let's call the same API as Web.
    try {
      const res = await apiPost("/chat/conversations/direct", { targetEmail: normalizedTarget });
      if (res.data?.id) {
        // Refresh conversations to get the new one
        await get().fetchConversations();
        return res.data.id;
      }
      throw new Error("Failed to create direct chat");
    } catch (err) {
      console.error("startDirectChat error", err);
      // Fallback: generate a probable ID if backend is simple
      const participants = [myEmail, normalizedTarget].sort();
      return `direct:${participants.join(':')}`;
    }
  },

  isConversationMuted: (convId: string) => {
    const muted = get().mutedConversations[convId];
    if (!muted) return false;
    if (muted === true || muted === 'until-open') return true;
    if (typeof muted === 'number') return Date.now() < muted;
    return false;
  },

  muteConversationFor: (convId, duration) => {
    let until: any = true;
    if (duration === '1h') until = Date.now() + 60 * 60 * 1000;
    else if (duration === '4h') until = Date.now() + 4 * 60 * 60 * 1000;
    else if (duration === 'until-8am') {
      const d = new Date();
      if (d.getHours() >= 8) d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      until = d.getTime();
    } else if (duration === 'until-open') until = 'until-open';

    set((state) => ({
      mutedConversations: { ...state.mutedConversations, [convId]: until }
    } as any));
  },

  clearConversationMuted: (convId) => {
    set((state) => {
      const next = { ...state.mutedConversations };
      delete next[convId];
      return { mutedConversations: next } as any;
    });
  },

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

  setPinConversation: async (convId: string, isPinned: boolean) => {
    try {
      // Try to sync with backend
      const res = await chatPatch(`/conversations/${convId}`, { pinned: isPinned });
      if (!res?.ok) throw new Error('SYNC_FAILED');
      
      // Update local state
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, pinned: isPinned } : c
        )
      } as any));
      
      return true;
    } catch (err) {
      console.error('Failed to sync pin state', err);
      // Fallback: just update local state
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, pinned: isPinned } : c
        )
      } as any));
      return false;
    }
  },

  setHiddenConversation: async (convId: string, isHidden: boolean) => {
    try {
      // Try to sync with backend
      const res = await chatPatch(`/conversations/${convId}`, { hidden: isHidden });
      if (!res?.ok) throw new Error('SYNC_FAILED');
      
      // Update local state
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, hidden: isHidden } : c
        )
      } as any));
      
      return true;
    } catch (err) {
      console.error('Failed to sync hidden state', err);
      // Fallback: just update local state
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId ? { ...c, hidden: isHidden } : c
        )
      } as any));
      return false;
    }
  },
});
