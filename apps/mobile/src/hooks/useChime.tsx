import { useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform, AppState, Alert } from 'react-native';
import { ChimeModuleBridge } from '../bridge/chime';

import { useCallStore } from '../store/callStore';
import { chimeRef } from '../utils/chimeRef';

/**
 * [SENIOR] useChime Mobile V10.0 - SDK Truth, Zero Ambiguity
 *
 * FINAL FIX for invisible remote video:
 * - Native SDK isLocalTile() is the ONLY tile classification source.
 * - Attendee ID comparison REMOVED permanently (broken when both peers share an account).
 * - All store updates go through useCallStore.getState() to avoid stale closure bugs.
 * - Render control is entirely mount/unmount based (no opacity:0 on SurfaceViews).
 */
export const useChime = () => {
  const { 
    meetingData, attendeeData, callType, callState,
    remoteTiles: globalRemoteTiles
  } = useCallStore();

  const [localTileId, setLocalTileId] = useState<number | null>(null);
  const isStarted = useRef(false);
  const localTileIdRef = useRef<number | null>(null);
  const startTimeoutRef = useRef<any>(null);

  useEffect(() => {
    localTileIdRef.current = localTileId;
  }, [localTileId]);

  // Stable ref for meetingData + attendeeData so listeners don't close over stale values
  const metadataRef = useRef<{ meetingData: any, attendeeData: any }>({ meetingData: null, attendeeData: null });
  useEffect(() => {
    metadataRef.current = { meetingData, attendeeData };
  }, [meetingData, attendeeData]);

  const requestPermissions = async () => {
    console.log(`[Chime-Permissions] Requesting ALL permissions (Audio & Video) on ${Platform.OS}`);
    
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      // 1. Kiểm tra & Yêu cầu quyền Audio
      const hasAudio = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (!hasAudio) {
        const grantedAudio = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (grantedAudio !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[Chime-Permissions] Audio permission DENIED');
          return false;
        }
      }

      // 2. Kiểm tra & Yêu cầu quyền Video (Luôn yêu cầu cả 2 một lúc)
      const hasVideo = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (!hasVideo) {
        const grantedVideo = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (grantedVideo !== PermissionsAndroid.RESULTS.GRANTED) {
          console.warn('[Chime-Permissions] Camera permission DENIED');
          return false;
        }
      }
      
      console.log('[Chime-Permissions] ALL permissions GRANTED');
      return true;
    } catch (err) {
      console.warn("[Chime-Bridge] Permission error:", err);
      return false;
    }
  };

  const cleanup = useCallback(async (reason: string = 'unknown') => {
    console.log(`[Chime-Bridge] Cleaning up session. Reason: ${reason}`);
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }

    ChimeModuleBridge.stopMeeting();
    ChimeModuleBridge.removeAllListeners('onVideoTileAdded');
    ChimeModuleBridge.removeAllListeners('onVideoTileRemoved');
    ChimeModuleBridge.removeAllListeners('onMeetingStart');
    ChimeModuleBridge.removeAllListeners('onMeetingEnd');
    ChimeModuleBridge.removeAllListeners('onMeetingConnecting');
    ChimeModuleBridge.removeAllListeners('onAttendeeJoin');
    ChimeModuleBridge.removeAllListeners('onAttendeeLeave');
    
    isStarted.current = false;
    // Use getState() to avoid stale closure on the setRemoteTiles reference
    useCallStore.getState().setRemoteTiles([]);
    setLocalTileId(null);
    chimeRef.current = null;
  }, []);

  useEffect(() => {
    chimeRef.current = { cleanup };
    return () => { chimeRef.current = null; };
  }, [cleanup]);

  const setupSession = useCallback(async () => {
    const { meetingData: md, attendeeData: ad } = metadataRef.current;
    
    // [CRITICAL] Block redundant setup calls immediately
    if (isStarted.current) {
      console.log('[Chime-Bridge] Setup session skipped - already started or starting');
      return;
    }
    
    if (!md || !ad) {
      console.warn('[Chime-Bridge] Setup session skipped - missing metadata');
      return;
    }

    isStarted.current = true; // Lock immediately
    console.log(`[Chime-Bridge] V10.0 Setup Starting (Meeting: ${md.MeetingId})...`);
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Thiếu quyền truy cập',
        'ZaloEdu cần quyền truy cập Camera và Micros để thực hiện cuộc gọi. Vui lòng cấp quyền trong Cài đặt.'
      );
      return;
    }

    try {
      ChimeModuleBridge.addListener('onVideoTileAdded', (tile: any) => {
        const tileId = tile?.tileId;
        if (tileId === undefined || tileId === null) return;
        const isLocal = !!tile?.isLocal;

        console.log(`[Chime-Bridge] 🎥 tileId=${tileId} isLocal=${isLocal} attendeeId=${tile?.attendeeId}`);

        if (isLocal) {
          console.log(`[Chime-Bridge] ✅ LOCAL tile: ${tileId}`);
          setLocalTileId(tileId);
        } else {
          console.log(`[Chime-Bridge] 🌐 REMOTE tile: ${tileId} → pushing to store`);
          const store = useCallStore.getState();
          const currentTiles = store.remoteTiles;
          if (!currentTiles.find(t => t.tileId === tileId)) {
            store.setRemoteTiles([...currentTiles, { ...tile, tileId }]);
          }
        }
      });

      ChimeModuleBridge.addListener('onVideoTileRemoved', (tile: any) => {
        const tileId = tile?.tileId;
        console.log(`[Chime-Bridge] ❌ Tile Removed: ${tileId}`);
        if (tileId === undefined || tileId === null) return;

        if (tileId === localTileIdRef.current) {
          setLocalTileId(null);
        } else {
          const store = useCallStore.getState();
          const nextTiles = store.remoteTiles.filter(t => t.tileId !== tileId);
          store.setRemoteTiles(nextTiles);
        }
      });

      ChimeModuleBridge.addListener('onMeetingConnecting', (data) => {
        console.log('[Chime-Bridge] 📡 Signaling CONNECTING...', data);
      });

      ChimeModuleBridge.addListener('onMeetingStart', (data) => {
        console.log('[Chime-Bridge] 🌍 SIGNALING CONNECTED (onMeetingStart)', data);
        // ✅ [FIX 6] Set state to CONNECTED only when native signaling confirms it
        useCallStore.getState().setConnected();
      });

      ChimeModuleBridge.addListener('onMeetingEnd', (data) => {
        console.log('[Chime-Bridge] 🏁 Meeting ended/failed', data);
        // ✅ [FIX 1] Reset lock so a new session can start if needed
        isStarted.current = false;
      });

      ChimeModuleBridge.addListener('onAttendeeJoin', (data) => {
        console.log('[Chime-Bridge] 👤 Attendee joined:', data.attendeeId);
      });

      ChimeModuleBridge.addListener('onAttendeeLeave', (data) => {
        console.log('[Chime-Bridge] 👤 Attendee left:', data.attendeeId);
      });

      console.log(`[Chime-Bridge] 🚀 Waiting 1000ms for expo-av to release Audio Focus & Calling Native StartMeeting (ID: ${md.MeetingId})...`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[Chime-Bridge] 🔊 Delay finished. Proceeding to Native Setup.');
      } catch (e) {
        console.warn(e);
      }

      let retries = 0;
      let success = false;
      while (retries < 3 && !success) {
        try {
          await ChimeModuleBridge.startMeeting(md, ad);
          console.log(`[Chime-Bridge] 🏁 Native StartMeeting CALLED (Attempt ${retries + 1})`);
          success = true;
        } catch (e) {
          retries++;
          console.error(`[Chime-Bridge] Setup failed on attempt ${retries}:`, e);
          if (retries >= 3) {
            isStarted.current = false;
          } else {
            console.log(`[Chime-Bridge] Retrying in 1000ms...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    } catch (err) {
      console.error('[Chime-Bridge] Setup CRASHED:', err);
      isStarted.current = false;
    }
  }, [callType]);

  // [CLEANUP] Remove the automatic useEffect trigger to prevent double-joins
  // Mobile session should be triggered MANUALLY from CallOverlay once
  // we are absolutely sure the previous session (if any) is dead.

  const isCameraUserEnabled = useRef(callType === 'video');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: any) => {
      if (isStarted.current) {
        if (nextAppState === 'background') {
          ChimeModuleBridge.toggleCamera(false);
        } else if (nextAppState === 'active') {
          if (isCameraUserEnabled.current) {
            ChimeModuleBridge.toggleCamera(true);
          }
        }
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // ✅ [FIX 2] Only trigger setupSession when the app explicitly enters JOINING state.
    // This prevents accidental joins from stale meetingData before handleAccept is called.
    if (meetingData && attendeeData && callState === 'JOINING') {
      setupSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingData, attendeeData, callState]); // ✅ callState là reactive, trigger effect khi thay đổi

  return {
    localTileId,
    remoteTiles: globalRemoteTiles,
    cleanup,
    toggleMic: useCallback((on: boolean) => ChimeModuleBridge.toggleMic(on), []),
    
    // [SENIOR] Dynamic upgrade handler for Camera
    requestCameraPermissionUpgrade: async () => {
      if (Platform.OS !== 'android') return true;
      try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn("[Chime-Bridge] Camera permission upgrade error:", err);
        return false;
      }
    },
    
    toggleCamera: useCallback(async (on: boolean) => {
      if (on) {
        if (Platform.OS === 'android') {
          try {
            const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert('Chưa cấp quyền', 'Vui lòng cấp quyền Camera để bật Video.');
              return;
            }
          } catch (err) {
            console.warn('[Chime-Bridge] Camera Permission upgrade failed', err);
            return;
          }
        }
      }
      isCameraUserEnabled.current = on;
      return ChimeModuleBridge.toggleCamera(on);
    }, []),
    switchAudioOutput: useCallback((useSpeaker: boolean) => ChimeModuleBridge.switchAudioOutput(!!useSpeaker), []),
    switchCamera: useCallback(async () => {
      try {
        await ChimeModuleBridge.switchCamera();
        console.log('[Chime-Hook] 🔄 Camera switched successfully');
      } catch (error) {
        console.warn('[Chime-Hook] ❌ Failed to switch camera:', error);
      }
    }, []),
    requestPermissions
  };
};
