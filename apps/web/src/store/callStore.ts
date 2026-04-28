import { create } from 'zustand';

export type CallState = 'IDLE' | 'RINGING' | 'CALLING' | 'JOINING' | 'CONNECTED' | 'ENDED';

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
  callState: CallState;
  conversationId: string | null;
  activeCallId: string | null;
  meetingData: any | null;
  attendeeData: any | null;
  peerProfile: any | null;
  isIncoming: boolean;
  callType: 'audio' | 'video';
  toEmail: string | null;
  startTime: number | null;

  // Media states
  isCameraOn: boolean;
  isRemoteCameraOn: boolean;
  isMicOn: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  remoteTiles: any[];
  
  // Upgrade states
  upgradeRequestPending: boolean;
  incomingUpgradeRequest: boolean;
  upgradeRequesterEmail: string | null;

  engine: 'webrtc' | 'chime' | null;
  callOffer: any | null;

  pendingMeetingData: any | null;    // ✅ THÊM
  pendingAttendeeData: any | null;   // ✅ THÊM

  // Actions
  setCallState: (state: CallState) => void;
  setConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setMeetingData: (meeting: any, attendee: any, type?: 'audio' | 'video') => void;
  initiateCall: (convId: string, activeCallId: string, type: 'audio' | 'video', toEmail: string, profile: any, engine?: 'webrtc' | 'chime') => void;
  setIncomingCall: (convId: string, activeCallId: string, peer: any, type: 'audio' | 'video', fromEmail: string, engine?: 'webrtc' | 'chime', offer?: any) => void;
  setCallOffer: (offer: any) => void;
  acceptCall: (meetingInfo?: any) => void;
  hangupCall: () => void;
  rejectCall: () => void;
  resetCall: () => void;
  setCallType: (type: 'audio' | 'video') => void;
  setCameraOn: (on: boolean) => void;
  setRemoteCameraOn: (on: boolean) => void;
  setMicOn: (on: boolean) => void;
  setConnected: () => void;
  setUpgradeRequestPending: (pending: boolean) => void;
  setIncomingUpgradeRequest: (incoming: boolean) => void;
  setUpgradeRequesterEmail: (email: string | null) => void;
  setRemoteTiles: (tiles: any[]) => void;
  setPendingMeetingData: (meeting: any, attendee: any, type?: 'audio' | 'video') => void; // ✅ THÊM
  isPeerJoined: boolean;
  setPeerJoined: (joined: boolean) => void;
  isMinimized: boolean;
  setMinimized: (minimized: boolean) => void;
}

