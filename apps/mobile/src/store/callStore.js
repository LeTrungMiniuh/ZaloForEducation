import { create } from 'zustand';

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

  // Actions
  startOutgoingCall: (receiver, callType, convId, activeCallId) => {
    set({
      callState: 'CALLING',
      callType,
      conversationId: convId,
      activeCallId,
      receiver,
      isIncoming: false,
      caller: null,
      startTime: null,
      meetingData: null,
      attendeeData: null,
    });
  },

  receiveIncomingCall: (caller, callType, convId, activeCallId) => {
    set({
      callState: 'RINGING',
      callType,
      conversationId: convId,
      activeCallId,
      caller,
      isIncoming: true,
      receiver: null,
      startTime: null,
      meetingData: null,
      attendeeData: null,
    });
  },

  acceptCall: (meetingInfo = {}) => {
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
    set({
      callState: 'ENDED',
    });
    // Trì hoãn reset về IDLE để UI kịp thông báo
    setTimeout(() => {
      get().resetCall();
    }, 2000);
  },

  hangupCall: () => {
    set({
      callState: 'ENDED',
    });
    setTimeout(() => {
      get().resetCall();
    }, 1500);
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

  resetCall: () => {
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
    });
  },
}));
