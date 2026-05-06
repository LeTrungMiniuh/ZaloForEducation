import { useEffect, useCallback } from "react";
import {
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  ConsoleLogger,
  LogLevel,
} from "amazon-chime-sdk-js";
import { useCallStore } from "../store/callStore";
import { useAuth } from "../context/AuthContext";

// Module-level singletons: survive React re-renders and component unmounts
let globalSession: DefaultMeetingSession | null = null;
let globalLocalVideo: HTMLVideoElement | null = null;
let globalRemoteVideo: HTMLVideoElement | null = null;
let globalContentVideo: HTMLVideoElement | null = null;
let globalTiles: { local?: number; remote?: number; content?: number } = {};
let globalVideoStarted = false;

const isValidTileId = (tileId: unknown): tileId is number =>
  typeof tileId === "number" && Number.isFinite(tileId);

const requestNextTick = (callback: () => void) => {
  requestAnimationFrame(() => requestAnimationFrame(callback));
};

/**
 * [Web-Chime] Normalize Chime attendee IDs (strips modality suffix like #1, #2)
 */
const normalizeAttendeeId = (id?: string | null): string | null => {
  if (!id) return null;
  return id.split("#")[0];
};

/**
 * Cập nhật video element refs từ CallOverlay.
 * Truyền `undefined` để giữ nguyên phía đó.
 */
export const setLocalVideoRef = (node: HTMLVideoElement | null) => {
  globalLocalVideo = node;
  const tId = globalTiles.local;
  if (globalLocalVideo && tId !== undefined && globalSession) {
    console.log(`[Web-Chime] 🔗 Binding LOCAL tile ${tId}`);
    globalSession.audioVideo.bindVideoElement(tId, globalLocalVideo);
  }
};

export const setRemoteVideoRef = (node: HTMLVideoElement | null) => {
  globalRemoteVideo = node;
  const tId = globalTiles.remote;
  if (globalRemoteVideo && tId !== undefined && globalSession) {
    console.log(`[Web-Chime] 🔗 Binding REMOTE tile ${tId}`);
    globalSession.audioVideo.bindVideoElement(tId, globalRemoteVideo);
  }
};

export const setContentVideoRef = (node: HTMLVideoElement | null) => {
  globalContentVideo = node;
  const tId = globalTiles.content;
  if (node && tId !== undefined && globalSession) {
    globalSession.audioVideo.bindVideoElement(tId, node);
  }
};

const tryBindTile = (tileId: number, type: "local" | "remote" | "content", attempt = 0) => {
  if (!globalSession) return;
  
  let el: HTMLVideoElement | null = null;
  if (type === "local") el = globalLocalVideo;
  else if (type === "remote") el = globalRemoteVideo;
  else if (type === "content") el = globalContentVideo;

  if (el) {
    globalSession.audioVideo.bindVideoElement(tileId, el);
    console.log(`[Chime] ✅ ${type.toUpperCase()} tile=${tileId} bound on attempt ${attempt}`);
  } else if (attempt < 5) {
    setTimeout(() => tryBindTile(tileId, type, attempt + 1), 100 * (attempt + 1));
  } else {
    console.warn(`[Chime] ❌ FAILED BINDING tile=${tileId}: ${type.toUpperCase()} element is NULL after 5 attempts`);
  }
};

/**
 * Dừng toàn bộ hardware và cleanup Chime session.
 */
export const leaveCurrentSession = async (reason: string = "unknown") => {
  if (globalSession) {
    console.log(`[Chime] Cleaning up global session. Reason: ${reason}`);
    const sessionToStop = globalSession;
    globalSession = null;
    
    try {
      const store = useCallStore.getState();
      if (store.isLocalScreenSharing) {
        sessionToStop.audioVideo.stopContentShare();
        await new Promise(res => setTimeout(res, 200));
        cleanupScreenShareStream();
      }

      const cleanupPromises: Promise<any>[] = [
        sessionToStop.audioVideo.stopAudioInput()
      ];
      
      if (globalVideoStarted) {
        cleanupPromises.push(sessionToStop.audioVideo.stopVideoInput());
      }

      await Promise.allSettled(cleanupPromises);

      sessionToStop.audioVideo.stop();
    } catch (e) {
      console.warn("[Chime] Cleanup error:", e);
    }
    
    globalTiles = {};
    globalVideoStarted = false;
    globalLocalVideo = null;
    globalRemoteVideo = null;
    globalContentVideo = null;
    console.log("[Chime] Session cleaned up.");
  }
};

