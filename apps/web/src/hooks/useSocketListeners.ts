import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useChatStore, type Message } from "../store/chatStore";
import { useCallStore } from "../store/callStore";
import {
  leaveCurrentSession,
  toggleCamera as toggleCameraChime,
} from "./useChime";
import {
  getMessagePreview,
  isConversationMutedNow,
  getDisplayName,
} from "../utils/chatUtils";
import {
  bootstrapReminderNotifications,
  registerReminderNotificationFromMessage,
  dismissWebNotificationsByConversation,
} from "../utils/reminderNotifications";
import { pushSecurityAlert } from "../utils/securityAlerts";
import Swal from "sweetalert2";

type PresenceStatus = "online" | "offline";

type PresencePayload = {
  email?: string;
  status?: PresenceStatus | string;
};

type ConversationReadPayload = {
  convId?: string;
};

type HistoryClearedPayload = {
  convId?: string;
};

type TypingPayload = {
  convId?: string;
  email?: string;
  isTyping?: boolean;
};

type SocketMessage = Message & {
  convId?: string;
};

type CallEventData = {
  callId: string;
  convId: string;
  fromEmail?: string;
  callerProfile?: any;
  callType?: "audio" | "video";
  engine?: "webrtc" | "chime";
  meetingInfo?: any;
  fromProfile?: { email?: string };
  toEmail?: string;
  offer?: any;
};

