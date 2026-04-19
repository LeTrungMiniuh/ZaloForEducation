import type { Message } from '@zalo-edu/shared';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../store/chatStore';

type PresenceStatus = 'online' | 'offline';

type PresencePayload = {
  email?: string;
  status?: PresenceStatus | string;
};

type ConversationReadPayload = {
  convId?: string;
};

type HistoryClearedPayload = {
  convId?: string;
};

type TypingPayload = {
  convId?: string;
  email?: string;
  isTyping?: boolean;
};

type SocketMessage = Message & {
  convId?: string;
};

export const useSocketListeners = () => {
  const { socket } = useAuth();
  const addMessage = useChatStore((state) => state.addMessage);
  const markAsRead = useChatStore((state) => state.markAsRead);
  const setLocalRead = useChatStore((state) => state.setLocalRead);
  const localClearHistory = useChatStore((state) => state.localClearHistory);
  const setUserProfiles = useChatStore((state) => state.setUserProfiles);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg: SocketMessage) => {
      if (!msg?.id) return;

      addMessage(msg);

      const incomingConvId = msg.conversationId || msg.convId;
      if (!incomingConvId) return;

      if (incomingConvId === useChatStore.getState().activeConvId) {
        markAsRead(incomingConvId).catch((error) => {
          console.error('Failed to mark conversation as read', error);
        });
      }
    };

    const handleConversationRead = (data: ConversationReadPayload) => {
      if (!data?.convId) return;
      setLocalRead(data.convId);
    };

    const handleHistoryCleared = (data: HistoryClearedPayload) => {
      if (!data?.convId) return;
      localClearHistory(data.convId);
    };

    const handlePresenceUpdate = (data: PresencePayload) => {
      const email = String(data?.email || '').trim().toLowerCase();
      if (!email) return;

      const status = data?.status;
      if (status !== 'online' && status !== 'offline') return;

      setUserProfiles((prev) => {
        const existing = prev[email] || {};
        return {
          ...prev,
          [email]: {
            ...existing,
            email,
            status,
          },
        };
      });
    };

    const handleTypingUpdate = (data: TypingPayload) => {
      if (!data?.convId || !data?.email) return;
      document.dispatchEvent(new CustomEvent('chat_typing_update', { detail: data }));
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('conversation_marked_read', handleConversationRead);
    socket.on('history_cleared', handleHistoryCleared);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('typing_update', handleTypingUpdate);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('conversation_marked_read', handleConversationRead);
      socket.off('history_cleared', handleHistoryCleared);
      socket.off('presence_update', handlePresenceUpdate);
      socket.off('typing_update', handleTypingUpdate);
    };
  }, [
    socket,
    addMessage,
    markAsRead,
    setLocalRead,
    localClearHistory,
    setUserProfiles,
  ]);
};
