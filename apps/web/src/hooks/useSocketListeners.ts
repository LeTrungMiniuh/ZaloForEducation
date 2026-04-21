/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { getMessagePreview } from '../utils/chatUtils';
import { leaveCurrentSession, toggleCamera as toggleCameraChime } from './useChime';

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
    setMessages
  } = useChatStore();

  // Helper to update conv list locally
  const upsertConversationLastMessage = useCallback((convId: string, msg: any) => {
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
  }, [setConversations]);

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
        const state = useChatStore.getState();
        const updatedMessages = state.messages.map((m): typeof m => {
          const shouldMarkRead =
            m.senderId === user.email && (!m.status || m.status === 'sent' || m.status === 'delivered');

          return shouldMarkRead ? { ...m, status: 'seen' } : m;
        });

        setMessages(
          updatedMessages,
          state.nextCursor
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
      const { callState, activeCallId } = useCallStore.getState();
      
      // [SENIOR] Busy check: Only reject if we are actively in a non-idle, non-ended call
      // If we are in 'ENDED' (UI hiding delay), we SHOULD allow a new call to take over.
      if (callState !== 'IDLE' && callState !== 'ENDED' && activeCallId && activeCallId !== data.callId) {
        console.warn('[Socket] Busy, auto-rejecting callId:', data.callId);
        socket.emit('call:reject', {
          convId: data.convId,
          callId: data.callId,
          fromEmail: user.email,
          toEmail: data.fromEmail,
          reason: 'BUSY'
        });
        return;
      }

      useCallStore.getState().setIncomingCall(
        data.convId,
        data.callId, // [SENIOR]
        data.callerProfile,
        data.callType || 'audio',
        data.fromEmail,
        data.engine
      );
    };

    const handleCallAccept = (data: any) => {
      const { activeCallId, acceptCall } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:accept — Peer accepted. Starting media.');
        acceptCall(data.meetingInfo || {});
      }
    };

    const handleCallDismiss = (data: any) => {
      const { activeCallId, resetCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        // [SENIOR] Protect active call from accidental dismiss signals
        if (callState === 'CONNECTED' || callState === 'JOINING') {
          console.log('[Socket] call:dismiss ignored — call is already active/joining');
          return;
        }
        console.log('[Socket] call:dismiss — handled on another device');
        resetCall();
      }
    };

    const handleCallHandledElsewhere = (data: any) => {
      const { activeCallId, resetCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        // [SENIOR] Protect active call from syncing state when this device IS the handler
        if (callState === 'CONNECTED' || callState === 'JOINING') {
          console.log('[Socket] call:handled_elsewhere ignored — call is already active/joining');
          return;
        }
        console.log('[Socket] call:handled_elsewhere — Syncing state across devices');
        resetCall();
      }
    };

    const handleCallHangup = async (data: any) => {
      const { activeCallId, hangupCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log('[Socket] call:hangup — cleaning up Chime');
        await leaveCurrentSession();
        hangupCall();
      }
    };


    const handleCallTimeout = (data: any) => {
      const { activeCallId, rejectCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        // [SENIOR] Protect active call from accidental timeout signals
        if (callState === 'CONNECTED' || callState === 'JOINING') {
          console.log('[Socket] call:timeout ignored — call is already active/joining');
          return;
        }
        console.log('[Socket] call:timeout — Closing call screen');
        rejectCall();
      }
    };

    const handleUpgradeRequest = (data: any) => {
      const { activeCallId, setIncomingUpgradeRequest, setUpgradeRequesterEmail, conversationId, toEmail } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_request — Peer requesting video');
        setIncomingUpgradeRequest(true);
        setUpgradeRequesterEmail(data.fromProfile?.email ?? null);

        // [SENIOR] 20s receiver-side timeout
        setTimeout(() => {
          const checkState = useCallStore.getState();
          if (checkState.incomingUpgradeRequest && checkState.activeCallId === data.callId) {
            console.log('[Socket] Upgrade request timed out on receiver side');
            setIncomingUpgradeRequest(false);
            if (socket && conversationId && toEmail) {
              socket.emit('call:upgrade_declined', { 
                convId: conversationId, 
                callId: data.callId,
                toEmail 
              });
            }
          }
        }, 20000);
      }
    };

    const handleUpgradeAccepted = async (data: any) => {
      const { activeCallId, setCallType, setCameraOn, setUpgradeRequestPending } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_accepted — Peer accepted. Switching to video.');
        setCallType('video');
        setCameraOn(true);
        setUpgradeRequestPending(false);
        // Trigger actual camera start via AWS Chime hook
        await toggleCameraChime(true);
      }
    };

    const handleUpgradeDeclined = (data: any) => {
      const { activeCallId, setUpgradeRequestPending } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_declined — Peer declined.');
        setUpgradeRequestPending(false);
        alert('Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.');
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
    socket.on('call:accept', handleCallAccept);
    socket.on('call:dismiss', handleCallDismiss);
    socket.on('call:handled_elsewhere', handleCallHandledElsewhere);
    socket.on('call:hangup', handleCallHangup);
    socket.on('call:timeout', handleCallTimeout);
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
      socket.off('call:accept', handleCallAccept);
      socket.off('call:dismiss', handleCallDismiss);
      socket.off('call:handled_elsewhere', handleCallHandledElsewhere);
      socket.off('call:hangup', handleCallHangup);
      socket.off('call:timeout', handleCallTimeout);
      socket.off('call:upgrade_request', handleUpgradeRequest);
      socket.off('call:upgrade_accepted', handleUpgradeAccepted);
      socket.off('call:upgrade_declined', handleUpgradeDeclined);
    };
  }, [socket, user, activeConvId, addMessage, markAsRead, setLocalRead, setConversations, localClearHistory, setUserProfiles, updateMessage, setMessages, upsertConversationLastMessage]);
};
