import { create } from "zustand";

export type GroupCallState =
  | "IDLE"
  | "RINGING"
  | "CALLING"
  | "JOINING"
  | "CONNECTED"
  | "ENDED";
 
export type ScreenShareState = {
  stream: MediaStream | null;
  isSharing: boolean;
};

interface GroupCallStore {
  callState: GroupCallState;
  conversationId: string | null;
  activeCallId: string | null;
  meetingData: any | null;
  attendeeData: any | null;
  participants: Record<string, any>; // { [attendeeId]: { email, name, avatar, status, joinedAt } }
  ringingEmails: string[]; // For "Ringing..." status UI
  peerProfile: any | null; // For incoming call UI
  groupName: string | null;
  groupAvatar: string | null;
  
  // Media states
  isCameraOn: boolean;
  isMicOn: boolean;
  remoteTiles: any[]; // { tileId, attendeeId, active }
  activeCallForConv: any | null; // { callId, participants, participantCount }
  callType: 'audio' | 'video' | null;
  isMinimized: boolean;
 
  // Screen Share states (SSOT)
  screenShares: Record<string, ScreenShareState>;
  isLocalScreenSharing: boolean;
  localScreenShareStream: MediaStream | null;

  // Actions
  checkActiveCall: (convId: string) => Promise<void>;
  setActiveCallForConv: (data: any | null) => void;
  initiateGroupCall: (convId: string, callId: string, type: 'audio' | 'video', recipients: string[], profile: any) => Promise<void>;
  setIncomingGroupCall: (convId: string, callId: string, type: 'audio' | 'video', callerProfile: any, groupName?: string, groupAvatar?: string) => void;
  setMeetingData: (meeting: any, attendee: any) => void;
  setConnected: () => void;
  setParticipants: (participants: Record<string, any>) => void;
  updateParticipant: (attendeeId: string, data: any) => void;
  removeParticipant: (attendeeId: string) => void;
  addRemoteTile: (tile: any) => void;
  removeRemoteTile: (tileId: number) => void;
  resetGroupCall: () => void;
  setCameraOn: (on: boolean) => void;
  setMicOn: (on: boolean) => void;
  joinMeeting: (convId: string, callId: string, type: string, userProfile?: any) => Promise<void>;
  toggleMinimized: (minimized?: boolean) => void;
 
  // Screen Share Actions
  setScreenShare: (attendeeId: string, state: ScreenShareState) => void;
  removeScreenShare: (attendeeId: string) => void;
  setLocalScreenSharing: (isSharing: boolean, stream: MediaStream | null) => void;
  clearAllScreenShares: () => void;
}