const cleanupScreenShareStream = () => {
  const store = useCallStore.getState();
  if (store.localScreenShareStream) {
    store.localScreenShareStream.getTracks().forEach(t => t.stop());
  }
  store.setLocalScreenSharing(false, null);
  
  // SSOT cleanup
  const myId = normalizeAttendeeId(store.attendeeData?.AttendeeId)?.toLowerCase();
  if (myId) {
    store.setScreenShare(myId, { stream: null, isSharing: false });
  }
};

/**
 * Gán tile vào video element tương ứng.
 */
export const bindTile = (tileId: number, type: "local" | "remote" | "content") => {
  if (!globalSession || !isValidTileId(tileId)) return;

  let el: HTMLVideoElement | null = null;
  if (type === "local") el = globalLocalVideo;
  else if (type === "remote") el = globalRemoteVideo;
  else if (type === "content") el = globalContentVideo;

  if (el) {
    console.log(`[Chime] 🔗 BINDING tile=${tileId} to ${type.toUpperCase()} elementId=${el.id || "no-id"}`);
    globalSession.audioVideo.bindVideoElement(tileId, el);
  } else {
    console.warn(`[Chime] ⚠️ FAILED BINDING tile=${tileId}: ${type.toUpperCase()} element is NULL`);
  }
};

/**
 * Gán lại toàn bộ các tile hiện có vào DOM nodes.
 */
export const rebindAllTiles = () => {
  if (isValidTileId(globalTiles.local)) bindTile(globalTiles.local, "local");
  if (isValidTileId(globalTiles.remote)) bindTile(globalTiles.remote, "remote");
  if (isValidTileId(globalTiles.content)) bindTile(globalTiles.content, "content");
};

/**
 * Bật/tắt camera trong phiên đang hoạt động.
 */
export const toggleCamera = async (turnOn: boolean) => {
  if (!globalSession) {
    console.warn("[Chime] toggleCamera called but no active session");
    return;
  }
  if (turnOn) {
    try {
      console.log("[Chime] Starting Video Input...");
      const devices = await globalSession.audioVideo.listVideoInputDevices();
      if (devices.length > 0) {
        await globalSession.audioVideo.startVideoInput(devices[0].deviceId);
      } else {
        await globalSession.audioVideo.startVideoInput({ video: true } as any);
      }
      globalSession.audioVideo.startLocalVideoTile();
      globalVideoStarted = true;
      // Trì hoãn nhẹ để gán ref nếu thẻ video local được render sau đó
      setTimeout(() => {
        if (globalTiles.local !== undefined && globalLocalVideo) {
          globalSession!.audioVideo.bindVideoElement(
            globalTiles.local,
            globalLocalVideo,
          );
        }
      }, 500);
    } catch (e: any) {
      console.error("[Chime] toggleCamera ON failed:", e?.message);
    }
  } else {
    try {
      console.log("[Chime] Stopping Video Input...");
      globalSession.audioVideo.stopLocalVideoTile();
      await globalSession.audioVideo.stopVideoInput();
      if (globalLocalVideo?.srcObject) {
        (globalLocalVideo.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
        globalLocalVideo.srcObject = null;
      }
      globalVideoStarted = false;
    } catch (e: any) {
      console.error("[Chime] toggleCamera OFF failed:", e?.message);
    }
  }
};

/**
 * Bật/Tắt Micro.
 */
export const toggleMic = async (turnOn: boolean) => {
  if (!globalSession) return;
  if (turnOn) {
    globalSession.audioVideo.realtimeUnmuteLocalAudio();
    console.log("[Chime] Microphone UNMUTED");
  } else {
    globalSession.audioVideo.realtimeMuteLocalAudio();
    console.log("[Chime] Microphone MUTED");
  }
};
 
/**
 * Bật chia sẻ màn hình (Screen Share)
 */
let stopScreenShareProxy = async () => {};

export const startScreenShare = async () => {
  if (!globalSession) return;
 
  const store = useCallStore.getState();
  
  // Toggle behavior
  if (store.isLocalScreenSharing) {
    await stopScreenShare();
    return;
  }
 
  // Guard: Someone else is sharing
  const isSomeoneSharing = Object.values(store.screenShares).some(s => s.isSharing);
  if (isSomeoneSharing) {
    alert("Đang có người khác chia sẻ màn hình. Bạn không thể chia sẻ lúc này.");
    return;
  }
 
  try {
    console.log("[Chime] Starting Screen Capture...");
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 15 }
      },
      audio: false
    });
 
    const track = stream.getVideoTracks()[0];
    track.onended = () => {
      stopScreenShareProxy();
    };
 
    store.setLocalScreenSharing(true, stream);
    
    requestNextTick(() => {
      if (globalSession) {
        globalSession.audioVideo.startContentShare(stream).catch(e => {
          console.error("[Chime] startContentShare failed:", e);
          cleanupScreenShareStream();
        });
      }
    });
  } catch (e: any) {
    console.error("[Chime] startScreenShare failed:", e);
    if (e.name === "NotAllowedError") {
      alert("Bạn đã từ chối quyền chia sẻ màn hình.");
    }
    store.setLocalScreenSharing(false, null);
  }
};
 
