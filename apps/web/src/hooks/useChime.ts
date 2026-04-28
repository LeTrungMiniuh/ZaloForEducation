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
export const leaveCurrentSession = async (reason: string = 'unknown') => {
  if (globalSession) {
    console.log(`[Chime] Cleaning up global session. Reason: ${reason}`);
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
    meetingData, attendeeData, callState,
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

    console.log(`[Chime] >>> Starting session setup (Meeting: ${meeting.MeetingId}) <<<`);
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
      console.log('[Chime] Step 1: Initializing audio...');
      const audioInputDevices = await session.audioVideo.listAudioInputDevices();
      if (audioInputDevices.length > 0) {
        console.log(`[Chime] Found ${audioInputDevices.length} audio inputs. First: ${audioInputDevices[0].label}`);
        try {
          await session.audioVideo.startAudioInput(audioInputDevices[0].deviceId);
        } catch (e) {
          console.warn('[Chime] Failed to start specific audio input, trying default...');
          await session.audioVideo.startAudioInput(null as any);
        }
      } else {
        console.warn('[Chime] No specific audio input devices found, attempting default...');
        await session.audioVideo.startAudioInput(null as any);
      }

      const audioOutputDevices = await session.audioVideo.listAudioOutputDevices();
      if (audioOutputDevices.length > 0) {
        console.log(`[Chime] Using speaker: ${audioOutputDevices[0].label || 'Default'}`);
        await session.audioVideo.chooseAudioOutput(audioOutputDevices[0].deviceId);
      } else {
        console.warn('[Chime] No audio output devices found, attempting default...');
        await session.audioVideo.chooseAudioOutput(null as any);
      }

      // [AUDIO FIX] Local mic will be unmuted in audioVideoDidStart callback

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
          useCallStore.getState().setConnected();
          
          // [CRITICAL] Bind audio element NOW — session is ready
          const audioEl = document.getElementById('chime-audio') as HTMLAudioElement | null;
          if (audioEl && session) {
            audioEl.volume = 1.0;
            audioEl.muted = false;
            session.audioVideo.bindAudioElement(audioEl).then(() => {
              console.log('[Web-Chime] 🔊 Audio element bound INSIDE audioVideoDidStart');
              session.audioVideo.realtimeUnmuteLocalAudio();
              audioEl.play().catch(e => {
                console.warn('[Web-Chime] 🔇 Autoplay blocked? Retrying on first click.', e);
                const playOnActive = () => {
                   audioEl.play();
                   document.removeEventListener('click', playOnActive);
                };
                document.addEventListener('click', playOnActive);
              });
            }).catch((e: any) => console.warn('[Web-Chime] Audio bind error:', e));
          } else {
            console.warn('[Web-Chime] ⚠️ #chime-audio NOT FOUND when session started');
          }
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

      // [FIX] Attendee Presence is handled via Realtime API, not AudioVideoObserver
      session.audioVideo.realtimeSubscribeToAttendeeIdPresence((attendeeId, present) => {
        console.log(`[Web-Chime] 👤 Attendee ${attendeeId} is ${present ? 'PRESENT' : 'LEFT'}`);
        if (present) {
          // Safety-net: Re-verify audio binding when someone joins
          const audioEl = document.getElementById('chime-audio') as HTMLAudioElement | null;
          if (audioEl && session) {
            session.audioVideo.bindAudioElement(audioEl).catch(() => {});
          }
        }
      });

      // 4. Audio Output binding — primary bind is in audioVideoDidStart callback above.
      // This is a SAFETY NET rebind after 2s in case the callback fires before DOM is ready.
      console.log('[Chime] Step 4: Scheduling safety-net audio rebind...');
      setTimeout(async () => {
        const audioEl = document.getElementById('chime-audio') as HTMLAudioElement | null;
        if (audioEl && globalSession) {
          try {
            await globalSession.audioVideo.bindAudioElement(audioEl);
            console.log('[Chime] Step 4 OK: Safety-net audio rebind successful');
          } catch (e) {
            console.warn('[Chime] Step 4: Safety-net rebind skipped (already bound)');
          }
        }
      }, 2000);

      // 5. Start session
      console.log('[Chime] Step 5: Calling audioVideo.start()...');
      
      let retries = 0;
      let success = false;
      while (retries < 3 && !success) {
        try {
          await session.audioVideo.start();
          console.log(`[Chime] Step 5 OK: Session STARTED (Attempt ${retries + 1})`);
          success = true;
        } catch (e) {
          retries++;
          console.error(`[Chime] Step 5 FAILED on attempt ${retries}:`, e);
          if (retries >= 3) {
            throw e; // Ném lỗi ra ngoài catch block chính
          } else {
            console.log(`[Chime] Retrying in 1000ms...`);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      // 6. Start local video tile
      if (type === 'video') {
         console.log('[Chime] Step 6: Starting local video tile...');
        session.audioVideo.startLocalVideoTile();
      }

      // 7. Periodic rebinds
      setTimeout(() => rebindAllTiles(), 1500);

    } catch (error: any) {
      console.error('[Chime] ❌ setupSession CRASHED:', error);
      setConnectionError(`Lỗi Media: ${error?.message || 'Không xác định'}`);
      setConnecting(false);
      // globalSession = null; // Don't nullify yet, might be transient
    }
  }, [setCallState, resetCall, bindTile, rebindAllTiles, setConnecting, setConnectionError, setRemoteCameraOn]);

  useEffect(() => {
    // For Caller: This happens after receiving 'call:accept' socket.
    // For Callee: This happens after clicking 'Accept' button.
    if (meetingData && attendeeData && !globalSession && callState === 'JOINING') {
      const type = useCallStore.getState().callType;
      console.log(`[Chime] useEffect triggered — creating session (type=${type})`);
      setupSession(type);
    }
  }, [meetingData?.MeetingId, attendeeData?.AttendeeId, setupSession, callState]);

  return {
    rebindAllTiles,
  };
};
