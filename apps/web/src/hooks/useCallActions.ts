import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../context/AuthContext";
import { useCallStore } from "../store/callStore";
import { useChatStore } from "../store/chatStore";
import api from "../services/api";

/**
 * Hook đóng gói logic khởi tạo và quản lý cuộc gọi AWS Chime.
 * Dùng trong ChatHeader để attach vào nút Video/Audio.
 */
export const useCallActions = () => {
  const { socket, user } = useAuth();
  const { initiateCall, setPendingMeetingData } = useCallStore();
  const { conversations, activeConvId, userProfiles } = useChatStore();

  const startCall = useCallback(
    async (type: "audio" | "video") => {
      if (!activeConvId || !user || !socket) {
        console.warn("[useCallActions] Missing convId, user or socket");
        return;
      }

      const activeCallId = uuidv4(); // [SENIOR] Generate unique Call ID

      const activeConv = conversations.find((c) => c.id === activeConvId);
      if (!activeConv) {
        console.warn("[useCallActions] Cannot find active conversation");
        return;
      }

      const isGroupCall = activeConv.type === "group";
      const directPartnerEmail = Array.isArray(activeConv.members)
        ? activeConv.members.find((m: string) => m !== user.email)
        : null;

      const recipientEmails = Array.isArray(activeConv.members)
        ? activeConv.members
            .map((member: string) =>
              String(member || "")
                .trim()
                .toLowerCase(),
            )
            .filter(
              (member: string) =>
                member &&
                member !==
                  String(user.email || "")
                    .trim()
                    .toLowerCase(),
            )
        : [];

      if (!isGroupCall && !directPartnerEmail) {
        console.warn("[useCallActions] Cannot find partner email");
        return;
      }

      const callProfile = isGroupCall
        ? {
            email: activeConv.id,
            fullName: activeConv.name || "Nhóm",
            avatarUrl: activeConv.avatar || null,
          }
        : userProfiles[directPartnerEmail!] || {
            email: directPartnerEmail,
            fullName: directPartnerEmail,
            avatarUrl: null,
          };

      try {
        // 1. Khởi tạo UI state ngay lập tức (optimistic)
        // [SENIOR] Force chime engine for everyone as we migrated both Web and Mobile to Chime SDK
        const engine = "chime";
        initiateCall(
          activeConvId,
          activeCallId,
          type,
          isGroupCall ? recipientEmails[0] || "" : directPartnerEmail!,
          callProfile,
          engine,
          recipientEmails,
        );

        if (engine === "chime") {
          // Cuộc gọi Web -> Web: Tạo hoặc lấy Chime meeting
          const res = await api.post("/call/create", {
            conversationId: activeConvId,
            callId: activeCallId,
            type,
          });
          // ✅ [FIX] Don't trigger session yet, just save as pending
          setPendingMeetingData(
            res.data.meeting,
            res.data.attendee,
            res.data.callType,
          );
        }

        // 4. Thông báo đối phương qua Socket.IO (Bỏ qua tạo Chime meeting nếu WebRTC)
        recipientEmails.forEach((toEmail) => {
          socket.emit("call:invite", {
            convId: activeConvId,
            callId: activeCallId,
            fromEmail: user.email,
            toEmail,
            callerProfile: {
              email: user.email,
              fullName: user.fullName || user.fullname || user.email,
              avatarUrl: user.avatarUrl || user.avatar,
            },
            callType: type,
          });
        });

        console.log(
          `[useCallActions] ${type} call started → ${recipientEmails.join(", ")}`,
        );
      } catch (error: any) {
        console.error("[useCallActions] Failed to start call:", error?.message);
        useCallStore.getState().resetCall();
      }
    },
    [
      activeConvId,
      user,
      socket,
      conversations,
      userProfiles,
      initiateCall,
      setPendingMeetingData,
    ],
  );

  return { startCall };
};