export const useCallStore = create<CallStore>((set, get) => ({
  callState: 'IDLE',
  conversationId: null,
  activeCallId: null,
  meetingData: null,
  attendeeData: null,
  peerProfile: null,
  isIncoming: false,
  callType: 'audio',
  toEmail: null,
  startTime: null,
  isCameraOn: true,
  isRemoteCameraOn: false,
  isMicOn: true,
  isConnecting: false,
  connectionError: null,
  remoteTiles: [],
  upgradeRequestPending: false,
  incomingUpgradeRequest: false,
  upgradeRequesterEmail: null,
  engine: null,
  callOffer: null,
  isPeerJoined: false,
  isMinimized: false,
  pendingMeetingData: null,
  pendingAttendeeData: null,
  
  setMinimized: (isMinimized) => set({ isMinimized }),

  setCallState: (callState) => set({ callState }),
  setConnecting: (isConnecting) => set({ isConnecting }),
  setConnectionError: (connectionError) => set({ connectionError }),

  setMeetingData: (meetingData, attendeeData, type) => {
    const currentType = get().callType;
    set({
      meetingData,
      attendeeData,
      callType: type || currentType,
    });
  },

  setPendingMeetingData: (pendingMeetingData, pendingAttendeeData, type) => {
    const currentType = get().callType;
    set({ 
      pendingMeetingData, 
      pendingAttendeeData,
      callType: type || currentType 
    });
  },

  setCallType: (callType) => set({ callType }),

  initiateCall: (conversationId, activeCallId, callType, toEmail, profile, engine) => {
    clearInternalTimeout();
    set({
      conversationId,
      activeCallId,
      callType,
      callState: 'CALLING',
      isIncoming: false,
      toEmail,
      peerProfile: profile,
      isCameraOn: callType === 'video',
      isMicOn: true,
      isConnecting: true,
      connectionError: null,
      upgradeRequestPending: false,
      incomingUpgradeRequest: false,
      engine: engine || 'chime',
      callOffer: null,
      startTime: null,
    });

    // [SENIOR] Auto-timeout after 60s if not connected
    callTimeout = setTimeout(() => {
      console.log('[Store] Call timed out after 60s (Caller Side)');
      const socket = (window as any).socket;
      if (socket && toEmail && activeCallId) {
        socket.emit('call:timeout', { convId: conversationId, callId: activeCallId, toEmail });
      }
      get().hangupCall();
    }, 60000);
  },

  setIncomingCall: (conversationId, activeCallId, peerProfile, callType, fromEmail, engine, offer) => {
    clearInternalTimeout();
    set({
      conversationId,
      activeCallId,
      peerProfile,
      callType,
      callState: 'RINGING',
      isIncoming: true,
      toEmail: fromEmail,
      isCameraOn: callType === 'video',
      isMicOn: true,
      isConnecting: false,
      connectionError: null,
      engine: engine || 'chime',
      callOffer: offer || null,
      startTime: null,
    });

    // [SENIOR] Auto-timeout after 60s if not answered
    callTimeout = setTimeout(() => {
      console.log('[Store] Call timed out after 60s (Receiver Side)');
      get().rejectCall();
    }, 60000);
  },

  setCallOffer: (offer) => set({ callOffer: offer }),

  acceptCall: (meetingInfo) => {
    clearInternalTimeout();
    const current = get();
    
    // [CRITICAL FIX] Caller MUST use its own pending data.
    // If it uses meetingInfo.attendee sent by the Callee via socket, 
    // both will join with the SAME AttendeeId -> statusCode: 4!
    const meeting = current.pendingMeetingData 
      || meetingInfo?.Meeting || meetingInfo?.meeting 
      || current.meetingData;
    const attendee = current.pendingAttendeeData 
      || meetingInfo?.Attendee || meetingInfo?.attendee 
      || current.attendeeData;

    set({ 
      callState: 'JOINING',
      isConnecting: true,
      connectionError: null,
      meetingData: meeting,      // ✅ Kích hoạt useEffect trong useChime
      attendeeData: attendee,
      pendingMeetingData: null,  // ✅ Dọn dẹp
      pendingAttendeeData: null,
      startTime: null,
    });
  },

  setConnected: () => {
    const state = get();
    set({
      callState: 'CONNECTED',
      isConnecting: false,
      startTime: Date.now(),
    });
    
    // Clear backend ghost hangup timer
    const socket = (window as any).socket;
    if (socket && state.conversationId && state.toEmail && state.activeCallId) {
      socket.emit('call:peer_joined', {
        convId: state.conversationId,
        toEmail: state.toEmail,
        callId: state.activeCallId
      });
    }
  },

  hangupCall: () => {
    clearInternalTimeout();
    // [SYSTEM] Nullify session IDs immediately to free up backend/signaling
    set({ 
      callState: 'ENDED', 
      activeCallId: null, 
      meetingData: null, 
      attendeeData: null,
      isConnecting: false
    });

    // [UI] Keep the ENDED screen for 1 second before total reset
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
      isConnecting: false
    });
    resetTimeout = setTimeout(() => {
      get().resetCall();
      resetTimeout = null;
    }, 1000);
  },

  setCameraOn: (isCameraOn: boolean) => set({ isCameraOn }),
  setRemoteCameraOn: (isRemoteCameraOn: boolean) => set({ isRemoteCameraOn }),
  setMicOn: (isMicOn: boolean) => set({ isMicOn }),
  setUpgradeRequestPending: (upgradeRequestPending: boolean) => set({ upgradeRequestPending }),
  setIncomingUpgradeRequest: (incomingUpgradeRequest: boolean) => set({ incomingUpgradeRequest }),
  setUpgradeRequesterEmail: (upgradeRequesterEmail: string | null) => set({ upgradeRequesterEmail }),
  setRemoteTiles: (remoteTiles: any[]) => set({ remoteTiles }),
  setPeerJoined: (isPeerJoined: boolean) => set({ isPeerJoined }),

  resetCall: () => {
    clearInternalTimeout();
    set({
      callState: 'IDLE',
      conversationId: null,
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
      peerProfile: null,
      isIncoming: false,
      callType: 'audio',
      startTime: null,
      isCameraOn: true,
      isRemoteCameraOn: false,
      isMicOn: true,
      isConnecting: false,
      connectionError: null,
      upgradeRequestPending: false,
      incomingUpgradeRequest: false,
      upgradeRequesterEmail: null,
      engine: null,
      callOffer: null,
      isPeerJoined: false,
      remoteTiles: [],
      isMinimized: false,
    });
  },
}));
