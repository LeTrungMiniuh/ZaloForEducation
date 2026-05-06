import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useGroupCallStore } from '../../store/groupCallStore';
import { useAuth } from '../../context/AuthContext';

const IncomingGroupCallModal: React.FC = () => {
  const { user, socket } = useAuth();
  const { 
    callState, 
    conversationId, 
    activeCallId, 
    peerProfile, 
    groupName,
    groupAvatar,
    callType,
    resetGroupCall,
    joinMeeting 
  } = useGroupCallStore();

  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (callState === 'RINGING') {
      ringtoneRef.current = new Audio('/audio_sound/ringtone.mp3');
      ringtoneRef.current.loop = true;
      ringtoneRef.current.play().catch(() => {});
    } else {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
    }
    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
      }
    };
  }, [callState]);

  const handleAccept = async () => {
    try {
      if (!conversationId || !activeCallId) return;
      await joinMeeting(conversationId, activeCallId, callType || 'video', user);
      
      if (socket) {
        socket.emit('group-call:accept', {
          convId: conversationId,
          callId: activeCallId,
        });
      }
    } catch (e) {
      alert('Không thể tham gia cuộc gọi nhóm');
      resetGroupCall();
    }
  };

  const handleDecline = () => {
    resetGroupCall();
  };

  if (callState !== 'RINGING') return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1e] w-full max-w-sm rounded-[32px] p-8 text-center border border-white/5 shadow-2xl animate-in zoom-in duration-300">
        <div className="mb-6 flex flex-col items-center">
          <div className="relative mb-4">
            <img 
              src={groupAvatar || peerProfile?.avatarUrl || '/logo_blue.png'} 
              className="w-24 h-24 rounded-full object-cover border-4 border-blue-500/30"
              alt=""
            />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center border-2 border-[#1a1a1e]">
              <Phone size={14} className="text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white">{groupName || peerProfile?.fullName || 'Nhóm ZaloEdu'}</h2>
          <p className="text-blue-400 font-semibold text-sm mt-1">Cuộc gọi nhóm mới...</p>
        </div>
        
        <p className="text-white/50 mb-8 text-sm">Bạn có một lời mời tham gia cuộc gọi video nhóm</p>
        
        <div className="flex justify-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={handleDecline}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20"
            >
              <PhoneOff size={28} />
            </button>
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Từ chối</span>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <button 
              onClick={handleAccept}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-all shadow-lg shadow-green-500/20 animate-bounce"
            >
              <Phone size={28} />
            </button>
            <span className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Tham gia</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncomingGroupCallModal;
