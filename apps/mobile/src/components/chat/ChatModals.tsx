import React from 'react';
import { View, Text, TouchableOpacity, Pressable, Modal, TextInput, Image } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import styles from '../../screens/main/style/ChatScreen.styles';
import { REACTION_OPTIONS, FLUENT_EMOJI_MAP } from '../../constants/Emojis';
import Alert from '../../utils/Alert';

interface ChatModalsProps {
  actionMessage: any;
  setActionMessage: (val: any) => void;
  detailMessage: any;
  setDetailMessage: (val: any) => void;
  onReaction: (message: any, emoji: string) => void;
  onReply: (message: any) => void;
  onForward: (message: any) => void;
  onRecall: (message: any) => void;
  onDelete: (message: any) => void;
  onPin: (message: any) => void;
  onMark: (message: any) => void;
  onViewDetail: (message: any) => void;
  onStartMultiSelect: (message: any) => void;
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
  detailMessage,
  setDetailMessage,
  onReaction,
  onReply,
  onForward,
  onRecall,
  onDelete,
  onPin,
  onMark,
  onViewDetail,
  onStartMultiSelect,
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
            <View style={{ paddingHorizontal: 4, paddingTop: 4, paddingBottom: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
                Phản ứng nhanh
              </Text>
              <View style={[styles.reactionBar, { justifyContent: 'space-between' }]}>
              {REACTION_OPTIONS.map(e => (
                <TouchableOpacity
                  key={e}
                  onPress={() => { onReaction(actionMessage, e); setActionMessage(null); }}
                  style={{ alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff' }}
                >
                  <EmojiItem emoji={e} />
                </TouchableOpacity>
              ))}
              </View>
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

              <TouchableOpacity style={styles.actionItem} onPress={() => { onMark(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#ecfccb' }]}><Text style={[styles.actionIcon, { color: '#65a30d' }]}>star</Text></View>
                <Text style={styles.actionText}>{actionMessage.marked ? 'Bỏ đánh dấu' : 'Đánh dấu'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => { onStartMultiSelect(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#eff6ff' }]}><Text style={[styles.actionIcon, { color: '#2563eb' }]}>checklist</Text></View>
                <Text style={styles.actionText}>Chọn nhiều</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionItem} onPress={() => { onViewDetail(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#f1f5f9' }]}><Text style={[styles.actionIcon, { color: '#334155' }]}>info</Text></View>
                <Text style={styles.actionText}>Xem chi tiết</Text>
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
                <Text style={styles.actionText}>Xóa chỉ ở phía tôi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      <Modal
        visible={!!detailMessage}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailMessage(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setDetailMessage(null)}>
          <Pressable style={[styles.muteModalCard, { width: '92%', maxWidth: 420, overflow: 'hidden' }]} onPress={(event) => event.stopPropagation()}>
            <View style={{ height: 5, backgroundColor: '#00418f', width: '100%' }} />
            <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.muteModalTitle, { marginBottom: 0 }]}>Chi tiết tin nhắn</Text>
                <TouchableOpacity onPress={() => setDetailMessage(null)}>
                  <Text style={{ fontSize: 22, color: '#64748b' }}>close</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Mã tin nhắn {detailMessage?.id || ''}
              </Text>
            </View>

            <View style={{ padding: 18, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                  <Image source={{ uri: detailMessage?.senderAvatar || 'https://via.placeholder.com/150' }} style={{ width: '100%', height: '100%' }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
                    {detailMessage?.senderName || detailMessage?.senderId || 'Người dùng'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {detailMessage?.senderId || ''}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: detailMessage?.status === 'read' ? '#e0f2fe' : '#f8fafc' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: detailMessage?.status === 'read' ? '#0369a1' : '#475569' }}>
                    {detailMessage?.status === 'read' ? 'Đã xem' : detailMessage?.status === 'delivered' ? 'Đã nhận' : detailMessage?.status === 'sending' ? 'Đang gửi' : 'Đã gửi'}
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#f8fafc', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Nội dung</Text>
                <Text style={{ fontSize: 15, color: '#111827', lineHeight: 23 }}>
                  {detailMessage?.content || (detailMessage?.media?.length ? '[Ảnh/Video]' : detailMessage?.files?.length ? '[Tệp tin]' : '[Tin nhắn trống]')}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1, backgroundColor: '#eff6ff', borderRadius: 16, padding: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1d4ed8', marginBottom: 4, textTransform: 'uppercase' }}>Thời gian</Text>
                  <Text style={{ fontSize: 13, color: '#0f172a', lineHeight: 18 }}>
                    {detailMessage ? new Date(detailMessage.createdAt || Date.now()).toLocaleString('vi-VN') : ''}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#f0fdf4', borderRadius: 16, padding: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#16a34a', marginBottom: 4, textTransform: 'uppercase' }}>Loại</Text>
                  <Text style={{ fontSize: 13, color: '#0f172a', lineHeight: 18 }}>
                    {detailMessage?.media?.length ? 'Media' : detailMessage?.files?.length ? 'Tệp tin' : detailMessage?.type || 'Text'}
                  </Text>
                </View>
              </View>

              {Array.isArray(detailMessage?.media) && detailMessage.media.length > 0 && (
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>Media</Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {detailMessage.media.slice(0, 4).map((item: any, index: number) => (
                      <View key={`${item.url || index}`} style={{ width: 80, height: 80, borderRadius: 14, overflow: 'hidden', backgroundColor: '#e2e8f0' }}>
                        <Image source={{ uri: item.dataUrl || item.url }} style={{ width: '100%', height: '100%' }} />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {Array.isArray(detailMessage?.files) && detailMessage.files.length > 0 && (
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 10, textTransform: 'uppercase' }}>Tệp đính kèm</Text>
                  {detailMessage.files.slice(0, 3).map((file: any, index: number) => (
                    <View key={`${file.name || index}`} style={{ paddingVertical: 10, borderBottomWidth: index < Math.min(detailMessage.files.length, 3) - 1 ? 1 : 0, borderBottomColor: '#e2e8f0' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{file.name || 'Tệp tin'}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{file.mimeType || 'application/octet-stream'}</Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={[styles.muteModalApplyBtn, { marginTop: 6 }]} onPress={() => setDetailMessage(null)}>
                <Text style={styles.muteModalApplyText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
