import { useEffect, useRef, useCallback } from 'react';
import {
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  ConsoleLogger,
  LogLevel,
} from 'amazon-chime-sdk-js';
import { useCallStore } from '../store/callStore';

// Module-level singletons: survive React re-renders và component unmounts
let globalSession: DefaultMeetingSession | null = null;
let globalTiles: { local?: number; remote?: number } = {};
let globalVideoStarted = false;
let globalLocalVideo: HTMLVideoElement | null = null;
let globalRemoteVideo: HTMLVideoElement | null = null;

/**
 * Cập nhật video element refs từ CallOverlay.
 * Truyền `undefined` để giữ nguyên phía đó.
 */
export const setGlobalVideoRefs = (
  local: HTMLVideoElement | null | undefined,
  remote: HTMLVideoElement | null | undefined,
) => {
  if (local !== undefined) {
    globalLocalVideo = local;
    if (local && globalTiles.local !== undefined && globalSession) {
      globalSession.audioVideo.bindVideoElement(globalTiles.local, local);
    }
  }
  if (remote !== undefined) {
    globalRemoteVideo = remote;
    if (remote && globalTiles.remote !== undefined && globalSession) {
      globalSession.audioVideo.bindVideoElement(globalTiles.remote, remote);
    }
  }
};

/**
 * Dừng toàn bộ hardware và cleanup Chime session.
 * Có thể gọi từ bất kỳ đâu (socket hangup handler, v.v.).
 */
