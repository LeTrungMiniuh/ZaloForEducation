import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const IncomingCallModal: React.FC = () => {
  const {
    callState,
    peerProfile,
    conversationId,
    callType,
    toEmail,
    resetCall,
    acceptCall,
    setMeetingData,
  } = useCallStore();

  const { socket } = useAuth();
  const [timeLeft, setTimeLeft] = useState(30);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  // Reset countdown khi modal mở lại
  useEffect(() => {
    if (callState === 'RINGING') {
      setTimeLeft(30);
    }
  }, [callState]);

  // Countdown timer — tự động từ chối sau 30s
  useEffect(() => {
    if (callState === 'RINGING') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            resetCall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [callState, resetCall]);

  // Camera preview cho video call
  useEffect(() => {
    let stream: MediaStream | null = null;

    if (callState === 'RINGING' && callType === 'video') {
      const startPreview = async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          setPreviewStream(stream);
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error('[IncomingCall] Camera preview failed:', err);
        }
      };
      startPreview();
    }

    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (previewVideoRef.current?.srcObject) {
        (previewVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        previewVideoRef.current.srcObject = null;
      }
      setPreviewStream(null);
    };
  }, [callState, callType]);

  const handleAccept = async () => {
    // Dừng camera preview để giải phóng hardware trước khi Chime chiếm
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
      setPreviewStream(null);
    }
    if (previewVideoRef.current?.srcObject) {
      (previewVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      previewVideoRef.current.srcObject = null;
    }

    // Chờ OS release hardware
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const res = await api.post('/call/join', { conversationId });
      const data = res.data;

      setMeetingData(data.meeting, data.attendee, data.callType);
      acceptCall();

      // Thông báo cho caller biết callee đã join → hiển thị "Đang trò chuyện"
      if (toEmail && socket) {
        socket.emit('call:peer_joined', {
          convId: conversationId,
          toEmail,
        });
      }
    } catch (error) {
      console.error('[IncomingCall] Accept error:', error);
      resetCall();
    }
  };

  const handleDecline = () => {
    // Notify caller
    if (toEmail && socket && conversationId) {
      socket.emit('call:hangup', { convId: conversationId, toEmail });
    }
    resetCall();
  };

  if (callState !== 'RINGING') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
      <div className="bg-[#1c1c1e] text-white rounded-[48px] p-10 w-full max-w-sm shadow-2xl border border-white/10 flex flex-col items-center text-center overflow-hidden">

        {/* Call type indicator */}
        <div className="mb-8">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-blue-500 mb-4 opacity-80">
            {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
          </div>
          <h3 className="text-3xl font-black mb-1">
            {peerProfile?.fullName || peerProfile?.fullname || peerProfile?.email || 'ZaloEdu User'}
          </h3>
          <p className="text-white/40 font-medium">Đang gọi cho bạn...</p>
        </div>

        {/* Avatar / Camera Preview */}
        <div className="relative w-48 h-48 mb-10">
          {callType === 'video' ? (
            <div className="w-full h-full rounded-[40px] overflow-hidden bg-black border-4 border-blue-500/30 shadow-2xl relative">
              <video
                ref={previewVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-0 right-0 text-[10px] font-black uppercase tracking-widest text-white/50">
                Xem trước
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" style={{ animationDuration: '3s' }} />
              <img
                src={peerProfile?.avatarUrl || peerProfile?.avatar || `https://i.pravatar.cc/150?u=${peerProfile?.email}`}
                className="w-full h-full rounded-full object-cover border-4 border-white/10 relative z-10"
                alt="caller"
              />
            </div>
          )}

          <div className={`absolute -bottom-2 -right-2 p-3 rounded-2xl border-4 border-[#1c1c1e] z-20 shadow-lg ${
            callType === 'video' ? 'bg-blue-600' : 'bg-green-600'
          }`}>
            {callType === 'video' ? <Video size={24} /> : <Phone size={24} />}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-8 w-full justify-center">
          <button
            onClick={handleDecline}
            className="w-20 h-20 rounded-3xl bg-red-500/10 hover:bg-red-500 flex items-center justify-center text-red-500 hover:text-white transition-all transform hover:scale-110 active:scale-95 border border-red-500/20"
            title="Từ chối"
          >
            <PhoneOff size={32} />
          </button>
          <button
            onClick={handleAccept}
            className="w-20 h-20 rounded-3xl bg-green-500 flex items-center justify-center text-white hover:bg-green-600 transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-green-500/40"
            title="Chấp nhận"
          >
            <Phone size={32} />
          </button>
        </div>

        <p className="mt-10 text-[10px] text-white/30 font-black uppercase tracking-[0.2em]">
          Cuộc gọi tự động kết thúc sau {timeLeft}s
        </p>
      </div>
    </div>
  );
};

export default IncomingCallModal;
