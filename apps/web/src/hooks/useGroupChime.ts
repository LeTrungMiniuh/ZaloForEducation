import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  ConsoleLogger,
  LogLevel,
} from 'amazon-chime-sdk-js';
import { useGroupCallStore } from '../store/groupCallStore';
import { useAuth } from '../context/AuthContext';

/**
 * [Web-Chime] Normalize Chime attendee IDs (strips modality suffix like #1, #content)
 */
const normalizeAttendeeId = (id?: string | null): string | null => {
  if (!id) return null;
  return id.split('#')[0];
};

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

  // [SENIOR] Physical video element singletons for group
  const groupLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const groupRemoteVideoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const groupContentVideoRef = useRef<HTMLVideoElement | null>(null);
  const contentTileIdRef = useRef<number | null>(null);

  // [FIX #4] Dùng ref để tránh stale closure trong onended handler
  const stopScreenShareRef = useRef<() => Promise<void>>(async () => { });

  // ─────────────────────────────────────────────
  // [FIX #2] Helper cleanup stream độc lập với session
  // Đảm bảo stream luôn được stop dù session null hay không
  // ─────────────────────────────────────────────
  const cleanupScreenShareStream = () => {
    const store = useGroupCallStore.getState();

    if (store.localScreenShareStream) {
      store.localScreenShareStream.getTracks().forEach(t => t.stop());
    }
    store.setLocalScreenSharing(false, null);

    if (attendeeData?.AttendeeId) {
      const myId = normalizeAttendeeId(attendeeData.AttendeeId)?.toLowerCase();
      if (myId) {
        store.setScreenShare(myId, { stream: null, isSharing: false });
      }
    }
  };

  // ─────────────────────────────────────────────
  // [FIX #1] Event-driven content share start, không dùng setTimeout magic number
  // Dùng double requestAnimationFrame để nhường SDK flush 1 tick
  // ─────────────────────────────────────────────
  const startContentShareWhenReady = (stream: MediaStream) => {
    const s = sessionRef.current;
    if (!s) return;

    const tryStart = () => {
      s.audioVideo.startContentShare(stream).catch((e: Error) => {
        console.error('[GroupChime] startContentShare failed:', e);
        cleanupScreenShareStream();
      });
    };

    requestAnimationFrame(() => requestAnimationFrame(tryStart));
  };

  // ─────────────────────────────────────────────
  // [FIX #6] Retry binding content tile với exponential backoff
  // Xử lý trường hợp React ref chưa mount tại thời điểm tile update
  // ─────────────────────────────────────────────
  const tryBindContentTile = (tileId: number, attempt = 0) => {
    if (groupContentVideoRef.current && sessionRef.current) {
      sessionRef.current.audioVideo.bindVideoElement(tileId, groupContentVideoRef.current);
      console.log(`[GroupChime] ✅ Content tile=${tileId} bound on attempt ${attempt}`);
    } else if (attempt < 5) {
      setTimeout(() => tryBindContentTile(tileId, attempt + 1), 100 * (attempt + 1));
    } else {
      console.error(`[GroupChime] ❌ Content tile=${tileId} bind failed after 5 attempts`);
    }
  };

  // ─────────────────────────────────────────────
  // Video ref setters
  // ─────────────────────────────────────────────
  const setGroupLocalVideoRef = useCallback((node: HTMLVideoElement | null) => {
    groupLocalVideoRef.current = node;
    const store = useGroupCallStore.getState();
    const localTile = store.remoteTiles.find(t => t.isLocal);
    if (node && sessionRef.current && localTile) {
      sessionRef.current.audioVideo.bindVideoElement(localTile.tileId, node);
    }
  }, []);

  const setGroupRemoteVideoRef = useCallback((tileId: number, node: HTMLVideoElement | null) => {
    groupRemoteVideoRefs.current[tileId] = node;
    if (node && sessionRef.current) {
      sessionRef.current.audioVideo.bindVideoElement(tileId, node);
    }
  }, []);

  const setGroupContentVideoRef = useCallback((node: HTMLVideoElement | null) => {
    groupContentVideoRef.current = node;
    if (node && sessionRef.current && contentTileIdRef.current) {
      const tid = contentTileIdRef.current;
      console.log(`[GroupChime] 🖥️ Binding Content Ref to tile=${tid}`);
      sessionRef.current.audioVideo.bindVideoElement(tid, node);
    }
  }, []);

  const rebindAllGroupTiles = () => {
    const s = sessionRef.current;
    if (!s) return;

    const store = useGroupCallStore.getState();

    // 1. Bind Local
    const localTile = store.remoteTiles.find(t => t.isLocal);
    if (localTile && groupLocalVideoRef.current) {
      s.audioVideo.bindVideoElement(localTile.tileId, groupLocalVideoRef.current);
    }

    // 2. Bind Remotes
    store.remoteTiles.forEach(tile => {
      if (tile.isLocal) return;
      const el = groupRemoteVideoRefs.current[tile.tileId];
      if (el) {
        s.audioVideo.bindVideoElement(tile.tileId, el);
      }
    });

    // 3. Bind Content
    if (contentTileIdRef.current && groupContentVideoRef.current) {
      console.log(`[GroupChime] 🔗 Re-binding CONTENT tile=${contentTileIdRef.current}`);
      s.audioVideo.bindVideoElement(contentTileIdRef.current, groupContentVideoRef.current);
    }
  };

  // ─────────────────────────────────────────────
  // Setup Session
  // ─────────────────────────────────────────────
  const setupSession = async () => {
    if (!meetingData || !attendeeData || sessionRef.current) return;

    const logger = new ConsoleLogger('GroupChime', LogLevel.ERROR);
    const deviceController = new DefaultDeviceController(logger);
    const configuration = new MeetingSessionConfiguration(meetingData, attendeeData);

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
              attendeeId: attendeeData.AttendeeId,
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
              lastSeenAt: Date.now(),
            },
          });
        }

        // Initialize mic/camera state from store
        syncMediaState(newSession);

        // [SENIOR] Add Content Share Observer
        newSession.audioVideo.addContentShareObserver({
          contentShareDidStart: () => {
            console.log('[GroupChime] 🖥️ Content Share Started');
          },
          contentShareDidStop: () => {
            console.log('[GroupChime] 🖥️ Content Share Stopped');
            const store = useGroupCallStore.getState();
            store.clearAllScreenShares();
            store.setLocalScreenSharing(false, null);
            setTimeout(() => rebindAllGroupTiles(), 200);
          },
        });
      },

      videoTileDidUpdate: (tileState: any) => {
        const rawAttendeeId = tileState.localTile
          ? attendeeData?.AttendeeId
          : tileState.boundAttendeeId;

        const attendeeId = normalizeAttendeeId(rawAttendeeId)?.toLowerCase();
        if (!attendeeId) return;

        if (tileState.isContent) {
          contentTileIdRef.current = tileState.tileId;
          console.log(`[GroupChime] 🖥️ CONTENT TILE UPDATE: id=${tileState.tileId} attendee=${attendeeId} active=${tileState.active}`);

          const store = useGroupCallStore.getState();
          
          if (!tileState.active) {
            console.log('[GroupChime] 🖥️ Content tile inactive. Cleaning up...');
            contentTileIdRef.current = null;
            store.clearAllScreenShares();
            setTimeout(() => rebindAllGroupTiles(), 200);
            return;
          }

          if (!store.screenShares[attendeeId]) {
            store.setScreenShare(attendeeId, { stream: null, isSharing: true });
          }

          addRemoteTile({
            tileId: tileState.tileId,
            attendeeId,
            active: true,
            isLocal: tileState.localTile,
            isContent: true,
          });

          // [FIX #6] Dùng retry thay vì bind trực tiếp một lần
          tryBindContentTile(tileState.tileId);
          return;
        }

        addRemoteTile({
          tileId: tileState.tileId,
          attendeeId,
          active: tileState.active,
          isLocal: tileState.localTile,
        });

        if (tileState.localTile && groupLocalVideoRef.current) {
          sessionRef.current?.audioVideo.bindVideoElement(tileState.tileId, groupLocalVideoRef.current);
        } else {
          const el = groupRemoteVideoRefs.current[tileState.tileId];
          if (el) sessionRef.current?.audioVideo.bindVideoElement(tileState.tileId, el);
        }
      },

      videoTileDidRemove: (tileId: number) => {
        removeRemoteTile(tileId);
        delete groupRemoteVideoRefs.current[tileId];

        if (contentTileIdRef.current === tileId) {
          contentTileIdRef.current = null;
          const store = useGroupCallStore.getState();
          store.clearAllScreenShares();
          setTimeout(() => rebindAllGroupTiles(), 100);
        }
      },

      audioVideoDidStop: (sessionStatus: any) => {
        console.log('[GroupChime] AudioVideo Stopped', sessionStatus);
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      },
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

  // ─────────────────────────────────────────────
  // [FIX #5] leaveSession — await content share stop đúng thứ tự
  // ─────────────────────────────────────────────
  const leaveSession = async () => {
    if (!sessionRef.current) return;

    console.log('[GroupChime] 🛑 Stopping session');
    const sessionToStop = sessionRef.current;
    sessionRef.current = null;
    setSession(null);

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    try {
      const store = useGroupCallStore.getState();

      // [FIX #5] Stop content share TRƯỚC, nhường 1 tick cho SDK xử lý
      if (store.isLocalScreenSharing) {
        sessionToStop.audioVideo.stopContentShare();
        await new Promise(res => setTimeout(res, 200));
        cleanupScreenShareStream();
      }

      // Stop media devices song song
      await Promise.allSettled([
        sessionToStop.audioVideo.stopVideoInput(),
        sessionToStop.audioVideo.stopAudioInput(),
      ]);

      // Stop session sau cùng
      sessionToStop.audioVideo.stop();
    } catch (error) {
      console.error('[GroupChime] Error leaving session:', error);
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

  // ─────────────────────────────────────────────
  // [FIX #2 + #3] stopScreenShare — cleanup luôn chạy, không bị chặn bởi session guard
  // ─────────────────────────────────────────────
  const stopScreenShare = async () => {
    try {
      // Gọi SDK nếu session vẫn còn, nhưng KHÔNG early return nếu null
      sessionRef.current?.audioVideo.stopContentShare();
    } catch (e) {
      console.error('[GroupChime] stopContentShare error:', e);
    } finally {
      // [FIX #2] Cleanup stream LUÔN chạy bất kể session state
      cleanupScreenShareStream();
    }
  };

  // ─────────────────────────────────────────────
  // [FIX #3 + #1] startScreenShare — block thay vì clear state người khác
  // ─────────────────────────────────────────────
  const startScreenShare = async () => {
    if (!sessionRef.current) return;

    const store = useGroupCallStore.getState();

    // [FIX #3] Nếu mình đang share → toggle off
    if (store.isLocalScreenSharing) {
      await stopScreenShare();
      return;
    }

    // [FIX #3] Nếu người KHÁC đang share → block, không xóa state của họ
    const someoneElseIsSharing = Object.values(store.screenShares).some(s => s.isSharing);
    if (someoneElseIsSharing) {
      alert("Đang có người khác chia sẻ màn hình. Bạn không thể chia sẻ lúc này.");
      return;
    }

    try {
      console.log('[GroupChime] 🚀 Starting Screen Capture...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false, // [SENIOR] Disable audio to stabilize negotiation
      });

      // [FIX #4] Dùng ref để tránh stale closure
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShareRef.current();
      };

      store.setLocalScreenSharing(true, stream);

      // [FIX #1] Dùng event-driven thay vì setTimeout 500ms
      startContentShareWhenReady(stream);
    } catch (e: any) {
      console.error('[GroupChime] startScreenShare failed:', e);
      store.setLocalScreenSharing(false, null);
      if (e.name === 'NotAllowedError') {
        alert('Bạn đã từ chối quyền chia sẻ màn hình.');
      }
    }
  };

  // [FIX #4] Giữ stopScreenShareRef luôn trỏ đến version mới nhất của stopScreenShare
  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  });

  // Automatically setup session when data is available
  useEffect(() => {
    if (meetingData && attendeeData && !sessionRef.current) {
      setupSession();
    }
  }, [meetingData, attendeeData]);

  // Handle unmount
  useEffect(() => {
    return () => {
      // Uncomment nếu muốn tự động leave khi component unmount:
      // leaveSession();
    };
  }, []);

  return {
    setupSession,
    leaveSession,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    setGroupLocalVideoRef,
    setGroupRemoteVideoRef,
    setGroupContentVideoRef,
    rebindAllGroupTiles,
    session,
  };
};