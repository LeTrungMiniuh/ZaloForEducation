import React from 'react';
import { View, Text, TouchableOpacity, Pressable, TextInput, Image, ActivityIndicator } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface ContactModalsProps {
  actionFriend: any;
  setActionFriend: (val: any) => void;
  nicknameFriend: any;
  setNicknameFriend: (val: any) => void;
  nicknameDraft: string;
  setNicknameDraft: (val: string) => void;
  nicknameSaving: boolean;
  onSaveNickname: () => void;
  profileFriend: any;
  setProfileFriend: (val: any) => void;
  profileLoading: boolean;
  onUnfriend: (email: string) => void;
  onBlock: (email: string) => void;
  onToggleCloseFriend: (email: string, status: boolean) => void;
  onOpenDirectChat: (email: string) => void;
  formatBirthDate: (val: any) => string;
}

export const ContactModals: React.FC<ContactModalsProps> = ({
  actionFriend,
  setActionFriend,
  nicknameFriend,
  setNicknameFriend,
  nicknameDraft,
  setNicknameDraft,
  nicknameSaving,
  onSaveNickname,
  profileFriend,
  setProfileFriend,
  profileLoading,
  onUnfriend,
  onBlock,
  onToggleCloseFriend,
  onOpenDirectChat,
  formatBirthDate,
}) => {
  return (
    <>
      {/* Action Sheet */}
      {actionFriend && (
        <Pressable style={styles.overlay} onPress={() => setActionFriend(null)}>
          <View style={styles.sheet}>
            <View style={[styles.sheetItem, { borderBottomWidth: 0 }]}>
              <Text style={[styles.sheetText, { textAlign: "center", color: "#738098" }]}>
                Tùy chọn cho {actionFriend.displayName}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => onOpenDirectChat(actionFriend.email)}
            >
              <Text style={styles.sheetText}>Nhắn tin</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => onToggleCloseFriend(actionFriend.email, !actionFriend.isCloseFriend)}
            >
              <Text style={styles.sheetText}>
                {actionFriend.isCloseFriend ? "Bỏ đánh dấu bạn thân" : "Đánh dấu bạn thân"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => {
                setNicknameFriend(actionFriend);
                setNicknameDraft(actionFriend.nickname || "");
                setActionFriend(null);
              }}
            >
              <Text style={styles.sheetText}>Đặt biệt danh</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => onUnfriend(actionFriend.email)}
            >
              <Text style={[styles.sheetText, { color: "#ef4444" }]}>Xóa bạn</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => onBlock(actionFriend.email)}
            >
              <Text style={[styles.sheetText, { color: "#ef4444" }]}>Chặn người dùng</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      )}

      {/* Nickname Modal */}
      {nicknameFriend && (
        <Pressable style={styles.overlay} onPress={() => setNicknameFriend(null)}>
          <View style={styles.nicknameModal}>
            <Text style={styles.nickTitle}>Đặt biệt danh</Text>
            <Text style={styles.nickHint}>
              Biệt danh giúp bạn dễ dàng nhận diện bạn bè hơn.
            </Text>
            <TextInput
              style={styles.nickInput}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              placeholder="Nhập biệt danh..."
              autoFocus
            />
            <View style={styles.nickActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setNicknameFriend(null)}
              >
                <Text style={styles.cancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, nicknameSaving && styles.disabledBtn]}
                onPress={onSaveNickname}
                disabled={nicknameSaving}
              >
                <Text style={styles.saveText}>
                  {nicknameSaving ? "Đang lưu" : "Lưu"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}

      {/* Profile Modal */}
      {profileFriend && (
        <Pressable style={styles.overlay} onPress={() => setProfileFriend(null)}>
          <View style={styles.profileModal}>
            <View style={styles.profileHead}>
              <Image
                source={{ uri: profileFriend.avatarUrl }}
                style={styles.profileAvatar}
              />
              <View>
                <Text style={styles.profileName}>{profileFriend.displayName}</Text>
                <Text style={styles.profileEmail}>{profileFriend.email}</Text>
              </View>
            </View>

            {profileLoading ? (
              <View style={styles.profileLoadingRow}>
                <ActivityIndicator size="small" color="#1f8fff" />
                <Text style={styles.profileLoadingText}>Đang tải thông tin...</Text>
              </View>
            ) : (
              <View style={styles.profileInfoWrap}>
                <Text style={styles.profileInfoRow}>
                  Giới tính: {profileFriend.profile?.gender || "Chưa cập nhật"}
                </Text>
                <Text style={styles.profileInfoRow}>
                  Ngày sinh: {formatBirthDate(profileFriend.profile?.dateOfBirth || profileFriend.profile?.date_of_birth) || "Chưa cập nhật"}
                </Text>
                <Text style={styles.profileInfoRow}>
                  Số điện thoại: {profileFriend.profile?.phoneNumber || "Chưa cập nhật"}
                </Text>
              </View>
            )}

            <View style={styles.profileActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setProfileFriend(null)}
              >
                <Text style={styles.cancelText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  onOpenDirectChat(profileFriend.email);
                  setProfileFriend(null);
                }}
              >
                <Text style={styles.saveText}>Nhắn tin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      )}
    </>
  );
};
