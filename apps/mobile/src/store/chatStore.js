import { create } from 'zustand';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper to get/set from storage
const getCachedMessages = async (convId) => {
  try {
    const data = await AsyncStorage.getItem(`messages#${convId}`);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    return [];
  }
};

const setCachedMessages = (convId, messages) => {
  AsyncStorage.setItem(`messages#${convId}`, JSON.stringify(messages.slice(-50))).catch(() => {}); // Chỉ cache 50 tin mới nhất
};

export const useChatStore = create((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: [],
  isLoadingMessages: false,
  nextCursor: null,

  setConversations: (conversations) => set({ conversations }),
  
  setActiveConversation: async (convId) => {
    if (get().activeConvId === convId) return;
    
    // Set active conversation and clear messages initially
    set({ activeConvId: convId, messages: [], nextCursor: null });

    if (convId) {
      // Offline-first: Load từ cache trước
      const cached = await getCachedMessages(convId);
      // Double check activeConvId hasn't changed while await was pending
      if (get().activeConvId === convId) {
        set({ messages: cached });
      }
      
      get().fetchMessages(convId);
    }
  },

  setMessages: (messages, nextCursor) => {
    set({ messages, nextCursor });
    if (get().activeConvId) {
      setCachedMessages(get().activeConvId, messages);
    }
  },

  addMessage: (message) => set((state) => {
    if (state.messages.find(m => m.id === message.id)) return state;
    const newMessages = [...state.messages, message];
    if (state.activeConvId) setCachedMessages(state.activeConvId, newMessages);
    return { messages: newMessages };
  }),

  updateMessage: (msgId, updates) => set((state) => ({
    messages: state.messages.map(m => m.id === msgId ? { ...m, ...updates } : m)
  })),

  fetchConversations: async () => {
    try {
      const res = await axios.get('/chat/conversations');
      set({ conversations: res.data });
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  },

  fetchMessages: async (convId, limit = 30) => {
    set({ isLoadingMessages: true });
    try {
      const res = await axios.get(`/chat/conversations/${convId}/messages?limit=${limit}`);
      const newMessages = res.data.messages;
      set({ 
        messages: newMessages, 
        nextCursor: res.data.nextCursor,
        isLoadingMessages: false 
      });
      setCachedMessages(convId, newMessages);
    } catch (err) {
      set({ isLoadingMessages: false });
      console.error('Failed to fetch messages', err);
    }
  },

  sendMessageOptimistic: async (convId, senderEmail, content, msgType = 'text') => {
    const tempId = `TEMP#${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    const optimisticMsg = {
      id: tempId,
      conversationId: convId,
      senderId: senderEmail,
      content,
      type: msgType,
      status: 'sending',
      createdAt: timestamp,
    };

    set((state) => ({ messages: [...state.messages, optimisticMsg] }));

    try {
      const res = await axios.post(`/chat/conversations/${convId}/messages`, {
        content,
        type: msgType
      });

      set((state) => ({
        messages: state.messages.map(m => m.id === tempId ? { ...res.data, status: 'sent' } : m)
      }));
    } catch (err) {
      set((state) => ({
        messages: state.messages.map(m => m.id === tempId ? { ...m, status: 'sending' } : m) 
      }));
      console.error('Failed to send message', err);
    }
  }
}));
