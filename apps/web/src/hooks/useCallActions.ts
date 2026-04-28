import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../context/AuthContext';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import api from '../services/api';

/**
 * Hook đóng gói logic khởi tạo và quản lý cuộc gọi AWS Chime.
 * Dùng trong ChatHeader để attach vào nút Video/Audio.
 */
export const useCallActions = () => {
  const { socket, user } = useAuth();
  const { initiateCall, setPendingMeetingData } = useCallStore();
  const { conversations, activeConvId, userProfiles } = useChatStore();

  const startCall = useCallback(async (type: 'audio' | 'video') => {
    if (!activeConvId || !user || !socket) {
      console.warn('[useCallActions] Missing convId, user or socket');
      return;
    }

    const activeCallId = uuidv4(); // [SENIOR] Generate unique Call ID

    // Tìm email của đối phương từ conversation hiện tại
    const activeConv = conversations.find(c => c.id === activeConvId);
    if (!activeConv || activeConv.type !== 'direct') {
      console.warn('[useCallActions] Group calls not yet supported');
      return;
    }

    const partnerEmail = Array.isArray(activeConv.members)
      ? activeConv.members.find((m: string) => m !== user.email)
      : null;

    if (!partnerEmail) {
      console.warn('[useCallActions] Cannot find partner email');
      return;
    }

    // Lấy profile của partner để hiển thị trong IncomingCallModal
    const partnerProfile = userProfiles[partnerEmail] || {
      email: partnerEmail,
      fullName: partnerEmail,
      avatarUrl: null,
    };

    try {
      // Xác định platform của đối phương
      const { platform: targetPlatform } = await socket.emitWithAck('get_platform', { email: partnerEmail });
      // 1. Khởi tạo UI state ngay lập tức (optimistic)
      // [SENIOR] Force chime engine for everyone as we migrated both Web and Mobile to Chime SDK
      const engine = 'chime';
      initiateCall(activeConvId, activeCallId, type, partnerEmail, partnerProfile, engine);

      if (engine === 'chime') {
        // Cuộc gọi Web -> Web: Tạo hoặc lấy Chime meeting
        const res = await api.post('/call/create', {
          conversationId: activeConvId,
          callId: activeCallId,
          type,
        });
        // ✅ [FIX] Don't trigger session yet, just save as pending
        setPendingMeetingData(res.data.meeting, res.data.attendee, res.data.callType);
      }

      // 4. Thông báo đối phương qua Socket.IO (Bỏ qua tạo Chime meeting nếu WebRTC)
      socket.emit('call:invite', {
        convId: activeConvId,
        callId: activeCallId, // [SENIOR]
        fromEmail: user.email,
        toEmail: partnerEmail,
        callerProfile: {
          email: user.email,
          fullName: user.fullName || user.fullname || user.email,
          avatarUrl: user.avatarUrl || user.avatar,
        },
        callType: type,
      });

      console.log(`[useCallActions] ${type} call started → ${partnerEmail}`);
    } catch (error: any) {
      console.error('[useCallActions] Failed to start call:', error?.message);
      useCallStore.getState().resetCall();
    }
  }, [activeConvId, user, socket, conversations, userProfiles, initiateCall, setPendingMeetingData]);

  return { startCall };
};
