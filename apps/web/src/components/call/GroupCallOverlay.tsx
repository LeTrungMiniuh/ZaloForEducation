import React, { useEffect, useRef } from 'react';
import { PhoneOff, Video, VideoOff, Mic, MicOff, Monitor } from 'lucide-react';
import { useGroupCallStore } from '../../store/groupCallStore';
import { useAuth } from '../../context/AuthContext';
import { useGroupChime } from '../../hooks/useGroupChime';
import api from '../../services/api';

const GroupCallOverlay: React.FC = () => {
  const { 
    callState, 
    activeCallId, 
    conversationId, 
    participants, 
    ringingEmails,
    remoteTiles, 
    attendeeData,
    isCameraOn, 
    isMicOn,
    isMinimized,
    toggleMinimized,
    isLocalScreenSharing,
    screenShares,
  } = useGroupCallStore();

  const { socket, user } = useAuth();
  const { 
    setupSession, 
    leaveSession, 
    toggleMic, 
    toggleCamera, 
    startScreenShare, 
    stopScreenShare, 
    session 
  } = useGroupChime();
  const ringbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ringbackRef.current) {
      ringbackRef.current = new Audio('/audio_sound/ringback.mp3');
      ringbackRef.current.loop = true;
    }

    const hasRinging = ringingEmails.length > 0;
    const isJoining = callState === 'JOINING';
    
    if (isJoining || (callState === 'CONNECTED' && hasRinging)) {
      ringbackRef.current.play().catch(() => {});
    } else {
      if (ringbackRef.current) {
        ringbackRef.current.pause();
        ringbackRef.current.currentTime = 0;
      }
    }

    return () => {
      if (ringbackRef.current) {
        ringbackRef.current.pause();
      }
    };
  }, [callState, ringingEmails.length]);

  useEffect(() => {
    if (callState === 'JOINING' || (callState === 'CONNECTED' && !session)) {
      setupSession();
    }
  }, [callState]);

  const handleHangup = async () => {
    if (!user?.email || !attendeeData?.AttendeeId) return;

    if (socket && conversationId && activeCallId) {
      socket.emit('group-call:hangup', {
        convId: conversationId,
        callId: activeCallId,
        userEmail: user.email,
        attendeeId: attendeeData.AttendeeId
      });
    }

    try {
      await api.post('/group-call/hangup', { 
        conversationId, 
        callId: activeCallId,
        attendeeId: attendeeData.AttendeeId 
      });
    } catch (e) {}

    await leaveSession();
    resetGroupCall();
  };

  if (callState === 'IDLE') return null;

  // [SENIOR] Minimized View
  if (isMinimized) {
    return (
      <div 
        onClick={() => toggleMinimized(false)}
        className="fixed bottom-6 right-6 z-[999] w-[280px] bg-[#1a1a1e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all animate-in slide-in-from-bottom-5"
      >
        <div className="p-4 flex items-center justify-between bg-gradient-to-r from-blue-600/20 to-indigo-600/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white shadow-lg">
              {Object.values(participants).filter(p => p.status !== 'ringing').length}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white/90">Cuộc gọi nhóm</span>
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Đang diễn ra</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
             <button 
               onClick={(e) => { e.stopPropagation(); toggleMic(!isMicOn); }}
               className={`p-2 rounded-lg ${isMicOn ? 'text-white/70 hover:bg-white/10' : 'text-red-400 bg-red-400/10'}`}
             >
               {isMicOn ? <Mic size={16} /> : <MicOff size={16} />}
             </button>
             <button 
               onClick={(e) => { e.stopPropagation(); handleHangup(); }}
               className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"
             >
               <PhoneOff size={16} />
             </button>
          </div>
        </div>
        {isCameraOn && remoteTiles.length > 0 && (
          <div className="aspect-video bg-black relative">
            {/* Show a small preview of the first tile */}
            <VideoTile item={remoteTiles[0]} session={session} isMinimized />
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] bg-[#0a0a0c] text-white flex flex-col font-sans">
      {/* Header */}
      <div className="p-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <div>
          <h2 className="text-xl font-bold">Cuộc gọi nhóm</h2>
          <p className="text-sm text-white/50">{Object.values(participants).filter(p => p.status !== 'ringing').length} đang tham gia</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => toggleMinimized(true)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group"
            title="Thu nhỏ"
          >
            <div className="w-5 h-1 bg-white/40 group-hover:bg-white rounded-full" />
          </button>
          <div className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono">
             {callState}
          </div>
        </div>
      </div>
 
      {/* Main Stage for Screen Share */}
      {(() => {
        const activeShare = Object.entries(screenShares).find(([_, s]) => s.isSharing);
        const someoneIsSharing = !!activeShare || isLocalScreenSharing;
        
        if (!someoneIsSharing) return null;
        
        return (
          <div className="mx-6 mb-6 aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 relative shadow-2xl">
            <video 
              id="group-screen-share-video"
              className="w-full h-full object-contain"
              autoPlay
              playsInline
            />
            <div className="absolute top-4 left-4 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full flex items-center gap-2">
              <Monitor size={16} className="text-blue-400" />
              <span className="text-xs font-bold text-white/90">
                {isLocalScreenSharing ? "Bạn đang chia sẻ màn hình" : "Đang xem màn hình chia sẻ"}
              </span>
            </div>
            
            {/* [PRINCIPLE 10] Stop sharing button if local */}
            {isLocalScreenSharing && (
              <button 
                onClick={stopScreenShare}
                className="absolute bottom-4 right-4 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg"
              >
                Dừng chia sẻ
              </button>
            )}
          </div>
        );
      })()}

      {/* Video Grid */}
      <div className="grow p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-fr">
          {(() => {
            // [SENIOR] Reactive Merging Logic - SSOT (Mirroring Mobile)
            let items: any[] = [];
            
            // 1. Add all active video tiles
            remoteTiles.forEach(tile => {
              const attendeeId = (tile.attendeeId || "").toLowerCase();
              const p = participants[attendeeId];
              
              if (!p && !tile.isLocal) return;

              items.push({
                attendeeId: attendeeId,
                email: p?.email || (tile.isLocal ? user?.email : 'unknown'),
                name: p?.name || (tile.isLocal ? (user?.fullName || 'Bạn') : null),
                avatar: p?.avatar || (tile.isLocal ? user?.avatarUrl : null),
                tileId: tile.tileId,
                isVideoActive: tile.active,
                isLocal: tile.isLocal,
                status: 'connected'
              });
            });

            // 2. Add connected participants who DON'T have a video tile (camera off)
            Object.entries(participants || {}).forEach(([id, p]) => {
              if (!id || !p) return;
              if (p.status === 'disconnected') return; 
              
              const attendeeId = id.toLowerCase();
              const hasTile = remoteTiles.some(t => t.attendeeId && t.attendeeId.toLowerCase() === attendeeId);
              if (!hasTile) {
                items.push({
                  attendeeId: attendeeId,
                  ...p,
                  isVideoActive: false,
                  isLocal: attendeeId === (attendeeData?.AttendeeId || "").toLowerCase(),
                  status: 'connected'
                });
              }
            });

            // 3. Add ringing emails
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

            return items.map((item, idx) => (
              <VideoTile key={item.tileId || item.attendeeId || item.email || idx} item={item} session={session} />
            ));
          })()}

          {Object.keys(participants).length === 0 && ringingEmails.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center text-white/20 uppercase tracking-widest text-sm py-20">
               <div className="w-20 h-20 border-2 border-dashed border-white/10 rounded-full flex items-center justify-center mb-4">
                  <VideoOff size={32} />
               </div>
               Đang khởi tạo cuộc gọi nhóm...
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="p-10 flex justify-center items-center gap-8 bg-gradient-to-t from-black/80 to-transparent">
        <button 
          onClick={() => toggleMic(!isMicOn)}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMicOn ? 'bg-white/10' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
        >
          {isMicOn ? <Mic size={28} /> : <MicOff size={28} />}
        </button>

        <button 
          onClick={handleHangup}
          className="w-20 h-20 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-2xl shadow-red-600/40 transition-transform active:scale-90"
        >
          <PhoneOff size={32} />
        </button>

        <button 
          onClick={() => {
            if (isLocalScreenSharing) stopScreenShare();
            else startScreenShare();
          }}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isLocalScreenSharing ? 'bg-blue-500 shadow-lg shadow-blue-500/20' : 'bg-white/10'}`}
          title="Chia sẻ màn hình"
        >
          <Monitor size={28} />
        </button>

        <button 
          onClick={() => toggleCamera(!isCameraOn)}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isCameraOn ? 'bg-white/10' : 'bg-red-500 shadow-lg shadow-red-500/20'}`}
        >
          {isCameraOn ? <Video size={28} /> : <VideoOff size={28} />}
        </button>
      </div>

      <audio id="group-chime-audio" style={{ display: 'none' }} />
    </div>
  );
};

const VideoTile: React.FC<{ item: any; session: any; isMinimized?: boolean }> = ({ item, session, isMinimized }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && session && item.tileId !== undefined) {
      session.audioVideo.bindVideoElement(item.tileId, videoRef.current);
    }
  }, [item.tileId, session, item.isVideoActive]);

  const displayName = item.isLocal ? 'Bạn' : (item.name || (item.email ? item.email.split('@')[0] : 'Người dùng'));
  const initials = (item.name || item.email || '?').charAt(0).toUpperCase();

  if (isMinimized) {
    return (
      <div className="w-full h-full bg-black">
        <video 
          ref={videoRef} 
          className={`w-full h-full object-cover ${item.isLocal ? 'scale-x-[-1]' : ''}`} 
          autoPlay 
          muted={item.isLocal} 
          playsInline 
        />
        {!item.isVideoActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1e]">
            <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-xl font-bold text-blue-400">
              {initials}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-[#1a1a1e] rounded-3xl overflow-hidden border border-white/5 group shadow-2xl transition-all hover:scale-[1.02] hover:shadow-white/5">
      {/* Video Element */}
      <video 
        ref={videoRef} 
        className={`w-full h-full object-cover transition-opacity duration-500 ${item.isVideoActive ? 'opacity-100' : 'opacity-0'} ${item.isLocal ? 'scale-x-[-1]' : ''}`} 
        autoPlay 
        muted={item.isLocal} 
        playsInline 
      />

      {/* Placeholder / Camera Off State */}
      {!item.isVideoActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1e293b] to-[#0f172a]">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-4xl font-bold text-blue-400 shadow-lg shadow-blue-500/10 ring-4 ring-white/5">
            {initials}
          </div>
          <span className="mt-4 text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] text-center px-4">
            {item.status === 'ringing' ? 'Đang đổ chuông...' : 'Camera đang tắt'}
          </span>
        </div>
      )}

      {/* Identity Badge */}
      <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-black/60 backdrop-blur-xl rounded-xl text-[13px] font-medium border border-white/10 flex items-center gap-2.5 max-w-[85%] transition-transform group-hover:translate-x-1">
        <div className={`w-2 h-2 rounded-full shrink-0 ${item.isVideoActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-white/20'}`} />
        <span className="truncate text-white/90">
          {displayName}
        </span>
      </div>

      {/* Connection Indicator for remote users */}
      {!item.isLocal && item.status === 'connected' && !item.isVideoActive && (
        <div className="absolute top-4 right-4">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default GroupCallOverlay;