export const stopScreenShare = async () => {
  try {
    globalSession?.audioVideo.stopContentShare();
  } catch (e) {
    console.error("[Chime] stopScreenShare error:", e);
  } finally {
    cleanupScreenShareStream();
  }
};

stopScreenShareProxy = stopScreenShare;

export const useChime = () => {
  const {
    meetingData,
    attendeeData,
    callState,
    setCallState,
    resetCall,
    setConnecting,
    setConnectionError,
    setRemoteCameraOn,
    setRemoteTiles,
    remoteTiles,
  } = useCallStore();
  const { socket } = useAuth();

  const setupSession = useCallback(
    async (type: "audio" | "video") => {
      // [DEFENSIVE] Nếu có session cũ bị treo, dọn dẹp trước khi bắt đầu cái mới
      if (globalSession) {
        console.log(
          "[Chime] Existing session found, cleaning up before new call...",
        );
        await leaveCurrentSession();
      }

      const { meetingData: meeting, attendeeData: attendee } =
        useCallStore.getState();
      if (!meeting || !attendee) {
        console.error(
          "[Chime] setupSession ABORTED: Missing meeting/attendee data",
        );
        setConnectionError("Mất dữ liệu cuộc gọi (Missing Data)");
        return;
      }

      console.log(
        `[Chime] >>> Starting session setup (Meeting: ${meeting.MeetingId}) <<<`,
      );
      setConnecting(true);
      setConnectionError(null);

      const logger = new ConsoleLogger("ChimeMeeting", LogLevel.WARN);
      const deviceController = new DefaultDeviceController(logger);
      const config = new MeetingSessionConfiguration(meeting, attendee);
      const session = new DefaultMeetingSession(
        config,
        logger,
        deviceController,
      );

      globalSession = session;
      globalTiles = {};
      globalVideoStarted = false;

      try {
        console.log("[Chime] Step 1: Initializing audio...");
        const audioInputDevices =
          await session.audioVideo.listAudioInputDevices();
        if (audioInputDevices.length > 0) {
          console.log(
            `[Chime] Found ${audioInputDevices.length} audio inputs. First: ${audioInputDevices[0].label}`,
          );
          try {
            await session.audioVideo.startAudioInput(
              audioInputDevices[0].deviceId,
            );
          } catch (e) {
            console.warn(
              "[Chime] Failed to start specific audio input, trying default...",
            );
            await session.audioVideo.startAudioInput(null as any);
          }
        } else {
          console.warn(
            "[Chime] No specific audio input devices found, attempting default...",
          );
          await session.audioVideo.startAudioInput(null as any);
        }

        const audioOutputDevices =
          await session.audioVideo.listAudioOutputDevices();
        if (audioOutputDevices.length > 0) {
          console.log(
            `[Chime] Using speaker: ${audioOutputDevices[0].label || "Default"}`,
          );
          await session.audioVideo.chooseAudioOutput(
            audioOutputDevices[0].deviceId,
          );
        } else {
          console.warn(
            "[Chime] No audio output devices found, attempting default...",
          );
          await session.audioVideo.chooseAudioOutput(null as any);
        }

        // [AUDIO FIX] Local mic will be unmuted in audioVideoDidStart callback

        // 2. Video Input
        if (type === "video") {
          console.log("[Chime] Step 2: Listing video devices...");
          try {
            const videoInputDevices =
              await session.audioVideo.listVideoInputDevices();
            if (videoInputDevices.length > 0) {
              await session.audioVideo.startVideoInput(
                videoInputDevices[0].deviceId,
              );
            } else {
              await session.audioVideo.startVideoInput({ video: true } as any);
            }
            globalVideoStarted = true;
          } catch (videoErr: any) {
            console.error("[Chime] Step 2 FAIL: Video setup failed", videoErr);
          }
        }

        // 3. Observer
        session.audioVideo.addObserver({
          videoTileDidUpdate: (tileState: any) => {
            const tileId = tileState.tileId;
            const isLocal = !!tileState.localTile;
            const attendeeId = normalizeAttendeeId(
              tileState.boundExternalUserId || tileState.boundAttendeeId,
            );

            console.log(
              `[Web-Chime] 🎥 Tile Update: id=${tileId} isLocal=${isLocal} attendee=${attendeeId} active=${tileState.active} isContent=${tileState.isContent}`,
            );

            if (!attendeeId) {
              console.log(`[Web-Chime] ⏳ Tile ${tileId} has no attendeeId yet. Skipping bind...`);
              return;
            }

            if (tileState.isContent) {
              globalTiles.content = tileId;
              const store = useCallStore.getState();

              if (!tileState.active) {
                globalTiles.content = undefined;
                store.clearAllScreenShares();
                rebindAllTiles();
                return;
              }

              if (!store.screenShares[attendeeId]) {
                store.setScreenShare(attendeeId, { stream: null, isSharing: true });
              }
              tryBindTile(tileId, "content");
              return;
            }

            if (isLocal) {
              globalTiles.local = tileId;
              tryBindTile(tileId, "local");
            } else {
              globalTiles.remote = tileId;
              setRemoteCameraOn(true);
              if (!remoteTiles.find((t) => t.tileId === tileId)) {
                setRemoteTiles([{ tileId, attendeeId }]);
              }
              tryBindTile(tileId, "remote");
            }
          },
          videoTileWasRemoved: (tileId: number) => {
            console.log(`[Web-Chime] ❌ Tile Removed: ${tileId}`);
            if (!isValidTileId(tileId)) return;

            const store = useCallStore.getState();
            if (globalTiles.local === tileId) {
              globalTiles.local = undefined;
            }
            if (globalTiles.content === tileId) {
              console.log("[Web-Chime] 🖥️ Screen share tile removed. Cleaning up...");
              globalTiles.content = undefined;
              store.clearAllScreenShares();
              // Force re-bind others to ensure camera restoration
              rebindAllTiles();
            }
            if (globalTiles.remote === tileId) {
              globalTiles.remote = undefined;

              try {
                session.audioVideo.unbindVideoElement(tileId);
              } catch (e) {
                console.warn(
                  `[Web-Chime] unbindVideoElement failed for tile ${tileId}`,
                  e,
                );
              }

              // Clear from store
              const { remoteTiles, setRemoteTiles, setRemoteCameraOn } =
                useCallStore.getState();
              const nextTiles = remoteTiles.filter((t) => t.tileId !== tileId);
              setRemoteTiles(nextTiles);

              if (nextTiles.length === 0) {
                setRemoteCameraOn(false);
              }
            }
          },
          audioVideoDidStart: () => {
            console.log("[Web-Chime] ✅ Session STARTED successfully");
            setConnecting(false);
            useCallStore.getState().setConnected();

            // [FIX] Notify backend that peer has successfully joined Chime meeting to clear Ghost Hangup timer
            const { conversationId, activeCallId, toEmail, toEmails } =
              useCallStore.getState();
            console.log("[Web-Chime] 🧪 Debug Signaling Check:", {
              conversationId,
              activeCallId,
              hasSocket: !!socket
            });
            if (
              conversationId &&
              activeCallId &&
              socket
            ) {
              const recipients =
                toEmails && toEmails.length > 0
                  ? toEmails
                  : toEmail
                    ? [toEmail]
                    : [];
              console.log(
                "[Web-Chime] 📢 Notifying backend: call:peer_joined to clear Ghost Hangup timer",
              );
              socket.emit("call:peer_joined", {
                convId: conversationId,
                callId: activeCallId,
                toEmail: toEmail || recipients[0] || null,
                toEmails: recipients.length > 0 ? recipients : undefined,
              });
            }

            // [CRITICAL] Bind audio element NOW — session is ready
            const audioEl = document.getElementById(
              "chime-audio",
            ) as HTMLAudioElement | null;
            if (audioEl && session) {
              audioEl.volume = 1.0;
              audioEl.muted = false;
              session.audioVideo
                .bindAudioElement(audioEl)
                .then(() => {
                  console.log(
                    "[Web-Chime] 🔊 Audio element bound INSIDE audioVideoDidStart",
                  );
                  session.audioVideo.realtimeUnmuteLocalAudio();
                  audioEl.play().catch((e) => {
                    console.warn(
                      "[Web-Chime] 🔇 Autoplay blocked? Retrying on first click.",
                      e,
                    );
                    const playOnActive = () => {
                      audioEl.play();
                      document.removeEventListener("click", playOnActive);
                    };
                    document.addEventListener("click", playOnActive);
                  });
                })
                .catch((e: any) =>
                  console.warn("[Web-Chime] Audio bind error:", e),
                );
            } else {
              console.warn(
                "[Web-Chime] ⚠️ #chime-audio NOT FOUND when session started",
              );
            }
          },
          audioVideoDidStop: (sessionStatus: any) => {
            const code = sessionStatus?.statusCode();
            console.log(`[Web-Chime] Session STOPPED (Code: ${code})`);

            const currentState = useCallStore.getState().callState;
            if (
              currentState !== "ENDED" &&
              currentState !== "IDLE" &&
              code !== undefined &&
              code !== 0 &&
              code !== 1 &&
              code !== 5
            ) {
              setConnectionError(`Lỗi kết nối (Code: ${code})`);
            }
            setConnecting(false);
          },
          audioVideoDidStartConnecting: (reconnecting: boolean) => {
            console.log(`[Chime] Connecting... (reconnecting=${reconnecting})`);
            setConnecting(true);
          },
        });

        // [FIX] Attendee Presence is handled via Realtime API, not AudioVideoObserver
        session.audioVideo.realtimeSubscribeToAttendeeIdPresence(
          (attendeeId, present) => {
            console.log(
              `[Web-Chime] 👤 Attendee ${attendeeId} is ${present ? "PRESENT" : "LEFT"}`,
            );
            if (present) {
              // Safety-net: Re-verify audio binding when someone joins
              const audioEl = document.getElementById(
                "chime-audio",
              ) as HTMLAudioElement | null;
              if (audioEl && session) {
                session.audioVideo.bindAudioElement(audioEl).catch(() => {});
              }
            }
          },
        );

        // 4. Audio Output binding — primary bind is in audioVideoDidStart callback above.
        // This is a SAFETY NET rebind after 2s in case the callback fires before DOM is ready.
        console.log("[Chime] Step 4: Scheduling safety-net audio rebind...");
        setTimeout(async () => {
          const audioEl = document.getElementById(
            "chime-audio",
          ) as HTMLAudioElement | null;
          if (audioEl && globalSession) {
            try {
              await globalSession.audioVideo.bindAudioElement(audioEl);
              console.log(
                "[Chime] Step 4 OK: Safety-net audio rebind successful",
              );
            } catch (e) {
              console.warn(
                "[Chime] Step 4: Safety-net rebind skipped (already bound)",
              );
            }
          }
        }, 2000);

        // 5. Start session
        console.log("[Chime] Step 5: Calling audioVideo.start()...");

        let retries = 0;
        let success = false;
        while (retries < 3 && !success) {
          try {
            await session.audioVideo.start();
            console.log(
              `[Chime] Step 5 OK: Session STARTED (Attempt ${retries + 1})`,
            );
            success = true;
          } catch (e) {
            retries++;
            console.error(`[Chime] Step 5 FAILED on attempt ${retries}:`, e);
            if (retries >= 3) {
              throw e; // Ném lỗi ra ngoài catch block chính
            } else {
              console.log(`[Chime] Retrying in 1000ms...`);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }

        // 6. Start local video tile
        if (type === "video") {
          console.log("[Chime] Step 6: Starting local video tile...");
          session.audioVideo.startLocalVideoTile();
        }

        // 7. Periodic rebinds
        setTimeout(() => rebindAllTiles(), 1500);
      } catch (error: any) {
        console.error("[Chime] ❌ setupSession CRASHED:", error);
        setConnectionError(`Lỗi Media: ${error?.message || "Không xác định"}`);
        setConnecting(false);
        // globalSession = null; // Don't nullify yet, might be transient
      }
    },
    [
      setCallState,
      resetCall,
      bindTile,
      rebindAllTiles,
      setConnecting,
      setConnectionError,
      setRemoteCameraOn,
      setRemoteTiles,
      remoteTiles,
      socket,
    ],
  );

  useEffect(() => {
    // For Caller: This happens after receiving 'call:accept' socket.
    // For Callee: This happens after clicking 'Accept' button.
    if (
      meetingData &&
      attendeeData &&
      !globalSession &&
      callState === "JOINING"
    ) {
      const type = useCallStore.getState().callType;
      console.log(
        `[Chime] useEffect triggered — creating session (type=${type})`,
      );
      setupSession(type);
    }
  }, [
    meetingData?.MeetingId,
    attendeeData?.AttendeeId,
    setupSession,
    callState,
  ]);

  return {
    // rebindAllTiles, // Now exported standalone
  };
};
