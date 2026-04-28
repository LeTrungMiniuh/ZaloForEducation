import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, Text, Image, TouchableOpacity, 
  Vibration, StyleSheet, PanResponder, Animated, Dimensions, Alert 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallStore } from '../../store/callStore';
import { useAuth } from '../../context/AuthContext';
import { useChime } from '../../hooks/useChime';
import { RNChimeVideoView } from '../../bridge/chime';
import { apiRequest } from '../../utils/api';
import styles from './style/CallOverlay.styles';
import SocketService from '../../utils/socket';
import { Audio } from 'expo-av';

const { width, height } = Dimensions.get('window');

/**
 * [SENIOR] CallOverlay Mobile V6.0 - Call Summary
 * Đã tích hợp màn hình kết thúc cuộc gọi với thời gian đàm thoại.
 */
const CallOverlay = () => {
  const { 
    callState, 
    callType, 
    conversationId,
    activeCallId, 
    caller, 
    receiver, 
    startTime, 
    isIncoming, 
    acceptCall, 
    rejectCall,
    hangupCall,
    resetCall,
    remoteTiles,       // [SENIOR] Pulled from global store
    isRemoteCameraOn,  // [SENIOR] Pulled from global store
    upgradeRequestPending,
    incomingUpgradeRequest,
    isMinimized,
    setMinimized,
  } = useCallStore() as any;
  
  const { user } = useAuth() as any;
  const [duration, setDuration] = useState('00:00');
  const [lastDuration, setLastDuration] = useState('00:00');
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  
  // [SENIOR] Moved to Global Store (callStore.js) for one-way flows.
  const { isMicOn, setMicOn, isCameraOn, setCameraOn } = useCallStore() as any;


  // [V10.0] Remote Placeholder fade-out animation only
  // Removed remoteVideoOpacity: SurfaceView cannot be wrapped in opacity: 0
  // on Android Legacy architecture (prevents surface buffer attachment).
  const placeholderOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRemoteCameraOn) {
      Animated.timing(placeholderOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(placeholderOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }
  }, [isRemoteCameraOn]);

  // [SENIOR] LOCAL PIP State (For local camera box in video calls)
  const localPan = useRef(new Animated.ValueXY({ 
    x: width - 118 - 20, 
    y: 150 // Dời xuống một chút để né header
  })).current;
  // [SENIOR FIX] Chọc thẳng vào getState() để tránh Stale Closure
  const localPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !(useCallStore.getState() as any).isMinimized,
      onMoveShouldSetPanResponder: () => !(useCallStore.getState() as any).isMinimized,
      onPanResponderGrant: () => {
        localPan.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: localPan.x, dy: localPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        localPan.flattenOffset();
      }
    })
  ).current;

  // [SENIOR FIX] Xử lý kéo thả và Tap cho màn hình Mini PiP
  const globalPipPan = useRef(new Animated.ValueXY({ x: 20, y: 60 })).current;
  const globalPipPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => (useCallStore.getState() as any).isMinimized,
      onMoveShouldSetPanResponder: () => (useCallStore.getState() as any).isMinimized,
      onPanResponderGrant: () => {
        globalPipPan.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: globalPipPan.x, dy: globalPipPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        globalPipPan.flattenOffset();
        // Kiểm tra xem là TAP hay DRAG (Nếu di chuyển < 10px thì coi là TAP)
        const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;
        if (isTap) {
          (useCallStore.getState() as any).setMinimized(false);
        }
      }
    })
  ).current;

  const { 
    localTileId,
    cleanup, 
    toggleMic: toggleMicChime, 
    toggleCamera: toggleCameraChime,
    switchAudioOutput,
    switchCamera,
    requestCameraPermissionUpgrade,
    requestPermissions
  } = useChime() as any;
  
  const timerRef = useRef<any>(null);
  const timeoutRef = useRef<any>(null);
  const hasSyncedRef = useRef(false);
  const ringtoneSound = useRef<any>(null);
  const ringbackSound = useRef<any>(null);

  const resetAudioMode = useCallback(async () => {
    try {
      const { Audio } = require('expo-av');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      console.log('[CallOverlay] 🛡️ Audio mode reset to system default (released expo-av focus)');
    } catch (e) {
      console.warn('Failed to reset audio mode', e);
    }
  }, []);

  const stopRingtone = useCallback(async () => {
    if (ringtoneSound.current) {
      console.log('[CallOverlay] Manual Stop: Ringtone');
      try {
        await ringtoneSound.current.stopAsync();
        await ringtoneSound.current.unloadAsync();
      } catch (e) {}
      ringtoneSound.current = null;
      await resetAudioMode();
    }
  }, [resetAudioMode]);

  const stopRingback = useCallback(async () => {
    if (ringbackSound.current) {
      console.log('[CallOverlay] Manual Stop: Ringback');
      try {
        await ringbackSound.current.stopAsync();
        await ringbackSound.current.unloadAsync();
      } catch (e) {}
      ringbackSound.current = null;
      await resetAudioMode();
    }
  }, [resetAudioMode]);

  // Handle Duration Timer
  useEffect(() => {
    if (callState === 'CONNECTED' && startTime) {
      timerRef.current = setInterval(() => {
        const diff = Math.floor((Date.now() - startTime) / 1000);
        const mins = Math.floor(diff / 60).toString().padStart(2, '0');
        const secs = (diff % 60).toString().padStart(2, '0');
        const timeStr = `${mins}:${secs}`;
        setDuration(timeStr);
        setLastDuration(timeStr);
      }, 1000);
    } else if (callState !== 'ENDED') {
      if (timerRef.current) clearInterval(timerRef.current);
      setDuration('00:00');
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState, startTime]);

  // [PRODUCTION] Auto-timeout is now handled centrally in callStore.js
  /*
  useEffect(() => {
    if (callState === 'RINGING' && isIncoming) {
      timeoutRef.current = setTimeout(() => {
        handleReject();
      }, 60000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [callState, isIncoming]);
  */

  // Handle Vibration for Incoming Call
  useEffect(() => {
    if (callState === 'RINGING' && isIncoming === true) {
      const pattern = [0, 500, 1000];
      Vibration.vibrate(pattern, true);
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [callState, isIncoming]);

  // [SENIOR] Incoming Call Ringtone Logic (Mobile - expo-av)
  useEffect(() => {
    async function manageRingtone() {
      if (callState === 'RINGING' && isIncoming) {
        try {
          console.log('[Mobile-Call] 🔔 Starting ringtone...');
          
          // [SENIOR] Cấu hình Audio Mode để nhạc chuông kêu kể cả khi để im lặng
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false,
          });

          // Ensure any previous instance is cleared
          if (ringtoneSound.current) {
            try { await ringtoneSound.current.unloadAsync(); } catch(e) {}
            ringtoneSound.current = null;
          }
          
          const { sound } = await Audio.Sound.createAsync(
            require('../../../assets/audio_sound/ringtone.mp3'),
            { shouldPlay: true, isLooping: true }
          );
          ringtoneSound.current = sound;
        } catch (error) {
          console.log('[Mobile-Call] ❌ Error playing ringtone:', error);
        }
      } else {
        if (ringtoneSound.current) {
          console.log('[Mobile-Call] 🔇 Stopping and unloading ringtone...');
          try {
            await ringtoneSound.current.stopAsync();
            await ringtoneSound.current.unloadAsync();
          } catch (e) {
            // Ignore "not loaded" errors
          }
          ringtoneSound.current = null;
        }
      }
    }

    manageRingtone();

    return () => {
      if (ringtoneSound.current) {
        ringtoneSound.current.unloadAsync().catch(() => {});
      }
    };
  }, [callState, isIncoming]);

  // [SENIOR] Ringback Tone Logic (Mobile - expo-av) - For Caller
  useEffect(() => {
    async function manageRingback() {
      if ((callState === 'RINGING' || callState === 'CALLING') && !isIncoming) {
        try {
          console.log('[Mobile-Call] 🛰️ Starting ringback tone...');
          if (ringbackSound.current) {
            try { await ringbackSound.current.unloadAsync(); } catch(e) {}
            ringbackSound.current = null;
          }

          const { sound } = await Audio.Sound.createAsync(
            require('../../../assets/audio_sound/ringback.mp3'),
            { shouldPlay: true, isLooping: true }
          );
          ringbackSound.current = sound;
        } catch (error) {
          console.log('[Mobile-Call] ❌ Error playing ringback:', error);
        }
      } else {
        if (ringbackSound.current) {
          console.log('[Mobile-Call] 🔇 Stopping and unloading ringback...');
          try {
            await ringbackSound.current.stopAsync();
            await ringbackSound.current.unloadAsync();
          } catch (e) {
            // Ignore "not loaded" errors
          }
          ringbackSound.current = null;
        }
      }
    }

    manageRingback();

    return () => {
      if (ringbackSound.current) {
        ringbackSound.current.unloadAsync().catch(() => {});
      }
    };
  }, [callState, isIncoming]);

  // [SENIOR] One-Way Data Flow: Sync Mic Hardware with Store
  useEffect(() => {
    // ✅ [ROOT CAUSE #2 FIX] Only sync hardware when state is truly CONNECTED.
    // Syncing during JOINING or RINGING leads to race conditions with uninitialized sessions.
    if (callState === 'CONNECTED') {
      console.log('[CallOverlay] Syncing Mic Hardware ->', isMicOn);
      toggleMicChime(isMicOn);
    }
  }, [isMicOn, callState, toggleMicChime]);

  // [SENIOR] One-Way Data Flow: Sync Camera Hardware with Store
  useEffect(() => {
    if (callState === 'CONNECTED') {
      console.log('[CallOverlay] Syncing Camera Hardware ->', isCameraOn);
      toggleCameraChime(isCameraOn);
      
      // Auto-switch speaker mode when camera is engaged
      if (isCameraOn) {
        setIsSpeakerOn(true);
        switchAudioOutput(true);
      }
    }
  }, [isCameraOn, callState, toggleCameraChime, switchAudioOutput]);

  // [Web-Chime] Initial sync logic
  useEffect(() => {
    if (callState !== 'CONNECTED' || hasSyncedRef.current) return;
    
    // Initial hardware sync based on invitation type
    const isVideo = callType === 'video';
    setIsSpeakerOn(isVideo);
    switchAudioOutput(isVideo);
    
    hasSyncedRef.current = true;
  }, [callState, callType, switchAudioOutput]);

  useEffect(() => {
    if (callState === 'IDLE' || callState === 'ENDED') {
      hasSyncedRef.current = false;
    }
  }, [callState]);

  // [SENIOR FIX] Đảm bảo dọn dẹp phiên Chime khi Component bị Unmount (đối phương cúp máy dẫn tới unmount)
  useEffect(() => {
    return () => {
      console.log('[CallOverlay] Unmounting... triggering cleanup');
      cleanup('Overlay-Unmount');
    };
  }, [cleanup]);

  const isAcceptingRef = useRef(false);

  if (callState === 'IDLE') return null;

  const handleAccept = async () => {
    if (isAcceptingRef.current) return;
    if (!activeCallId || useCallStore.getState().callState !== 'RINGING') return;
    
    isAcceptingRef.current = true;
    console.log(`[CallOverlay] handleAccept clicked. callType: ${callType}`);

    // [SENIOR] Luôn xin đủ cả 2 quyền (Audio & Video) khi nghe máy sếp nhé!
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      isAcceptingRef.current = false;
      return;
    }

    await stopRingtone();
    
    // ✅ [ROOT CAUSE #5 FIX] Add a small delay (300ms) to allow AudioManager to release
    // the hardware before Chime tries to grab it.
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const res = await apiRequest('/call/join', { 
        method: 'POST',
        body: JSON.stringify({
          conversationId, 
          callId: activeCallId 
        })
      });
      
      if (!res.ok) throw new Error(res.message || 'Không thể tham gia cuộc gọi');
      
      const meetingData = res.data || res;
      const { meeting, attendee } = meetingData;
      
      if (!meeting || !attendee) {
        console.error('[CallOverlay] Missing meeting data in response:', res);
        throw new Error('Dữ liệu cuộc họp không hợp lệ');
      }

      acceptCall({ meeting, attendee });
      
      if (SocketService.socket) {
        (SocketService.socket as any).emit('call:accept', {
          convId: conversationId,
          callId: activeCallId,
          fromEmail: user.email,
          toEmail: caller?.email
          // ✅ KHÔNG gửi meetingInfo để tránh Caller dùng nhầm
        });
      }

      if (callType === 'video') {
        setIsSpeakerOn(true);
        switchAudioOutput(true);
      }

      // [STABLE PATTERN] metadata update in store will trigger setupSession in useChime automatically
      isAcceptingRef.current = false;
    } catch (err) {
      console.error('Error accepting call:', err);
      isAcceptingRef.current = false;
      resetCall();
    }
  };

  const handleReject = () => {
    if (SocketService.socket) {
      (SocketService.socket as any).emit('call:reject', {
        convId: conversationId,
        callId: activeCallId,
        fromEmail: user.email,
        toEmail: isIncoming ? caller.email : receiver.email,
        reason: 'NO_ANSWER'
      });
    }
    cleanup('Overlay-Reject');
    rejectCall();
  };

  const handleHangup = async () => {
    const currentStore = useCallStore.getState();
    const now = Date.now();
    const start = currentStore.startTime;

    console.log('[Mobile-Hangup] 🛡️ Guard Check:', { 
      now, 
      start, 
      diff: start ? now - start : 'N/A',
      callState: currentStore.callState 
    });

    if (start && (now - start) < 5000) {
      console.warn('[Mobile-Hangup] 🛡️ BLOCKED — call just started', now - start, 'ms ago');
      return;
    }

    console.log('[Mobile-Hangup] 🚀 handleHangup executing...');
    try {
      const durationSec = (currentStore.callState === 'CONNECTED' && start) 
        ? Math.floor((now - start) / 1000) 
        : 0;

      if (SocketService.socket) {
        (SocketService.socket as any).emit('call:hangup', {
          convId: conversationId,
          callId: activeCallId,
          fromEmail: user.email,
          toEmail: isIncoming ? caller.email : receiver.email,
          duration: durationSec,
          callType: callType
        });
      }
      
      await apiRequest('/call/hangup', { 
        method: 'POST',
        body: JSON.stringify({ 
          conversationId, 
          callId: activeCallId,
          duration: durationSec,
          callType: callType
        }) 
      });
      
      cleanup('Overlay-Hangup');
      hangupCall();
    } catch (err) {
      console.error('Error hanging up:', err);
      cleanup('Overlay-Hangup-Error');
      hangupCall();
    }
  };

  const peer = isIncoming ? caller : receiver;
  const displayName = peer?.fullName || peer?.fullname || peer?.email || 'Người dùng Zalo';
  
  // [V9.0] Avatar URI Safety - use data URI as fallback to avoid empty string warnings
  const FALLBACK_AVATAR = { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
  const getAvatarUri = (u: any) => {
    const raw = u?.avatarUrl || u?.avatar;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return { uri: raw.trim() };
    }
    return FALLBACK_AVATAR;
  };

  const avatarSource = getAvatarUri(peer);
  const localAvatarSource = getAvatarUri(user);
  
  const remoteTile = remoteTiles.length > 0 ? remoteTiles[0] : null;
  const isLocalCameraOn = isCameraOn && localTileId !== null && localTileId !== undefined;

  const handleToggleCamera = async () => {
    if (callType === 'audio') {
      // [SENIOR] CHECK PERMISSION BEFORE SIGNALING SENDER REQUEST
      const hasPermission = await requestCameraPermissionUpgrade();
      if (!hasPermission) return;

      (useCallStore.getState() as any).setUpgradeRequestPending(true);
      if (SocketService.socket && conversationId && activeCallId) {
        (SocketService.socket as any).emit('call:upgrade_request', {
          convId: conversationId,
          callId: activeCallId,
          toEmail: isIncoming ? caller.email : receiver.email,
          fromProfile: user,
        });

        // [SENIOR] 25s sender-side timeout (fallback)
        setTimeout(() => {
          const checkState = useCallStore.getState() as any;
          if (checkState.upgradeRequestPending && checkState.activeCallId === activeCallId) {
            console.log('[Mobile-Chime] Upgrade request timed out on sender side');
            (useCallStore.getState() as any).setUpgradeRequestPending(false);
          }
        }, 25000);
      }
      return;
    }
    
    // Normal Toggle: JUST UPDATE THE STORE (Effect handles hardware)
    setCameraOn(!isCameraOn);
  };

  const handleAcceptUpgrade = async () => {
    (useCallStore.getState() as any).setIncomingUpgradeRequest(false);
    
    // [SENIOR] CHECK PERMISSION BEFORE ACCEPTING
    const hasPermission = await requestCameraPermissionUpgrade();
    if (!hasPermission) {
      (SocketService.socket as any).emit('call:upgrade_declined', {
        convId: conversationId,
        callId: activeCallId,
        toEmail: isIncoming ? caller.email : receiver.email,
      });
      return; 
    }

    (useCallStore.getState() as any).setCallType('video');
    setCameraOn(true);

    (SocketService.socket as any).emit('call:upgrade_accepted', {
      convId: conversationId,
      callId: activeCallId,
      toEmail: isIncoming ? caller.email : receiver.email,
    });
  };

  const handleRejectUpgrade = () => {
    (useCallStore.getState() as any).setIncomingUpgradeRequest(false);
    if (SocketService.socket) {
      (SocketService.socket as any).emit('call:upgrade_declined', {
        convId: conversationId,
        callId: activeCallId,
        toEmail: isIncoming ? caller.email : receiver.email,
      });
    }
  };

  const renderIncoming = () => (
    <View style={[styles.content, { backgroundColor: 'transparent' }]}>
      <View style={styles.userInfo}>
        <Image source={avatarSource} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>Đang gọi {callType === 'video' ? 'video...' : 'thoại...'}</Text>
      </View>

      <View style={styles.incomingActions}>
        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={handleReject}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>call_end</Text>
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Từ chối</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={handleAccept}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIcon}>{callType === 'video' ? 'videocam' : 'call'}</Text>
          </TouchableOpacity>
          <Text style={styles.actionLabel}>Trả lời</Text>
        </View>
      </View>
    </View>
  );

  const renderVideoCall = () => (
    <View style={[styles.videoStage, { backgroundColor: 'black' }]}>
      {/* LAYER 1 (bottom): Placeholder - always rendered, fades out when video arrives */}
      <Animated.View
        style={[styles.cameraOffContainer, { opacity: placeholderOpacity, zIndex: 1 }]}
        pointerEvents="none"
      >
        <Image source={avatarSource} style={styles.cameraOffAvatar} />
        <Text style={styles.cameraOffIcon}>videocam_off</Text>
        <Text style={styles.cameraOffTitle}>{displayName} đã tắt camera</Text>
      </Animated.View>

      {/* LAYER 2: Remote Video - mounts directly when remote camera is ON, NO opacity wrappers */}
      {remoteTile && isRemoteCameraOn && (
        <View style={[StyleSheet.absoluteFillObject, { zIndex: 2, backgroundColor: 'transparent' }]} pointerEvents="none">
          <RNChimeVideoView
            tileId={remoteTile.tileId}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'transparent' }]}
          />
        </View>
      )}

      {/* LAYER 3: Top Left - Minimize Button (Sếp yêu cầu để ở đây cho hợp lý) */}
      <TouchableOpacity 
        onPress={() => setMinimized(true)}
        style={{ 
          position: 'absolute', 
          top: 60, 
          left: 20, 
          zIndex: 10,
          backgroundColor: 'rgba(0,0,0,0.4)',
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)'
        }}
      >
        <Text style={[styles.actionIcon, { fontSize: 22 }]}>close_fullscreen</Text>
      </TouchableOpacity>

      {/* LAYER 3.1: Top Right - Flip Camera Button (Chỉ hiện khi bật cam) */}
      {isCameraOn && (
        <TouchableOpacity 
          onPress={switchCamera}
          style={{ 
            position: 'absolute', 
            top: 60, 
            right: 20, 
            zIndex: 10,
            backgroundColor: 'rgba(0,0,0,0.4)',
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)'
          }}
        >
          <Text style={[styles.actionIcon, { fontSize: 22 }]}>flip_camera_android</Text>
        </TouchableOpacity>
      )}

      {/* LAYER 3.5: Name + Timer overlay */}
      <View style={[styles.remoteHeader, { zIndex: 3 }]}>
        <Text style={styles.remoteHeaderName}>{displayName}</Text>
        <Text style={styles.remoteHeaderTimer}>{duration}</Text>
      </View>

      {/* LAYER 4 (top): Local PIP - draggable inside full-screen */}
      <Animated.View
        style={[styles.localPipContainer, localPan.getLayout(), { zIndex: 999 }]}
        {...localPanResponder.panHandlers}
      >
        {isLocalCameraOn ? (
          <RNChimeVideoView tileId={localTileId} onTop={true} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={styles.localCameraOff}>
            <Image source={localAvatarSource} style={styles.localAvatar} />
            <Text style={styles.localCameraOffIcon}>videocam_off</Text>
          </View>
        )}
        <View style={styles.localPipBadge}>
          <Text style={styles.localPipBadgeText}>Bạn</Text>
        </View>
      </Animated.View>

      {/* LAYER 5 (top): Controls overlay */}
      <View style={[styles.ongoingActions, styles.videoControlOverlay, { zIndex: 998 }]}>
        <View style={styles.mediaControls}>
          <TouchableOpacity style={[styles.mediaButton, !isMicOn && styles.mediaButtonActive]} onPress={() => setMicOn(!isMicOn)}>
            <Text style={[styles.mediaIcon, !isMicOn && styles.mediaIconActive]}>{isMicOn ? 'mic' : 'mic_off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, isSpeakerOn && styles.mediaButtonActive]} onPress={() => { const next = !isSpeakerOn; setIsSpeakerOn(next); switchAudioOutput(next); }}>
            <Text style={[styles.mediaIcon, isSpeakerOn && styles.mediaIconActive]}>{isSpeakerOn ? 'volume_up' : 'volume_down'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, !isCameraOn && styles.mediaButtonActive]} onPress={handleToggleCamera}>
            <Text style={[styles.mediaIcon, !isCameraOn && styles.mediaIconActive]}>{isCameraOn ? 'videocam' : 'videocam_off'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.hangupButton} onPress={() => handleHangup()} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>call_end</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAudioCall = () => (
    <View style={styles.content}>
      <TouchableOpacity 
        onPress={() => setMinimized(true)}
        style={{ 
          position: 'absolute', 
          top: 60, 
          left: 20, 
          zIndex: 10,
          backgroundColor: 'rgba(255,255,255,0.1)',
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)'
        }}
      >
        <Text style={[styles.actionIcon, { fontSize: 22, color: '#fff' }]}>close_fullscreen</Text>
      </TouchableOpacity>

      <View style={styles.userInfo}>
        <Image source={avatarSource} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.timer}>{duration}</Text>
      </View>

      <View style={styles.ongoingActions}>
        <View style={styles.mediaControls}>
          <TouchableOpacity style={[styles.mediaButton, !isMicOn && styles.mediaButtonActive]} onPress={() => setMicOn(!isMicOn)}>
            <Text style={[styles.mediaIcon, !isMicOn && styles.mediaIconActive]}>{isMicOn ? 'mic' : 'mic_off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, isSpeakerOn && styles.mediaButtonActive]} onPress={() => { const next = !isSpeakerOn; setIsSpeakerOn(next); switchAudioOutput(next); }}>
            <Text style={[styles.mediaIcon, isSpeakerOn && styles.mediaIconActive]}>{isSpeakerOn ? 'volume_up' : 'volume_down'}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.mediaButton, upgradeRequestPending && { backgroundColor: 'rgba(59,130,246,0.3)', opacity: 0.8 }]} 
            onPress={handleToggleCamera}
            disabled={upgradeRequestPending}
          >
            <Text style={[styles.mediaIcon]}>{upgradeRequestPending ? 'hourglass_empty' : 'videocam'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.hangupButton} onPress={() => handleHangup()} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>call_end</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCalling = () => (
    <View style={styles.content}>
      <View style={styles.userInfo}>
        <Image source={avatarSource} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.status}>Đang kết nối...</Text>
      </View>
      <TouchableOpacity style={styles.hangupButton} onPress={() => handleHangup()} activeOpacity={0.7}>
        <Text style={styles.actionIcon}>call_end</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEnded = () => (
    <View style={styles.content}>
      <View style={styles.userInfo}>
        <Image source={avatarSource} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={[styles.status, { color: '#ff3b30', fontWeight: 'bold', marginTop: 10 }]}>Cuộc gọi đã kết thúc</Text>
        {lastDuration !== '00:00' && (
          <View style={{ backgroundColor: '#f2f2f7', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, marginTop: 15 }}>
            <Text style={{ fontSize: 18, color: '#333', fontWeight: 'bold' }}>{lastDuration}</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <Animated.View 
      style={[
        styles.overlay,
        isMinimized && {
          width: 160,
          height: 220,
          borderRadius: 24,
          overflow: 'hidden',
          top: 0,
          left: 0,
          bottom: undefined,
          right: undefined,
          ...globalPipPan.getLayout(), // getLayout() provides {left, top}
          borderWidth: 3, // Làm viền dầy lên cho sếp thấy rõ
          borderColor: 'rgba(255,255,255,0.5)',
          elevation: 50, // Nổi cao nhất có thể
          backgroundColor: '#000',
        }
      ]}
      {...(isMinimized ? globalPipPanResponder.panHandlers : {})}
    >
      {isMinimized && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {callType === 'video' ? (
            <View style={{ flex: 1, backgroundColor: '#000' }}>
               {remoteTile && isRemoteCameraOn ? (
                  <RNChimeVideoView
                    tileId={remoteTile.tileId}
                    style={StyleSheet.absoluteFillObject}
                  />
               ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={avatarSource} style={{ width: 60, height: 60, borderRadius: 30 }} />
                    <Text style={{ color: '#fff', fontSize: 10, marginTop: 8 }}>Camera ẩn</Text>
                  </View>
               )}
               <View style={{ position: 'absolute', bottom: 10, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{duration}</Text>
               </View>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c1c2e' }}>
              <Image source={avatarSource} style={{ width: 70, height: 70, borderRadius: 35, marginBottom: 12 }} />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{duration}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 }}>Đang thoại...</Text>
            </View>
          )}
        </View>
      )}

      {!isMinimized && (
        <SafeAreaView style={{ flex: 1 }}>
          {callState === 'RINGING' && renderIncoming()}
          {(callState === 'CALLING' || callState === 'JOINING') && renderCalling()}
          {callState === 'CONNECTED' && (callType === 'video' ? renderVideoCall() : renderAudioCall())}
          {callState === 'ENDED' && renderEnded()}
          
          {incomingUpgradeRequest && callState === 'CONNECTED' && (
            <View style={{position: 'absolute', top: 60, left: 20, right: 20, backgroundColor: 'rgba(28,28,46,0.95)', padding: 16, borderRadius: 16, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, zIndex: 9999}}>
              <Text style={{color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 16, textAlign: 'center'}}>{displayName} muốn chuyển sang cuộc gọi Video</Text>
              <View style={{flexDirection: 'row', gap: 10}}>
                <TouchableOpacity onPress={handleAcceptUpgrade} style={{flex: 1, backgroundColor: '#16a34a', paddingVertical: 10, borderRadius: 10, alignItems: 'center'}}>
                  <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 13}}>Đồng ý</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRejectUpgrade} style={{flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', paddingVertical: 10, borderRadius: 10, alignItems: 'center'}}>
                  <Text style={{color: '#fff', fontWeight: 'bold', fontSize: 13}}>Từ chối</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </SafeAreaView>
      )}
    </Animated.View>
  );
};

export default CallOverlay;
