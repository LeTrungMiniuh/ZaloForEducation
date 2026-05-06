import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  PhoneOff,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  Loader2,
  User,
  Clock,
  Calendar,
  Minimize2,
  Maximize2,
  Monitor,
} from "lucide-react";
import { useCallStore, type CallState } from "../../store/callStore";
import { useAuth } from "../../context/AuthContext";
import {
  setLocalVideoRef,
  setRemoteVideoRef,
  setContentVideoRef,
  toggleCamera as toggleCameraChime,
  toggleMic as toggleMicChime,
  leaveCurrentSession,
  startScreenShare,
  stopScreenShare,
  rebindAllTiles,
} from "../../hooks/useChime";
import api from "../../services/api";
import { useChatStore } from "../../store/chatStore";

const CallOverlay: React.FC = () => {
  const {
    callState,
    conversationId,
    callType,
    peerProfile,
    isIncoming,
    isCameraOn,
    setCameraOn,
    isMicOn,
    setMicOn,
    toEmail,
    toEmails,
    activeCallId,
    startTime,
    isRemoteCameraOn,
    upgradeRequestPending,
    setUpgradeRequestPending,
    incomingUpgradeRequest,
    setIncomingUpgradeRequest,
    isMinimized,
    setMinimized,
    isLocalScreenSharing,
    screenShares,
    isPeerJoined,
    hangupCall,
  } = useCallStore();

  const { socket, user } = useAuth();

  const { userProfiles } = useChatStore();

  const [participants, setParticipants] = useState<
    Array<{
      email: string;
      name: string;
      avatar?: string | null;
      status:
        | "calling"
        | "ringing"
        | "connected"
        | "rejected"
        | "timeout"
        | "idle";
      attemptStartedAt?: number | null;
    }>
  >([]);
  const [hoveredParticipant, setHoveredParticipant] = useState<string | null>(
    null,
  );
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Group participants by status
  const connectedParticipants = participants.filter(
    (p) => p.status === "connected",
  );
  const ringingParticipants = participants.filter(
    (p) => p.status === "ringing",
  );
  const failedParticipants = participants.filter(
    (p) => p.status === "rejected" || p.status === "timeout",
  );

  // [SENIOR] Resilient LOCAL Video Binding
  const localVideoRef = useCallback((node: HTMLVideoElement | null) => {
    setLocalVideoRef(node);
  }, []);

  // [SENIOR] Resilient REMOTE Video Binding
  const remoteVideoRef = useCallback((node: HTMLVideoElement | null) => {
    setRemoteVideoRef(node);
  }, []);

  // [PRINCIPLE 6] Screen Share Ref Callback
  const screenShareVideoRef = useCallback((node: HTMLVideoElement | null) => {
    setContentVideoRef(node);
  }, []);

  const [duration, setDuration] = useState(0);
  const [lastDuration, setLastDuration] = useState<number | null>(null);

  // Timer Logic
  useEffect(() => {
    let interval: any;
    if (callState === "CONNECTED" && startTime) {
      interval = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else if (callState === "ENDED") {
      if (duration > 0) setLastDuration(duration);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState, startTime]);

  // [SENIOR] Incoming Call Ringtone Logic (Web)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // [SENIOR] Calculate layout state for rebinding
  const activeRemoteScreenShare = Object.entries(screenShares).find(([_, s]) => s.isSharing);
  const someoneIsSharing = !!activeRemoteScreenShare || isLocalScreenSharing;

  // [SENIOR] Force re-bind when layout switches (e.g. screen share start/stop)
  useEffect(() => {
    if (callState === "CONNECTED") {
      console.log(`[Web-Call] 🔃 Layout changed (someoneIsSharing=${someoneIsSharing}). Re-binding tiles...`);
      // Short delay to ensure DOM nodes are ready
      const timer = setTimeout(() => {
        rebindAllTiles();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [someoneIsSharing, callState, rebindAllTiles]);

  useEffect(() => {
    // Initialize audio instance once
    if (!ringtoneRef.current) {
      const audio = new Audio("/audio_sound/ringtone.mp3");
      audio.loop = true;
      ringtoneRef.current = audio;
    }

    const audio = ringtoneRef.current;

    if (callState === "RINGING" && isIncoming) {
      console.log("[Web-Call] 🔔 Starting ringtone...");
      // Browsers block autoplay unless interacted with.
      // Wrap in catch to prevent console errors if blocked.
      audio.play().catch((err) => {
        console.warn(
          "[Web-Call] ⚠️ Autoplay blocked or failed. User interaction might be required.",
          err,
        );
      });
    } else {
      // Stop ringtone for any other state (CONNECTED, ENDED, idle)
      if (audio) {
        console.log("[Web-Call] 🔇 Stopping ringtone.");
        audio.pause();
        audio.currentTime = 0;
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [callState, isIncoming]);

  // [SENIOR] Ringback Tone Logic (Web) - For Caller
  const ringbackRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!ringbackRef.current) {
      const audio = new Audio("/audio_sound/ringback.mp3");
      audio.loop = true;
      ringbackRef.current = audio;
    }

    const audio = ringbackRef.current;

    // Trigger ringback ONLY if user is the CALLER and state is RINGING or CALLING
    if ((callState === "RINGING" || callState === "CALLING") && !isIncoming) {
      console.log("[Web-Call] 🛰️ Starting ringback tone...");
      audio.play().catch((err) => {
        console.warn("[Web-Call] ⚠️ Ringback blocked by browser policy.", err);
      });
    } else {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    }

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [callState, isIncoming]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleHangup = async (reason: string = "manual") => {
    // [DEBUG] Trace who is calling hangup
    console.trace(
      `[Web-Call] handleHangup called. Reason: ${reason}, callState: ${useCallStore.getState().callState}`,
    );

    // [GUARD] Never send hangup if we're the callee in RINGING state
    const currentState = useCallStore.getState().callState;
    if (currentState === "RINGING" && useCallStore.getState().isIncoming) {
      console.warn(
        "[Web-Call] BLOCKED hangup — we are RINGING as callee. Use handleDecline instead.",
      );
      return;
    }

    const targets = toEmails.length > 0 ? toEmails : toEmail ? [toEmail] : [];

    if (socket && conversationId && activeCallId) {
      console.log(
        `[Web-Call] Sending call:hangup to peer(s). Reason: ${reason}`,
      );
      socket.emit("call:hangup", {
        convId: conversationId,
        callId: activeCallId,
        toEmail: targets.length === 1 ? targets[0] : undefined,
        toEmails: targets,
        reason,
      });
    }
    if (activeCallId) {
      try {
        await api.post("/call/hangup", { conversationId, callId: activeCallId });
      } catch (e) {
        /* ignore */
      }
    }
    await leaveCurrentSession("handleHangup-" + reason);

    // Switch to ENDED state for 4 seconds
    hangupCall();
  };

  // 0. Derived states (Move to top to avoid ReferenceError)
  const displayStatus = ((): CallState => {
    if (callState === "CONNECTED" && !isPeerJoined) return "JOINING";
    return callState || "IDLE";
  })();

  // 1. Logic Status thông minh hơn (Không phụ thuộc vào peerJoined nữa)
  const statusText = (() => {
    if (displayStatus === "JOINING" || displayStatus === "CALLING")
      return "Đang gọi...";
    if (displayStatus === "RINGING") return "Đang đổ chuông...";
    if (displayStatus === "ENDED") return "Cuộc gọi đã kết thúc";
    if (displayStatus === "CONNECTED") return formatTime(duration);
    return "...";
  })();

  // 2. Fallback Thông tin đối phương "bao sống"
  const getFallbackName = () => {
    if (toEmail) return toEmail.split("@")[0]; // Lấy phần đầu của email làm tên
    return "Người dùng ZaloEdu";
  };

  const peer = {
    fullName: peerProfile?.fullName || getFallbackName(),
    avatar: peerProfile?.avatarUrl || peerProfile?.avatar || null,
  };

  // Initialize participants list from toEmails / toEmail
  useEffect(() => {
    const targets =
      toEmails && toEmails.length > 0 ? toEmails : toEmail ? [toEmail] : [];
    const now = Date.now();
    const list = targets.map((e) => {
      const normalized = String(e || "")
        .trim()
        .toLowerCase();
      const profile = userProfiles[normalized] || {};
      return {
        email: normalized,
        name: profile?.fullName || normalized.split("@")[0],
        avatar: profile?.avatarUrl || profile?.avatar || null,
        status: (
          !isIncoming && callState === "CALLING"
            ? "ringing"
            : callState === "RINGING"
              ? "ringing"
              : callState === "CALLING"
                ? "calling"
                : "idle"
        ) as "calling" | "ringing" | "connected" | "rejected" | "timeout" | "idle",
        attemptStartedAt:
          (!isIncoming && callState === "CALLING") ||
          callState === "RINGING" ||
          callState === "CALLING"
            ? now
            : null,
      };
    });
    setParticipants(list);
  }, [toEmail, toEmails, callState, userProfiles, isIncoming]);

  const onPeerJoined = useCallback((data: any) => {
    const email = (
      data?.toEmail ||
      data?.fromEmail ||
      data?.fromProfile?.email ||
      data?.email ||
      ""
    )
      .trim()
      .toLowerCase();
    if (!email) return;
    setParticipants((prev) =>
      prev.map((p) =>
        p.email === email
          ? { ...p, status: "connected", attemptStartedAt: null }
          : p,
      ),
    );
  }, []);

  const onReject = useCallback((data: any) => {
    const email = (
      data?.toEmail ||
      data?.fromEmail ||
      data?.fromProfile?.email ||
      ""
    )
      .trim()
      .toLowerCase();
    if (!email) return;
    setParticipants((prev) =>
      prev.map((p) =>
        p.email === email
          ? { ...p, status: "rejected", attemptStartedAt: null }
          : p,
      ),
    );
  }, []);

  const onTimeout = useCallback((data: any) => {
    const email = (
      data?.toEmail ||
      data?.fromEmail ||
      data?.fromProfile?.email ||
      ""
    )
      .trim()
      .toLowerCase();
    if (!email) return;
    setParticipants((prev) =>
      prev.map((p) =>
        p.email === email
          ? { ...p, status: "timeout", attemptStartedAt: null }
          : p,
      ),
    );
  }, []);

  const onHangupEvent = useCallback((data: any) => {
    console.log("[CallOverlay] call:hangup event received via socket", data);
    handleHangup("Socket-hangup");
  }, [handleHangup]);

  useEffect(() => {
    if (!socket) return;

    socket.on("call:peer_joined", onPeerJoined);
    socket.on("call:accept", onPeerJoined);
    socket.on("call:reject", onReject);
    socket.on("call:timeout", onTimeout);
    socket.on("call:hangup", onHangupEvent);

    return () => {
      socket.off("call:peer_joined", onPeerJoined);
      socket.off("call:accept", onPeerJoined);
      socket.off("call:reject", onReject);
      socket.off("call:timeout", onTimeout);
      socket.off("call:hangup", onHangupEvent);
    };
  }, [socket, onPeerJoined, onReject, onTimeout, onHangupEvent]);



  // Tick to update elapsed times for tooltips/spinners
  useEffect(() => {
    const interval = setInterval(() => setParticipants(prev => [...prev]), 1000);
    return () => clearInterval(interval);
  }, []);

  // Participant tooltip helper
  const getParticipantTooltip = (p: (typeof participants)[0]) => {
    const baseText = `${p.name} (${p.email})`;
    const statusText =
      p.status === "connected"
        ? "Đã kết nối"
        : p.status === "calling"
          ? "Đang gọi"
          : p.status === "ringing"
            ? "Đang đổ chuông"
            : p.status === "rejected"
              ? "Từ chối"
              : p.status === "timeout"
                ? "Không trả lời"
                : "...";
    const elapsedText = p.attemptStartedAt
      ? ` • ${Math.floor((Date.now() - p.attemptStartedAt) / 1000)}s`
      : "";
    return `${baseText} — ${statusText}${elapsedText}`;
  };

  const handleParticipantHover = (
    p: (typeof participants)[0],
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredParticipant(p.email);
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  };

  // PREMIUM ENDED SCREEN
  const renderEnded = () => (
    <div className="fixed inset-0 z-120 bg-[#0a0a0a]/90 backdrop-blur-3xl flex flex-col items-center justify-center text-white animate-in fade-in zoom-in duration-500 px-6">
      {/* Background Profile Blur */}
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-20">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#0a0a0a]" />
        {peer.avatar ? (
          <img
            src={peer.avatar}
            className="w-full h-full object-cover blur-[100px] scale-150"
            alt=""
          />
        ) : (
          <div className="w-full h-full bg-blue-900/30 blur-[100px] scale-150" />
        )}
      </div>

      <div className="relative mb-10">
        <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping blur-2xl" />
        <div className="w-28 h-28 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 relative z-10">
          <PhoneOff
            size={44}
            className="text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"
          />
        </div>
      </div>

      <h2 className="text-4xl font-black mb-3 tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white to-white/60">
        Cuộc gọi đã kết thúc
      </h2>
      <p className="text-white/40 font-bold uppercase tracking-[0.25em] text-[10px] mb-12">
        ZaloEdu Live • Professional Experience
      </p>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col gap-6 w-full max-w-sm backdrop-blur-md shadow-2xl">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
              <Clock size={20} className="text-blue-400" />
            </div>
            <span className="text-white/60 text-sm font-semibold">
              Thời gian gọi
            </span>
          </div>
          <span className="text-white font-mono text-2xl font-black">
            {formatTime(lastDuration || duration)}
          </span>
        </div>

        <div className="h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
              <Calendar size={20} className="text-emerald-400" />
            </div>
            <span className="text-white/60 text-sm font-semibold">
              Ngày thực hiện
            </span>
          </div>
          <span className="text-white font-bold text-sm tracking-wide">
            {new Date().toLocaleDateString("vi-VN")}
          </span>
        </div>
      </div>

      <div className="mt-16 flex items-center gap-3 py-3 px-6 rounded-full bg-white/5 border border-white/5">
        <Loader2 size={16} className="animate-spin text-white/30" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
          Đang quay lại màn hình chat
        </span>
      </div>
    </div>
  );

  if (callState === "ENDED") return renderEnded();
  if (callState === "IDLE" || (callState === "RINGING" && isIncoming))
    return null;

  const handleToggleCamera = async () => {
    if (callType === "audio") {
      setUpgradeRequestPending(true);
      if (socket && conversationId && toEmail && activeCallId) {
        socket.emit("call:upgrade_request", {
          convId: conversationId,
          callId: activeCallId,
          toEmail,
          fromProfile: { email: user?.email, fullName: user?.fullName },
        });

        // [SENIOR] 25s sender-side timeout (fallback)
        setTimeout(() => {
          const checkState = useCallStore.getState();
          if (
            checkState.upgradeRequestPending &&
            checkState.activeCallId === activeCallId
          ) {
            console.log("[Web-Chime] Upgrade request timed out on sender side");
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

  const handleToggleScreenShare = async () => {
    if (isLocalScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const renderAudioLayout = () => (
    <div className="grow flex flex-col items-center justify-center relative overflow-hidden bg-linear-to-b from-[#0a0a0a] to-[#111118]">
      {/* Background Blur Effect dựa trên Avatar */}
      {peer.avatar && (
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img
            src={peer.avatar}
            className="w-full h-full object-cover blur-[120px] scale-150"
            alt="bg"
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-8 relative z-10 animate-in slide-in-from-bottom-10 fade-in duration-700">
        <div className="relative group">
          {/* Vòng Ripple hiệu ứng âm thanh (chỉ hiện khi đang CONNECTED) */}
          {callState === "CONNECTED" && (
            <>
              <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping opacity-50" />
              <div className="absolute inset-0 bg-blue-500/10 rounded-full animate-pulse scale-125 duration-1000" />
            </>
          )}

          <div className="w-48 h-48 rounded-full border-[6px] border-white/5 overflow-hidden relative z-10 shadow-[0_0_80px_rgba(59,130,246,0.15)] bg-[#1c1c2e]">
            {peer.avatar ? (
              <img
                src={peer.avatar}
                alt={peer.fullName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-linear-to-br from-blue-900/40 to-[#0a0a0a] flex items-center justify-center">
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
            <span
              className={`w-2 h-2 rounded-full ${callState === "CONNECTED" ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`}
            />
            <p
              className={`font-bold uppercase tracking-[0.2em] text-[12px] ${callState === "CONNECTED" ? "text-green-400" : "text-white/60"}`}
            >
              {statusText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderVideoLayout = () => {
    return (
      <div className="grow relative bg-[#0a0a0a] overflow-hidden flex flex-col md:flex-row">
        {/* Main Stage: Screen Share or Remote Video */}
        <div className="grow relative flex items-center justify-center">
          {someoneIsSharing ? (
            <div className="absolute inset-0 z-10 bg-black flex flex-col items-center justify-center">
              <video
                id="main-stage-content"
                ref={screenShareVideoRef}
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
            </div>
          ) : (
            <>
              {isRemoteCameraOn ? (
                <video
                  id="main-stage-remote"
                  ref={remoteVideoRef}
                  className="w-full h-full object-cover animate-in fade-in duration-700"
                  autoPlay
                  playsInline
                />
              ) : (
                <div
                  className={`flex flex-col items-center gap-6 animate-in zoom-in duration-500 ${isMinimized ? "scale-50" : ""}`}
                >
                  <div className="w-28 h-28 rounded-full bg-white/5 animate-pulse flex items-center justify-center border border-white/10 shadow-inner relative">
                    <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-xl" />
                    {peer.avatar ? (
                      <img
                        src={peer.avatar}
                        className="w-full h-full object-cover rounded-full opacity-40 grayscale"
                        alt=""
                      />
                    ) : (
                      <User size={48} className="text-white/10 relative z-10" />
                    )}
                  </div>
                  {!isMinimized && (
                    <div className="text-center">
                      <p className="text-white/20 font-black uppercase tracking-[0.2em] text-[10px] mb-2 flex items-center justify-center gap-2">
                        <CameraOff size={12} /> Camera Đang Tắt
                      </p>
                      <p className="text-white/40 font-bold text-xs">
                        Đang chờ tín hiệu video từ {peer.fullName}...
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Camera Sidebar/Floating Tiles if sharing */}
        {someoneIsSharing && !isMinimized && (
          <div className="absolute bottom-24 right-8 flex flex-col gap-4 z-20">
            {/* Remote Camera Mini Tile */}
            <div className="w-48 aspect-video rounded-2xl bg-[#1c1c2e]/60 backdrop-blur-2xl overflow-hidden border border-white/10 shadow-2xl relative">
              {isRemoteCameraOn ? (
                <video
                  id="sidebar-remote"
                  ref={remoteVideoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/40">
                   <User size={24} className="text-white/20" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/40 rounded text-[9px] font-bold">
                 {peer.fullName}
              </div>
            </div>

            {/* Local Camera Mini Tile */}
            <div className="w-48 aspect-video rounded-2xl bg-[#1c1c2e]/60 backdrop-blur-2xl overflow-hidden border border-white/10 shadow-2xl relative">
              {isCameraOn ? (
                <video
                  id="sidebar-local"
                  ref={localVideoRef}
                  className="w-full h-full object-cover scale-x-[-1]"
                  autoPlay
                  playsInline
                  muted
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black/40">
                   <User size={24} className="text-white/20" />
                </div>
              )}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/40 rounded text-[9px] font-bold">
                 Bạn
              </div>
            </div>
          </div>
        )}

        {/* Local Mini Pip - Default behavior when not sharing */}
        {!someoneIsSharing && !isMinimized && (
          <div className="absolute top-8 right-8 w-64 aspect-video rounded-3xl bg-[#1c1c2e]/60 backdrop-blur-2xl overflow-hidden border border-white/10 shadow-2xl z-20 group transition-all hover:scale-105 hover:shadow-blue-500/10">
            {isCameraOn ? (
              <video
                id="pip-local"
                ref={localVideoRef}
                className="w-full h-full object-cover scale-x-[-1]"
                autoPlay
                playsInline
                muted
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#1c1c2e]/80">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
                  <User size={24} className="text-white/20" />
                </div>
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                  Camera Của Bạn Đang Tắt
                </p>
              </div>
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-5">
              <p className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Bạn
              </p>
            </div>
          </div>
        )}

        {!isMinimized && (
          <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-black/90 to-transparent pointer-events-none" />
        )}

        {!someoneIsSharing && !isMinimized && (
          <div className="absolute left-10 bottom-10 z-10">
            <p className="text-white font-black text-3xl mb-2 tracking-tight">
              {peer.fullName}
            </p>
            <div className="flex items-center gap-3">
              <div
                className={`w-2 h-2 rounded-full ${callState === "CONNECTED" ? "bg-green-500" : "bg-yellow-500"} shadow-[0_0_8px_rgba(34,197,94,0.5)]`}
              />
              <p className="text-white/50 text-[11px] font-black uppercase tracking-[0.2em]">
                {statusText}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`fixed z-110 bg-[#0a0a0a] text-white flex flex-col font-sans transition-all duration-500 ease-in-out shadow-2xl ${
        isMinimized
          ? "bottom-6 right-6 w-80 h-48 rounded-2xl border border-white/20 overflow-hidden cursor-pointer group/pip"
          : "inset-0"
      }`}
    >
      {/* Top Header Overlay - Hidden in Minimized */}
      {!isMinimized && (
        <div className="h-20 flex items-center justify-between px-10 border-b border-white/5 shrink-0 bg-black/20 backdrop-blur-md z-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 shadow-lg">
              <Loader2 size={20} className="text-blue-400 animate-spin-slow" />
            </div>
            <div>
              <p className="font-black text-white text-md leading-tight tracking-tight">
                ZaloEdu Live <span className="text-blue-500 ml-1">Pro</span>
              </p>
              <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/20">
                {callType === "video"
                  ? "Kênh Video Bảo Mật"
                  : "Kênh Thoại Bảo Mật"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white/5 rounded-full px-5 py-1.5 border border-white/10">
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${callState === "CONNECTED" ? "bg-green-500" : "bg-yellow-400"}`}
                />
                {statusText}
              </div>
            </div>

            {participants && participants.length > 0 && (
              <div className="ml-4 hidden md:flex items-center gap-4">
                {/* Connected participants section */}
                {connectedParticipants.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400/70">
                      Đã vào ({connectedParticipants.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {connectedParticipants.map((p) => (
                        <div
                          key={p.email}
                          className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-emerald-400 cursor-pointer hover:scale-110 transition-transform"
                          onMouseEnter={(e) => handleParticipantHover(p, e)}
                          onMouseLeave={() => {
                            setHoveredParticipant(null);
                            setTooltipPos(null);
                          }}
                        >
                          {p.avatar ? (
                            <img
                              src={p.avatar}
                              className="w-full h-full object-cover"
                              alt={p.name}
                            />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs uppercase text-white/30">
                              {p.name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M20 6L9 17L4 12"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ringing participants section */}
                {ringingParticipants.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400/70">
                      Đang đổ chuông ({ringingParticipants.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {ringingParticipants.map((p) => (
                        <div
                          key={p.email}
                          className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-yellow-400 cursor-pointer hover:scale-110 transition-transform"
                          onMouseEnter={(e) => handleParticipantHover(p, e)}
                          onMouseLeave={() => {
                            setHoveredParticipant(null);
                            setTooltipPos(null);
                          }}
                        >
                          {p.avatar ? (
                            <img
                              src={p.avatar}
                              className="w-full h-full object-cover"
                              alt={p.name}
                            />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs uppercase text-white/30">
                              {p.name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-yellow-600 flex items-center justify-center">
                            <Loader2
                              size={12}
                              className="text-white animate-spin"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed participants section */}
                {failedParticipants.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-red-400/70">
                      Không trả lời ({failedParticipants.length})
                    </span>
                    <div className="flex items-center gap-2">
                      {failedParticipants.map((p) => (
                        <div
                          key={p.email}
                          className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-red-400/50 cursor-pointer hover:scale-110 transition-transform opacity-60"
                          onMouseEnter={(e) => handleParticipantHover(p, e)}
                          onMouseLeave={() => {
                            setHoveredParticipant(null);
                            setTooltipPos(null);
                          }}
                        >
                          {p.avatar ? (
                            <img
                              src={p.avatar}
                              className="w-full h-full object-cover"
                              alt={p.name}
                            />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center text-xs uppercase text-white/30">
                              {p.name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M18 6L6 18M6 6l12 12"
                                stroke="white"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setMinimized(true)}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
              title="Thu nhỏ"
            >
              <Minimize2 size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Maximize Overlay for Minimized State */}
      {isMinimized && (
        <div
          onClick={() => setMinimized(false)}
          className="absolute inset-0 z-50 bg-black/0 group-hover/pip:bg-black/60 transition-all flex items-center justify-center opacity-0 group-hover/pip:opacity-100"
        >
          <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-xl transform scale-75 group-hover/pip:scale-100 transition-transform">
            <Maximize2 size={24} className="text-white" />
          </div>
          <div className="absolute top-3 left-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
              {statusText}
            </span>
          </div>
        </div>
      )}

      <div
        className={`relative grow overflow-hidden flex flex-col ${isMinimized ? "pointer-events-none" : ""}`}
      >
        {callType === "video" ? renderVideoLayout() : renderAudioLayout()}

        {/* Incoming Video Upgrade Request Modal */}
        {incomingUpgradeRequest && callState === "CONNECTED" && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-[#1c1c2e]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col items-center animate-in slide-in-from-top-10 zoom-in duration-300">
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mb-3">
              <Camera className="text-blue-400" size={24} />
            </div>
            <p className="text-sm font-bold text-white mb-5">
              {peer.fullName} muốn chuyển sang cuộc gọi Video
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setIncomingUpgradeRequest(false);
                  // Set Web side to video and trigger actual Chime hook
                  useCallStore.getState().setCallType("video");
                  setCameraOn(true);
                  toggleCameraChime(true);
                  // Notify peer
                  if (socket && conversationId && toEmail && activeCallId) {
                    socket.emit("call:upgrade_accepted", {
                      convId: conversationId,
                      callId: activeCallId,
                      toEmail,
                    });
                  }
                }}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                Đồng ý
              </button>
              <button
                onClick={() => {
                  setIncomingUpgradeRequest(false);
                  if (socket && conversationId && toEmail && activeCallId) {
                    socket.emit("call:upgrade_declined", {
                      convId: conversationId,
                      callId: activeCallId,
                      toEmail,
                    });
                  }
                }}
                className="flex-1 py-2.5 bg-white/10 hover:bg-red-500/20 hover:text-red-400 rounded-xl text-xs font-black uppercase tracking-wider transition-colors border border-transparent hover:border-red-500/30"
              >
                Từ chối
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar Overlay - Hidden in Minimized */}
      {!isMinimized && (
        <div className="h-32 flex items-center justify-center pb-10 shrink-0 z-20">
          <div className="bg-white/5 backdrop-blur-3xl border border-white/10 px-8 py-4 rounded-[40px] flex items-center gap-5 shadow-2xl">
            <button
              onClick={handleToggleMic}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isMicOn ? "bg-white/5 text-white" : "bg-red-500/20 text-red-500 border border-red-500/20"}`}
            >
              {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
            </button>

            <button
              onClick={handleToggleCamera}
              disabled={upgradeRequestPending}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${upgradeRequestPending ? "bg-blue-900/50 text-white/50 animate-pulse cursor-not-allowed" : isCameraOn ? "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]" : "bg-white/5 text-white/30 border border-white/5"}`}
            >
              {upgradeRequestPending ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <Camera size={24} />
              )}
            </button>

            <button
              onClick={handleToggleScreenShare}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${isLocalScreenSharing ? "bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]" : "bg-white/5 text-white/30 border border-white/5"}`}
              title={isLocalScreenSharing ? "Dừng chia sẻ màn hình" : "Chia sẻ màn hình"}
            >
              <Monitor size={24} />
            </button>

            <div className="w-px h-8 bg-white/10 mx-2" />

            <button
              onClick={() => handleHangup("manual")}
              className="w-16 h-16 rounded-2xl bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 shadow-[0_0_30px_rgba(239,68,68,0.3)]"
            >
              <PhoneOff size={28} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Styled Participant Tooltip */}
      {hoveredParticipant && tooltipPos && (
        <div
          className="fixed z-200 pointer-events-none animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="bg-[#1c1c2e]/95 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-2 shadow-2xl whitespace-nowrap">
            <p className="text-xs font-bold text-white">
              {participants.find((p) => p.email === hoveredParticipant) &&
                getParticipantTooltip(
                  participants.find((p) => p.email === hoveredParticipant)!,
                )}
            </p>
          </div>
          <div
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-2 h-2 bg-[#1c1c2e]/95 rotate-45"
            style={{ marginTop: "-4px" }}
          />
        </div>
      )}
      {/* Note: Audio tag is now globally managed in App.tsx */}
    </div>
  );
};

export default CallOverlay;
