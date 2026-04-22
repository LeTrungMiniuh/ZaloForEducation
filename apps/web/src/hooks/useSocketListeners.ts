import type { Message } from '@zalo-edu/shared';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChatStore } from '../store/chatStore';
import { leaveCurrentSession, toggleCamera as toggleCameraChime } from './useChime';
import { useCallStore } from '../store/callStore';

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
  callerProfile?: unknown;
  callType?: 'audio' | 'video';
  engine?: 'webrtc' | 'chime';
  meetingInfo?: unknown;
  fromProfile?: { email?: string };
  toEmail?: string;
};

export const useSocketListeners = () => {
  const { socket, user } = useAuth();
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

    // ── Call Events ──────────────────────────────────────────────────────────
    const handleCallIncoming = (data: CallEventData) => {
      console.log('[Socket] call:incoming', data);
      const { callState, activeCallId } = useCallStore.getState();
      
      // [SENIOR] Busy check: Only reject if we are actively in a non-idle, non-ended call
      // If we are in 'ENDED' (UI hiding delay), we SHOULD allow a new call to take over.
      if (callState !== 'IDLE' && callState !== 'ENDED' && activeCallId && activeCallId !== data.callId) {
        console.warn('[Socket] Busy, auto-rejecting callId:', data.callId);
        socket.emit('call:reject', {
          convId: data.convId,
          callId: data.callId,
          fromEmail: user?.email,
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
        // [SENIOR] Protect active call from accidental dismiss signals
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
        // [SENIOR] Protect active call from syncing state when this device IS the handler
        if (callState === 'CONNECTED' || callState === 'JOINING') {
          console.log('[Socket] call:handled_elsewhere ignored — call is already active/joining');
          return;
        }
        console.log('[Socket] call:handled_elsewhere — Syncing state across devices');
        resetCall();
      }
    };

    const handleCallHangup = async (data: CallEventData) => {
      const { activeCallId, hangupCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log('[Socket] call:hangup — cleaning up Chime');
        await leaveCurrentSession();
        hangupCall();
      }
    };

    const handleCallReject = async (data: CallEventData) => {
      const { activeCallId, rejectCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log('[Socket] call:reject — cleaning up Chime');
        await leaveCurrentSession();
        rejectCall();
      }
    };


    const handleCallTimeout = (data: CallEventData) => {
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

    const handleUpgradeRequest = (data: CallEventData) => {
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

    const handleUpgradeAccepted = async (data: CallEventData) => {
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

    const handleUpgradeDeclined = (data: CallEventData) => {
      const { activeCallId, setUpgradeRequestPending } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log('[Socket] call:upgrade_declined — Peer declined.');
        setUpgradeRequestPending(false);
        alert('Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.');
      }
    };

    // Socket listeners — Chat
    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('conversation_marked_read', handleConversationRead);
    socket.on('history_cleared', handleHistoryCleared);
    socket.on('presence_update', handlePresenceUpdate);
    socket.on('typing_update', handleTypingUpdate);
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
    addMessage,
    markAsRead,
    setLocalRead,
    localClearHistory,
    setUserProfiles,
    user,
  ]);
};
