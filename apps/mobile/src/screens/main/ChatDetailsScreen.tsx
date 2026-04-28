import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Switch, 
  Alert,
  Dimensions
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { chatUpload } from '../../utils/api';
import { normalizeAttachment } from '../../store/chatHelpers';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const ChatDetailsScreen = ({ route, navigation }: any) => {
  const { conversationId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { 
    conversations, 
    messages, 
    userProfiles, 
    clearHistory,
    isConversationMuted,
    muteConversationFor,
    clearConversationMuted,
    removeMember,
    updateMemberRole,
    updateGroupInfo,
    dissolveGroup,
    addMembers
  } = useChatStore();

  const chat = conversations.find(c => c.id === conversationId);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  if (!chat) return null;

  const partnerEmail = chat.type === 'direct'
    ? (Array.isArray(chat.members) ? chat.members.find((m: string) => m !== user?.email) : undefined)
    : undefined;

  const profile = partnerEmail ? userProfiles[partnerEmail] : null;
  const chatName = profile?.nickname || profile?.fullName || profile?.fullname || partnerEmail || chat.name || "Hội thoại";
  const chatAvatar = profile?.avatarUrl || profile?.urlAvatar || chat.avatar || 'https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png';

  const allAttachments = messages.flatMap((m: any) => {
    const arr = [...(m.media || []), ...(m.files || [])];
    return arr.map(a => ({ ...a, createdAt: m.createdAt }));
  }).map(f => normalizeAttachment(f)).reverse();

  const mediaFiles = allAttachments.filter(f => 
    f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')
  ).slice(0, 4);

  const handleClearChat = () => {
    Alert.alert(
      "Xóa lịch sử trò chuyện",
      "Bạn có chắc chắn muốn xóa toàn bộ tin nhắn? Hành động này không thể hoàn tác.",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            try {
              await clearHistory(conversationId);
              navigation.goBack();
            } catch (err) { Alert.alert("Lỗi", "Không thể xóa lịch sử"); }
          }
        }
      ]
    );
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      "Rời nhóm",
      "Bạn sẽ không còn nhận được tin nhắn từ nhóm này.",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Rời nhóm", 
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember(conversationId, user?.email || "");
              navigation.navigate('Home');
            } catch (err: any) { Alert.alert("Lỗi", err.response?.data?.message || "Không thể rời nhóm"); }
          }
        }
      ]
    );
  };

  const handleDissolveGroup = () => {
    Alert.alert(
      "Giải tán nhóm",
      "Tất cả thành viên sẽ bị xóa và lịch sử chat sẽ bị xóa.",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Giải tán", 
          style: "destructive",
          onPress: async () => {
            try {
              await dissolveGroup(conversationId);
              navigation.navigate('Home');
            } catch (err: any) { Alert.alert("Lỗi", err.response?.data?.message || "Không thể giải tán nhóm"); }
          }
        }
      ]
    );
  };

  const handleKickMember = (email: string) => {
    Alert.alert(
      "Xóa thành viên",
      `Xóa ${email} khỏi nhóm?`,
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xóa", 
          style: "destructive",
          onPress: async () => {
            try {
              await removeMember(conversationId, email);
            } catch (err: any) { Alert.alert("Lỗi", err.response?.data?.message || "Không thể xóa thành viên"); }
          }
        }
      ]
    );
  };

  const handleChangeRole = (email: string, role: 'owner' | 'deputy' | 'member') => {
    const label = role === 'owner' ? 'Trưởng nhóm' : role === 'deputy' ? 'Phó nhóm' : 'Thành viên';
    Alert.alert(
      "Thay đổi vai trò",
      `Đặt ${email} làm ${label}?`,
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Xác nhận", 
          onPress: async () => {
            try {
              await updateMemberRole(conversationId, email, role);
            } catch (err: any) { Alert.alert("Lỗi", err.response?.data?.message || "Không thể đổi vai trò"); }
          }
        }
      ]
    );
  };

  const handleUpdateGroupName = () => {
    Alert.prompt(
      "Đổi tên nhóm",
      "Nhập tên nhóm mới",
      [
        { text: "Hủy", style: "cancel" },
        { 
          text: "Lưu", 
          onPress: async (name: string | undefined) => {
            if (!name) return;
            try {
              await updateGroupInfo(conversationId, { name });
            } catch (err: any) { Alert.alert("Lỗi", "Không thể đổi tên"); }
          }
        }
      ],
      'plain-text',
      chat.name
    );
  };

  const handleUpdateGroupAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      try {
        const uploadRes = await chatUpload({
          uri: result.assets[0].uri,
          name: 'group_avatar.jpg',
          type: 'image/jpeg'
        });
        if (uploadRes.ok) {
          const avatarUrl = uploadRes.data?.fileUrl || uploadRes.data?.dataUrl || '';
          await updateGroupInfo(conversationId, { avatar: avatarUrl });
        } else {
          Alert.alert("Lỗi", "Không thể tải ảnh lên");
        }
      } catch (err) {
        Alert.alert("Lỗi", "Không thể cập nhật ảnh đại diện");
      }
    }
  };

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderMenuItem = (icon: string, title: string, rightElement?: React.ReactNode, onPress?: () => void, color = '#1f2631') => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} disabled={!onPress}>
      <View style={styles.menuLeft}>
        <Text style={[styles.menuIcon, { color }]}>{icon}</Text>
        <Text style={styles.menuText}>{title}</Text>
      </View>
      {rightElement ? rightElement : <Text style={styles.chevron}>chevron_right</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.headerIcon}>arrow_back_ios</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tuỳ chọn</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile Section */}
        <View style={styles.profileBox}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={chat.type === 'group' ? handleUpdateGroupAvatar : undefined}
          >
            <Image source={{ uri: chatAvatar }} style={styles.largeAvatar} />
            {chat.type === 'group' && (
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditIcon}>camera_alt</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.profileName}>{chatName}</Text>
          
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>search</Text></View>
              <Text style={styles.actionLabel}>Tìm{"\n"}tin nhắn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>person</Text></View>
              <Text style={styles.actionLabel}>Trang{"\n"}cá nhân</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>palette</Text></View>
              <Text style={styles.actionLabel}>Đổi{"\n"}hình nền</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>notifications_none</Text></View>
              <Text style={styles.actionLabel}>Tắt{"\n"}thông báo</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Settings List */}
        {renderMenuItem("edit", "Đổi tên gợi nhớ")}
        {renderMenuItem("star_outline", "Đánh dấu bạn thân", 
          <Switch value={isFavorite} onValueChange={setIsFavorite} />
        )}
        {renderMenuItem("schedule", "Nhật ký chung")}

        <View style={styles.divider} />

        {/* Media Section */}
        <TouchableOpacity 
          style={styles.mediaRow} 
          onPress={() => navigation.navigate('ChatGallery', { conversationId })}
        >
          <View style={styles.mediaHeader}>
            <View style={styles.menuLeft}>
              <Text style={styles.menuIcon}>grid_view</Text>
              <Text style={styles.menuText}>Ảnh, file, link</Text>
            </View>
            <Text style={styles.chevron}>chevron_right</Text>
          </View>
          <View style={styles.mediaPreview}>
            {mediaFiles.length > 0 ? (
              mediaFiles.map((m, i) => (
                <Image key={i} source={{ uri: m.dataUrl || m.url }} style={styles.previewImg} />
              ))
            ) : (
              <View style={styles.emptyMedia}><Text style={styles.emptyText}>Chưa có media</Text></View>
            )}
            <View style={styles.previewMore}>
              <Text style={styles.headerIcon}>arrow_forward</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        {renderMenuItem("group_add", `Tạo nhóm với ${chatName}`)}
        {renderMenuItem("person_add", `Thêm ${chatName} vào nhóm`)}
        {renderMenuItem("groups", "Xem nhóm chung (3)")}

        <View style={styles.divider} />

        {renderMenuItem("push_pin", "Ghim trò chuyện", 
          <Switch value={isPinned} onValueChange={setIsPinned} />
        )}
        {renderMenuItem("visibility_off", "Ẩn trò chuyện", 
          <Switch value={isHidden} onValueChange={setIsHidden} />
        )}
        {renderMenuItem("phone_in_talk", "Báo cuộc gọi đến", 
          <Switch value={true} onValueChange={() => {}} />
        )}
        {renderMenuItem("person_outline", "Cài đặt cá nhân")}
        {renderMenuItem("history", "Tin nhắn tự xóa", <Text style={styles.subText}>Không tự xóa</Text>)}

        <View style={styles.divider} />

        {renderMenuItem("report", "Báo xấu", undefined, undefined, '#ef4444')}
        {renderMenuItem("block", "Quản lý chặn")}
        {renderMenuItem("storage", "Dung lượng trò chuyện")}
        {renderMenuItem("delete_outline", "Xóa lịch sử trò chuyện", undefined, handleClearChat, '#ef4444')}

        {chat.type === 'group' && (
          <>
            <View style={styles.divider} />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quản lý nhóm</Text>
            </View>
            {renderMenuItem("edit", "Đổi tên nhóm", undefined, handleUpdateGroupName)}
            {(chat.owner === user?.email || chat.admin === user?.email) && (
              renderMenuItem("delete_forever", "Giải tán nhóm", undefined, handleDissolveGroup, '#ef4444')
            )}
            {renderMenuItem("logout", "Rời nhóm", undefined, handleLeaveGroup, '#ef4444')}

            <View style={styles.divider} />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Thành viên ({chat.members?.length || 0})</Text>
            </View>
            <TouchableOpacity style={styles.addMemberBtn} onPress={() => {
               Alert.prompt("Thêm thành viên", "Nhập email", async (email) => {
                  if (email) await addMembers(conversationId, [email]);
               });
            }}>
               <Text style={styles.addMemberIcon}>add</Text>
               <Text style={styles.addMemberText}>Thêm thành viên</Text>
            </TouchableOpacity>

            {chat.members?.map((m: string) => {
               const p = userProfiles[m.trim().toLowerCase()];
               const isMe = m === user?.email;
               const isOwner = chat.owner === m || chat.admin === m;
               const isDeputy = (chat.deputies || []).includes(m);
               const myRole = (chat.owner === user?.email || chat.admin === user?.email) ? 'owner' : (chat.deputies || []).includes(user?.email || "") ? 'deputy' : 'member';

               return (
                 <View key={m} style={styles.memberItem}>
                    <Image source={{ uri: p?.avatarUrl || 'https://via.placeholder.com/150' }} style={styles.memberAvatar} />
                    <View style={styles.memberInfo}>
                       <Text style={styles.memberName}>{p?.nickname || p?.fullName || m} {isMe && "(Bạn)"}</Text>
                       <Text style={styles.memberRole}>
                          {isOwner ? "Trưởng nhóm" : isDeputy ? "Phó nhóm" : "Thành viên"}
                       </Text>
                    </View>
                    {!isMe && (
                       <View style={styles.memberActions}>
                          {myRole === 'owner' && (
                             <>
                                {!isOwner && (
                                   <TouchableOpacity onPress={() => handleChangeRole(m, isDeputy ? 'member' : 'deputy')}>
                                      <Text style={[styles.actionIconSm, { color: Colors.primary }]}>{isDeputy ? "shield_outlined" : "shield"}</Text>
                                   </TouchableOpacity>
                                )}
                                {!isOwner && (
                                   <TouchableOpacity onPress={() => handleChangeRole(m, 'owner')}>
                                      <Text style={[styles.actionIconSm, { color: '#f59e0b' }]}>star</Text>
                                   </TouchableOpacity>
                                )}
                             </>
                          )}
                          {(myRole === 'owner' || (myRole === 'deputy' && !isOwner && !isDeputy)) && (
                             <TouchableOpacity onPress={() => handleKickMember(m)}>
                                <Text style={[styles.actionIconSm, { color: '#ef4444' }]}>person_remove</Text>
                             </TouchableOpacity>
                          )}
                       </View>
                    )}
                 </View>
               );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.primary,
  },
  backBtn: {
    padding: 8,
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  profileBox: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 20,
  },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 16,
    backgroundColor: '#f1f5f9',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 2,
  },
  avatarEditIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#475569',
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2631',
    marginBottom: 24,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
  },
  actionItem: {
    alignItems: 'center',
    width: width / 4 - 20,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#475569',
  },
  actionLabel: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '500',
  },
  divider: {
    height: 8,
    backgroundColor: '#f1f5f9',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    marginRight: 16,
    color: '#475569',
  },
  menuText: {
    fontSize: 16,
    color: '#1f2631',
    fontWeight: '500',
  },
  chevron: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#cbd5e1',
  },
  subText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  mediaRow: {
    backgroundColor: '#fff',
    paddingBottom: 16,
  },
  mediaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  mediaPreview: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  previewImg: {
    width: (width - 64) / 4,
    height: (width - 64) / 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  previewMore: {
    width: (width - 64) / 4,
    height: (width - 64) / 4,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyMedia: {
    flex: 1,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  addMemberIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: Colors.primary,
    marginRight: 12,
  },
  addMemberText: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: 'bold',
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  memberRole: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionIconSm: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
  }
});

export default ChatDetailsScreen;
