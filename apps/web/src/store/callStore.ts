import { create } from 'zustand';

export type CallState = 'IDLE' | 'RINGING' | 'JOINING' | 'CONNECTED' | 'ENDED';

interface CallStore {
  callState: CallState;
  conversationId: string | null;
  activeCallId: string | null;
  meetingData: any | null;
  attendeeData: any | null;
  peerProfile: any | null;
  isIncoming: boolean;
  callType: 'audio' | 'video';
  peerJoined: boolean;
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
  setPeerJoined: (joined: boolean) => void;
  setCameraOn: (on: boolean) => void;
  setRemoteCameraOn: (on: boolean) => void;
  setMicOn: (on: boolean) => void;
  setUpgradeRequestPending: (pending: boolean) => void;
  setIncomingUpgradeRequest: (incoming: boolean) => void;
  setUpgradeRequesterEmail: (email: string | null) => void;
  setRemoteTiles: (tiles: any[]) => void;
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
  peerJoined: false,
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

  setCallType: (callType) => set({ callType }),

  initiateCall: (conversationId, activeCallId, callType, toEmail, profile, engine) => {
    set({
      conversationId,
      activeCallId,
      callType,
      callState: 'JOINING',
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
  },

  setIncomingCall: (conversationId, activeCallId, peerProfile, callType, fromEmail, engine, offer) => {
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
  },

  setCallOffer: (offer) => set({ callOffer: offer }),

  acceptCall: (meetingInfo = {}) => {
    const current = get();
    set({ 
      callState: 'CONNECTED', 
      isConnecting: false, 
      connectionError: null,
      meetingData: current.meetingData || meetingInfo.meeting,
      attendeeData: current.attendeeData || meetingInfo.attendee,
      startTime: Date.now(),
    });
  },

  hangupCall: () => {
    set({ callState: 'ENDED' });
    // [STANDARD] 4000ms delay to show summary screen
    setTimeout(() => {
      get().resetCall();
    }, 4000);
  },

  rejectCall: () => {
    set({ callState: 'ENDED' });
    // [STANDARD] 4000ms delay as requested in walkthrough
    setTimeout(() => {
      get().resetCall();
    }, 4000);
  },

  setPeerJoined: (peerJoined: boolean) => set({ peerJoined }),
  setCameraOn: (isCameraOn: boolean) => set({ isCameraOn }),
  setRemoteCameraOn: (isRemoteCameraOn: boolean) => set({ isRemoteCameraOn }),
  setMicOn: (isMicOn: boolean) => set({ isMicOn }),
  setUpgradeRequestPending: (upgradeRequestPending: boolean) => set({ upgradeRequestPending }),
  setIncomingUpgradeRequest: (incomingUpgradeRequest: boolean) => set({ incomingUpgradeRequest }),
  setUpgradeRequesterEmail: (upgradeRequesterEmail: string | null) => set({ upgradeRequesterEmail }),
  setRemoteTiles: (remoteTiles: any[]) => set({ remoteTiles }),

  resetCall: () => {
    set({
      callState: 'IDLE',
      conversationId: null,
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
      peerProfile: null,
      isIncoming: false,
      callType: 'audio',
      peerJoined: false,
      toEmail: null,
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
      remoteTiles: [],
    });
  },
}));
