import { create } from 'zustand';

let callTimeout = null;
const clearInternalTimeout = () => {
  if (callTimeout) {
    clearTimeout(callTimeout);
    callTimeout = null;
  }
};

export const useCallStore = create((set, get) => ({
  callState: 'IDLE', // 'IDLE' | 'RINGING' | 'CALLING' | 'CONNECTED' | 'ENDED'
  callType: null,    // 'audio' | 'video'
  conversationId: null,
  activeCallId: null, // [SENIOR] Unique UUID for the call session
  caller: null,      // profile of the person calling (if isIncoming)
  receiver: null,    // profile of the person being called (if !isIncoming)
  meetingData: null,   // AWS Chime meeting object
  attendeeData: null,  // AWS Chime attendee object
  isIncoming: false,
  startTime: null,   // timestamp for duration calculation
  remoteTiles: [],   // [SENIOR] Track remote video tiles globally
  isRemoteCameraOn: false, // [SENIOR] Explicit flag for remote camera state
  isCameraOn: false,   // [SENIOR] Global state for local camera
  isMicOn: true,       // [SENIOR] Global state for local mic
  isConnecting: false,
  toEmail: null,       // [SENIOR] Target peer email for signaling
  isMinimized: false,  // [SENIOR] Track PiP state
  
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
      // Need Socket access. AuthContext usually handles it but we can use SocketService directly
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
      // Keep existing meeting data for caller if socket payload doesn't include it.
      meetingData: meetingInfo.meeting || current.meetingData,
      attendeeData: meetingInfo.attendee || current.attendeeData,
      startTime: Date.now(),
    });
  },

  rejectCall: () => {
    clearInternalTimeout();
    // [SYSTEM] Nullify session IDs immediately to free up backend/signaling
    set({ 
      callState: 'ENDED',
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
    });
    // [UI] Keep the ENDED screen for 1 second before total reset
    setTimeout(() => {
      get().resetCall();
    }, 1000);
  },

  hangupCall: () => {
    clearInternalTimeout();
    // [SYSTEM] Immediate cleanup
    set({
      callState: 'ENDED',
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
    });
    setTimeout(() => {
      get().resetCall();
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
      isMinimized: false, // [SENIOR] Auto-restore full screen on reset
    });
  },
}));
