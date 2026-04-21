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
    meetingData, attendeeData, callType,
    remoteTiles: globalRemoteTiles
  } = useCallStore();

  const [localTileId, setLocalTileId] = useState(null);
  const isStarted = useRef(false);
  const localTileIdRef = useRef(null);

  useEffect(() => {
    localTileIdRef.current = localTileId;
  }, [localTileId]);

  // Stable ref for meetingData + attendeeData so listeners don't close over stale values
  const metadataRef = useRef({ meetingData: null, attendeeData: null });
  useEffect(() => {
    metadataRef.current = { meetingData, attendeeData };
  }, [meetingData, attendeeData]);

  const requestPermissions = async (isVideo = true) => {
    console.log(`[Chime-Permissions] Checking permissions for ${isVideo ? 'Video' : 'Audio'} call on ${Platform.OS}`);
    
    // On iOS, the Chime Native SDK handles permissions when meeting starts, 
    // but for Android we must request explicitly via PermissionsAndroid.
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const grantedAudio = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      console.log(`[Chime-Permissions] Audio permission result: ${grantedAudio}`);
      if (grantedAudio !== PermissionsAndroid.RESULTS.GRANTED) return false;

      if (isVideo) {
        console.log('[Chime-Permissions] Requesting Camera permission...');
        const grantedVideo = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
        console.log(`[Chime-Permissions] Camera permission result: ${grantedVideo}`);
        if (grantedVideo !== PermissionsAndroid.RESULTS.GRANTED) return false;
      }
      return true;
    } catch (err) {
      console.warn("[Chime-Bridge] Permission error:", err);
      return false;
    }
  };

  const cleanup = useCallback(async () => {
    console.log('[Chime-Bridge] Cleaning up session');
    ChimeModuleBridge.stopMeeting();
    ChimeModuleBridge.removeAllListeners('onVideoTileAdded');
    ChimeModuleBridge.removeAllListeners('onVideoTileRemoved');
    ChimeModuleBridge.removeAllListeners('onMeetingStart');
    
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
    if (isStarted.current || !meetingData || !attendeeData) return;

    console.log('[Chime-Bridge] V10.0 Setup Starting...');
    const hasPermission = await requestPermissions(callType === 'video');
    if (!hasPermission) return;

    try {
      ChimeModuleBridge.addListener('onVideoTileAdded', (tile) => {
        const tileId = tile?.tileId;
        if (tileId === undefined || tileId === null) return;

        // [V10.0] ABSOLUTE TRUST: The native SDK's isLocalTile() computed from actual SFU
        // media flow is the ONLY valid classification source. Attendee ID comparison
        // has been permanently removed — it is unreliable when both peers share the
        // same Chime account (IDs are identical, breaking any comparison logic).
        const isLocal = !!tile?.isLocal;

        console.log(`[Chime-Bridge] 🎥 tileId=${tileId} isLocal=${isLocal} attendeeId=${tile?.attendeeId}`);

        if (isLocal) {
          console.log(`[Chime-Bridge] ✅ LOCAL tile: ${tileId}`);
          setLocalTileId(tileId);
        } else {
          console.log(`[Chime-Bridge] 🌐 REMOTE tile: ${tileId} → pushing to store`);
          // getState() reads+writes atomically — eliminates ALL closure stale-state risk
          const store = useCallStore.getState();
          const currentTiles = store.remoteTiles;
          if (!currentTiles.find(t => t.tileId === tileId)) {
            store.setRemoteTiles([...currentTiles, { ...tile, tileId }]);
            console.log(`[Chime-Bridge] 📡 Store updated. remoteTiles count: ${currentTiles.length + 1}`);
          } else {
            console.log(`[Chime-Bridge] ℹ️ tileId=${tileId} already in store.`);
          }
        }
      });

      ChimeModuleBridge.addListener('onVideoTileRemoved', (tile) => {
        const tileId = tile?.tileId;
        console.log(`[Chime-Bridge] ❌ Tile Removed: ${tileId}`);
        if (tileId === undefined || tileId === null) return;

        if (tileId === localTileIdRef.current) {
          setLocalTileId(null);
        } else {
          // Use getState() for atomic read+write, no stale closure
          const store = useCallStore.getState();
          const nextTiles = store.remoteTiles.filter(t => t.tileId !== tileId);
          store.setRemoteTiles(nextTiles);
        }
      });

      ChimeModuleBridge.addListener('onMeetingStart', () => {
        console.log('[Chime-Bridge] 🌍 SIGNALING CONNECTED');
        // [SENIOR] Ensure Audio and Video are active as soon as signaled
        setTimeout(() => {
          console.log('[Chime-Bridge] 🔊 Unmuting and starting media streams');
          if (ChimeModuleBridge.switchAudioOutput) {
            ChimeModuleBridge.switchAudioOutput(callType === 'video'); // Force speaker for video
          }
          ChimeModuleBridge.toggleMic(true);
          if (callType === 'video') {
            ChimeModuleBridge.toggleCamera(true);
          }
        }, 500);
      });

      console.log('[Chime-Bridge] 🚀 Triggering Native StartMeeting...');
      await ChimeModuleBridge.startMeeting(metadataRef.current.meetingData, metadataRef.current.attendeeData);
      
      await ChimeModuleBridge.toggleMic(true);
      if (callType === 'video') {
        await ChimeModuleBridge.toggleCamera(true);
      }

      isStarted.current = true;
    } catch (err) {
      console.error('[Chime-Bridge] Setup failed:', err);
    }
  }, [meetingData, attendeeData, callType]);

  const isCameraUserEnabled = useRef(callType === 'video');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
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
    if (meetingData && attendeeData) {
      setupSession();
    }
  }, [meetingData, attendeeData, setupSession]);

  return {
    localTileId,
    remoteTiles: globalRemoteTiles,
    cleanup,
    toggleMic: useCallback((on) => ChimeModuleBridge.toggleMic(on), []),
    
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
    
    toggleCamera: useCallback(async (on) => {
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
    switchAudioOutput: useCallback((useSpeaker) => ChimeModuleBridge.switchAudioOutput(!!useSpeaker), []),
    requestPermissions
  };
};
