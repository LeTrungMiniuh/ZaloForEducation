import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, Image, TouchableOpacity, SafeAreaView, 
  Vibration, StyleSheet, PanResponder, Animated, Dimensions 
} from 'react-native';
import { useCallStore } from '../../store/callStore';
import { useAuth } from '../../context/AuthContext';
import { useChime } from '../../hooks/useChime';
import { RNChimeVideoView } from '../../bridge/chime';
import { apiRequest } from '../../utils/api';
import styles from './style/CallOverlay.styles';
import SocketService from '../../utils/socket';

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
    hangupCall,
    resetCall,
    remoteTiles,       // [SENIOR] Pulled from global store
    isRemoteCameraOn   // [SENIOR] Pulled from global store
  } = useCallStore();
  
  const { user } = useAuth();
  const [duration, setDuration] = useState('00:00');
  const [lastDuration, setLastDuration] = useState('00:00');
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(callType === 'video');

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

  // [SENIOR] Draggable PIP State
  const pan = useRef(new Animated.ValueXY({ 
    x: width - 118 - 16, 
    y: height - 168 - 250 
  })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      }
    })
  ).current;

  const { 
    localTileId,
    cleanup, 
    toggleMic: toggleMicChime, 
    toggleCamera: toggleCameraChime,
    switchAudioOutput
  } = useChime();
  
  const timerRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasSyncedRef = useRef(false);

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

  // [PRODUCTION] Handle 30s Timeout for Incoming Call
  useEffect(() => {
    if (callState === 'RINGING' && isIncoming) {
      timeoutRef.current = setTimeout(() => {
        handleReject();
      }, 30000);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [callState, isIncoming]);

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

  // [Web-Chime] Sync UI state with callType
  useEffect(() => {
    if (callState !== 'CONNECTED' || hasSyncedRef.current) return;

    const isVideo = callType === 'video';
    setIsSpeakerOn(isVideo);
    setIsCameraOn(isVideo);
    
    // [SENIOR FIX] Kích hoạt lại Microphone một lần nữa ngay khi đối phương (Web) vào phòng.
    // Nếu Mobile là người gọi, nó phải chờ Web nhấc máy. Trong lúc chờ phòng vắng, Android có thể tự 
    // Sleep AudioRecord. Việc bật lại Mic ở thời khắc CONNECTED sẽ "đánh thức" đường truyền tiếng.
    toggleMicChime(true);
    setIsMicOn(true);
    
    // Nếu là audio call, ép ra loa ngoài (Speaker) lại một lần nữa
    if (!isVideo) {
        switchAudioOutput(true);
    }
    
    hasSyncedRef.current = true;
  }, [callState, callType, toggleMicChime, switchAudioOutput]);

  useEffect(() => {
    if (callState === 'IDLE') {
      hasSyncedRef.current = false;
    }
  }, [callState]);

  // [SENIOR FIX] Đảm bảo dọn dẹp phiên Chime khi Component bị Unmount (đối phương cúp máy dẫn tới unmount)
  useEffect(() => {
    return () => {
      console.log('[CallOverlay] Unmounting... triggering cleanup');
      cleanup();
    };
  }, [cleanup]);

  if (callState === 'IDLE') return null;

  const handleAccept = async () => {
    if (!activeCallId) return;
    try {
      const res = await apiRequest('/call/join', { 
        method: 'POST',
        body: JSON.stringify({
          conversationId, 
          callId: activeCallId 
        })
      });
      
      if (!res.ok) throw new Error(res.message || 'Không thể tham gia cuộc gọi');
      
      const { meeting, attendee } = res;
      acceptCall({ meeting, attendee });
      
      SocketService.socket.emit('call:accept', {
        convId: conversationId,
        callId: activeCallId,
        fromEmail: user.email,
        toEmail: caller.email
      });

      if (callType === 'video') {
        setIsSpeakerOn(true);
        switchAudioOutput(true);
      }
    } catch (err) {
      console.error('Error accepting call:', err);
      resetCall();
    }
  };

  const handleReject = () => {
    SocketService.socket.emit('call:reject', {
      convId: conversationId,
      callId: activeCallId,
      fromEmail: user.email,
      toEmail: isIncoming ? caller.email : receiver.email,
      reason: 'NO_ANSWER'
    });
    cleanup();
    resetCall();
  };

  const handleHangup = async () => {
    try {
      SocketService.socket.emit('call:hangup', {
        convId: conversationId,
        callId: activeCallId,
        fromEmail: user.email,
        toEmail: isIncoming ? caller.email : receiver.email
      });
      
      await apiRequest('/call/hangup', { 
        method: 'POST',
        body: JSON.stringify({ conversationId, callId: activeCallId }) 
      });
      
      cleanup();
      hangupCall();
    } catch (err) {
      console.error('Error hanging up:', err);
      cleanup();
      hangupCall();
    }
  };

  const peer = isIncoming ? caller : receiver;
  const displayName = peer?.fullName || peer?.fullname || peer?.email || 'Người dùng Zalo';
  
  // [V9.0] Avatar URI Safety - use data URI as fallback to avoid empty string warnings
  const FALLBACK_AVATAR = { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' };
  const getAvatarUri = (u) => {
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

      {/* LAYER 3: Name + Timer overlay */}
      <View style={[styles.remoteHeader, { zIndex: 3 }]}>
        <Text style={styles.remoteHeaderName}>{displayName}</Text>
        <Text style={styles.remoteHeaderTimer}>{duration}</Text>
      </View>

      {/* LAYER 4 (top): Local PIP - draggable */}
      <Animated.View
        style={[styles.localPipContainer, pan.getLayout(), { zIndex: 999 }]}
        {...panResponder.panHandlers}
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
          <TouchableOpacity style={[styles.mediaButton, !isMicOn && styles.mediaButtonActive]} onPress={() => { const next = !isMicOn; setIsMicOn(next); toggleMicChime(next); }}>
            <Text style={[styles.mediaIcon, !isMicOn && styles.mediaIconActive]}>{isMicOn ? 'mic' : 'mic_off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, isSpeakerOn && styles.mediaButtonActive]} onPress={() => { const next = !isSpeakerOn; setIsSpeakerOn(next); switchAudioOutput(next); }}>
            <Text style={[styles.mediaIcon, isSpeakerOn && styles.mediaIconActive]}>{isSpeakerOn ? 'volume_up' : 'volume_down'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, !isCameraOn && styles.mediaButtonActive]} onPress={() => { const next = !isCameraOn; setIsCameraOn(next); toggleCameraChime(next); }}>
            <Text style={[styles.mediaIcon, !isCameraOn && styles.mediaIconActive]}>{isCameraOn ? 'videocam' : 'videocam_off'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.hangupButton} onPress={handleHangup} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>call_end</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAudioCall = () => (
    <View style={styles.content}>
      <View style={styles.userInfo}>
        <Image source={avatarSource} style={styles.avatar} />
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.timer}>{duration}</Text>
      </View>

      <View style={styles.ongoingActions}>
        <View style={styles.mediaControls}>
          <TouchableOpacity style={[styles.mediaButton, !isMicOn && styles.mediaButtonActive]} onPress={() => { const next = !isMicOn; setIsMicOn(next); toggleMicChime(next); }}>
            <Text style={[styles.mediaIcon, !isMicOn && styles.mediaIconActive]}>{isMicOn ? 'mic' : 'mic_off'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mediaButton, isSpeakerOn && styles.mediaButtonActive]} onPress={() => { const next = !isSpeakerOn; setIsSpeakerOn(next); switchAudioOutput(next); }}>
            <Text style={[styles.mediaIcon, isSpeakerOn && styles.mediaIconActive]}>{isSpeakerOn ? 'volume_up' : 'volume_down'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.hangupButton} onPress={handleHangup} activeOpacity={0.7}>
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
      <TouchableOpacity style={styles.hangupButton} onPress={handleHangup} activeOpacity={0.7}>
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
    <View style={styles.overlay}>
      <SafeAreaView style={{ flex: 1 }}>
        {callState === 'RINGING' && renderIncoming()}
        {callState === 'CALLING' && renderCalling()}
        {callState === 'CONNECTED' && (callType === 'video' ? renderVideoCall() : renderAudioCall())}
        {callState === 'ENDED' && renderEnded()}
      </SafeAreaView>
    </View>
  );
};

export default CallOverlay;
