import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  PhoneOff, Mic, MicOff, Camera, CameraOff,
  Loader2, User,
  Clock, Calendar
} from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useAuth } from '../../context/AuthContext';
import {
  setGlobalVideoRefs,
  toggleCamera as toggleCameraChime,
  toggleMic as toggleMicChime,
  leaveCurrentSession,
} from '../../hooks/useChime';
import api from '../../services/api';

const CallOverlay: React.FC = () => {
  const {
    callState, conversationId, callType, peerProfile, isIncoming,
    isCameraOn, setCameraOn, isMicOn, setMicOn, toEmail,
    activeCallId, startTime, isRemoteCameraOn, remoteTiles,
    upgradeRequestPending, setUpgradeRequestPending,
    incomingUpgradeRequest, setIncomingUpgradeRequest,
  } = useCallStore();

  const { socket, user } = useAuth();

  // [SENIOR] Synchronous LOCAL Video Binding via Ref Callback
  const localVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      console.log('[Web-Chime] 🎬 Local <video> element mounted in DOM!');
      setGlobalVideoRefs(node, undefined);
    } else {
      setGlobalVideoRefs(null, undefined);
    }
  }, []);

  // [SENIOR] Resilient REMOTE Video Binding via Ref Callback
  const remoteVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      console.log('[Web-Chime] 🎬 Remote <video> element mounted in DOM!');
      setGlobalVideoRefs(undefined, node);
    } else {
      setGlobalVideoRefs(undefined, null);
    }
  }, []);

  const [duration, setDuration] = useState(0);
  const [lastDuration, setLastDuration] = useState<number | null>(null);

  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (callState === 'CONNECTED' && startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (callState === 'ENDED') {
      if (duration > 0) setLastDuration(duration);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState, startTime, duration]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleHangup = async () => {
    if (socket && conversationId && toEmail && activeCallId) {
      socket.emit('call:hangup', { convId: conversationId, callId: activeCallId, toEmail });
    }
    try {
      await api.post('/call/hangup', { conversationId, callId: activeCallId });
    } catch (e) { /* ignore */ }
    await leaveCurrentSession();

    // Switch to ENDED state for 4 seconds
    useCallStore.getState().hangupCall();
  };

  // 1. Logic Status thông minh hơn (Không phụ thuộc vào peerJoined nữa)
  const statusText = (() => {
    if (callState === 'JOINING') return 'Đang kết nối...';
    if (callState === 'RINGING') return 'Đang đổ chuông...';
    if (callState === 'ENDED') return 'Cuộc gọi đã kết thúc';
    if (callState === 'CONNECTED') return formatTime(duration);
    return '...';
  })();

  // 2. Fallback Thông tin đối phương "bao sống"
  const getFallbackName = () => {
    if (toEmail) return toEmail.split('@')[0]; // Lấy phần đầu của email làm tên
    return 'Người dùng ZaloEdu';
  };

  const peer = {
    fullName: peerProfile?.fullName || getFallbackName(),
    avatar: peerProfile?.avatarUrl || peerProfile?.avatar || null,
  };

  // PREMIUM ENDED SCREEN
  const renderEnded = () => (
    <div className="fixed inset-0 z-[120] bg-[#0a0a0a]/90 backdrop-blur-3xl flex flex-col items-center justify-center text-white animate-in fade-in zoom-in duration-500 px-6">
      {/* Background Profile Blur */}
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0a0a]" />
        {peer.avatar ? (
          <img src={peer.avatar} className="w-full h-full object-cover blur-[100px] scale-150" alt="" />
        ) : (
          <div className="w-full h-full bg-blue-900/30 blur-[100px] scale-150" />
        )}
      </div>

      <div className="relative mb-10">
        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping blur-2xl" />
        <div className="w-28 h-28 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 relative z-10">
          <PhoneOff size={44} className="text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
        </div>
      </div>

      <h2 className="text-4xl font-black mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">Cuộc gọi đã kết thúc</h2>
      <p className="text-white/40 font-bold uppercase tracking-[0.25em] text-[10px] mb-12">ZaloEdu Live • Professional Experience</p>

      <div className="bg-white/5 border border-white/10 rounded-[32px] p-8 flex flex-col gap-6 w-full max-w-sm backdrop-blur-md shadow-2xl">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Clock size={20} className="text-blue-400" />
            </div>
            <span className="text-white/60 text-sm font-semibold">Thời gian gọi</span>
          </div>
          <span className="text-white font-mono text-2xl font-black">{formatTime(lastDuration || duration)}</span>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
              <Calendar size={20} className="text-emerald-400" />
            </div>
            <span className="text-white/60 text-sm font-semibold">Ngày thực hiện</span>
          </div>
          <span className="text-white font-bold text-sm tracking-wide">{new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      <div className="mt-16 flex items-center gap-3 py-3 px-6 rounded-full bg-white/5 border border-white/5">
        <Loader2 size={16} className="animate-spin text-white/30" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Đang quay lại màn hình chat</span>
      </div>
    </div>
  );

  if (callState === 'ENDED') return renderEnded();
  if (callState !== 'CONNECTED' && callState !== 'JOINING') return null;

  const handleToggleCamera = async () => {
    if (callType === 'audio') {
      setUpgradeRequestPending(true);
      if (socket && conversationId && toEmail && activeCallId) {
        socket.emit('call:upgrade_request', {
          convId: conversationId,
          callId: activeCallId,
          toEmail,
          fromProfile: { email: user?.email, fullName: user?.fullName }
        });

        // [SENIOR] 25s sender-side timeout (fallback)
        setTimeout(() => {
          const checkState = useCallStore.getState();
          if (checkState.upgradeRequestPending && checkState.activeCallId === activeCallId) {
            console.log('[Web-Chime] Upgrade request timed out on sender side');
            setUpgradeRequestPending(false);
          }
        }, 25000);
      }
      return;
    }

    const next = !isCameraOn;
    setCameraOn(next);
    await toggleCameraChime(next);
  };

  const handleToggleMic = async () => {
    const next = !isMicOn;
    setMicOn(next);
    await toggleMicChime(next);
  };

  const renderAudioLayout = () => (
    <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-[#0a0a0a] to-[#111118]">
      {/* Background Blur Effect dựa trên Avatar */}
      {peer.avatar && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img src={peer.avatar} className="w-full h-full object-cover blur-[120px] scale-150" alt="bg" />
        </div>
      )}

      <div className="flex flex-col items-center gap-8 relative z-10 animate-in slide-in-from-bottom-10 fade-in duration-700">
        <div className="relative group">
          {/* Vòng Ripple hiệu ứng âm thanh (chỉ hiện khi đang CONNECTED) */}
          {callState === 'CONNECTED' && (
            <>
              <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping opacity-50" />
              <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-pulse scale-125 duration-1000" />
            </>
          )}

          <div className="w-48 h-48 rounded-full border-[6px] border-white/5 overflow-hidden relative z-10 shadow-[0_0_80px_rgba(59,130,246,0.15)] bg-[#1c1c2e]">
            {peer.avatar ? (
              <img src={peer.avatar} alt={peer.fullName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-900/40 to-[#0a0a0a] flex items-center justify-center">
                <span className="text-6xl font-black text-white/30 uppercase">
                  {peer.fullName.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="text-center flex flex-col items-center">
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight drop-shadow-lg capitalize">
            {peer.fullName}
          </h2>
          <div className="flex items-center justify-center gap-3 bg-white/5 px-6 py-2 rounded-full border border-white/10 backdrop-blur-md">
            <span className={`w-2 h-2 rounded-full ${callState === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <p className={`font-bold uppercase tracking-[0.2em] text-[12px] ${callState === 'CONNECTED' ? 'text-green-400' : 'text-white/60'}`}>
              {statusText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderVideoLayout = () => (
    <div className="flex-grow relative bg-[#0a0a0a] overflow-hidden">
      {/* [Web-Chime] Remote Video Stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        {isRemoteCameraOn ? (
          <video ref={remoteVideoRef} className="w-full h-full object-cover animate-in fade-in duration-700" autoPlay playsInline />
        ) : (
          <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
            <div className="w-28 h-28 rounded-full bg-white/5 animate-pulse flex items-center justify-center border border-white/10 shadow-inner relative">
              <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-xl" />
              {peer.avatar ? (
                <img src={peer.avatar} className="w-full h-full object-cover rounded-full opacity-40 grayscale" alt="" />
              ) : (
                <User size={48} className="text-white/10 relative z-10" />
              )}
            </div>
            <div className="text-center">
              <p className="text-white/20 font-black uppercase tracking-[0.2em] text-[10px] mb-2 flex items-center justify-center gap-2">
                <CameraOff size={12} /> Camera Đang Tắt
              </p>
              <p className="text-white/40 font-bold text-xs">Đang chờ tín hiệu video từ {peer.fullName}...</p>
            </div>
          </div>
        )}
      </div>

      {/* Local Mini Pip */}
      <div className="absolute top-8 right-8 w-64 aspect-video rounded-3xl bg-[#1c1c2e]/60 backdrop-blur-2xl overflow-hidden border border-white/10 shadow-2xl z-20 group transition-all hover:scale-105 hover:shadow-blue-500/10">
        {isCameraOn ? (
          <video ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1c1c2e]/80">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <User size={24} className="text-white/20" />
            </div>
            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Camera Của Bạn Đang Tắt</p>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-5">
          <p className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Bạn
          </p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 to-transparent pointer-events-none" />

      <div className="absolute left-10 bottom-10 z-10">
        <p className="text-white font-black text-3xl mb-2 tracking-tight">{peer.fullName}</p>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${callState === 'CONNECTED' ? "bg-green-500" : "bg-yellow-500"} shadow-[0_0_8px_rgba(34,197,94,0.5)]`} />
          <p className="text-white/50 text-[11px] font-black uppercase tracking-[0.2em]">{statusText}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] bg-[#0a0a0a] text-white flex flex-col font-sans">
      {/* Top Header Overlay */}
      <div className="h-24 flex items-center justify-between px-10 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-md z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-lg">
            <Loader2 size={24} className="text-blue-400 animate-spin-slow" />
          </div>
          <div>
            <p className="font-black text-white text-lg leading-tight tracking-tight">ZaloEdu Live <span className="text-blue-500 ml-1">Pro</span></p>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">{callType === 'video' ? 'Kênh Video Bảo Mật' : 'Kênh Thoại Bảo Mật'}</p>
          </div>
        </div>
        <div className="bg-white/5 rounded-full px-5 py-2 border border-white/10">
          <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-white/50">
            <div className={`w-2 h-2 rounded-full ${callState === 'CONNECTED' ? 'bg-green-500' : 'bg-yellow-400'}`} />
            {statusText}
          </div>
        </div>
      </div>

      <div className="relative flex-grow overflow-hidden flex flex-col">
        {callType === 'video' ? renderVideoLayout() : renderAudioLayout()}

        {/* Incoming Video Upgrade Request Modal */}
        {incomingUpgradeRequest && callState === 'CONNECTED' && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c2e]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col items-center animate-in slide-in-from-top-10 zoom-in duration-300">
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mb-3">
              <Camera className="text-blue-400" size={24} />
            </div>
            <p className="text-sm font-bold text-white mb-5">{peer.fullName} muốn chuyển sang cuộc gọi Video</p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setIncomingUpgradeRequest(false);
                  // Set Web side to video and trigger actual Chime hook
                  useCallStore.getState().setCallType('video');
                  setCameraOn(true);
                  toggleCameraChime(true);
                  // Notify peer
                  if (socket && conversationId && toEmail && activeCallId) {
                    socket.emit('call:upgrade_accepted', { convId: conversationId, callId: activeCallId, toEmail });
                  }
                }}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-black uppercase tracking-wider transition-colors">
                Đồng ý
              </button>
              <button
                onClick={() => {
                  setIncomingUpgradeRequest(false);
                  if (socket && conversationId && toEmail && activeCallId) {
                    socket.emit('call:upgrade_declined', { convId: conversationId, callId: activeCallId, toEmail });
                  }
                }}
                className="flex-1 py-2.5 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-transparent hover:border-red-500/30">
                Từ chối
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar Overlay */}
      <div className="h-32 flex items-center justify-center pb-10 shrink-0 z-20">
        <div className="bg-white/5 backdrop-blur-3xl border border-white/10 px-8 py-4 rounded-[40px] flex items-center gap-5 shadow-2xl">
          <button onClick={handleToggleMic} className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isMicOn ? 'bg-white/5 text-white' : 'bg-red-500/20 text-red-500 border border-red-500/20'}`}>
            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            onClick={handleToggleCamera}
            disabled={upgradeRequestPending}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${upgradeRequestPending ? 'bg-blue-900/50 text-white/50 animate-pulse cursor-not-allowed' : isCameraOn ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'bg-white/5 text-white/30 border border-white/5'}`}>
            {upgradeRequestPending ? <Loader2 size={24} className="animate-spin" /> : <Camera size={24} />}
          </button>

          <div className="w-px h-8 bg-white/10 mx-2" />

          <button onClick={handleHangup} className="w-16 h-16 rounded-2xl bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
            <PhoneOff size={28} className="text-white" />
          </button>
        </div>
      </div>
      {/* Note: Audio tag is now globally managed in App.tsx */}
    </div>
  );
};

export default CallOverlay;
