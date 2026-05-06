import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGroupCallStore } from '../store/groupCallStore';

export const useGroupSocketListeners = () => {
  const { socket } = useAuth();
    const { setIncomingGroupCall, resetGroupCall, updateParticipant, removeParticipant } = useGroupCallStore();
  
    useEffect(() => {
      if (!socket) return;
  
      console.log('[GroupSocket] 🎧 Registering Web Listeners');
  
      const handleInvite = (data: any) => {
        console.log('[GroupSocket] 📞 Incoming Group Call Invite:', data);
        setIncomingGroupCall(data.convId, data.callId, data.callType, data.callerProfile, data.groupName, data.groupAvatar);
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
      console.log('[GroupSocket] 🛑 Call Ended in Room:', data);
      const state = useGroupCallStore.getState();
      // If we are IN this call, reset everything
      if (state.activeCallId === data.callId) {
        state.resetGroupCall();
      } else {
        // Just clear the header indicator if it matches
        if (state.activeCallForConv?.callId === data.callId) {
          state.setActiveCallForConv(null);
        }
      }
    };

    const handlePeerLeft = (data: any) => {
      console.log('[GroupSocket] 🏃 Peer Left:', data);
      if (data.attendeeId) {
        removeParticipant(data.attendeeId.toLowerCase());
      }
    };

    const handleActiveCall = (data: any) => {
      console.log('[GroupSocket] 🔔 Call Active in Room:', data);
      useGroupCallStore.getState().setActiveCallForConv(data);
    };

    socket.on('group-call:incoming', handleInvite);
    socket.on('group-call:peer_joined', handlePeerJoined);
    socket.on('group-call:ended', handleCallEnded);
    socket.on('group-call:peer_left', handlePeerLeft);
    socket.on('group-call:active', handleActiveCall);

    return () => {
      console.log('[GroupSocket] 🚮 Cleaning up Web Listeners');
      socket.off('group-call:incoming', handleInvite);
      socket.off('group-call:peer_joined', handlePeerJoined);
      socket.off('group-call:ended', handleCallEnded);
      socket.off('group-call:peer_left', handlePeerLeft);
      socket.off('group-call:active', handleActiveCall);
    };
  }, [socket, setIncomingGroupCall, resetGroupCall, updateParticipant, removeParticipant]);
};
