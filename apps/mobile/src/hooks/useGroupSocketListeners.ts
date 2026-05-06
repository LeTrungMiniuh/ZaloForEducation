import { useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useGroupCallStore } from '../store/groupCallStore';
import SocketService from '../utils/socket';

export const useGroupSocketListeners = () => {
    const { setIncomingGroupCall, resetGroupCall, updateParticipant, removeParticipant } = useGroupCallStore();

    useEffect(() => {
      let socket = SocketService.socket;
      let checkInterval: any;

      const registerListeners = (s: any) => {
        console.log('[GroupSocket] 🎧 Registering Mobile Listeners');
    
        const handleInvite = (data: any) => {
          console.log('[GroupSocket] 📞 Incoming Group Call Invite:', data);
          setIncomingGroupCall(data.convId, data.callId, data.callType, data.fromEmail, data.callerProfile, data.groupName, data.groupAvatar);
        };
    
        const handlePeerJoined = (data: any) => {
          console.log('[GroupSocket] 👥 Peer Joined:', data);
          const attendeeId = data.attendeeId ? data.attendeeId.toLowerCase() : null;
          if (data.participant && attendeeId) {
            updateParticipant(attendeeId, { ...data.participant, status: 'connected' });
          } else if (attendeeId) {
            updateParticipant(attendeeId, { status: 'connected' });
          }
        };

        const handleCallEnded = (data: any) => {
          console.log('[GroupSocket] 🛑 Call Ended by remote', data);
          const state = useGroupCallStore.getState();
          if (state.callId === data.callId) {
            state.resetGroupCall();
          } else {
            state.resetGroupCall(); 
          }
        };

        const handlePeerLeft = (data: any) => {
          console.log('[GroupSocket] 🏃 Peer Left:', data);
          if (data.attendeeId) {
            removeParticipant(data.attendeeId.toLowerCase());
          }
        };

        s.on('group-call:incoming', handleInvite);
        s.on('group-call:peer_joined', handlePeerJoined);
        s.on('group-call:ended', handleCallEnded);
        s.on('group-call:peer_left', handlePeerLeft);

        return () => {
          console.log('[GroupSocket] 🚮 Cleaning up Mobile Listeners');
          s.off('group-call:incoming', handleInvite);
          s.off('group-call:peer_joined', handlePeerJoined);
          s.off('group-call:ended', handleCallEnded);
          s.off('group-call:peer_left', handlePeerLeft);
        };
      };

      let cleanup: (() => void) | undefined;

      if (socket) {
        cleanup = registerListeners(socket);
      } else {
        console.log('[GroupSocket] ⏳ Socket not ready, starting poll...');
        checkInterval = setInterval(() => {
          socket = SocketService.socket;
          if (socket) {
            console.log('[GroupSocket] ✅ Socket found!');
            cleanup = registerListeners(socket);
            clearInterval(checkInterval);
          }
        }, 1000);
      }

      return () => {
        if (checkInterval) clearInterval(checkInterval);
        if (cleanup) cleanup();
      };
    }, [setIncomingGroupCall, resetGroupCall, updateParticipant, removeParticipant]);
};
