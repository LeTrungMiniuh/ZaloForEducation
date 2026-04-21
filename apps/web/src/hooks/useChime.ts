import { useEffect, useCallback } from 'react';
import {
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  ConsoleLogger,
  LogLevel,
} from 'amazon-chime-sdk-js';
import { useCallStore } from '../store/callStore';

// Module-level singletons: survive React re-renders and component unmounts
let globalSession: DefaultMeetingSession | null = null;
let globalTiles: { local?: number; remote?: number } = {};
let globalVideoStarted = false;
let globalLocalVideo: HTMLVideoElement | null = null;
let globalRemoteVideo: HTMLVideoElement | null = null;

const isValidTileId = (tileId: unknown): tileId is number =>
  typeof tileId === 'number' && Number.isFinite(tileId);

/**
 * [Web-Chime] Normalize Chime attendee IDs (strips modality suffix like #1, #2)
 */
const normalizeAttendeeId = (id?: string | null): string | null => {
  if (!id) return null;
  return id.split('#')[0];
};

/**
 * Cập nhật video element refs từ CallOverlay.
 * Truyền `undefined` để giữ nguyên phía đó.
 */
export const setGlobalVideoRefs = (
  local: HTMLVideoElement | null | undefined,
  remote: HTMLVideoElement | null | undefined,
  localTileId?: number,
  remoteTileId?: number
) => {
  if (local !== undefined) {
    globalLocalVideo = local;
    const tId = localTileId ?? globalTiles.local;
    // CRITICAL: Bind IMMEDIATELY when the local DOM node arrives!
    if (globalLocalVideo && tId !== undefined && globalSession) {
      console.log(`[Web-Chime] 🔗 DOM Node Arrived! Binding LOCAL tile ${tId}`);
      globalSession.audioVideo.bindVideoElement(tId, globalLocalVideo);
    }
  }
  if (remote !== undefined) {
    globalRemoteVideo = remote;
    const tId = remoteTileId ?? globalTiles.remote;
    // CRITICAL: Bind IMMEDIATELY when the remote DOM node arrives!
    if (globalRemoteVideo && tId !== undefined && globalSession) {
      console.log(`[Web-Chime] 🔗 DOM Node Arrived! Binding remote tile ${tId}`);
      globalSession.audioVideo.bindVideoElement(tId, globalRemoteVideo);
    }
  }
};

/**
 * Dừng toàn bộ hardware và cleanup Chime session.
 */
