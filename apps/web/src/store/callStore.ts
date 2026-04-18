import { create } from 'zustand';

export type CallState = 'IDLE' | 'RINGING' | 'JOINING' | 'CONNECTED' | 'ENDED';

interface CallStore {
  callState: CallState;
  conversationId: string | null;
  meetingData: any | null;
  attendeeData: any | null;
  peerProfile: any | null; // Profile của đối phương (dù là người gọi hay người nhận)
  isIncoming: boolean;
  callType: 'audio' | 'video';
  peerJoined: boolean;
  toEmail: string | null; // email của người kia để emit socket events

  // Camera & upgrade state
  isCameraOn: boolean;
  isMicOn: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  upgradeRequestPending: boolean;
  incomingUpgradeRequest: boolean;
  upgradeRequesterEmail: string | null;

  // Actions
  setCallState: (state: CallState) => void;
  setConnecting: (isConnecting: boolean) => void;
  setConnectionError: (error: string | null) => void;
  setMeetingData: (meeting: any, attendee: any, type?: 'audio' | 'video') => void;
  initiateCall: (convId: string, type: 'audio' | 'video', toEmail: string, profile: any) => void;
  setIncomingCall: (convId: string, peer: any, type: 'audio' | 'video', fromEmail: string) => void;
  acceptCall: () => void;
  resetCall: () => void;
  setCallType: (type: 'audio' | 'video') => void;
  setPeerJoined: (joined: boolean) => void;
  setCameraOn: (on: boolean) => void;
  setMicOn: (on: boolean) => void;
  setUpgradeRequestPending: (pending: boolean) => void;
  setIncomingUpgradeRequest: (incoming: boolean) => void;
  setUpgradeRequesterEmail: (email: string | null) => void;
}

export const useCallStore = create<CallStore>((set, get) => ({
  callState: 'IDLE',
  conversationId: null,
  meetingData: null,
  attendeeData: null,
  peerProfile: null,
  isIncoming: false,
  callType: 'audio',
  peerJoined: false,
  toEmail: null,
  isCameraOn: true,
  isMicOn: true,
  isConnecting: false,
  connectionError: null,
  upgradeRequestPending: false,
  incomingUpgradeRequest: false,
  upgradeRequesterEmail: null,

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

  initiateCall: (conversationId, callType, toEmail, profile) => {
    set({
      conversationId,
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
    });
  },

  setIncomingCall: (conversationId, peerProfile, callType, fromEmail) => {
    set({
      conversationId,
      peerProfile,
      callType,
      callState: 'RINGING',
      isIncoming: true,
      toEmail: fromEmail,
      isCameraOn: callType === 'video',
      isMicOn: true,
      isConnecting: false,
      connectionError: null,
    });
  },

  acceptCall: () => set({ callState: 'JOINING', isConnecting: true, connectionError: null }),

  setPeerJoined: (peerJoined: boolean) => set({ peerJoined }),
  setCameraOn: (isCameraOn: boolean) => set({ isCameraOn }),
  setMicOn: (isMicOn: boolean) => set({ isMicOn }),
  setUpgradeRequestPending: (upgradeRequestPending: boolean) => set({ upgradeRequestPending }),
  setIncomingUpgradeRequest: (incomingUpgradeRequest: boolean) => set({ incomingUpgradeRequest }),
  setUpgradeRequesterEmail: (upgradeRequesterEmail: string | null) => set({ upgradeRequesterEmail }),

  resetCall: () => {
    set({
      callState: 'IDLE',
      conversationId: null,
      meetingData: null,
      attendeeData: null,
      peerProfile: null,
      isIncoming: false,
      callType: 'audio',
      peerJoined: false,
      toEmail: null,
      isCameraOn: true,
      isMicOn: true,
      isConnecting: false,
      connectionError: null,
      upgradeRequestPending: false,
      incomingUpgradeRequest: false,
      upgradeRequesterEmail: null,
    });
  },
}));
