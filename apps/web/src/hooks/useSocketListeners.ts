import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatStore, type Message } from '../store/chatStore';
import { useCallStore } from '../store/callStore';
import { leaveCurrentSession, toggleCamera as toggleCameraChime } from './useChime';
import { getMessagePreview, isConversationMutedNow } from '../utils/chatUtils';

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



type CallEventData = {
  callId: string;
  convId: string;
  fromEmail?: string;
  callerProfile?: any;
  callType?: 'audio' | 'video';
  engine?: 'webrtc' | 'chime';
  meetingInfo?: any;
  fromProfile?: { email?: string };
  toEmail?: string;
  offer?: any;
};

export const useSocketListeners = () => {
  const { socket, user } = useAuth();
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());

  // Chat Store Selectors
  const addMessage = useChatStore((state) => state.addMessage);
  const markAsRead = useChatStore((state) => state.markAsRead);
  const setLocalRead = useChatStore((state) => state.setLocalRead);
  const localClearHistory = useChatStore((state) => state.localClearHistory);
  const setUserProfiles = useChatStore((state) => state.setUserProfiles);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setConversations = useChatStore((state) => state.setConversations);
  const setMessages = useChatStore((state) => state.setMessages);
  const activeConvId = useChatStore((state) => state.activeConvId);

  // Request notification permission on first user interaction.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;

    const requestPermission = () => {
      Notification.requestPermission().catch(() => undefined);
    };

    window.addEventListener('click', requestPermission, { once: true });
    return () => {
      window.removeEventListener('click', requestPermission);
    };
  }, []);

  const showIncomingMessageNotification = async (msg: any, convId: string) => {
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !user?.email
    )
      return;
    if (!msg?.id || notifiedMessageIdsRef.current.has(msg.id)) return;
    if (!msg.senderId || msg.senderId === user.email) return;
    if (isConversationMutedNow(convId)) return;

    const shouldNotify =
      document.visibilityState !== 'visible' || convId !== activeConvId;
    if (!shouldNotify) return;
    if (Notification.permission !== 'granted') return;

    notifiedMessageIdsRef.current.add(msg.id);

    const senderName = String(msg.senderName || msg.senderId || 'Người dùng');
    const preview = getMessagePreview(msg);
    const title = `Tin nhắn từ ${senderName}`;
    const options: any = {
      body: preview,
      icon: '/logo_blue.png',
      badge: '/logo_blue.png',
      tag: `conv-${convId}`,
      renotify: true,
    };

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch (err) {
      console.warn('[notify] Failed to show notification', err);
    }
  };

  useEffect(() => {
    if (!socket || !user) return;

    // ── Chat Events ──────────────────────────────────────────────────────────

    const handleReceiveMessage = (msg: SocketMessage) => {
      if (!msg?.id) return;

      const incomingConvId = (msg.conversationId || msg.convId || "").trim();
      if (!incomingConvId) return;

      // 1. Add to store (Updates message list if active AND updates inbox preview ALWAYS)
      addMessage(msg);

      // 2. Auto mark as read if it's the active conversation
      if (incomingConvId.toLowerCase() === (activeConvId || "").toLowerCase()) {
        markAsRead(incomingConvId).catch((error) => {
          console.error("Failed to mark conversation as read", error);
        });
      }

      // 3. Browser notification
      void showIncomingMessageNotification(msg, incomingConvId);
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

      const status = data?.status as PresenceStatus;
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

    const handleMessageReaction = (data: { messageId: string; reactions: any }) => {
      updateMessage(data.messageId, { reactions: data.reactions });
    };

    const handleMessageRecalled = (data: { messageId: string }) => {
      updateMessage(data.messageId, {
        recalled: true,
        content: 'Tin nhắn đã được thu hồi',
        media: [],
        files: [],
        reactions: {},
      } as any);
    };

    const handleMessagePinned = (data: { messageId: string; pinned: boolean; pinnedBy: string }) => {
      updateMessage(data.messageId, { 
        pinned: data.pinned, 
        pinnedBy: data.pinnedBy 
      } as any);
    };

    const handlePinUpdate = (data: { conversationId?: string; convId?: string; pinnedMessageIds: string[] }) => {
      const convId = data.conversationId || data.convId;
      if (!convId) return;
      console.log('[SOCKET] PIN_UPDATE received:', data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, pinnedMessageIds: data.pinnedMessageIds } : c
        )
      );
    };

    const handleGroupUpdate = (data: { convId: string; updates: any }) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === data.convId ? { ...c, ...data.updates } : c))
      );
    };

    const handleParticipantRead = (data: { convId: string; email: string; timestamp: number }) => {
      if (data.email !== user.email && data.convId === activeConvId) {
        const state = useChatStore.getState();
        const updatedMessages = state.messages.map((m): typeof m => {
          const shouldMarkRead =
            m.senderId === user.email &&
            (!m.status || m.status === 'sent' || m.status === 'delivered');

          return shouldMarkRead ? { ...m, status: 'seen' } : m;
        });

        setMessages(updatedMessages, state.nextCursor);
      }
    };

    // ── Call Events ──────────────────────────────────────────────────────────

    const handleCallIncoming = (data: CallEventData) => {
      console.log('[Socket] call:incoming', data);
      const { callState, activeCallId } = useCallStore.getState();

      if (
        callState !== 'IDLE' &&
        callState !== 'ENDED' &&
        activeCallId &&
        activeCallId !== data.callId
      ) {
        console.warn('[Socket] Busy, auto-rejecting callId:', data.callId);
        socket.emit('call:reject', {
          convId: data.convId,
          callId: data.callId,
          fromEmail: user?.email,
          toEmail: data.fromEmail,
          reason: 'BUSY',
        });
        return;
      }

      useCallStore.getState().setIncomingCall(
        data.convId,
        data.callId,
        data.callerProfile || data.fromProfile,
        data.callType || 'audio',
        data.fromEmail || '',
        data.engine,
        data.offer
      );
    };

    const handleCallAccept = (data: CallEventData) => {
      const { activeCallId, acceptCall } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:accept — Peer accepted. Starting media.');
        acceptCall(data.meetingInfo || {});
      }
    };

    const handleCallDismiss = (data: CallEventData) => {
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

    const handleCallHandledElsewhere = (data: CallEventData) => {
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
      const { activeCallId, hangupCall, conversationId: currentConvId } = useCallStore.getState();
      // Handle both callId based (Chime) and convId based (generic) hangup
      if ((data.callId && data.callId === activeCallId) || (data.convId && data.convId === currentConvId) || (!data.callId && !data.convId)) {
        console.log('[Socket] call:hangup — cleaning up');
        await leaveCurrentSession();
        hangupCall();
      }
    };

    const handleCallReject = async (data: CallEventData) => {
      const { activeCallId, rejectCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log('[Socket] call:reject — cleaning up');
        await leaveCurrentSession();
        rejectCall();
      }
    };

    const handleCallTimeout = (data: CallEventData) => {
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

    const handleCallPeerJoined = (data: any) => {
      const { activeCallId, conversationId: currentConvId, setPeerJoined } = useCallStore.getState();
      if ((data.callId && data.callId === activeCallId) || (data.convId && data.convId === currentConvId)) {
        console.log('[Socket] call:peer_joined');
        setPeerJoined(true);
      }
    };

    const handleUpgradeRequest = (data: CallEventData) => {
      const {
        activeCallId,
        setIncomingUpgradeRequest,
        setUpgradeRequesterEmail,
        conversationId,
        toEmail,
      } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_request — Peer requesting video');
        setIncomingUpgradeRequest(true);
        setUpgradeRequesterEmail(data.fromProfile?.email ?? data.fromEmail ?? null);

        // Auto-timeout for upgrade request
        setTimeout(() => {
          const checkState = useCallStore.getState();
          if (
            checkState.incomingUpgradeRequest &&
            checkState.activeCallId === data.callId
          ) {
            console.log('[Socket] Upgrade request timed out on receiver side');
            setIncomingUpgradeRequest(false);
            if (socket && conversationId && toEmail) {
              socket.emit('call:upgrade_declined', {
                convId: conversationId,
                callId: data.callId,
                toEmail,
              });
            }
          }
        }, 20000);
      }
    };

    const handleUpgradeAccepted = async (data: CallEventData) => {
      const { activeCallId, setCallType, setCameraOn, setUpgradeRequestPending } =
        useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_accepted — Peer accepted. Switching to video.');
        setCallType('video');
        setCameraOn(true);
        setUpgradeRequestPending(false);
        await toggleCameraChime(true);
      }
    };

    const handleUpgradeDeclined = (data: CallEventData) => {
      const { activeCallId, setUpgradeRequestPending } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_declined — Peer declined.');
        setUpgradeRequestPending(false);
        alert('Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.');
      }
    };

    // ── Bind Listeners ───────────────────────────────────────────────────────

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('conversation_marked_read', handleConversationRead);
    socket.on('history_cleared', handleHistoryCleared);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('typing_update', handleTypingUpdate);
    socket.on('message_reaction', handleMessageReaction);
    socket.on('message_recalled', handleMessageRecalled);
    socket.on('message_pinned', handleMessagePinned);
    socket.on('pin_update', handlePinUpdate);
    socket.on('PIN_UPDATE', handlePinUpdate);
    socket.on('group_update', handleGroupUpdate);
    socket.on('participant_read', handleParticipantRead);

    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:accept', handleCallAccept);
    socket.on('call:dismiss', handleCallDismiss);
    socket.on('call:handled_elsewhere', handleCallHandledElsewhere);
    socket.on('call:hangup', handleCallHangup);
    socket.on('call:reject', handleCallReject);
    socket.on('call:timeout', handleCallTimeout);
    socket.on('call:peer_joined', handleCallPeerJoined);
    socket.on('call:upgrade_request', handleUpgradeRequest);
    socket.on('call:upgrade_accepted', handleUpgradeAccepted);
    socket.on('call:upgrade_declined', handleUpgradeDeclined);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('conversation_marked_read', handleConversationRead);
      socket.off('history_cleared', handleHistoryCleared);
      socket.off('presence_update', handlePresenceUpdate);
      socket.off('typing_update', handleTypingUpdate);
      socket.off('message_reaction', handleMessageReaction);
      socket.off('message_recalled', handleMessageRecalled);
      socket.off('message_pinned', handleMessagePinned);
      socket.off('pin_update', handlePinUpdate);
      socket.off('PIN_UPDATE', handlePinUpdate);
      socket.off('group_update', handleGroupUpdate);
      socket.off('participant_read', handleParticipantRead);

      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:accept', handleCallAccept);
      socket.off('call:dismiss', handleCallDismiss);
      socket.off('call:handled_elsewhere', handleCallHandledElsewhere);
      socket.off('call:hangup', handleCallHangup);
      socket.off('call:reject', handleCallReject);
      socket.off('call:timeout', handleCallTimeout);
      socket.off('call:peer_joined', handleCallPeerJoined);
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
