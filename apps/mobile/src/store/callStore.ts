import { create } from 'zustand';

let callTimeout: any = null;
let resetTimeout: any = null;
const clearInternalTimeout = () => {
  if (callTimeout) {
    clearTimeout(callTimeout);
    callTimeout = null;
  }
  if (resetTimeout) {
    clearTimeout(resetTimeout);
    resetTimeout = null;
  }
};

interface CallStore {
  callState: 'IDLE' | 'RINGING' | 'CALLING' | 'CONNECTED' | 'ENDED' | 'JOINING';
  callType: 'audio' | 'video' | null;
  conversationId: string | null;
  activeCallId: string | null;
  caller: any | null;
  receiver: any | null;
  meetingData: any | null;
  attendeeData: any | null;
  isIncoming: boolean;
  startTime: number | null;
  remoteTiles: any[];
  isRemoteCameraOn: boolean;
  isCameraOn: boolean;
  isMicOn: boolean;
  isConnecting: boolean;
  toEmail: string | null;
  isMinimized: boolean;
  upgradeRequestPending: boolean;
  incomingUpgradeRequest: boolean;
  upgradeRequesterEmail: string | null;

  setMinimized: (isMinimized: boolean) => void;
  startOutgoingCall: (receiver: any, callType: 'audio' | 'video', convId: string, activeCallId: string) => void;
  receiveIncomingCall: (caller: any, callType: 'audio' | 'video', convId: string, activeCallId: string) => void;
  acceptCall: (meetingInfo?: any) => void;
  rejectCall: () => void;
  hangupCall: () => void;
  setMeetingInfo: (meeting: any, attendee: any) => void;
  setRemoteTiles: (remoteTiles: any[]) => void;
  setRemoteCameraOn: (isRemoteCameraOn: boolean) => void;
  setCallType: (callType: 'audio' | 'video') => void;
  setUpgradeRequestPending: (pending: boolean) => void;
  setIncomingUpgradeRequest: (incoming: boolean) => void;
  setUpgradeRequesterEmail: (email: string | null) => void;
  setCameraOn: (on: boolean) => void;
  setMicOn: (on: boolean) => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStore>((set, get) => ({
  callState: 'IDLE',
  callType: null,
  conversationId: null,
  activeCallId: null,
  caller: null,
  receiver: null,
  meetingData: null,
  attendeeData: null,
  isIncoming: false,
  startTime: null,
  remoteTiles: [],
  isRemoteCameraOn: false,
  isCameraOn: false,
  isMicOn: true,
  isConnecting: false,
  toEmail: null,
  isMinimized: false,
  
  setMinimized: (isMinimized) => set({ isMinimized }),

  // Upgrade states
  upgradeRequestPending: false,
  incomingUpgradeRequest: false,
  upgradeRequesterEmail: null,
  
  // Actions
  startOutgoingCall: (receiver, callType, convId, activeCallId) => {
    clearInternalTimeout();
    set({
      callState: 'CALLING',
      callType,
      conversationId: convId,
      activeCallId,
      receiver,
      toEmail: receiver.email,
      isIncoming: false,
      caller: null,
      startTime: null,
      meetingData: null,
      attendeeData: null,
      isCameraOn: callType === 'video',
      isMicOn: true,
    });

    // [SENIOR] Auto-timeout after 60s if not connected
    callTimeout = setTimeout(() => {
      console.log('[Store] Call timed out after 60s (Caller Side)');
      const SocketService = require('../utils/socket').default;
      if (SocketService.socket && activeCallId && receiver?.email) {
        SocketService.socket.emit('call:timeout', { 
          convId: convId, 
          callId: activeCallId, 
          toEmail: receiver.email 
        });
      }
      get().hangupCall();
    }, 60000);
  },

  receiveIncomingCall: (caller, callType, convId, activeCallId) => {
    clearInternalTimeout();
    set({
      callState: 'RINGING',
      callType,
      conversationId: convId,
      activeCallId,
      caller,
      toEmail: caller.email,
      isIncoming: true,
      receiver: null,
      startTime: null,
      meetingData: null,
      attendeeData: null,
      isCameraOn: callType === 'video',
      isMicOn: true,
    });

    // [SENIOR] Auto-timeout after 60s if not answered
    callTimeout = setTimeout(() => {
      console.log('[Store] Call timed out after 60s (Receiver Side)');
      get().rejectCall();
    }, 60000);
  },

  acceptCall: (meetingInfo = {}) => {
    clearInternalTimeout();
    const current = get();
    set({
      callState: 'CONNECTED',
      meetingData: meetingInfo.meeting || current.meetingData,
      attendeeData: meetingInfo.attendee || current.attendeeData,
      startTime: Date.now(),
    });
  },

  hangupCall: () => {
    clearInternalTimeout();
    set({
      callState: 'ENDED',
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
    });
    resetTimeout = setTimeout(() => {
      get().resetCall();
      resetTimeout = null;
    }, 1000);
  },

  rejectCall: () => {
    clearInternalTimeout();
    set({ 
      callState: 'ENDED',
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
    });
    resetTimeout = setTimeout(() => {
      get().resetCall();
      resetTimeout = null;
    }, 1000);
  },

  setMeetingInfo: (meeting, attendee) => {
    set({
      meetingData: meeting,
      attendeeData: attendee,
    });
  },

  setRemoteTiles: (remoteTiles) => set({ 
    remoteTiles,
    isRemoteCameraOn: remoteTiles.length > 0 
  }),

  setRemoteCameraOn: (isRemoteCameraOn) => set({ isRemoteCameraOn }),

  setCallType: (callType) => set({ callType }),
  setUpgradeRequestPending: (upgradeRequestPending) => set({ upgradeRequestPending }),
  setIncomingUpgradeRequest: (incomingUpgradeRequest) => set({ incomingUpgradeRequest }),
  setUpgradeRequesterEmail: (upgradeRequesterEmail) => set({ upgradeRequesterEmail }),
  setCameraOn: (isCameraOn) => set({ isCameraOn }),
  setMicOn: (isMicOn) => set({ isMicOn }),

  resetCall: () => {
    clearInternalTimeout();
    set({
      callState: 'IDLE',
      callType: null,
      conversationId: null,
      activeCallId: null,
      caller: null,
      receiver: null,
      meetingData: null,
      attendeeData: null,
      isIncoming: false,
      startTime: null,
      remoteTiles: [],
      isRemoteCameraOn: false,
      isCameraOn: false,
      isMicOn: true,
      upgradeRequestPending: false,
      incomingUpgradeRequest: false,
      upgradeRequesterEmail: null,
      isMinimized: false,
    });
  },
}));
