import { useCallback } from 'react';
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
  const { initiateCall, setMeetingData } = useCallStore();
  const { conversations, activeConvId, userProfiles } = useChatStore();

  const startCall = useCallback(async (type: 'audio' | 'video') => {
    if (!activeConvId || !user || !socket) {
      console.warn('[useCallActions] Missing convId, user or socket');
      return;
    }

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
      // 1. Khởi tạo UI state ngay lập tức (optimistic)
      initiateCall(activeConvId, type, partnerEmail, partnerProfile);

      // 2. Tạo Chime meeting trên server
      const res = await api.post('/call/create', {
        conversationId: activeConvId,
        type,
      });

      // 3. Lưu meeting data → useChime sẽ setup session
      setMeetingData(res.data.meeting, res.data.attendee, res.data.callType);

      // 4. Thông báo đối phương qua Socket.IO
      socket.emit('call:invite', {
        convId: activeConvId,
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
  }, [activeConvId, user, socket, conversations, userProfiles, initiateCall, setMeetingData]);

  return { startCall };
};