export const useSocketListeners = () => {
  const { socket, user } = useAuth();
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  const activeCallNotificationRef = useRef<Notification | null>(null);

  useEffect(() => {
    bootstrapReminderNotifications();
  }, []);

  // Chat Store Selectors
  const addMessage = useChatStore((state) => state.addMessage);
  const markAsRead = useChatStore((state) => state.markAsRead);
  const setLocalRead = useChatStore((state) => state.setLocalRead);
  const localClearHistory = useChatStore((state) => state.localClearHistory);
  const setUserProfiles = useChatStore((state) => state.setUserProfiles);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const setConversations = useChatStore((state) => state.setConversations);
  const setMessages = useChatStore((state) => state.setMessages);
  const fetchConversations = useChatStore((state) => state.fetchConversations);
  const activeConvId = useChatStore((state) => state.activeConvId);

  // Request notification permission on first user interaction.
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default") return;

    const requestPermission = () => {
      Notification.requestPermission().catch(() => undefined);
    };

    window.addEventListener("click", requestPermission, { once: true });
    return () => {
      window.removeEventListener("click", requestPermission);
    };
  }, []);

  const showIncomingMessageNotification = async (msg: any, convId: string) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !user?.email
    )
      return;
    if (!msg?.id || notifiedMessageIdsRef.current.has(msg.id)) return;
    if (!msg.senderId || msg.senderId === user.email) return;
    if (isConversationMutedNow(convId)) return;

    const shouldNotify =
      document.visibilityState !== "visible" || convId !== activeConvId;
    if (!shouldNotify) return;
    if (Notification.permission !== "granted") return;

    notifiedMessageIdsRef.current.add(msg.id);

    const userProfiles = useChatStore.getState().userProfiles;
    const senderName = getDisplayName(msg.senderId, user, userProfiles);

    const preview = getMessagePreview(msg);
    const title = `Tin nhắn từ ${senderName}`;
    const options: any = {
      body: preview,
      icon: "/logo_blue.png",
      badge: "/logo_blue.png",
      tag: `conv-${convId}`,
      renotify: true,
    };

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch (err) {
      console.warn("[notify] Failed to show notification", err);
    }
  };

  useEffect(() => {
    if (!socket || !user) return;

    // ── Chat Events ──────────────────────────────────────────────────────────

    const handleReceiveMessage = (msg: SocketMessage) => {
      if (!msg?.id) return;

      const incomingConvId = (msg.conversationId || msg.convId || "").trim();
      if (!incomingConvId) return;

      // 1. Add to store (Updates message list if active AND updates inbox preview ALWAYS)
      addMessage(msg);

      const normIncoming = incomingConvId.toLowerCase().startsWith("conv#") 
        ? incomingConvId.toLowerCase() 
        : `conv#${incomingConvId.toLowerCase()}`;
        
      const normActive = (activeConvId || "").toLowerCase().startsWith("conv#")
        ? (activeConvId || "").toLowerCase()
        : `conv#${(activeConvId || "").toLowerCase()}`;

      if (normIncoming === normActive) {
        dismissWebNotificationsByConversation(incomingConvId);
        markAsRead(incomingConvId).catch((error) => {
          console.error("Failed to mark conversation as read", error);
        });
      }

      if (msg.payload?.reminder && msg.status !== "sending") {
        registerReminderNotificationFromMessage(msg, incomingConvId);
      }

      // 3. Browser notification
      if (!msg.payload?.reminder) {
        void showIncomingMessageNotification(msg, incomingConvId);
      }
    };

    const handleConversationRead = (data: ConversationReadPayload) => {
      if (!data?.convId) return;
      setLocalRead(data.convId);
    };

    const handleHistoryCleared = (data: HistoryClearedPayload) => {
      if (!data?.convId) return;
      localClearHistory(data.convId);
    };

    const handlePresenceUpdate = (data: PresencePayload) => {
      const email = String(data?.email || "")
        .trim()
        .toLowerCase();
      if (!email) return;

      const status = data?.status as PresenceStatus;
      if (status !== "online" && status !== "offline") return;

      setUserProfiles((prev) => {
        const existing = prev[email] || {};
        return {
          ...prev,
          [email]: {
            ...existing,
            email,
            status,
          },
        };
      });
    };

    const handleTypingUpdate = (data: TypingPayload) => {
      if (!data?.convId || !data?.email) return;
      document.dispatchEvent(
        new CustomEvent("chat_typing_update", { detail: data }),
      );
    };

    const handleMessageReaction = (data: {
      messageId: string;
      reactions: any;
    }) => {
      updateMessage(data.messageId, { reactions: data.reactions });
    };

    const handleMessageRecalled = (data: { messageId: string }) => {
      updateMessage(data.messageId, {
        recalled: true,
        content: "Tin nhắn đã được thu hồi",
        media: [],
        files: [],
        reactions: {},
      } as any);
    };

    const handleMessagePinned = (data: {
      messageId: string;
      pinned: boolean;
      pinnedBy: string;
    }) => {
      updateMessage(data.messageId, {
        pinned: data.pinned,
        pinnedBy: data.pinnedBy,
      } as any);
    };

    const handleMessagePatched = (data: { convId: string; message: any }) => {
      console.log("[SOCKET] message_patched received:", data);
      if (data.message?.id) {
        updateMessage(data.message.id, data.message);
      }

      // If it contains pinned status change, we might need to update conversation too
      if (data.message?.pinnedMessageIds) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === data.convId
              ? { ...c, pinnedMessageIds: data.message.pinnedMessageIds }
              : c,
          ),
        );
      }
    };

    const handlePinUpdate = (data: {
      conversationId?: string;
      convId?: string;
      pinnedMessageIds: string[];
    }) => {
      const convId = data.conversationId || data.convId;
      if (!convId) return;

      console.log("[SOCKET] PIN_UPDATE received:", data);

      // [SENIOR] Scoped state update
      useChatStore.getState().updateConversationById(convId, {
        pinnedMessageIds: data.pinnedMessageIds,
      });

      // If active, we might want to force a messages refresh or just rely on the memo
      // The PinnedHeader memo will pick up the change because conversations array reference changes.
    };

    const handleGroupUpdate = (data: {
      convId: string;
      members?: string[];
      addedMembers?: string[];
      removedMember?: string[];
      roleUpdated?: any;
      infoUpdated?: any;
      actor: string;
    }) => {
      console.log("[SOCKET] group_updated received:", data);
      // If the conversation exists, update it. If it doesn't and a member was added (possibly this client), fetch and insert it.
      const state = useChatStore.getState();
      const exists = state.conversations.find((c) => c.id === data.convId);

      if (exists) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== data.convId) return c;

            let next = { ...c };
            if (data.members) next.members = data.members;
            if (data.infoUpdated) {
              if (data.infoUpdated.name) next.name = data.infoUpdated.name;
              if (data.infoUpdated.avatar)
                next.avatar = data.infoUpdated.avatar;
            }
            if (data.roleUpdated) {
              if (data.roleUpdated.role === "owner") {
                next.owner = data.roleUpdated.email;
                next.admin = data.roleUpdated.email; // sync legacy
              }
              if (data.roleUpdated.role === "deputy") {
                next.deputies = Array.from(
                  new Set([...(next.deputies || []), data.roleUpdated.email]),
                );
              }
              if (data.roleUpdated.role === "member") {
                next.deputies = (next.deputies || []).filter(
                  (d) => d !== data.roleUpdated.email,
                );
              }
            }
            return next;
          }),
        );
      } else {
        // If the current user was added to this convo or infoUpdated suggests a change, fetch the conversation and insert it
        const addedIncludesMe =
          Array.isArray(data.addedMembers) &&
          user &&
          data.addedMembers
            .map(String)
            .map((s) => s.trim().toLowerCase())
            .includes(user.email?.trim().toLowerCase());
        if (addedIncludesMe || data.infoUpdated) {
          void fetchConversations();

          // If I was added, show a small notification and ensure the inbox reloads immediately
          if (addedIncludesMe) {
            try {
              const userProfiles = useChatStore.getState().userProfiles;
              const actorName = getDisplayName(data.actor, user, userProfiles);
              Swal.fire({
                title: "Bạn đã được thêm vào nhóm",
                text: `${actorName} đã thêm bạn vào nhóm`,
                icon: "info",
                timer: 3000,
                showConfirmButton: false,
              });
            } catch (e) {
              console.warn("Failed to show added notification", e);
            }
          }
        }
      }
    };

    const handleConversationUpdated = (data: {
      convId: string;
      updates: any;
    }) => {
      console.log("[SOCKET] conversation:updated received:", data);
      setConversations((prev) =>
        prev.map((c) => (c.id === data.convId ? { ...c, ...data.updates } : c)),
      );
    };

    const handleGroupDissolved = (data: { convId: string; actor: string }) => {
      console.log("[SOCKET] group_dissolved received:", data);
      setConversations((prev) => prev.filter((c) => c.id !== data.convId));
      if (activeConvId === data.convId) {
        useChatStore.getState().setActiveConversation(null);
        Swal.fire({
          title: "Nhóm đã giải tán",
          text: "Chủ nhóm đã giải tán cuộc trò chuyện này.",
          icon: "info",
          timer: 3000,
        });
      }
    };

    const handleParticipantRead = (data: {
      convId: string;
      email: string;
      timestamp: number;
    }) => {
      if (data.email !== user.email && data.convId === activeConvId) {
        const state = useChatStore.getState();
        const updatedMessages = state.messages.map((m): typeof m => {
          const shouldMarkRead =
            m.senderId === user.email &&
            (!m.status || m.status === "sent" || m.status === "delivered");

          return shouldMarkRead ? { ...m, status: "seen" } : m;
        });

        setMessages(updatedMessages, state.nextCursor);
      }
    };

    const handleSecurityAlert = (data: any) => {
      console.log("[SOCKET] security_alert received:", data);
      pushSecurityAlert(data);
    };

    // ── Call Events ──────────────────────────────────────────────────────────

    const handleCallIncoming = (data: CallEventData) => {
      console.log("[Socket] call:incoming", data);
      const { callState, activeCallId } = useCallStore.getState();

      if (
        callState !== "IDLE" &&
        callState !== "ENDED" &&
        activeCallId &&
        activeCallId !== data.callId
      ) {
        console.warn("[Socket] Busy, auto-rejecting callId:", data.callId);
        socket.emit("call:reject", {
          convId: data.convId,
          callId: data.callId,
          fromEmail: user?.email,
          toEmail: data.fromEmail,
          reason: "BUSY",
        });
        return;
      }

      useCallStore
        .getState()
        .setIncomingCall(
          data.convId,
          data.callId,
          data.callerProfile || data.fromProfile,
          data.callType || "audio",
          data.fromEmail || "",
          data.engine,
          data.offer,
        );

      // ── Desktop Notification for Call ──
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const shouldNotify =
          document.visibilityState !== "visible" ||
          activeConvId !== data.convId;
        if (shouldNotify) {
          const userProfiles = useChatStore.getState().userProfiles;
          // Prefer showing the conversation (group) name in notifications for group calls
          const conv = useChatStore
            .getState()
            .conversations.find((c) => c.id === data.convId);
          const groupName =
            conv?.name ||
            data.callerProfile?.fullName ||
            getDisplayName(data.fromEmail, user, userProfiles);
          const title =
            data.callType === "video"
              ? `Gọi video — ${groupName}`
              : `Gọi thoại — ${groupName}`;
          const options: any = {
            body: `${groupName} đang gọi...`,
            icon:
              (data.callerProfile || data.fromProfile)?.avatarUrl ||
              "/logo_blue.png",
            badge: "/logo_blue.png",
            tag: `call-${data.callId}`,
            requireInteraction: true, // Giữ thông báo trên màn hình cho đến khi user tương tác
          };

          try {
            const n = new Notification(title, options);
            activeCallNotificationRef.current = n;
            n.onclick = () => {
              window.focus();
              n.close();
              activeCallNotificationRef.current = null;
            };
            n.onclose = () => {
              activeCallNotificationRef.current = null;
            };
          } catch (err) {
            console.warn("[notify] Failed to show call notification", err);
          }
        }
      }
    };

    const handleCallAccept = (data: CallEventData) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const { activeCallId, acceptCall, meetingData } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log("[Socket] call:accept — Peer accepted. Starting media.");
        // [CRITICAL FIX] Web is the CALLER: preserve existing meetingData.
        // Do NOT overwrite with meetingInfo from Mobile (which is Mobile's own attendee data).
        // The Web's meeting session was already set up when it called /call/create.
        acceptCall(meetingData ? undefined : data.meetingInfo || {});
      }
    };

    const handleCallDismiss = (data: CallEventData) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const { activeCallId, resetCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        if (callState === "CONNECTED" || callState === "JOINING") {
          console.log(
            "[Socket] call:dismiss ignored — call is already active/joining",
          );
          return;
        }
        console.log("[Socket] call:dismiss — handled on another device");
        resetCall();
      }
    };

    const handleCallHandledElsewhere = (data: CallEventData) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const { activeCallId, resetCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        if (callState === "CONNECTED" || callState === "JOINING") {
          console.log(
            "[Socket] call:handled_elsewhere ignored — call is already active/joining",
          );
          return;
        }
        console.log(
          "[Socket] call:handled_elsewhere — Syncing state across devices",
        );
        resetCall();
      }
    };

    const handleCallHangup = async (data: any) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const {
        activeCallId,
        hangupCall,
        conversationId: currentConvId,
      } = useCallStore.getState();
      // [SENIOR] Refined hangup condition: Must have EITHER callId OR convId.
      // Total catch-all (!data.callId && !data.convId) is too dangerous for production.
      const isMatch = (data.callId && data.callId === activeCallId) || 
                      (data.convId && data.convId === currentConvId);
      
      if (isMatch) {
        console.log(`[Socket] call:hangup — cleaning up. Reason: ${data.reason || "NORMAL"}`);
        await leaveCurrentSession("Socket-hangup");
        hangupCall();
      } else if (!data.callId && !data.convId) {
        console.warn("[Socket] call:hangup received with NO IDs. Ignoring to avoid global crash.");
      }
    };

    const handleCallReject = async (data: CallEventData) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const { activeCallId, rejectCall } = useCallStore.getState();
      if (!data?.callId || data.callId === activeCallId) {
        console.log("[Socket] call:reject — cleaning up");
        await leaveCurrentSession("Socket-reject");
        rejectCall();
      }
    };

    const handleCallTimeout = (data: CallEventData) => {
      if (activeCallNotificationRef.current) {
        activeCallNotificationRef.current.close();
        activeCallNotificationRef.current = null;
      }
      const { activeCallId, rejectCall, callState } = useCallStore.getState();
      if (data.callId === activeCallId) {
        if (callState === "CONNECTED" || callState === "JOINING") {
          console.log(
            "[Socket] call:timeout ignored — call is already active/joining",
          );
          return;
        }
        console.log("[Socket] call:timeout — Closing call screen");
        rejectCall();
      }
    };

    const handleCallPeerJoined = (data: any) => {
      const {
        activeCallId,
        conversationId: currentConvId,
        setPeerJoined,
      } = useCallStore.getState();
      if (
        (data.callId && data.callId === activeCallId) ||
        (data.convId && data.convId === currentConvId)
      ) {
        console.log("[Socket] call:peer_joined");
        setPeerJoined(true);
      }
    };

    const handleUpgradeRequest = (data: CallEventData) => {
      const {
        activeCallId,
        setIncomingUpgradeRequest,
        setUpgradeRequesterEmail,
        conversationId,
        toEmail,
      } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log("[Socket] call:upgrade_request — Peer requesting video");
        setIncomingUpgradeRequest(true);
        setUpgradeRequesterEmail(
          data.fromProfile?.email ?? data.fromEmail ?? null,
        );

        // Auto-timeout for upgrade request
        setTimeout(() => {
          const checkState = useCallStore.getState();
          if (
            checkState.incomingUpgradeRequest &&
            checkState.activeCallId === data.callId
          ) {
            console.log("[Socket] Upgrade request timed out on receiver side");
            setIncomingUpgradeRequest(false);
            if (socket && conversationId && toEmail) {
              socket.emit("call:upgrade_declined", {
                convId: conversationId,
                callId: data.callId,
                toEmail,
              });
            }
          }
        }, 20000);
      }
    };

    const handleUpgradeAccepted = async (data: CallEventData) => {
      const {
        activeCallId,
        setCallType,
        setCameraOn,
        setUpgradeRequestPending,
      } = useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log(
          "[Socket] call:upgrade_accepted — Peer accepted. Switching to video.",
        );
        setCallType("video");
        setCameraOn(true);
        setUpgradeRequestPending(false);
        await toggleCameraChime(true);
      }
    };

    const handleUpgradeDeclined = (data: CallEventData) => {
      const { activeCallId, setUpgradeRequestPending } =
        useCallStore.getState();
      if (data.callId === activeCallId) {
        console.log("[Socket] call:upgrade_declined — Peer declined.");
        setUpgradeRequestPending(false);
        alert("Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.");
      }
    };

    // ── Bind Listeners ───────────────────────────────────────────────────────

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("conversation_marked_read", handleConversationRead);
    socket.on("history_cleared", handleHistoryCleared);
    socket.on("presence_update", handlePresenceUpdate);
    socket.on("typing_update", handleTypingUpdate);
    socket.on("message_reaction", handleMessageReaction);
    socket.on("message_recalled", handleMessageRecalled);
    socket.on("message_pinned", handleMessagePinned);
    socket.on("message_patched", handleMessagePatched);
    socket.on("pin_update", handlePinUpdate);
    socket.on("PIN_UPDATE", handlePinUpdate);
    socket.on("group_updated", handleGroupUpdate);
    socket.on("conversation:updated", handleConversationUpdated);
    socket.on("group_dissolved", handleGroupDissolved);
    socket.on("participant_read", handleParticipantRead);
    socket.on("security_alert", handleSecurityAlert);

    socket.on("call:incoming", handleCallIncoming);
    socket.on("call:accept", handleCallAccept);
    socket.on("call:dismiss", handleCallDismiss);
    socket.on("call:handled_elsewhere", handleCallHandledElsewhere);
    socket.on("call:hangup", handleCallHangup);
    socket.on("call:reject", handleCallReject);
    socket.on("call:timeout", handleCallTimeout);
    socket.on("call:peer_joined", handleCallPeerJoined);
    socket.on("call:upgrade_request", handleUpgradeRequest);
    socket.on("call:upgrade_accepted", handleUpgradeAccepted);
    socket.on("call:upgrade_declined", handleUpgradeDeclined);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("conversation_marked_read", handleConversationRead);
      socket.off("history_cleared", handleHistoryCleared);
      socket.off("presence_update", handlePresenceUpdate);
      socket.off("typing_update", handleTypingUpdate);
      socket.off("message_reaction", handleMessageReaction);
      socket.off("message_recalled", handleMessageRecalled);
      socket.off("message_pinned", handleMessagePinned);
      socket.off("message_patched", handleMessagePatched);
      socket.off("pin_update", handlePinUpdate);
      socket.off("PIN_UPDATE", handlePinUpdate);
      socket.off("group_updated", handleGroupUpdate);
      socket.off("conversation:updated", handleConversationUpdated);
      socket.off("group_dissolved", handleGroupDissolved);
      socket.off("participant_read", handleParticipantRead);
      socket.off("security_alert", handleSecurityAlert);

      socket.off("call:incoming", handleCallIncoming);
      socket.off("call:accept", handleCallAccept);
      socket.off("call:dismiss", handleCallDismiss);
      socket.off("call:handled_elsewhere", handleCallHandledElsewhere);
      socket.off("call:hangup", handleCallHangup);
      socket.off("call:reject", handleCallReject);
      socket.off("call:timeout", handleCallTimeout);
      socket.off("call:peer_joined", handleCallPeerJoined);
      socket.off("call:upgrade_request", handleUpgradeRequest);
      socket.off("call:upgrade_accepted", handleUpgradeAccepted);
      socket.off("call:upgrade_declined", handleUpgradeDeclined);
    };
  }, [
    socket,
    user,
    activeConvId,
    addMessage,
    markAsRead,
    setLocalRead,
    localClearHistory,
    setUserProfiles,
    updateMessage,
    setConversations,
    setMessages,
  ]);
};
