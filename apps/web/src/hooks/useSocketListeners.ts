import type { Message } from '@zalo-edu/shared';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { leaveCurrentSession, toggleCamera as toggleCameraChime } from './useChime';

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

type MuteSetting = true | 'until-open' | number;

export const useSocketListeners = () => {
  const { socket, user } = useAuth();
  
  const addMessage = useChatStore((state) => state.addMessage);
  const markAsRead = useChatStore((state) => state.markAsRead);
  const setLocalRead = useChatStore((state) => state.setLocalRead);
  const localClearHistory = useChatStore((state) => state.localClearHistory);
  const setUserProfiles = useChatStore((state) => state.setUserProfiles);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setConversations = useChatStore((state) => state.setConversations);
  const setMessages = useChatStore((state) => state.setMessages);
  const activeConvId = useChatStore((state) => state.activeConvId);

  useEffect(() => {
    if (!socket || !user) return;

    const handleReceiveMessage = (msg: SocketMessage) => {
      if (!msg?.id) return;

      addMessage(msg);

      const incomingConvId = (msg.conversationId || msg.convId || '').trim();
      if (!incomingConvId) return;

      const currentActiveId = useChatStore.getState().activeConvId;
      if (currentActiveId && incomingConvId.toLowerCase() === currentActiveId.toLowerCase()) {
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

    // ── Call Events ──────────────────────────────────────────────────────────
    const handleCallIncoming = (data: any) => {
      console.log('[Socket] call:incoming', data);
      const { callState, activeCallId } = useCallStore.getState();
      
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
        data.callId,
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

    const handleCallReject = async (data: any) => {
      const { activeCallId, rejectCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log('[Socket] call:reject — cleaning up Chime');
        await leaveCurrentSession();
        rejectCall();
      }
    };

    const handleCallTimeout = (data: any) => {
      const { activeCallId, rejectCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
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

    const handleGroupUpdate = (data: { convId: string, updates: any }) => {
      setConversations((prev) => prev.map(c => 
        c.id === data.convId ? { ...c, ...data.updates } : c
      ));
    };

    const handleMuteUpdate = (data: { convId: string, mutedUntil: MuteSetting }) => {
      // Syncing mute state if needed
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('conversation_marked_read', handleConversationRead);
    socket.on('history_cleared', handleHistoryCleared);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('typing_update', handleTypingUpdate);
    socket.on('group_update', handleGroupUpdate);
    socket.on('message_pinned', handleMessagePinned);
    socket.on('pin_update', handlePinUpdate);
    socket.on('participant_read', handleParticipantRead);
    socket.on('mute_update', handleMuteUpdate);

    // Socket listeners — Call
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:accept', handleCallAccept);
    socket.on('call:dismiss', handleCallDismiss);
    socket.on('call:handled_elsewhere', handleCallHandledElsewhere);
    socket.on('call:hangup', handleCallHangup);
    socket.on('call:reject', handleCallReject);
    socket.on('call:timeout', handleCallTimeout);
    socket.on('call:upgrade_request', handleUpgradeRequest);
    socket.on('call:upgrade_accepted', handleUpgradeAccepted);
    socket.on('call:upgrade_declined', handleUpgradeDeclined);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('conversation_marked_read', handleConversationRead);
      socket.off('history_cleared', handleHistoryCleared);
      socket.off('presence_update', handlePresenceUpdate);
      socket.off('typing_update', handleTypingUpdate);
      socket.off('group_update', handleGroupUpdate);
      socket.off('message_pinned', handleMessagePinned);
      socket.off('pin_update', handlePinUpdate);
      socket.off('participant_read', handleParticipantRead);
      socket.off('mute_update', handleMuteUpdate);
      
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:accept', handleCallAccept);
      socket.off('call:dismiss', handleCallDismiss);
      socket.off('call:handled_elsewhere', handleCallHandledElsewhere);
      socket.off('call:hangup', handleCallHangup);
      socket.off('call:reject', handleCallReject);
      socket.off('call:timeout', handleCallTimeout);
      socket.off('call:upgrade_request', handleUpgradeRequest);
      socket.off('call:upgrade_accepted', handleUpgradeAccepted);
      socket.off('call:upgrade_declined', handleUpgradeDeclined);
    };
  }, [
    socket,
    user,
    activeConvId,
    addMessage,
    markAsRead,
    setLocalRead,
    localClearHistory,
    setUserProfiles,
    updateMessage,
    setConversations,
    setMessages,
  ]);
};