export const leaveCurrentSession = async () => {
  if (globalSession) {
    console.log('[Chime] Cleaning up global session...');
    try {
      const cleanupPromises: Promise<void>[] = [];
      if (globalVideoStarted) cleanupPromises.push(globalSession.audioVideo.stopVideoInput());
      cleanupPromises.push(globalSession.audioVideo.stopAudioInput());
      
      await Promise.all(cleanupPromises);
      
      globalSession.audioVideo.stopLocalVideoTile();
      globalSession.audioVideo.stop();
      if (globalLocalVideo?.srcObject) {
        (globalLocalVideo.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        globalLocalVideo.srcObject = null;
      }
    } catch (e) { console.warn('[Chime] Cleanup error:', e); }
    globalSession = null;
    globalTiles = {};
    globalVideoStarted = false;
    globalLocalVideo = null;
    globalRemoteVideo = null;
    console.log('[Chime] Session cleaned up.');
  }
};

/**
 * Bật/tắt camera trong phiên đang hoạt động.
 */
export const toggleCamera = async (turnOn: boolean) => {
  if (!globalSession) {
    console.warn('[Chime] toggleCamera called but no active session');
    return;
  }
  if (turnOn) {
    try {
      console.log('[Chime] Starting Video Input...');
      const devices = await globalSession.audioVideo.listVideoInputDevices();
      if (devices.length > 0) {
         await globalSession.audioVideo.startVideoInput(devices[0].deviceId);
      } else {
         await globalSession.audioVideo.startVideoInput({ video: true } as any);
      }
      globalSession.audioVideo.startLocalVideoTile();
      globalVideoStarted = true;
      // Trì hoãn nhẹ để gán ref nếu thẻ video local được render sau đó
      setTimeout(() => {
        if (globalTiles.local !== undefined && globalLocalVideo) {
          globalSession!.audioVideo.bindVideoElement(globalTiles.local, globalLocalVideo);
        }
      }, 500);
    } catch (e: any) {
      console.error('[Chime] toggleCamera ON failed:', e?.message);
    }
  } else {
    try {
      console.log('[Chime] Stopping Video Input...');
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
  if (!globalSession) return;
  if (turnOn) {
    globalSession.audioVideo.realtimeUnmuteLocalAudio();
    console.log('[Chime] Microphone UNMUTED');
  } else {
    globalSession.audioVideo.realtimeMuteLocalAudio();
    console.log('[Chime] Microphone MUTED');
  }
};

export const useChime = () => {
  const { 
    meetingData, attendeeData, 
    setCallState, resetCall, setConnecting, setConnectionError,
    setRemoteCameraOn,
  } = useCallStore();

  const bindTile = useCallback((tileId: number, isLocal: boolean) => {
    if (!globalSession) return;
    if (!isValidTileId(tileId)) return;
    
    const el = isLocal ? globalLocalVideo : globalRemoteVideo;
    if (el) {
      console.log(`[Chime] Binding tile ${tileId} to ${isLocal ? 'LOCAL' : 'REMOTE'} video element`);
      globalSession.audioVideo.bindVideoElement(tileId, el);
    } else {
      console.warn(`[Chime] Cannot bind tile ${tileId}: ${isLocal ? 'LOCAL' : 'REMOTE'} video element is currently NULL`);
    }
  }, []);

  const rebindAllTiles = useCallback(() => {
    if (isValidTileId(globalTiles.local)) bindTile(globalTiles.local, true);
    if (isValidTileId(globalTiles.remote)) bindTile(globalTiles.remote, false);
  }, [bindTile]);

  const setupSession = useCallback(async (type: 'audio' | 'video') => {
    // [DEFENSIVE] Nếu có session cũ bị treo, dọn dẹp trước khi bắt đầu cái mới
    if (globalSession) {
      console.log('[Chime] Existing session found, cleaning up before new call...');
      await leaveCurrentSession();
    }

    const { meetingData: meeting, attendeeData: attendee } = useCallStore.getState();
    if (!meeting || !attendee) {
      console.error('[Chime] setupSession ABORTED: Missing meeting/attendee data');
      setConnectionError('Mất dữ liệu cuộc gọi (Missing Data)');
      return;
    }

    console.log(`[Chime] >>> Starting session setup (type=${type}) <<<`);
    setConnecting(true);
    setConnectionError(null);

    const logger = new ConsoleLogger('ChimeMeeting', LogLevel.WARN);
    const deviceController = new DefaultDeviceController(logger);
    const config = new MeetingSessionConfiguration(meeting, attendee);
    const session = new DefaultMeetingSession(config, logger, deviceController);
    
    globalSession = session;
    globalTiles = {};
    globalVideoStarted = false;

    // [SENIOR] Listen for remote video element mount to bind tiles immediately
    const remoteVideoObserver = new MutationObserver(() => {
      const remoteEl = document.getElementById('remote-video') as HTMLVideoElement;
      if (remoteEl) {
        const { remoteTiles } = useCallStore.getState();
        if (remoteTiles.length > 0 && globalSession) {
          console.log(`[Web-Chime] 🔗 DOM Node Arrived! Binding remote tile ${remoteTiles[0].tileId}`);
          globalSession.audioVideo.bindVideoElement(remoteTiles[0].tileId, remoteEl);
        }
      }
    });
    if (document.body) {
      remoteVideoObserver.observe(document.body, { childList: true, subtree: true });
    }

    try {
      // 1. Audio Input & Output
      console.log('[Chime] Step 1: Listing audio devices...');
      const audioInputDevices = await session.audioVideo.listAudioInputDevices();
      if (audioInputDevices.length > 0) {
        console.log(`[Chime] Using audio device: ${audioInputDevices[0].label || 'Default'}`);
        await session.audioVideo.startAudioInput(audioInputDevices[0].deviceId);
      } else {
        throw new Error('Không tìm thấy Micro');
      }

      const audioOutputDevices = await session.audioVideo.listAudioOutputDevices();
      if (audioOutputDevices.length > 0) {
        console.log(`[Chime] Using speaker: ${audioOutputDevices[0].label || 'Default'}`);
        await session.audioVideo.chooseAudioOutput(audioOutputDevices[0].deviceId);
      } else {
        console.warn('[Chime] No audio output devices found, attempting default...');
        await session.audioVideo.chooseAudioOutput(null as any);
      }

      // 2. Video Input
      if (type === 'video') {
         console.log('[Chime] Step 2: Listing video devices...');
        try {
          const videoInputDevices = await session.audioVideo.listVideoInputDevices();
          if (videoInputDevices.length > 0) {
            await session.audioVideo.startVideoInput(videoInputDevices[0].deviceId);
          } else {
            await session.audioVideo.startVideoInput({ video: true } as any);
          }
          globalVideoStarted = true;
        } catch (videoErr: any) {
          console.error('[Chime] Step 2 FAIL: Video setup failed', videoErr);
        }
      }

      // 3. Observer
      session.audioVideo.addObserver({
        videoTileDidUpdate: (tileState: any) => {
          const tileId = tileState.tileId;
          const isLocal = !!tileState.localTile;
          const attendeeId = normalizeAttendeeId(tileState.boundExternalUserId || tileState.boundAttendeeId);
          
          console.log(`[Web-Chime] 🎥 Tile Update: id=${tileId} isLocal=${isLocal} attendee=${attendeeId} active=${tileState.active}`);
          
          if (isLocal) {
            globalTiles.local = tileId;
          } else {
            // [SENIOR] Handle Remote Tile
            globalTiles.remote = tileId;
            
            const store = useCallStore.getState();
            store.setRemoteCameraOn(true);
            
            const exists = store.remoteTiles.find(t => t.tileId === tileId);
            if (!exists) {
              store.setRemoteTiles([{ tileId, attendeeId }]);
            }

            // Bind immediately if DOM is already there
            const remoteEl = document.getElementById('remote-video') as HTMLVideoElement;
            if (remoteEl) {
              console.log(`[Web-Chime] 🔗 Direct binding tile ${tileId} to existing remote video`);
              session.audioVideo.bindVideoElement(tileId, remoteEl);
            } else {
              console.warn(`[Web-Chime] ⏳ Remote tile ${tileId} arrived but DOM not ready. MutationObserver will handle it.`);
            }
          }
          bindTile(tileId, isLocal);
        },
        videoTileWasRemoved: (tileId: number) => {
          console.log(`[Web-Chime] ❌ Tile Removed: ${tileId}`);
          if (!isValidTileId(tileId)) return;
          
          if (globalTiles.local === tileId) {
            globalTiles.local = undefined;
          }
          if (globalTiles.remote === tileId) {
            globalTiles.remote = undefined;
            
            try {
              session.audioVideo.unbindVideoElement(tileId);
            } catch (e) {
              console.warn(`[Web-Chime] unbindVideoElement failed for tile ${tileId}`, e);
            }
            
            // Clear from store
            const { remoteTiles, setRemoteTiles, setRemoteCameraOn } = useCallStore.getState();
            const nextTiles = remoteTiles.filter(t => t.tileId !== tileId);
            setRemoteTiles(nextTiles);

            if (nextTiles.length === 0) {
              setRemoteCameraOn(false);
            }
          }
        },
        audioVideoDidStart: () => {
          console.log('[Web-Chime] ✅ Session STARTED successfully');
          setConnecting(false);
          setCallState('CONNECTED');
        },
        audioVideoDidStop: (sessionStatus: any) => {
          const code = sessionStatus?.statusCode();
          console.log(`[Web-Chime] Session STOPPED (Code: ${code})`);
          
          const currentState = useCallStore.getState().callState;
          if (
            currentState !== 'ENDED' && 
            currentState !== 'IDLE' && 
            code !== undefined && code !== 0 && code !== 1 && code !== 5
          ) {
             setConnectionError(`Lỗi kết nối (Code: ${code})`);
          }
          setConnecting(false);
        },
        audioVideoDidStartConnecting: (reconnecting: boolean) => {
          console.log(`[Chime] Connecting... (reconnecting=${reconnecting})`);
          setConnecting(true);
        }
      });

      // 4. Audio Output binding (Search for #chime-audio in DOM)
      console.log('[Chime] Step 4: Binding audio element...');
      const audioEl = document.getElementById('chime-audio') as HTMLAudioElement | null;
      if (audioEl) {
        await session.audioVideo.bindAudioElement(audioEl);
        console.log('[Chime] Step 4 OK: Audio element bound');
      } else {
        console.warn('[Chime] Step 4 WARNING: #chime-audio NOT FOUND in DOM - call may have no audio');
      }

      // 5. Start session
      console.log('[Chime] Step 5: Calling audioVideo.start()...');
      await session.audioVideo.start();

      // 6. Start local video tile
      if (type === 'video') {
         console.log('[Chime] Step 6: Starting local video tile...');
        session.audioVideo.startLocalVideoTile();
      }

      // 7. Periodic rebinds
      setTimeout(() => rebindAllTiles(), 1500);

    } catch (error: any) {
      console.error('[Chime] ❌ setupSession CRASHED:', error);
      setConnectionError(error?.message || 'Lỗi khởi tạo Media');
      setConnecting(false);
      globalSession = null;
       // Reset call sau 5s nếu lỗi khởi tạo
      setTimeout(() => {
         if (useCallStore.getState().callState === 'JOINING') resetCall();
      }, 5000);
    }
  }, [setCallState, resetCall, bindTile, rebindAllTiles, setConnecting, setConnectionError, setRemoteCameraOn]);

  useEffect(() => {
    // ⚠️ Chỉ chạy khi có meeting data và chưa có session
    if (meetingData && attendeeData && !globalSession) {
      const type = useCallStore.getState().callType;
      setupSession(type);
    }
  }, [meetingData?.MeetingId, attendeeData?.AttendeeId, setupSession]);

  return {
    rebindAllTiles,
  };
};
