import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { leaveCurrentSession } from './useChime';
import { getMessagePreview } from '../utils/chatUtils';

export const useSocketListeners = () => {
  const { socket, user } = useAuth();
  const { 
    addMessage, 
    activeConvId, 
    markAsRead, 
    setLocalRead, 
    setConversations,
    localClearHistory,
    updateMessage,
    setUserProfiles,
    setMessages,
    messages
  } = useChatStore();

  // Helper to update conv list locally
  const upsertConversationLastMessage = (convId: string, msg: any) => {
    setConversations((prev) => {
      const index = prev.findIndex((conv) => conv.id === convId);
      if (index === -1) return prev;

      const next = [...prev];
      const target = next[index];
      const updated = {
        ...target,
        lastMessageContent: getMessagePreview(msg),
        lastMessageSenderId: msg.senderId,
        lastMessageTimestamp: msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now(),
        updatedAt: msg.createdAt || new Date().toISOString(),
      };

      next.splice(index, 1);
      next.unshift(updated);
      return next;
    });
  };

  useEffect(() => {
    if (!socket || !user) return;

    const handleReceiveMessage = (msg: any) => {
      if (!msg?.id) return;

      addMessage(msg);

      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId) {
        upsertConversationLastMessage(incomingConvId, msg);

        // Auto mark as read if we are in the active conversation
        if (incomingConvId === activeConvId) {
          markAsRead(incomingConvId);
        }
      }
    };

    const handleConversationRead = (data: { convId: string }) => {
      setLocalRead(data.convId);
    };

    const handleHistoryCleared = (data: { convId: string }) => {
      localClearHistory(data.convId);
    };

    const handlePresenceUpdate = (data: { email: string; status: 'online' | 'offline' }) => {
      setUserProfiles((prev: Record<string, any>) => {
        const existing = prev[data.email] || {};
        return {
          ...prev,
          [data.email]: {
            ...existing,
            email: data.email,
            status: data.status
          }
        };
      });
    };

    const handleMessageReaction = (data: { messageId: string, reactions: any }) => {
       updateMessage(data.messageId, { reactions: data.reactions });
    };
    
    const handleMessageRecalled = (data: { messageId: string }) => {
      updateMessage(data.messageId, { 
        recalled: true, 
        content: 'Tin nhắn đã được thu hồi', 
        media: [], 
        files: [], 
        reactions: {} 
      } as any);
    };

    const handleMessagePinned = (data: { messageId: string, pinned: boolean, pinnedBy: string }) => {
      updateMessage(data.messageId, { 
        pinned: data.pinned, 
        pinnedBy: data.pinnedBy 
      } as any);
    };

    const handlePinUpdate = (data: { conversationId: string, pinnedMessageIds: string[] }) => {
      console.log('[SOCKET] PIN_UPDATE received:', data);
      setConversations((prev) => prev.map(c => 
        c.id === data.conversationId ? { ...c, pinnedMessageIds: data.pinnedMessageIds } : c
      ));
    };

    const handleParticipantRead = (data: { convId: string, email: string, timestamp: number }) => {
      // If someone else read the conversation I am currently in,
      // I should update my sent messages to "read".
      if (data.email !== user.email && data.convId === activeConvId) {
        setMessages(
          useChatStore.getState().messages.map(m => 
            (m.senderId === user.email && (!m.status || m.status === 'sent' || m.status === 'delivered')) 
              ? { ...m, status: 'read' } 
              : m
          )
        );
      }
    };

    const handleTypingUpdate = (data: { convId: string, email: string, isTyping: boolean }) => {
      // Dispatch typing event to document so ChatPage can listen without deep store rerenders
      const event = new CustomEvent('chat_typing_update', { detail: data });
      document.dispatchEvent(event);
    };

    // ── Call Events ──────────────────────────────────────────────────────────
    const handleCallIncoming = (data: any) => {
      console.log('[Socket] call:incoming', data);
      useCallStore.getState().setIncomingCall(
        data.convId,
        data.callerProfile, // This goes into 'peer' parameter
        data.callType || 'audio',
        data.fromEmail,
      );
    };

    const handleCallHangup = async (data: any) => {
      const currentConvId = useCallStore.getState().conversationId;
      if (!data?.convId || data.convId === currentConvId) {
        console.log('[Socket] call:hangup — releasing hardware');
        await leaveCurrentSession();
        useCallStore.getState().resetCall();
      }
    };

    const handleCallPeerJoined = (data: any) => {
      const currentConvId = useCallStore.getState().conversationId;
      if (!data?.convId || data.convId === currentConvId) {
        console.log('[Socket] call:peer_joined');
        useCallStore.getState().setPeerJoined(true);
      }
    };

    const handleUpgradeRequest = (data: any) => {
      const currentConvId = useCallStore.getState().conversationId;
      if (!data?.convId || data.convId === currentConvId) {
        useCallStore.getState().setIncomingUpgradeRequest(true);
        useCallStore.getState().setUpgradeRequesterEmail(data.fromProfile?.email ?? null);
      }
    };

    const handleUpgradeAccepted = async (data: any) => {
      const currentConvId = useCallStore.getState().conversationId;
      if (!data?.convId || data.convId === currentConvId) {
        const { toggleCamera } = await import('./useChime');
        useCallStore.getState().setCallType('video');
        useCallStore.getState().setCameraOn(true);
        useCallStore.getState().setUpgradeRequestPending(false);
        await toggleCamera(true);
      }
    };

    const handleUpgradeDeclined = (data: any) => {
      const currentConvId = useCallStore.getState().conversationId;
      if (!data?.convId || data.convId === currentConvId) {
        useCallStore.getState().setUpgradeRequestPending(false);
      }
    };

    // Socket listeners — Chat
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('history_cleared', handleHistoryCleared);
    socket.on('conversation_marked_read', handleConversationRead);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('message_reaction', handleMessageReaction);
    socket.on('message_recalled', handleMessageRecalled);
    socket.on('message_pinned', handleMessagePinned);
    socket.on('PIN_UPDATE', handlePinUpdate);
    socket.on('participant_read', handleParticipantRead);
    socket.on('typing_update', handleTypingUpdate);
    // Socket listeners — Call
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:hangup', handleCallHangup);
    socket.on('call:peer_joined', handleCallPeerJoined);
    socket.on('call:upgrade_request', handleUpgradeRequest);
    socket.on('call:upgrade_accepted', handleUpgradeAccepted);
    socket.on('call:upgrade_declined', handleUpgradeDeclined);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('history_cleared', handleHistoryCleared);
      socket.off('conversation_marked_read', handleConversationRead);
      socket.off('presence_update', handlePresenceUpdate);
      socket.off('message_reaction', handleMessageReaction);
      socket.off('message_recalled', handleMessageRecalled);
      socket.off('message_pinned', handleMessagePinned);
      socket.off('PIN_UPDATE', handlePinUpdate);
      socket.off('participant_read', handleParticipantRead);
      socket.off('typing_update', handleTypingUpdate);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:hangup', handleCallHangup);
      socket.off('call:peer_joined', handleCallPeerJoined);
      socket.off('call:upgrade_request', handleUpgradeRequest);
      socket.off('call:upgrade_accepted', handleUpgradeAccepted);
      socket.off('call:upgrade_declined', handleUpgradeDeclined);
    };
  }, [socket, user, activeConvId, addMessage, markAsRead, setLocalRead, localClearHistory, setUserProfiles, updateMessage]);
};
