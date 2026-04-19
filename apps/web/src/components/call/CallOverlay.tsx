import React, { useEffect, useRef, useState } from 'react';
import {
  PhoneOff, Mic, MicOff, Camera, CameraOff,
  Video, VideoOff, Loader2, CheckCircle, XCircle,
} from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { useAuth } from '../../context/AuthContext';
import {
  setGlobalVideoRefs,
  toggleCamera,
  toggleMic,
  leaveCurrentSession,
  rebindAllTilesGlobal,
} from '../../hooks/useChime';
import api from '../../services/api';

const CallOverlay: React.FC = () => {
  // ── ALL HOOKS MUST BE AT THE TOP ────────────────────────────────────────────
  const {
    callState, conversationId, callType, peerProfile, isIncoming, setCallType,
    peerJoined, isCameraOn, setCameraOn, isMicOn, setMicOn, toEmail,
    upgradeRequestPending, setUpgradeRequestPending,
    incomingUpgradeRequest, setIncomingUpgradeRequest,
    upgradeRequesterEmail, setUpgradeRequesterEmail,
    resetCall,
  } = useCallStore();

  const { socket, user } = useAuth();

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [declineToast, setDeclineToast] = useState(false);
  const [upgradeTimeout, setUpgradeTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Retry tile binding sau khi CONNECTED (tiles appear async)
  useEffect(() => {
    if (callState === 'CONNECTED' && callType === 'video') {
      const t = setTimeout(() => rebindAllTilesGlobal(), 400);
      return () => clearTimeout(t);
    }
  }, [callState, callType]);

  // Auto-dismiss incoming upgrade toast sau 30s
  useEffect(() => {
    if (incomingUpgradeRequest) {
      const t = setTimeout(() => setIncomingUpgradeRequest(false), 30000);
      setUpgradeTimeout(t);
      return () => clearTimeout(t);
    }
  }, [incomingUpgradeRequest, setIncomingUpgradeRequest]);

  // Auto-hide decline toast sau 3s
  useEffect(() => {
    if (declineToast) {
      const t = setTimeout(() => setDeclineToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [declineToast]);

  // ── Early return AFTER all hooks ─────────────────────────────────────────────
  if (callState !== 'CONNECTED' && callState !== 'JOINING') return null;

  // ── Derived values ────────────────────────────────────────────────────────────
  const statusText =
    callState === 'JOINING' ? 'Đang kết nối...'
    : !isIncoming && !peerJoined ? 'Đang chờ đối phương...'
    : 'Đang trò chuyện';

  const peer = peerProfile || { fullName: toEmail || 'Người dùng ZaloEdu', email: toEmail, avatar: null };

  // ── Event handlers ─────────────────────────────────────────────────────────
  const handleHangup = async () => {
    // Thông báo đối phương
    if (socket && conversationId && toEmail) {
      socket.emit('call:hangup', { convId: conversationId, toEmail });
    }
    // Cleanup Chime meeting trên server
    try {
      await api.post('/call/hangup', { conversationId });
    } catch (e) { /* ignore */ }
    // Cleanup Chime session
    await leaveCurrentSession();
    resetCall();
  };

  const handleToggleCamera = async () => {
    const next = !isCameraOn;
    setCameraOn(next);
    await toggleCamera(next);
  };

  const handleToggleMic = async () => {
    const next = !isMicOn;
    setMicOn(next);
    await toggleMic(next);
  };

  const handleRequestUpgrade = () => {
    if (!socket || !conversationId || !toEmail) return;
    socket.emit('call:upgrade_request', {
      convId: conversationId,
      toEmail,
      fromProfile: {
        email: user?.email,
        fullName: user?.fullName,
        avatar: user?.avatar,
      },
    });
    setUpgradeRequestPending(true);
  };

  const handleAcceptUpgrade = async () => {
    if (upgradeTimeout) clearTimeout(upgradeTimeout);
    setIncomingUpgradeRequest(false);

    const requesterEmail = upgradeRequesterEmail;
    if (!requesterEmail) {
      console.error('[Overlay] Cannot accept upgrade: requester email unknown');
      return;
    }

    socket?.emit('call:upgrade_accepted', { convId: conversationId, toEmail: requesterEmail });
    setUpgradeRequesterEmail(null);

    // Bật camera phía mình
    setCallType('video');
    setCameraOn(true);
    await toggleCamera(true);
  };

  const handleDeclineUpgrade = () => {
    if (upgradeTimeout) clearTimeout(upgradeTimeout);
    setIncomingUpgradeRequest(false);

    const requesterEmail = upgradeRequesterEmail;
    if (requesterEmail) {
      socket?.emit('call:upgrade_declined', { convId: conversationId, toEmail: requesterEmail });
    }
    setUpgradeRequesterEmail(null);
    setDeclineToast(false);
  };

  // ── Audio Layout ─────────────────────────────────────────────────────────────
  const renderAudioLayout = () => (
    <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0a0a0a]" />
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        <div className="flex gap-1 items-center h-48">
          {[...Array(24)].map((_, i) => (
            <div key={i} className="w-1.5 bg-blue-400 rounded-full animate-pulse"
              style={{ height: `${20 + Math.sin(i * 0.5) * 60}%`, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-blue-500/15 animate-ping" style={{ animationDuration: '3s' }} />
          <div className="w-40 h-40 rounded-[52px] border-4 border-white/10 overflow-hidden bg-[#1c1c1e]">
            <img
              src={peer?.avatarUrl || peer?.avatar || `https://i.pravatar.cc/160?u=${peer?.email}`}
              className="w-full h-full object-cover" alt="partner avatar"
            />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-black text-white tracking-tight">
            {peer?.fullName || peer?.fullname || peer?.email || 'Đối phương'}
          </h1>
          <div className="mt-3 flex items-center gap-2 px-4 py-1.5 bg-green-500/10 rounded-full border border-green-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-green-400">{statusText}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Video Layout ─────────────────────────────────────────────────────────────
  const renderVideoLayout = () => (
    <div className="flex-grow p-6 grid grid-cols-2 gap-4 items-center">
      {/* Local */}
      <div className="relative bg-black rounded-3xl overflow-hidden aspect-video border border-white/5 shadow-xl">
        {isCameraOn ? (
          <video
            ref={(el) => {
              localVideoRef.current = el;
              setGlobalVideoRefs(el, undefined);
              if (el) rebindAllTilesGlobal();
            }}
            autoPlay muted playsInline
            className="w-full h-full object-cover scale-x-[-1]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#1c1c1e] gap-3">
            <CameraOff size={32} className="text-white/30" />
            <span className="text-xs text-white/30 font-semibold">Camera tắt</span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur px-3 py-1 rounded-xl text-[9px] font-black tracking-widest uppercase text-white/80">Tôi</div>
      </div>

      {/* Remote */}
      <div className="relative bg-black rounded-3xl overflow-hidden aspect-video border border-white/5 shadow-xl">
        <video
          ref={(el) => {
            remoteVideoRef.current = el;
            setGlobalVideoRefs(undefined, el);
            if (el) rebindAllTilesGlobal();
          }}
          autoPlay playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-3 left-3 bg-blue-600/80 backdrop-blur px-3 py-1 rounded-xl text-[9px] font-black tracking-widest uppercase text-white/80">Đối phương</div>
      </div>
    </div>
  );

  // ── Upgrade Request Toast (hiển thị cho B) ────────────────────────────────────
  const renderUpgradeToast = () => {
    if (!incomingUpgradeRequest) return null;
    return (
      <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-[#1c1c2e] border border-blue-500/30 rounded-2xl px-6 py-4 shadow-2xl flex flex-col gap-3 min-w-[320px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Video size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Yêu cầu Video Call</p>
              <p className="text-white/50 text-xs">Đối phương muốn chuyển sang gọi video</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleDeclineUpgrade}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-400 text-xs font-bold transition-all">
              <XCircle size={14} /> Từ chối
            </button>
            <button onClick={handleAcceptUpgrade}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/30">
              <CheckCircle size={14} /> Đồng ý
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Status & Connection Overlays ───────────────────────────────────────────
  const renderStatusOverlay = () => {
    const { isConnecting, connectionError } = useCallStore.getState();
    if (!isConnecting && !connectionError) return null;

    return (
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2">
        {isConnecting && (
          <div className="bg-blue-600/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-blue-400/30 animate-pulse">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[11px] font-bold uppercase tracking-widest">Đang thiết lập kết nối...</span>
          </div>
        )}
        {connectionError && (
          <div className="bg-red-600/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 border border-red-400/30">
            <XCircle size={16} />
            <span className="text-[11px] font-bold uppercase tracking-widest">{connectionError}</span>
          </div>
        )}
      </div>
    );
  };

  const renderDebugInfo = () => {
    // Chỉ bật debug nếu nhấn phím 'D' (giữ cho giao diện sạch cho user thông thường)
    if (localStorage.getItem('CALL_DEBUG') !== 'true') return null;
    
    const { meetingData, attendeeData } = useCallStore.getState();
    return (
      <div className="absolute top-4 left-4 z-[100] bg-black/80 p-3 rounded-lg text-[10px] font-mono text-green-500 border border-green-500/30 pointer-events-none">
        <p>MId: {meetingData?.MeetingId?.substring(0, 8)}...</p>
        <p>AId: {attendeeData?.AttendeeId?.substring(0, 8)}...</p>
        <p>Join: {peerJoined ? 'YES' : 'NO'}</p>
        <p>Cam: {isCameraOn ? 'ON' : 'OFF'}</p>
      </div>
    );
  };

  // ── Decline Feedback Toast (hiển thị cho A) ───────────────────────────────────
  const renderDeclineToast = () => {
    if (!declineToast) return null;
    return (
      <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-[#1c1c2e] border border-red-500/30 rounded-2xl px-5 py-3 shadow-xl flex items-center gap-3">
          <XCircle size={18} className="text-red-400 shrink-0" />
          <span className="text-white/80 text-sm font-semibold">Đối phương từ chối chuyển sang Video</span>
        </div>
      </div>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[110] bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <div className="h-20 flex items-center justify-between px-8 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
            {callType === 'video'
              ? <Video size={20} className="text-blue-400" />
              : <Mic size={20} className="text-green-400" />}
          </div>
          <div>
            <p className="font-black text-white text-sm leading-tight">ZaloEdu Live</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
              {callType === 'video' ? 'Video Call' : 'Voice Call'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
          <div className={`w-1.5 h-1.5 rounded-full ${
            peerJoined || isIncoming ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-yellow-500'
          }`} />
          {statusText}
        </div>
      </div>

      {/* Content */}
      <div className="relative flex-grow overflow-hidden flex flex-col">
        {renderDebugInfo()}
        {renderStatusOverlay()}
        {callType === 'video' ? renderVideoLayout() : renderAudioLayout()}
        {renderUpgradeToast()}
        {renderDeclineToast()}
      </div>

      {/* Controls */}
      <div className="h-28 flex items-center justify-center pb-8 shrink-0">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 px-6 py-3 rounded-[36px] flex items-center gap-3">
          {/* Mic */}
          <button
            onClick={handleToggleMic}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isMicOn
                ? 'bg-white/5 text-white hover:bg-white/10'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 ring-1 ring-red-500/50'
            }`}
            title={isMicOn ? 'Tắt Mic' : 'Bật Mic'}
          >
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {/* Camera Toggle — chỉ hiện khi video call */}
          {callType === 'video' && (
            <button
              onClick={handleToggleCamera}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                isCameraOn
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
              }`}
              title={isCameraOn ? 'Tắt camera' : 'Bật camera'}
            >
              {isCameraOn ? <Camera size={20} /> : <CameraOff size={20} />}
            </button>
          )}

          {/* Upgrade to Video — chỉ hiện khi audio call */}
          {callType === 'audio' && (
            <button
              onClick={handleRequestUpgrade}
              disabled={upgradeRequestPending}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                upgradeRequestPending
                  ? 'bg-blue-600/40 text-blue-300 cursor-not-allowed'
                  : 'bg-white/5 text-white/40 hover:bg-blue-500/20 hover:text-blue-400'
              }`}
              title={upgradeRequestPending ? 'Đang chờ đối phương...' : 'Yêu cầu Video Call'}
            >
              {upgradeRequestPending ? <Loader2 size={20} className="animate-spin" /> : <VideoOff size={20} />}
            </button>
          )}

          <div className="w-px h-6 bg-white/10 mx-1" />

          {/* Hang up */}
          <button
            onClick={handleHangup}
            className="w-14 h-14 rounded-2xl bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30"
            title="Kết thúc"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallOverlay;