export const leaveCurrentSession = async () => {
  if (globalSession) {
    try {
      if (globalVideoStarted) await globalSession.audioVideo.stopVideoInput();
      await globalSession.audioVideo.stopAudioInput();
      globalSession.audioVideo.stopLocalVideoTile();
      globalSession.audioVideo.stop();
      if (globalLocalVideo?.srcObject) {
        (globalLocalVideo.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        globalLocalVideo.srcObject = null;
      }
    } catch (e) { /* ignore cleanup errors */ }
    globalSession = null;
    globalTiles = {};
    globalVideoStarted = false;
    globalLocalVideo = null;
    globalRemoteVideo = null;
  }
};

/**
 * Re-bind tất cả video tiles đang được track.
 * Gọi được từ bất kỳ đâu (không cần hook).
 */
export const rebindAllTilesGlobal = () => {
  if (!globalSession) return;
  if (globalTiles.local !== undefined && globalLocalVideo) {
    globalSession.audioVideo.bindVideoElement(globalTiles.local, globalLocalVideo);
  }
  if (globalTiles.remote !== undefined && globalRemoteVideo) {
    globalSession.audioVideo.bindVideoElement(globalTiles.remote, globalRemoteVideo);
  }
};

/**
 * Bật/tắt camera trong phiên đang hoạt động.
 * Không đóng session — chỉ start/stop video track.
 */
export const toggleCamera = async (turnOn: boolean) => {
  if (!globalSession) {
    console.warn('[Chime] toggleCamera called but no active session');
    return;
  }
  if (turnOn) {
    try {
      await globalSession.audioVideo.startVideoInput({ video: true } as any);
      globalSession.audioVideo.startLocalVideoTile();
      globalVideoStarted = true;
      setTimeout(() => {
        if (globalTiles.local !== undefined && globalLocalVideo) {
          globalSession!.audioVideo.bindVideoElement(globalTiles.local, globalLocalVideo);
        }
      }, 300);
    } catch (e: any) {
      console.error('[Chime] toggleCamera ON failed:', e?.message);
    }
  } else {
    try {
      globalSession.audioVideo.stopLocalVideoTile();
      await globalSession.audioVideo.stopVideoInput();
      if (globalLocalVideo?.srcObject) {
        (globalLocalVideo.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        globalLocalVideo.srcObject = null;
      }
      globalVideoStarted = false;
    } catch (e: any) {
      console.error('[Chime] toggleCamera OFF failed:', e?.message);
    }
  }
};

/**
 * Bật/Tắt Micro.
 */
export const toggleMic = async (turnOn: boolean) => {
  if (!globalSession) {
    console.warn('[Chime] toggleMic called but no active session');
    return;
  }
  if (turnOn) {
    globalSession.audioVideo.realtimeUnmuteLocalAudio();
    console.log('[Chime] Microphone UNMUTED');
  } else {
    globalSession.audioVideo.realtimeMuteLocalAudio();
    console.log('[Chime] Microphone MUTED');
  }
};

export const useChime = () => {
  const { meetingData, attendeeData, callType, setCallState, resetCall, setConnecting, setConnectionError } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const bindTile = useCallback((tileId: number, isLocal: boolean) => {
    if (!globalSession) return;
    const el = isLocal ? globalLocalVideo : globalRemoteVideo;
    if (el) {
      console.log(`[Chime] Binding tile ${tileId} to ${isLocal ? 'LOCAL' : 'REMOTE'} video element`);
      globalSession.audioVideo.bindVideoElement(tileId, el);
    } else {
      console.warn(`[Chime] Cannot bind tile ${tileId}: ${isLocal ? 'LOCAL' : 'REMOTE'} video element is MISSING`);
    }
  }, []);

  const rebindAllTiles = useCallback(() => {
    if (globalTiles.local !== undefined) bindTile(globalTiles.local, true);
    if (globalTiles.remote !== undefined) bindTile(globalTiles.remote, false);
  }, [bindTile]);

  const setupSession = useCallback(async (type: 'audio' | 'video') => {
    if (globalSession) {
      console.log('[Chime] Session already exists, skipping setup');
      return;
    }

    // ⚠️ IMPORTANT: Read meetingData/attendeeData directly from store via getState()
    // to avoid stale closure issues (hook was created before data arrived)
    const { meetingData: meeting, attendeeData: attendee } = useCallStore.getState();
    if (!meeting || !attendee) {
      console.error('[Chime] setupSession called but meeting/attendee data is missing!');
      setConnectionError('Mất dữ liệu cuộc gọi (Missing Data)');
      return;
    }

    console.log(`[Chime] ===== SETUP SESSION START: type=${type} =====`);
    setConnecting(true);
    setConnectionError(null);

    const logger = new ConsoleLogger('ChimeMeeting', LogLevel.WARN);
    const deviceController = new DefaultDeviceController(logger);
    const config = new MeetingSessionConfiguration(meeting, attendee);
    const session = new DefaultMeetingSession(config, logger, deviceController);
    globalSession = session;
    globalTiles = {};
    globalVideoStarted = false;

    try {
      // 1. Audio Input
      const audioInputDevices = await session.audioVideo.listAudioInputDevices();
      console.log(`[Chime] Audio devices found: ${audioInputDevices.length}`);
      if (audioInputDevices.length > 0) {
        await session.audioVideo.startAudioInput(audioInputDevices[0].deviceId);
        console.log('[Chime] Audio input started');
      } else {
        throw new Error('Không tìm thấy Micro (No Mic)');
      }

      // 2. Video Input (video calls only)
      if (type === 'video') {
        try {
          await session.audioVideo.startVideoInput({ video: true } as any);
          globalVideoStarted = true;
          console.log('[Chime] Video input started');
        } catch (videoErr: any) {
          console.error('[Chime] Video input failed:', videoErr?.message);
          // Video fail doesn't stop the call, but we log it
        }
      }

      // 3. Observer
      session.audioVideo.addObserver({
        videoTileDidUpdate: (tileState: any) => {
          if (!tileState.boundAttendeeId) return;
          console.log(`[Chime] videoTileDidUpdate: id=${tileState.tileId} local=${tileState.localTile} active=${tileState.active}`);
          if (tileState.localTile) {
            globalTiles.local = tileState.tileId;
          } else {
            globalTiles.remote = tileState.tileId;
          }
          bindTile(tileState.tileId, !!tileState.localTile);
        },
        audioVideoDidStart: () => {
          console.log('[Chime] ✅ Session STARTED successfully (Observer)');
          setConnecting(false);
          setCallState('CONNECTED');
        },
        audioVideoDidStop: (sessionStatus: any) => {
          const code = sessionStatus?.statusCode();
          console.log(`[Chime] Session STOPPED (Code: ${code})`);
          if (code !== undefined && code !== 0 && code !== 1) {
             setConnectionError(`Lỗi kết nối (Code: ${code})`);
          }
          setConnecting(false);
        },
        audioVideoDidStartConnecting: (reconnecting: boolean) => {
          console.log(`[Chime] Connecting... (reconnecting=${reconnecting})`);
          setConnecting(true);
        },
        videoAvailabilityDidChange: (availability: any) => {
          console.log(`[Chime] Video availability: ${availability.canStartLocalVideo ? 'CAN' : 'CANNOT'} start local video`);
        }
      });

      // 4. Audio Output
      const audioEl = document.getElementById('chime-audio') as HTMLAudioElement | null;
      if (audioEl) {
        await session.audioVideo.bindAudioElement(audioEl);
        console.log('[Chime] Audio element bound');
      } else {
        console.error('[Chime] ❌ #chime-audio NOT FOUND in DOM!');
      }

      // 5. Start session
      await session.audioVideo.start();
      console.log('[Chime] session.audioVideo.start() sequence initiated');

      // 6. Start local video tile
      if (type === 'video') {
        session.audioVideo.startLocalVideoTile();
      }

      // 8. Retry binding (tiles activate asynchronously)
      setTimeout(() => { console.log('[Chime] Retry bind 1s'); rebindAllTiles(); }, 1000);
      setTimeout(() => { console.log('[Chime] Retry bind 3s'); rebindAllTiles(); }, 3000);

    } catch (error: any) {
      console.error('[Chime] ❌ Setup FAILED:', error?.message, error);
      setConnectionError(error?.message || 'Lỗi khởi tạo Chime');
      setConnecting(false);
      globalSession = null;
      // Trì hoãn reset để user kịp đọc lỗi nếu cần
      setTimeout(() => resetCall(), 5000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCallState, resetCall, bindTile, rebindAllTiles, setConnecting, setConnectionError]);
  // ⚠️ meetingData/attendeeData intentionally removed from deps — read via getState()

  // Trigger setup khi meeting data sẵn sàng
  // Dùng meetingData từ store hook (không phải getState) để React react được với change
  useEffect(() => {
    if (meetingData && attendeeData && !globalSession) {
      const type = useCallStore.getState().callType;
      console.log('[Chime] meetingData arrived, calling setupSession with type:', type);
      setupSession(type);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingData?.MeetingId, attendeeData?.AttendeeId]);
  // ⚠️ Dùng ID cụ thể thay vì object reference để tránh infinite loop

  // Mid-call upgrade: Audio → Video
  useEffect(() => {
    if (!globalSession || callType !== 'video' || globalVideoStarted) return;

    (async () => {
      try {
        await globalSession!.audioVideo.startVideoInput({ video: true } as any);
        globalSession!.audioVideo.startLocalVideoTile();
        globalVideoStarted = true;
        setTimeout(() => rebindAllTiles(), 500);
      } catch (e) {
        console.error('[Chime] Video upgrade failed:', e);
      }
    })();
  }, [callType, rebindAllTiles]);

  const leaveMeeting = useCallback(async () => {
    await leaveCurrentSession();
    resetCall();
  }, [resetCall]);

  return {
    localVideoRef,
    remoteVideoRef,
    leaveMeeting,
    rebindAllTiles,
  };
};
