import { useEffect, useRef, useState } from 'react';
import {
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  ConsoleLogger,
  LogLevel,
} from 'amazon-chime-sdk-js';
import { useGroupCallStore } from '../store/groupCallStore';
import { useAuth } from '../context/AuthContext';

export const useGroupChime = () => {
  const { user, socket } = useAuth();
  const { 
    meetingData, 
    attendeeData, 
    activeCallId, 
    conversationId,
    addRemoteTile,
    removeRemoteTile,
    setConnected,
    isCameraOn,
    isMicOn,
    setMicOn,
    setCameraOn,
    updateParticipant,
    removeParticipant,
  } = useGroupCallStore();

  const [session, setSession] = useState<DefaultMeetingSession | null>(null);
  const sessionRef = useRef<DefaultMeetingSession | null>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  const setupSession = async () => {
    if (!meetingData || !attendeeData || sessionRef.current) return;

    const logger = new ConsoleLogger('GroupChime', LogLevel.INFO);
    const deviceController = new DefaultDeviceController(logger);
    const configuration = new MeetingSessionConfiguration(meetingData, attendeeData);

    // Correct order: configuration, logger, deviceController
    const newSession = new DefaultMeetingSession(configuration, logger, deviceController);
    
    sessionRef.current = newSession;
    setSession(newSession);

    // [SENIOR] Physical presence mapping handled by socket SSOT
    newSession.audioVideo.realtimeSubscribeToAttendeeIdPresence((attendeeId, present) => {
      if (present) {
        updateParticipant(attendeeId, { status: 'connected' });
      } else {
        removeParticipant(attendeeId);
      }
    });

    const observer = {
      audioVideoDidStart: () => {
        console.log('[GroupChime] ✅ AudioVideo Started successfully');
        setConnected();
        
        // [SENIOR] Start Heartbeat (15s)
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (socket && activeCallId) {
            socket.emit('group-call:heartbeat', {
              callId: activeCallId,
              attendeeId: attendeeData.AttendeeId
            });
          }
        }, 15000);

        // [SENIOR] Ensure we are in the socket room for this conversation
        if (socket) {
          console.log(`[GroupChime] 🏠 Joining socket room: ${conversationId}`);
          socket.emit('join_room', { convId: conversationId });
        }

        // Notify backend via socket
        if (socket && user?.email) {
          console.log('[GroupChime] 📣 Emitting peer_joined for local user');
          socket.emit('group-call:peer_joined', {
            convId: conversationId,
            callId: activeCallId,
            userEmail: user.email,
            attendeeId: attendeeData.AttendeeId.toLowerCase(),
            participant: {
              email: user.email,
              name: user.fullName || user.email,
              avatar: user.avatarUrl,
              joinedAt: new Date().toISOString(),
              lastSeenAt: Date.now()
            }
          });
        }

        // Initialize mic/camera state from store
        syncMediaState(newSession);
      },
      videoTileDidUpdate: (tileState: any) => {
        console.log('[GroupChime] 📺 Video Tile Update:', tileState);
        
        // [SENIOR] For local tile, boundAttendeeId might be null initially
        const attendeeId = tileState.localTile 
          ? attendeeData?.AttendeeId?.toLowerCase() 
          : tileState.boundAttendeeId?.toLowerCase();

        if (!attendeeId) return;

        addRemoteTile({
          tileId: tileState.tileId,
          attendeeId: attendeeId,
          active: tileState.active,
          isLocal: tileState.localTile
        });
      },
      videoTileDidRemove: (tileId: number) => {
        removeRemoteTile(tileId);
      },
      audioVideoDidStop: (sessionStatus: any) => {
        console.log('[GroupChime] AudioVideo Stopped', sessionStatus);
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      }
    };

    newSession.audioVideo.addObserver(observer);

    // Setup Devices
    try {
      const audioInputs = await newSession.audioVideo.listAudioInputDevices();
      if (audioInputs.length > 0) {
        await newSession.audioVideo.startAudioInput(audioInputs[0].deviceId);
      }

      const videoInputs = await newSession.audioVideo.listVideoInputDevices();
      if (videoInputs.length > 0) {
        await newSession.audioVideo.startVideoInput(videoInputs[0].deviceId);
      }

      // Bind Audio Output
      const audioEl = document.getElementById('group-chime-audio') as HTMLAudioElement;
      if (audioEl) {
        await newSession.audioVideo.bindAudioElement(audioEl);
      }

      // Start the session
      newSession.audioVideo.start();
    } catch (error) {
      console.error('[GroupChime] Setup failed', error);
    }
  };

  const syncMediaState = async (s: DefaultMeetingSession) => {
    if (isMicOn) {
      s.audioVideo.realtimeUnmuteLocalAudio();
    } else {
      s.audioVideo.realtimeMuteLocalAudio();
    }

    if (isCameraOn) {
      s.audioVideo.startLocalVideoTile();
    } else {
      s.audioVideo.stopLocalVideoTile();
    }
  };

  const leaveSession = async () => {
    if (sessionRef.current) {
      console.log('[WebChime] 🛑 Stopping session and releasing hardware');
      try {
        // Explicitly stop inputs to release camera/mic lights in browser
        await sessionRef.current.audioVideo.stopVideoInput();
        await sessionRef.current.audioVideo.stopAudioInput();
        sessionRef.current.audioVideo.stop();
      } catch (error) {
        console.error('[WebChime] Error leaving session:', error);
      }
      sessionRef.current = null;
      setSession(null);
    }
  };

  const toggleMic = (on: boolean) => {
    if (!sessionRef.current) return;
    if (on) {
      sessionRef.current.audioVideo.realtimeUnmuteLocalAudio();
    } else {
      sessionRef.current.audioVideo.realtimeMuteLocalAudio();
    }
    setMicOn(on);
  };

  const toggleCamera = async (on: boolean) => {
    if (!sessionRef.current) return;
    if (on) {
      const videoInputs = await sessionRef.current.audioVideo.listVideoInputDevices();
      if (videoInputs.length > 0) {
        await sessionRef.current.audioVideo.startVideoInput(videoInputs[0].deviceId);
      }
      sessionRef.current.audioVideo.startLocalVideoTile();
    } else {
      sessionRef.current.audioVideo.stopLocalVideoTile();
    }
    setCameraOn(on);
  };

  // Automatically setup session when data is available
  useEffect(() => {
    if (meetingData && attendeeData && !sessionRef.current) {
      setupSession();
    }
    return () => {
      // Don't leave session automatically on every re-render, 
      // but if the component unmounts and we are not in a persistent call state
    };
  }, [meetingData, attendeeData]);

  // Handle unmount
  useEffect(() => {
    return () => {
      // If we want the call to persist, we might NOT want to stop here
      // But typically hooks are cleaned up on unmount.
      // If the caller UI is what unmounts, the call should probably stop.
      // leaveSession();
    };
  }, []);

  return { 
    setupSession, 
    leaveSession, 
    toggleMic, 
    toggleCamera, 
    session 
  };
};
