import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import styles from '../../screens/main/style/HomeScreen.styles';
import { Colors } from '../../constants/Theme';

const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];

interface MessageActionSheetProps {
  isVisible: boolean;
  message: any;
  userEmail: string;
  onClose: () => void;
  onReact: (message: any, emoji: string) => void;
  onReply: (message: any) => void;
  onCopy: (text: string) => void;
  onForward: (message: any) => void;
  onPin: (message: any) => void;
  onRecall: (messageId: string) => void;
  onDeleteForMe: (messageId: string) => void;
}

export const MessageActionSheet: React.FC<MessageActionSheetProps> = ({
  isVisible,
  message,
  userEmail,
  onClose,
  onReact,
  onReply,
  onCopy,
  onForward,
  onPin,
  onRecall,
  onDeleteForMe,
}) => {
  if (!isVisible || !message) return null;

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        style={styles.actionSheet}
        onPress={(e) => e.stopPropagation()}
      >
        {/* Reactions Bar */}
        <View style={styles.reactionBar}>
          {REACTION_OPTIONS.map((emoji) => (
            <TouchableOpacity
              key={`react-${emoji}`}
              style={styles.reactionOption}
              onPress={() => onReact(message, emoji)}
            >
              <Text style={styles.reactionEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionGrid}>
          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onReply(message)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#f0f7ff' }]}>
              <Text style={[styles.actionIcon, { color: Colors.primary }]}>reply</Text>
            </View>
            <Text style={styles.actionText}>Trả lời</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onCopy(message.content)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#f0fff4' }]}>
              <Text style={[styles.actionIcon, { color: '#22c55e' }]}>content_copy</Text>
            </View>
            <Text style={styles.actionText}>Sao chép</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onForward(message)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#fff7ed' }]}>
              <Text style={[styles.actionIcon, { color: '#f97316' }]}>forward</Text>
            </View>
            <Text style={styles.actionText}>Chuyển tiếp</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionItem}
            onPress={() => onPin(message)}
          >
            <View style={[styles.actionIconBox, { backgroundColor: '#fef3c7' }]}>
              <Text style={[styles.actionIcon, { color: '#d97706' }]}>push_pin</Text>
            </View>
            <Text style={styles.actionText}>{message.pinned ? 'Bỏ ghim' : 'Ghim'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionList}>
          {message.senderId === userEmail && !message.recalled && (
            <TouchableOpacity
              style={styles.actionListItem}
              onPress={() => onRecall(message.id)}
            >
              <Text style={styles.actionListIcon}>history_toggle_off</Text>
              <Text style={[styles.actionListText, { color: '#ef4444' }]}>
                Thu hồi tin nhắn
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.actionListItem}
            onPress={() => onDeleteForMe(message.id)}
          >
            <Text style={[styles.actionListIcon, { color: '#ef4444' }]}>delete</Text>
            <Text style={[styles.actionListText, { color: '#ef4444' }]}>
              Xóa ở phía tôi
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Pressable>
  );
};
