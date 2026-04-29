import React from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, TextInput, Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import styles from '../../screens/main/style/ChatScreen.styles';
import { REACTION_OPTIONS, FLUENT_EMOJI_MAP } from '../../constants/Emojis';
import Alert from '../../utils/Alert';

interface ChatModalsProps {
  actionMessage: any;
  setActionMessage: (val: any) => void;
  onReaction: (message: any, emoji: string) => void;
  onReply: (message: any) => void;
  onForward: (message: any) => void;
  onRecall: (message: any) => void;
  onDelete: (message: any) => void;
  onPin: (message: any) => void;
  userEmail: string;
  showMuteMenuModal: boolean;
  setShowMuteMenuModal: (val: boolean) => void;
  onSelectMuteSchedule: (type: string) => void;
  showCustomMuteModal: boolean;
  setShowCustomMuteModal: (val: boolean) => void;
  customMuteStartTime: string;
  setCustomMuteStartTime: (val: string) => void;
  customMuteEndTime: string;
  setCustomMuteEndTime: (val: string) => void;
  onApplyCustomMuteSchedule: () => void;
}

const EmojiItem = ({ emoji }: { emoji: string }) => {
  const [failed, setFailed] = React.useState(false);
  const url = (FLUENT_EMOJI_MAP as any)[emoji];

  if (failed || !url) {
    return <Text style={{ fontSize: 24 }}>{emoji}</Text>;
  }

  return (
    <Image 
      source={{ uri: url }} 
      style={styles.reactionPickerEmoji} 
      onError={() => setFailed(true)}
    />
  );
};

export const ChatModals: React.FC<ChatModalsProps> = ({
  actionMessage,
  setActionMessage,
  onReaction,
  onReply,
  onForward,
  onRecall,
  onDelete,
  onPin,
  userEmail,
  showMuteMenuModal,
  setShowMuteMenuModal,
  onSelectMuteSchedule,
  showCustomMuteModal,
  setShowCustomMuteModal,
  customMuteStartTime,
  setCustomMuteStartTime,
  customMuteEndTime,
  setCustomMuteEndTime,
  onApplyCustomMuteSchedule,
}) => {
  return (
    <>
      {/* ACTION SHEET */}
      {actionMessage && (
        <Pressable style={styles.overlay} onPress={() => setActionMessage(null)}>
          <View style={styles.actionSheet}>
            <View style={styles.reactionBar}>
              {REACTION_OPTIONS.map(e => (
                <TouchableOpacity key={e} onPress={() => { onReaction(actionMessage, e); setActionMessage(null); }}>
                  <EmojiItem emoji={e} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionGrid}>
              {/* RECALL BUTTON - ONLY FOR SENDER AND NOT RECALLED */}
              {String(actionMessage.senderId || "").trim().toLowerCase() === String(userEmail || "").trim().toLowerCase() && !actionMessage.recalled && (
                <TouchableOpacity style={styles.actionItem} onPress={() => { onRecall(actionMessage); setActionMessage(null); }}>
                  <View style={[styles.actionIconBox, { backgroundColor: '#fff1f2' }]}><Text style={[styles.actionIcon, { color: '#f43f5e' }]}>history</Text></View>
                  <Text style={styles.actionText}>Thu hồi</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionItem} onPress={() => { onReply(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#e0f2fe' }]}><Text style={[styles.actionIcon, { color: '#0ea5e9' }]}>reply</Text></View>
                <Text style={styles.actionText}>Trả lời</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.actionItem} onPress={() => { onForward(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#f0fdf4' }]}><Text style={[styles.actionIcon, { color: '#22c55e' }]}>redo</Text></View>
                <Text style={styles.actionText}>Chuyển tiếp</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => { onPin(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#fefce8' }]}><Text style={[styles.actionIcon, { color: '#ca8a04' }]}>push_pin</Text></View>
                <Text style={styles.actionText}>{actionMessage.pinned ? 'Bỏ ghim' : 'Ghim'}</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionItem} 
                onPress={async () => { 
                  if (actionMessage.content) {
                    await Clipboard.setStringAsync(actionMessage.content);
                    Alert.alert("Thông báo", "Đã sao chép vào bộ nhớ tạm");
                    setActionMessage(null);
                  }
                }}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#f5f3ff' }]}><Text style={[styles.actionIcon, { color: '#8b5cf6' }]}>content_copy</Text></View>
                <Text style={styles.actionText}>Sao chép</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => { onDelete(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#fdf2f8' }]}><Text style={[styles.actionIcon, { color: '#db2777' }]}>delete</Text></View>
                <Text style={styles.actionText}>Xóa</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      {/* MUTE NOTIFICATIONS MODALS */}
      <Modal
        visible={showMuteMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMuteMenuModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMuteMenuModal(false)}>
          <Pressable style={styles.muteMenuCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.muteModalTitle}>Thông báo cuộc trò chuyện</Text>
            <Text style={styles.muteModalSubtitle}>Chọn thời gian tắt thông báo</Text>

            <TouchableOpacity style={styles.muteMenuItem} onPress={() => onSelectMuteSchedule("1h")}>
              <Text style={styles.muteMenuItemText}>Tắt 1 giờ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => onSelectMuteSchedule("4h")}>
              <Text style={styles.muteMenuItemText}>Tắt 4 giờ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => onSelectMuteSchedule("morning")}>
              <Text style={styles.muteMenuItemText}>Tắt đến 8:00 sáng</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => onSelectMuteSchedule("custom")}>
              <Text style={styles.muteMenuItemText}>Khung giờ tùy chỉnh</Text>
            </TouchableOpacity>

            <View style={styles.muteMenuDivider} />

            <TouchableOpacity style={styles.muteMenuItem} onPress={() => onSelectMuteSchedule("unmute")}>
              <Text style={[styles.muteMenuItemText, styles.muteMenuPrimaryText]}>
                Bật lại thông báo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuCancelBtn} onPress={() => setShowMuteMenuModal(false)}>
              <Text style={styles.muteMenuCancelText}>Hủy</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showCustomMuteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomMuteModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCustomMuteModal(false)}>
          <Pressable style={styles.muteModalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.muteModalTitle}>Khung giờ tắt thông báo</Text>
            <Text style={styles.muteModalSubtitle}>Nhập giờ theo định dạng 24h HH:mm</Text>

            <View style={styles.muteInputsRow}>
              <View style={styles.muteInputGroup}>
                <Text style={styles.muteInputLabel}>Bắt đầu</Text>
                <TextInput
                  value={customMuteStartTime}
                  onChangeText={setCustomMuteStartTime}
                  placeholder="22:00"
                  style={styles.muteTimeInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={styles.muteInputGroup}>
                <Text style={styles.muteInputLabel}>Kết thúc</Text>
                <TextInput
                  value={customMuteEndTime}
                  onChangeText={setCustomMuteEndTime}
                  placeholder="07:00"
                  style={styles.muteTimeInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>

            <View style={styles.muteModalActions}>
              <TouchableOpacity style={styles.muteModalCancelBtn} onPress={() => setShowCustomMuteModal(false)}>
                <Text style={styles.muteModalCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.muteModalApplyBtn} onPress={onApplyCustomMuteSchedule}>
                <Text style={styles.muteModalApplyText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};
