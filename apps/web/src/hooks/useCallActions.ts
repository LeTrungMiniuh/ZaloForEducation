import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuth } from "../context/AuthContext";
import { useCallStore } from "../store/callStore";
import { useChatStore } from "../store/chatStore";
import { useGroupCallStore } from "../store/groupCallStore";
import api from "../services/api";

/**
 * Hook đóng gói logic khởi tạo và quản lý cuộc gọi AWS Chime.
 * Hỗ trợ cả cuộc gọi 1:1 và cuộc gọi Nhóm.
 */
export const useCallActions = () => {
  const { socket, user } = useAuth();
  const { initiateCall, setPendingMeetingData } = useCallStore();
  const { conversations, activeConvId, userProfiles } = useChatStore();
  const { joinMeeting } = useGroupCallStore();

  const startCall = useCallback(
    async (type: "audio" | "video") => {
      if (!activeConvId || !user || !socket) {
        console.warn("[useCallActions] Missing convId, user or socket");
        return;
      }

      const activeConv = conversations.find((c) => c.id === activeConvId);
      if (!activeConv) {
        console.warn("[useCallActions] Cannot find active conversation");
        return;
      }

      const isGroupCall = activeConv.type === "group";
      const activeCallId = uuidv4();

      if (isGroupCall) {
        // [SENIOR] Logic gọi nhóm mới
        console.log(`[useCallActions] 🚀 Starting GROUP ${type} call for: ${activeConvId}`);
        
        const recipientEmails = Array.isArray(activeConv.members)
          ? activeConv.members
              .map((m: any) => (typeof m === 'string' ? m : m.email))
              .filter((m: string) => m && m !== user.email)
          : [];

        console.log(`[useCallActions] 👥 Recipients for group call:`, recipientEmails);

        const { initiateGroupCall } = useGroupCallStore.getState();
        try {
          // [SENIOR] Khởi tạo Chime trước để đảm bảo session tồn tại trong Redis
          await initiateGroupCall(activeConvId, activeCallId, type, recipientEmails, {
            email: user.email,
            fullName: user.fullName || user.fullname || user.email,
            avatarUrl: user.avatarUrl || user.avatar,
          });

          // Sau khi tạo thành công mới gửi tín hiệu mời
          socket.emit("group-call:invite", {
            convId: activeConvId,
            callId: activeCallId,
            fromEmail: user.email,
            recipients: recipientEmails,
            callerProfile: {
              email: user.email,
              fullName: user.fullName || user.fullname || user.email,
              avatarUrl: user.avatarUrl || user.avatar,
            },
            groupName: activeConv.name,
            groupAvatar: activeConv.avatar,
            callType: type,
          });
        } catch (error) {
          console.error("[useCallActions] Group call failed:", error);
        }
        return;
      }

      // --- Logic gọi 1:1 cũ ---
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

      if (!directPartnerEmail) {
        console.warn("[useCallActions] Cannot find partner email");
        return;
      }

      const callProfile = userProfiles[directPartnerEmail!] || {
            email: directPartnerEmail,
            fullName: directPartnerEmail,
            avatarUrl: null,
          };

      try {
        const engine = "chime";
        initiateCall(
          activeConvId,
          activeCallId,
          type,
          directPartnerEmail!,
          callProfile,
          engine,
          recipientEmails,
        );

        if (engine === "chime") {
          const res = await api.post("/call/create", {
            conversationId: activeConvId,
            callId: activeCallId,
            type,
          });
          setPendingMeetingData(
            res.data.meeting,
            res.data.attendee,
            res.data.callType,
          );
        }

        recipientEmails.forEach((toEmail) => {
          socket.emit("call:invite", {
            convId: activeConvId,
            callId: activeCallId,
            fromEmail: user.email,
            toEmail,
            callerProfile: {
              email: user.email,
              fullName: user.fullName || user.fullName || user.email,
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
      joinMeeting
    ],
  );

  const joinGroupCall = useCallback(
    async (convId: string, callId: string, type: string = 'video') => {
      if (!user) return;
      try {
        await joinMeeting(convId, callId, type, {
          email: user.email,
          fullName: user.fullName || user.fullname || user.email,
          avatarUrl: user.avatarUrl || user.avatar,
        });
      } catch (error) {
        console.error("[useCallActions] Failed to join group call:", error);
      }
    },
    [user, joinMeeting]
  );

  return { startCall, joinGroupCall };
};