export const useGroupCallStore = create<GroupCallStore>((set, get) => ({
  callState: "IDLE",
  conversationId: null,
  activeCallId: null,
  meetingData: null,
  attendeeData: null,
  participants: {},
  ringingEmails: [],
  isCameraOn: false,
  isMicOn: true,
  remoteTiles: [],
  peerProfile: null,
  groupName: null,
  groupAvatar: null,
  activeCallForConv: null,
  callType: null,
  isMinimized: false,
 
  screenShares: {},
  isLocalScreenSharing: false,
  localScreenShareStream: null,

  setActiveCallForConv: (data) => set({ activeCallForConv: data }),

  checkActiveCall: async (convId) => {
    try {
      const { default: api } = await import("../services/api");
      const res = await api.get(`/group-call/active/${convId}`);
      set({ activeCallForConv: res.data });
    } catch (error) {
      console.error("[GroupCallStore] Check active call failed:", error);
    }
  },

  initiateGroupCall: async (convId, callId, type, recipients, profile) => {
    const { setMeetingData } = get();
    set({
      conversationId: convId,
      activeCallId: callId,
      callState: "CALLING",
      isCameraOn: type === "video",
      ringingEmails: recipients,
    });

    try {
      const { default: api } = await import("../services/api");
      const res = await api.post("/group-call/create", {
        conversationId: convId,
        callId: callId,
        type: type,
        initiatorProfile: profile
      });
      setMeetingData(res.data.meeting, res.data.attendee);
      
      if (res.data.participants) {
        get().setParticipants(res.data.participants);
      }
    } catch (error) {
      console.error("[GroupCallStore] Initiation failed:", error);
      set({ callState: "IDLE" });
      throw error;
    }
  },

  setIncomingGroupCall: (convId, callId, type, callerProfile, groupName, groupAvatar) => {
    set({
      conversationId: convId,
      activeCallId: callId,
      callState: "RINGING",
      isCameraOn: type === "video",
      peerProfile: callerProfile,
      groupName: groupName || null,
      groupAvatar: groupAvatar || null
    });
  },

  setMeetingData: (meeting, attendee) => {
    set({ meetingData: meeting, attendeeData: attendee });
  },

  setConnected: () => {
    set({ callState: "CONNECTED" });
  },

  setParticipants: (participants) => {
    const normalized: Record<string, any> = {};
    if (participants) {
      Object.entries(participants).forEach(([id, p]) => {
        normalized[id.toLowerCase()] = p;
      });
    }
    set({ participants: normalized });
  },

  updateParticipant: (attendeeId, data) => {
    const id = attendeeId.toLowerCase();
    set(state => {
      const participant = state.participants[id] || {};
      const updated = { ...participant, ...data };
      
      // [SENIOR] If we now have an email, remove it from ringing list
      let newRinging = state.ringingEmails;
      if (updated.email) {
        const emailLower = updated.email.toLowerCase();
        newRinging = state.ringingEmails.filter(e => e.toLowerCase() !== emailLower);
      }

      return {
        participants: {
          ...state.participants,
          [id]: updated
        },
        ringingEmails: newRinging
      };
    });
  },

  removeParticipant: (attendeeId) => {
    const id = attendeeId.toLowerCase();
    set(state => {
      const participant = state.participants[id];
      let newRinging = state.ringingEmails;
      
      // [SENIOR] If they leave, they shouldn't be in ringing list either
      if (participant?.email) {
        const emailLower = participant.email.toLowerCase();
        newRinging = state.ringingEmails.filter(e => e.toLowerCase() !== emailLower);
      }

      const newParticipants = { ...state.participants };
      delete newParticipants[id];
      
      // [SENIOR] Also cleanup any remoteTiles for this attendee
      const newTiles = state.remoteTiles.filter(t => (t.attendeeId || "").toLowerCase() !== id);

      return { 
        participants: newParticipants,
        ringingEmails: newRinging,
        remoteTiles: newTiles
      };
    });
  },

  addRemoteTile: (tile) => {
    set(state => ({
      remoteTiles: [...state.remoteTiles.filter(t => t.tileId !== tile.tileId), tile]
    }));
  },

  removeRemoteTile: (tileId) => {
    set(state => ({
      remoteTiles: state.remoteTiles.filter(t => t.tileId !== tileId)
    }));
  },

  setCameraOn: (on) => set({ isCameraOn: on }),
  setMicOn: (on) => set({ isMicOn: on }),

  joinMeeting: async (convId, callId, type: 'audio' | 'video', userProfile?) => {
    const { setMeetingData } = get();
    set({ 
      callState: "JOINING", 
      conversationId: convId, 
      activeCallId: callId,
      callType: type,
      isCameraOn: type === 'video'
    });
    try {
      const { default: api } = await import("../services/api");
      const res = await api.post("/group-call/join", {
        conversationId: convId,
        callId: callId,
        userProfile
      });
      setMeetingData(res.data.meeting, res.data.attendee);

      if (res.data.participants) {
        get().setParticipants(res.data.participants);
      }
    } catch (error) {
      console.error("[GroupCallStore] Join failed:", error);
      set({ callState: "IDLE" });
      throw error;
    }
  },

  resetGroupCall: () => {
    set({
      callState: "IDLE",
      conversationId: null,
      activeCallId: null,
      meetingData: null,
      attendeeData: null,
      participants: {},
      ringingEmails: [],
      remoteTiles: [],
      peerProfile: null,
      groupName: null,
      groupAvatar: null,
      activeCallForConv: null,
      isMinimized: false,
      screenShares: {},
      isLocalScreenSharing: false,
      localScreenShareStream: null,
    });
  },

  setScreenShare: (attendeeId, state) => {
    set((s) => ({
      screenShares: {
        ...s.screenShares,
        [attendeeId]: state,
      },
    }));
  },

  removeScreenShare: (attendeeId) => {
    set((s) => {
      const next = { ...s.screenShares };
      delete next[attendeeId];
      return { screenShares: next };
    });
  },

  setLocalScreenSharing: (isLocalScreenSharing, localScreenShareStream) => {
    set({ isLocalScreenSharing, localScreenShareStream });
  },

  clearAllScreenShares: () => {
    set({ screenShares: {}, isLocalScreenSharing: false, localScreenShareStream: null });
  },

  toggleMinimized: (minimized) => {
    set(state => ({ isMinimized: minimized !== undefined ? minimized : !state.isMinimized }));
  },
}));
