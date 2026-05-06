import { useState, useEffect, useRef, useCallback } from 'react';
import { useGroupCallStore } from '../store/groupCallStore';
import { ChimeModuleBridge } from '../bridge/chime';
import { apiPost } from '../utils/api';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import { useAuth } from '../context/AuthContext';
import SocketService from '../utils/socket';

export const useGroupChime = () => {
  const { 
    callId, convId, callType, setConnected, resetGroupCall, callState,
    videoTiles, addVideoTile, removeVideoTile
  } = useGroupCallStore();
  const { user } = useAuth();
  const initialCameraState = callType === 'video';
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(initialCameraState);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  
  const heartbeatIntervalRef = useRef<any>(null);
  const hasJoinedRef = useRef(false);

  const joinMeeting = useCallback(async () => {
    if (!callId || hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    try {
      if (!callId || !convId) {
        console.error('[GroupChime] ❌ Missing callId or convId in store:', { callId, convId });
        throw new Error('Thiếu thông tin cuộc gọi (callId/convId)');
      }

      console.log(`[GroupChime] 🚀 Joining meeting: callId=${callId}, convId=${convId}, type=${callType}`);
      const response = await apiPost('/group-call/join', { 
        callId,
        conversationId: convId,
        userProfile: {
          fullName: user?.fullName || user?.fullname || user?.email,
          avatarUrl: user?.avatarUrl || user?.avatar,
          email: user?.email
        }
      });

      if (!response.ok) {
        throw new Error(response.message || 'Failed to join group call');
      }

      const meetingData = response.meeting || response.data?.meeting;
      const attendeeData = response.attendee || response.data?.attendee;
      const participantsMap = response.participants || response.data?.participants;

      if (participantsMap) {
        useGroupCallStore.getState().setParticipants(participantsMap);
      }

      if (!meetingData?.MeetingId || !attendeeData?.AttendeeId || !attendeeData?.JoinToken) {
        throw new Error('Dữ liệu phiên họp (Meeting/Attendee) không đúng cấu trúc Chime');
      }

      const { status: micStatus } = await Audio.requestPermissionsAsync();
      let camStatus = 'denied';
      if (callType === 'video') {
        const { status } = await Camera.requestCameraPermissionsAsync();
        camStatus = status;
      } else {
        camStatus = 'granted'; // Treat as granted for audio calls to proceed
      }

      if (micStatus !== 'granted' || (callType === 'video' && camStatus !== 'granted')) {
        throw new Error('Cần quyền Camera và Microphone để tham gia cuộc gọi');
      }

      // Start Chime Native Session
      await ChimeModuleBridge.startMeeting(meetingData, attendeeData);
      
      // Start Heartbeat (15s)
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        if (SocketService.socket && callId) {
          SocketService.socket.emit('group-call:heartbeat', {
            callId: callId,
            attendeeId: attendeeData.AttendeeId
          });
        }
      }, 15000);

      // [SENIOR] Ensure we are in the socket room for this conversation
      if (SocketService.socket) {
        console.log(`[GroupChime] 🏠 Joining socket room: ${convId}`);
        SocketService.socket.emit('join_room', { convId: convId });
      }

      // Notify other peers via socket with SSOT profile
      if (SocketService.socket && user?.email) {
        SocketService.socket.emit('group-call:peer_joined', {
          convId: convId,
          callId: callId,
          userEmail: user.email,
          attendeeId: attendeeData.AttendeeId.toLowerCase(),
          participant: {
            email: user.email,
            name: user.fullName || user.fullname || user.email,
            avatar: user.avatarUrl,
            joinedAt: new Date().toISOString(),
            lastSeenAt: Date.now()
          }
        });
      }

      setTimeout(() => {
        ChimeModuleBridge.toggleMic(true);
        ChimeModuleBridge.toggleCamera(callType === 'video');
        setTimeout(() => {
          ChimeModuleBridge.switchAudioOutput(true); 
        }, 500);
      }, 1500);

      setConnected();
    } catch (error) {
      console.error('[GroupChime] ❌ Failed to join meeting:', error);
      hasJoinedRef.current = false;
      resetGroupCall();
    }
  }, [callId, setConnected, resetGroupCall, user]);

  useEffect(() => {
    if (!callId) {
      hasJoinedRef.current = false;
      return;
    }

    console.log('[GroupChime] 👂 Registering listeners for call:', callId);
    const addListener = ChimeModuleBridge.addListener('onVideoTileAdded', (tile: any) => {
      console.log('[GroupChime] 📹 Video Tile Added:', tile);
      // Ensure attendeeId is lowercased
      const normalizedTile = {
        ...tile,
        attendeeId: tile.attendeeId ? tile.attendeeId.toLowerCase() : null
      };
      addVideoTile(normalizedTile);
    });

    const removeListener = ChimeModuleBridge.addListener('onVideoTileRemoved', (tile: any) => {
      console.log('[GroupChime] ❌ Video Tile Removed:', tile);
      removeVideoTile(tile.tileId);
    });

    return () => {
      console.log('[GroupChime] 🧹 Cleaning up listeners...');
      addListener.remove();
      removeListener.remove();
    };
  }, [callId]);

  // Handle meeting cleanup separately to avoid race conditions
  useEffect(() => {
    return () => {
      if (hasJoinedRef.current) {
        console.log('[GroupChime] 🏁 Final cleanup on unmount');
        ChimeModuleBridge.toggleMic(false);
        ChimeModuleBridge.toggleCamera(false);
        ChimeModuleBridge.stopMeeting();
      }
    };
  }, []);

  const toggleMic = () => {
    const newState = !isMicOn;
    ChimeModuleBridge.toggleMic(newState);
    setIsMicOn(newState);
  };

  const toggleCamera = () => {
    const newState = !isCameraOn;
    ChimeModuleBridge.toggleCamera(newState);
    setIsCameraOn(newState);
  };

  const endCall = useCallback(() => {
    console.log('[GroupChime] 🛑 Ending call and releasing hardware...');
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    ChimeModuleBridge.toggleMic(false);
    ChimeModuleBridge.toggleCamera(false);
    ChimeModuleBridge.stopMeeting();
    
    setIsMicOn(false);
    setIsCameraOn(false);
    
    resetGroupCall();
    hasJoinedRef.current = false;
  }, [resetGroupCall]);

  return {
    videoTiles,
    isMicOn,
    isCameraOn,
    isSpeakerOn,
    joinMeeting,
    toggleMic,
    toggleCamera,
    endCall
  };
};
