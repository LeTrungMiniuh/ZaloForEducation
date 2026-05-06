import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  FlatList,
  Image,
  PanResponder,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useGroupCallStore, Participant } from '../../store/groupCallStore';
import { useChatStore } from '../../store/chatStore';
import { useGroupChime } from '../../hooks/useGroupChime';
import { RNChimeVideoView } from '../../bridge/chime';
import { Colors, Typography } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';
import SocketService from '../../utils/socket';
import { apiPost } from '../../utils/api';
import { useGroupSocketListeners } from '../../hooks/useGroupSocketListeners';
import SoundService from '../../utils/SoundService';
import { Vibration, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

const GroupCallOverlay = () => {
  // useGroupSocketListeners(); // [SENIOR] Moved to App.tsx for global scope
  const { 
    callState, 
    convId, 
    callId, 
    fromEmail, 
    peerProfile, 
    groupName, 
    groupAvatar, 
    participants, 
    ringingEmails, 
    isMinimized,
    callType,
    startJoining, 
    resetGroupCall,
    toggleMinimized
  } = useGroupCallStore();

  const {
    videoTiles,
    isMicOn,
    isCameraOn,
    joinMeeting,
    toggleMic,
    toggleCamera,
    endCall,
  } = useGroupChime();

  const pan = useRef(new Animated.ValueXY({ x: width - 100, y: height - 150 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        pan.flattenOffset();
        // [SENIOR] Detect Tap vs Drag
        const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;
        if (isTap) {
          toggleMinimized(false);
        }
      }
    })
  ).current;

  const { user } = useAuth();
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (callState === 'JOINING') {
      joinMeeting();
    }
    if (callState === 'CONNECTED') {
      const timer = setTimeout(() => setVideoReady(true), 500);
      return () => clearTimeout(timer);
    } else {
      setVideoReady(false);
    }
  }, [callState, joinMeeting]);

  useEffect(() => {
    const hasRinging = ringingEmails.length > 0;
    
    if (callState === 'RINGING') {
      SoundService.playRingtone();
      if (Platform.OS !== 'web') {
        Vibration.vibrate([0, 500, 1000], true);
      }
    } else if (callState === 'JOINING' || (callState === 'CONNECTED' && hasRinging)) {
      SoundService.stopRingtone();
      SoundService.playRingback();
      if (Platform.OS !== 'web') Vibration.cancel();
    } else {
      SoundService.stopAll();
      if (Platform.OS !== 'web') Vibration.cancel();
    }

    return () => {
      SoundService.stopAll();
      if (Platform.OS !== 'web') Vibration.cancel();
    };
  }, [callState]);

  const handleHangup = async () => {
    // [SENIOR] Identify which attendee is hanging up
    const myAttendeeId = Object.keys(participants).find(id => participants[id].email === user?.email);
    
    if (SocketService.socket && convId && callId && user?.email && myAttendeeId) {
      SocketService.socket.emit('group-call:hangup', {
        convId,
        callId,
        userEmail: user.email,
        attendeeId: myAttendeeId
      });

      try {
        await apiPost('/group-call/hangup', { 
          conversationId: convId, 
          callId,
          attendeeId: myAttendeeId
        });
      } catch (e) {}
    }

    endCall();
  };

  if (callState === 'IDLE') return null;

  if (isMinimized && (callState === 'CONNECTED' || callState === 'JOINING')) {
    return (
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          pan.getLayout(),
          styles.minimizedBubble
        ]}
      >
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => toggleMinimized(false)}
          style={styles.bubbleInner}
        >
          {videoTiles.length > 0 && isCameraOn ? (
            <RNChimeVideoView
              tileId={videoTiles[0].tileId}
              style={styles.bubbleVideo}
            />
          ) : (
            <View style={styles.bubblePlaceholder}>
               <Text style={styles.bubbleInitial}>
                 {(groupName || '?').charAt(0).toUpperCase()}
               </Text>
            </View>
          )}
          <View style={styles.bubbleBadge}>
             <Text style={styles.bubbleBadgeText}>{Object.keys(participants).length}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  const participantsList = Object.values(participants);
  const activeGridCount = Math.max(participantsList.length, videoTiles.length, ringingEmails.length);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <LinearGradient
        colors={['#0f172a', '#1e293b']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header Controls */}
        <View style={styles.headerControls}>
          <TouchableOpacity 
            onPress={() => toggleMinimized(true)}
            style={styles.minimizeBtn}
          >
            <Text style={styles.headerIcon}>keyboard_arrow_down</Text>
          </TouchableOpacity>
        </View>
        {/* --- RINGING STATE --- */}
        {callState === 'RINGING' && (
          <View style={styles.incomingWrapper}>
            <View style={styles.avatarCircle}>
              {groupAvatar ? (
                <Image source={{ uri: groupAvatar }} style={styles.groupAvatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {(groupName || peerProfile?.fullName || fromEmail || '')?.charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.callerName}>{groupName || peerProfile?.fullName || 'Nhóm ZaloEdu'}</Text>
            <Text style={styles.callTypeLabel}>Cuộc gọi video nhóm mới...</Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                onPress={resetGroupCall}
                style={[styles.actionBtn, styles.declineBtn]}
              >
                <Text style={styles.btnIcon}>call_end</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => startJoining(convId!, callId!, callType || 'video', groupName || undefined, groupAvatar || undefined, ringingEmails)}
                style={[styles.actionBtn, styles.acceptBtn]}
              >
                <Text style={styles.btnIcon}>call</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* --- JOINING STATE --- */}
        {callState === 'JOINING' && (
          <View style={styles.centerContent}>
            <View style={styles.callingHeader}>
              {groupAvatar ? (
                <Image source={{ uri: groupAvatar }} style={styles.callingAvatar} />
              ) : (
                <View style={[styles.callingAvatar, styles.callingAvatarPlaceholder]}>
                  <Text style={styles.callingPlaceholderText}>{groupName?.charAt(0) || 'G'}</Text>
                </View>
              )}
              <Text style={styles.callingName}>{groupName || 'Cuộc gọi nhóm'}</Text>
              <Text style={styles.callingStatus}>Đang kết nối...</Text>
            </View>
            <ActivityIndicator size="large" color="#fff" style={{ marginTop: 40 }} />
            
            <TouchableOpacity 
              onPress={resetGroupCall}
              style={[styles.hangupBtnLarge, { marginTop: 100 }]}
            >
              <Text style={styles.controlIcon}>call_end</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* --- CONNECTED STATE --- */}
        {callState === 'CONNECTED' && (
          <View style={styles.connectedWrapper}>
            <View style={styles.videoGridContainer}>
              {participantsList.length === 0 && videoTiles.length === 0 && ringingEmails.length === 0 ? (
                <View style={styles.emptyVideo}>
                  <ActivityIndicator color="rgba(255,255,255,0.5)" />
                  <Text style={styles.emptyText}>Đang khởi tạo...</Text>
                </View>
              ) : (
                <FlatList
                  key={`grid-${activeGridCount > 2 ? 2 : 1}`}
                  data={(() => {
                    // [SENIOR] SSOT Reactive Merging Logic
                    let items: any[] = [];
                    
                    // 1. All video tiles
                    videoTiles.forEach(tile => {
                      const id = tile.attendeeId ? tile.attendeeId.toLowerCase() : '';
                      const p = participants[id];
                      
                      // [SENIOR] Show the tile even if we don't have profile yet (UX resilience)
                      // Rule 3 is relaxed for better debugging and immediate feedback
                      items.push({
                        attendeeId: id,
                        email: p?.email || 'unknown',
                        name: p?.name || (tile.isLocal ? 'Bạn' : 'Đang tham gia...'),
                        tileId: tile.tileId,
                        isVideoActive: true,
                        isLocal: tile.isLocal,
                        status: 'connected'
                      });
                    });

                    // 2. Connected but no video (camera off)
                    Object.entries(participants || {}).forEach(([id, p]) => {
                      if (!id || !p) return;
                      const hasTile = videoTiles.some(t => t.attendeeId && t.attendeeId.toLowerCase() === id.toLowerCase());
                      if (!hasTile) {
                        items.push({
                          attendeeId: id,
                          ...p as any,
                          isVideoActive: false,
                          isLocal: (p as any).email === user?.email,
                          status: 'connected'
                        });
                      }
                    });

                    // 3. Ringing (Only those who haven't joined yet and are NOT the initiator)
                    ringingEmails.forEach(email => {
                      if (!email) return;
                      const emailLower = email.toLowerCase();
                      const alreadyJoined = Object.values(participants).some((p: any) => p.email?.toLowerCase() === emailLower);
                      if (!alreadyJoined) {
                        items.push({
                          email: emailLower,
                          status: 'ringing',
                          isVideoActive: false,
                          isLocal: false
                        });
                      }
                    });

                    return items;
                  })()}
                  keyExtractor={(item) => `${item.tileId || 'no-tile'}-${item.attendeeId || item.email}`}
                  numColumns={activeGridCount > 2 ? 2 : 1}
                  renderItem={({ item }) => (
                    <View style={[
                      styles.videoTileContainer,
                      activeGridCount <= 1 && { height: height * 0.6 }
                    ]}>
                      {item.isVideoActive && item.tileId !== undefined ? (
                        <RNChimeVideoView
                          tileId={item.tileId}
                          style={styles.videoTile}
                        />
                      ) : (
                        <View style={styles.placeholderContainer}>
                          <View style={styles.placeholderAvatar}>
                            <Text style={styles.placeholderText}>
                              {(item.name || item.email || '?').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.cameraOffText}>
                            {item.status === 'ringing' ? 'Đang đổ chuông...' : 'Camera tắt'}
                          </Text>
                        </View>
                      )}
                      <View style={styles.tileOverlay}>
                        <Text style={styles.tileName} numberOfLines={1}>
                          {item.isLocal ? 'Bạn' : (item.name || item.fullName || (item.email && item.email !== 'unknown' ? item.email.split('@')[0] : 'Người dùng'))}
                        </Text>
                      </View>
                    </View>
                  )}
                />
              )}
            </View>

            {/* Controls Bar */}
            <BlurView intensity={20} style={styles.controlsBar}>
              <TouchableOpacity onPress={toggleMic} style={[styles.controlBtn, !isMicOn && styles.btnOff]}>
                <Text style={[styles.controlIcon, !isMicOn && styles.iconOff]}>
                  {isMicOn ? 'mic' : 'mic_off'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={toggleCamera} style={[styles.controlBtn, !isCameraOn && styles.btnOff]}>
                <Text style={[styles.controlIcon, !isCameraOn && styles.iconOff]}>
                  {isCameraOn ? 'videocam' : 'videocam_off'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleHangup} style={[styles.controlBtn, styles.hangupBtn]}>
                <Text style={styles.controlIcon}>call_end</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  safeArea: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  incomingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 24,
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  groupAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  callerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  callTypeLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 40,
  },
  incomingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  incomingSub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 60,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 40,
  },
  actionBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
  },
  acceptBtn: {
    backgroundColor: '#22c55e',
  },
  declineBtn: {
    backgroundColor: '#ef4444',
  },
  btnIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  connectedWrapper: {
    flex: 1,
  },
  videoGridContainer: {
    flex: 1,
    padding: 8,
  },
  videoTileContainer: {
    flex: 1,
    height: height * 0.3,
    margin: 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  videoTile: {
    flex: 1,
  },
  tileOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  placeholderText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  cameraOffText: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  tileName: {
    color: '#fff',
    fontSize: 12,
  },
  emptyVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 20,
    paddingBottom: 40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupBtn: {
    backgroundColor: '#ef4444',
  },
  btnOff: {
    backgroundColor: '#fff',
  },
  controlIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  iconOff: {
    color: '#000',
  },
  callingHeader: {
    alignItems: 'center',
    marginTop: 60,
  },
  callingAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 24,
  },
  callingAvatarPlaceholder: {
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callingPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  callingName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  callingStatus: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  hangupBtnLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerControls: {
    paddingHorizontal: 20,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  minimizeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  minimizedBubble: {
    position: 'absolute',
    width: 80,
    height: 110,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    zIndex: 9999,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  bubbleInner: {
    flex: 1,
  },
  bubbleVideo: {
    flex: 1,
  },
  bubblePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
  },
  bubbleInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  bubbleBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

export default GroupCallOverlay;
