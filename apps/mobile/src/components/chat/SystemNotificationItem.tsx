import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useChatStore } from '../../store/chatStore';

interface SystemNotificationItemProps {
  message: any;
  onJump?: (id: string) => void;
}

const SystemNotificationItem = ({ message, onJump }: SystemNotificationItemProps) => {
  const { userProfiles, user } = useChatStore();
  const isReaction = message.metadata?.type === 'reaction_notification';
  const targetId = message.metadata?.targetMessageId;

  const getDisplayName = (email: string) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return "Bạn";
    const p = userProfiles[email.trim().toLowerCase()];
    return p?.nickname || p?.fullName || p?.fullname || email.split('@')[0];
  };

  let displayContent = message.content;
  try {
    const parsed = JSON.parse(message.content);
    if (parsed.action) {
       const actorLabel = getDisplayName(parsed.actor);
       const targetLabel = parsed.target ? getDisplayName(parsed.target) : '';

       switch (parsed.action) {
          case 'member_added':
             displayContent = `${actorLabel} đã thêm ${targetLabel} vào nhóm`;
             break;
          case 'member_removed':
             displayContent = `${actorLabel} đã xóa ${targetLabel} khỏi nhóm`;
             break;
          case 'member_left':
             displayContent = `${actorLabel} đã rời nhóm`;
             break;
          case 'role_updated':
             const roleName = parsed.role === 'owner' ? 'Trưởng nhóm' : parsed.role === 'deputy' ? 'Phó nhóm' : 'Thành viên';
             displayContent = `${actorLabel} đã đặt ${targetLabel} làm ${roleName}`;
             break;
          case 'info_updated':
             displayContent = `${actorLabel} đã cập nhật thông tin nhóm`;
             break;
          case 'group_created':
             displayContent = `${actorLabel} đã tạo nhóm`;
             break;
       }
    }
  } catch (e) {
    // Fallback to raw content
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.bubble} 
        onPress={() => targetId && onJump?.(targetId)}
        disabled={!targetId}
      >
        <Text style={styles.text}>{displayContent}</Text>
        {targetId && <Text style={styles.hint}>Nhấn để xem tin nhắn</Text>}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 30,
  },
  bubble: {
    backgroundColor: '#f1f2f4',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: '#65676b',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  hint: {
    fontSize: 10,
    color: '#0084ff',
    marginTop: 2,
    fontWeight: '600',
  }
});

export default SystemNotificationItem;
