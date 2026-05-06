import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  Image, 
  Modal,
  TextInput,
  Switch,
  Alert,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { chatUpload } from '../../utils/api';
import { normalizeAttachment } from '../../store/chatHelpers';
import { chatPatch, chatPost, chatGet } from '../../utils/api';
import { pushSecurityAlert } from '../../utils/securityAlerts';

const { width } = Dimensions.get('window');

const WALLPAPERS = [
  { key: 'default', label: 'Mặc định', color: '#ffffff' },
  { key: 'sky', label: 'Xanh trời', color: '#eef6ff' },
  { key: 'mint', label: 'Xanh mint', color: '#f0fdf4' },
  { key: 'slate', label: 'Xám dịu', color: '#f8fafc' },
] as const;

const CHAT_PINNED_CONVERSATIONS_KEY = 'chat_pinned_conversations_v1';
const CHAT_HIDDEN_CONVERSATIONS_KEY = 'chat_hidden_conversations_v1';
const CHAT_ALIAS_CONVERSATIONS_KEY = 'chat_alias_conversations_v1';
const CHAT_AUTO_DELETE_KEY = 'chat_auto_delete_v1';
const AUTO_DELETE_OPTIONS = [
  { label: 'Không tự xóa', days: 0 },
  { label: '1 ngày', days: 1 },
  { label: '7 ngày', days: 7 },
  { label: '30 ngày', days: 30 }
] as const;

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
    width: Dimensions.get('window').width / 4 - 20,
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
    width: (Dimensions.get('window').width - 72) / 5,
    height: (Dimensions.get('window').width - 72) / 5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  previewMore: {
    width: (Dimensions.get('window').width - 72) / 5,
    height: (Dimensions.get('window').width - 72) / 5,
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
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  aliasModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
  },
  aliasModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2631',
  },
  aliasModalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 14,
  },
  aliasInput: {
    borderWidth: 1,
    borderColor: '#dbe3ee',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2631',
  },
  aliasActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  aliasCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#eef2f7',
  },
  aliasCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  aliasSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  aliasSaveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});

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
    addMembers,
    setPinConversation,
    setHiddenConversation
  } = useChatStore();

  const chat = conversations.find(c => c.id === conversationId);
  const [isFavorite, setIsFavorite] = useState(false);
  const [wallpaperKey, setWallpaperKey] = useState<(typeof WALLPAPERS)[number]['key']>('default');
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasDraft, setAliasDraft] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState<number>(0);
  const [showAutoDeleteModal, setShowAutoDeleteModal] = useState(false);
  const [commonGroups, setCommonGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [mediaPreviewItems, setMediaPreviewItems] = useState<any[]>([]);
  const [loadingMediaPreview, setLoadingMediaPreview] = useState(false);

  useEffect(() => {
    let active = true;

    const loadWallpaper = async () => {
      try {
        const saved = await AsyncStorage.getItem(`chat-wallpaper:${conversationId}`);
        if (active && saved && WALLPAPERS.some((item) => item.key === saved)) {
          setWallpaperKey(saved as (typeof WALLPAPERS)[number]['key']);
        }
      } catch {
        // Ignore local storage failures and keep the default wallpaper.
      }
    };

    const loadAlias = async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_ALIAS_CONVERSATIONS_KEY);
        const map = raw ? JSON.parse(raw) : {};
        const saved = map?.[conversationId];
        if (active && saved) {
          setAliasDraft(saved);
          useChatStore.getState().setConversations((prev: any[]) => prev.map((item) => (
            item.id === conversationId ? { ...item, alias: saved } : item
          )));
        }
      } catch {
        // Best effort only.
      }
    };

    const loadAutoDelete = async () => {
      try {
        const raw = await AsyncStorage.getItem(CHAT_AUTO_DELETE_KEY);
        const map = raw ? JSON.parse(raw) : {};
        const saved = map?.[conversationId] || 0;
        if (active) {
          setAutoDeleteDays(saved);
        }
      } catch {
        // Best effort only.
      }
    };

    loadWallpaper();
    loadAlias();
    loadAutoDelete();

    return () => {
      active = false;
    };
  }, [conversationId]);

  // (moved) Load common groups on mount — will be initialized after partnerEmail is computed below

  if (!chat) return null;

  const partnerEmail = chat.type === 'direct'
    ? (Array.isArray(chat.members) ? chat.members.find((m: string) => m !== user?.email) : undefined)
    : undefined;

  const profile = partnerEmail ? userProfiles[partnerEmail] : null;
  // Load common groups when partnerEmail is available
  useEffect(() => {
    const loadCommonGroups = async () => {
      if (!partnerEmail) return;
      try {
        const res = await chatGet(`/groups/common?email=${encodeURIComponent(partnerEmail)}`);
        if (res?.ok && Array.isArray(res.data)) {
          setCommonGroups(res.data);
        }
      } catch (error) {
        console.error('Failed to load common groups', error);
      }
    };

    const loadMediaPreview = async () => {
      try {
        setLoadingMediaPreview(true);
        const res = await chatGet(`/conversations/${encodeURIComponent(conversationId)}/assets`, { 
          type: 'media', 
          limit: 5 
        });
        if (res.ok && res.data?.items) {
          const normalized = (res.data.items as any[]).flatMap(m => {
            const arr = [...(m.media || []), ...(m.files || [])];
            return arr.map(a => ({ ...a, createdAt: m.createdAt }));
          }).map(f => normalizeAttachment(f));
          setMediaPreviewItems(normalized.slice(0, 5));
        }
      } catch (err) {
        console.error('Failed to load media preview', err);
      } finally {
        setLoadingMediaPreview(false);
      }
    };

    loadCommonGroups();
    loadMediaPreview();
  }, [conversationId, partnerEmail]);

  const chatName = chat.alias || profile?.nickname || profile?.fullName || profile?.fullname || partnerEmail || chat.name || "Hội thoại";
  const chatAvatar = profile?.avatarUrl || profile?.urlAvatar || chat.avatar || (chat.type === 'group' ? 'https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png' : 'https://via.placeholder.com/150');
  const isMuted = isConversationMuted(conversationId);
  const wallpaper = WALLPAPERS.find((item) => item.key === wallpaperKey) || WALLPAPERS[0];
  const isPinned = !!chat?.pinned;
  const isHidden = !!chat?.hidden;

  const allAttachments = messages.flatMap((m: any) => {
    const arr = [...(m.media || []), ...(m.files || [])];
    return arr.map(a => ({ ...a, createdAt: m.createdAt }));
  }).map(f => normalizeAttachment(f)).reverse();

  const mediaFiles = allAttachments.filter(f => 
    f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')
  ).slice(0, 5);

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
              Alert.alert("Thành công", "Đã xóa lịch sử trò chuyện.", [
                { text: "OK", onPress: () => navigation.goBack() }
              ]);
            } catch (err) { 
              Alert.alert("Lỗi", "Không thể xóa lịch sử"); 
            }
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  const handleOpenProfile = () => {
    if (!partnerEmail) return;
    navigation.navigate('Profile', { userId: partnerEmail });
  };

  const handleSearchMessages = () => {
    navigation.navigate('InChatSearch', { conversationId, chatName });
  };

  const handleOpenPersonalSettings = () => {
    navigation.navigate('ProfileMore');
  };

  const persistConversationFlag = async (key: string, convId: string, value: boolean) => {
    try {
      const raw = await AsyncStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      if (value) map[convId] = true;
      else delete map[convId];
      await AsyncStorage.setItem(key, JSON.stringify(map));
    } catch {
      // Best effort persistence only.
    }
  };

  const handleTogglePin = async () => {
    const nextPinned = !isPinned;
    try {
      // Sync with backend via store action
      await setPinConversation(conversationId, nextPinned);
      // Also persist locally for offline support
      await persistConversationFlag(CHAT_PINNED_CONVERSATIONS_KEY, conversationId, nextPinned);
      Alert.alert('Đã cập nhật', nextPinned ? 'Cuộc trò chuyện đã được ghim.' : 'Đã bỏ ghim cuộc trò chuyện.');
    } catch {
      Alert.alert('Không thể cập nhật', 'Vui lòng thử lại sau.');
    }
  };

  const handleSaveAlias = async () => {
    if (!partnerEmail) return;
    const nextAlias = aliasDraft.trim();
    setSavingAlias(true);
    try {
      if (nextAlias) {
        const res = await chatPatch('/friends/nickname', { friendEmail: partnerEmail, nickname: nextAlias });
        if (!res?.ok) throw new Error('NICKNAME_FAILED');
        const raw = await AsyncStorage.getItem(CHAT_ALIAS_CONVERSATIONS_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[conversationId] = nextAlias;
        await AsyncStorage.setItem(CHAT_ALIAS_CONVERSATIONS_KEY, JSON.stringify(map));
        useChatStore.getState().setConversations((prev: any[]) => prev.map((item) => (
          item.id === conversationId ? { ...item, alias: nextAlias } : item
        )));
        Alert.alert('Đã lưu', 'Tên gợi nhớ đã được cập nhật.');
      } else {
        await chatPatch('/friends/nickname', { friendEmail: partnerEmail, nickname: '' });
        const raw = await AsyncStorage.getItem(CHAT_ALIAS_CONVERSATIONS_KEY);
        const map = raw ? JSON.parse(raw) : {};
        delete map[conversationId];
        await AsyncStorage.setItem(CHAT_ALIAS_CONVERSATIONS_KEY, JSON.stringify(map));
        useChatStore.getState().setConversations((prev: any[]) => prev.map((item) => (
          item.id === conversationId ? { ...item, alias: '' } : item
        )));
        Alert.alert('Đã xóa', 'Đã xóa tên gợi nhớ.');
      }
      setShowAliasModal(false);
    } catch {
      Alert.alert('Không thể lưu', 'Vui lòng thử lại sau.');
    } finally {
      setSavingAlias(false);
    }
  };

  const handleToggleHidden = async () => {
    const nextHidden = !isHidden;
    if (nextHidden) {
      Alert.alert(
        'Ẩn trò chuyện',
        'Ẩn cuộc trò chuyện này khỏi danh sách?',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Ẩn',
            style: 'destructive',
            onPress: async () => {
              try {
                // Sync with backend via store action
                await setHiddenConversation(conversationId, true);
                // Also persist locally for offline support
                await persistConversationFlag(CHAT_HIDDEN_CONVERSATIONS_KEY, conversationId, true);
                Alert.alert('Đã ẩn', 'Cuộc trò chuyện sẽ không hiển thị trong danh sách chính.');
                navigation.goBack();
              } catch {
                Alert.alert('Không thể ẩn', 'Vui lòng thử lại sau.');
              }
            },
          },
        ]
      );
      return;
    }

    try {
      // Sync with backend via store action
      await setHiddenConversation(conversationId, false);
      // Also persist locally for offline support
      await persistConversationFlag(CHAT_HIDDEN_CONVERSATIONS_KEY, conversationId, false);
      Alert.alert('Đã hiện lại', 'Cuộc trò chuyện đã quay lại danh sách.');
    } catch {
      Alert.alert('Không thể cập nhật', 'Vui lòng thử lại sau.');
    }
  };

  const handleChangeWallpaper = () => {
    Alert.alert(
      'Đổi hình nền',
      'Chọn hình nền cho cuộc trò chuyện này.',
      [
        { text: 'Hủy', style: 'cancel' },
        ...WALLPAPERS.map((item) => ({
          text: item.label,
          onPress: async () => {
            setWallpaperKey(item.key);
            try {
              await AsyncStorage.setItem(`chat-wallpaper:${conversationId}`, item.key);
            } catch {
              // Local preference is best-effort only.
            }
          },
        })),
      ]
    );
  };

  const handleToggleMute = () => {
    if (isMuted) {
      Alert.alert(
        "Bật thông báo",
        "Bật lại thông báo cho cuộc trò chuyện này?",
        [
          { text: "Hủy", style: "cancel" },
          {
            text: "Bật",
            onPress: () => {
              clearConversationMuted(conversationId);
              Alert.alert("Đã bật thông báo", "Cuộc trò chuyện này sẽ nhận thông báo trở lại.");
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      "Tắt thông báo",
      "Chọn thời gian tắt thông báo",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "1 giờ",
          onPress: () => {
            muteConversationFor(conversationId, '1h');
            Alert.alert("Đã tắt 1 giờ", "Thông báo sẽ được bật lại sau 1 giờ.");
          },
        },
        {
          text: "4 giờ",
          onPress: () => {
            muteConversationFor(conversationId, '4h');
            Alert.alert("Đã tắt 4 giờ", "Thông báo sẽ được bật lại sau 4 giờ.");
          },
        },
        {
          text: "Đến 8:00 sáng",
          onPress: () => {
            muteConversationFor(conversationId, 'until-8am');
            Alert.alert("Đã tắt đến 8:00", "Thông báo sẽ được bật lại vào 8:00 sáng ngày mai.");
          },
        },
        {
          text: "Cho đến khi mở lại",
          style: "destructive",
          onPress: () => {
            muteConversationFor(conversationId, 'until-open');
            Alert.alert("Đã tắt thông báo", "Thông báo sẽ được bật lại khi bạn mở cuộc trò chuyện.");
          },
        },
      ]
    );
  };

  const handleReportConversation = async () => {
    Alert.alert(
      'Báo xấu',
      'Chọn lý do báo xấu cuộc trò chuyện',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Nội dung khiếm nhã',
          onPress: async () => {
            try {
              await pushSecurityAlert({
                type: 'CHAT_REPORT',
                title: 'Báo xấu: Nội dung khiếm nhã',
                message: `Báo xấu cuộc trò chuyện với ${chatName}. Lý do: Nội dung khiếm nhã`,
                metadata: { conversationId, partnerEmail, reason: 'OFFENSIVE_CONTENT' },
              });
              Alert.alert('Đã ghi nhận', 'Báo xấu của bạn đã được lưu lại. Cảm ơn đã giúp cải thiện cộng đồng.');
            } catch {
              Alert.alert('Không thể gửi', 'Vui lòng thử lại sau.');
            }
          },
        },
        {
          text: 'Spam hoặc quấy rối',
          onPress: async () => {
            try {
              await pushSecurityAlert({
                type: 'CHAT_REPORT',
                title: 'Báo xấu: Spam/quấy rối',
                message: `Báo xấu cuộc trò chuyện với ${chatName}. Lý do: Spam hoặc quấy rối`,
                metadata: { conversationId, partnerEmail, reason: 'SPAM_HARASSMENT' },
              });
              Alert.alert('Đã ghi nhận', 'Báo xấu của bạn đã được lưu lại. Cảm ơn đã giúp cải thiện cộng đồng.');
            } catch {
              Alert.alert('Không thể gửi', 'Vui lòng thử lại sau.');
            }
          },
        },
        {
          text: 'Lừa đảo hoặc giả mạo',
          onPress: async () => {
            try {
              await pushSecurityAlert({
                type: 'CHAT_REPORT',
                title: 'Báo xấu: Lừa đảo',
                message: `Báo xấu cuộc trò chuyện với ${chatName}. Lý do: Lừa đảo hoặc giả mạo`,
                metadata: { conversationId, partnerEmail, reason: 'SCAM_IMPERSONATION' },
              });
              Alert.alert('Đã ghi nhận', 'Báo xấu của bạn đã được lưu lại. Cảm ơn đã giúp cải thiện cộng đồng.');
            } catch {
              Alert.alert('Không thể gửi', 'Vui lòng thử lại sau.');
            }
          },
        },
        {
          text: 'Nội dung bạo lực hoặc có hại',
          style: 'destructive',
          onPress: async () => {
            try {
              await pushSecurityAlert({
                type: 'CHAT_REPORT',
                title: 'Báo xấu: Bạo lực',
                message: `Báo xấu cuộc trò chuyện với ${chatName}. Lý do: Nội dung bạo lực hoặc có hại`,
                metadata: { conversationId, partnerEmail, reason: 'VIOLENCE_HARM' },
              });
              Alert.alert('Đã ghi nhận', 'Báo xấu của bạn đã được lưu lại. Cảm ơn đã giúp cải thiện cộng đồng.');
            } catch {
              Alert.alert('Không thể gửi', 'Vui lòng thử lại sau.');
            }
          },
        },
      ]
    );
  };

  const handleBlockUser = async () => {
    if (!partnerEmail) return;
    Alert.alert(
      'Chặn người dùng',
      `Chặn ${chatName} khỏi danh bạ?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chặn',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await chatPost('/friends/block', { targetEmail: partnerEmail });
              if (!res?.ok) throw new Error('BLOCK_FAILED');
              Alert.alert('Đã chặn', 'Bạn có thể quản lý danh sách chặn trong Danh bạ.');
              navigation.navigate('Main', { screen: 'Contacts' });
            } catch {
              Alert.alert('Không thể chặn', 'Vui lòng thử lại sau.');
            }
          },
        },
      ]
    );
  };

  const handleConversationStorage = () => {
    const totalBytes = allAttachments.reduce((sum: number, item: any) => sum + Number(item?.size || 0), 0);
    const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
    Alert.alert(
      'Dung lượng trò chuyện',
      `Số tin nhắn đính kèm: ${allAttachments.length}\nDung lượng ước tính: ${totalMB} MB`,
      [
        { text: 'Đóng', style: 'cancel' },
        { text: 'Mở kho lưu trữ', onPress: () => navigation.navigate('ChatGallery', { conversationId }) },
      ]
    );
  };

  const handleAutoDelete = () => {
    Alert.alert(
      'Tin nhắn tự xóa',
      'Chọn thời hạn tự xóa tin nhắn cũ',
      [
        { text: 'Hủy', style: 'cancel' },
        ...AUTO_DELETE_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: async () => {
            try {
              const raw = await AsyncStorage.getItem(CHAT_AUTO_DELETE_KEY);
              const map = raw ? JSON.parse(raw) : {};
              if (opt.days === 0) {
                delete map[conversationId];
              } else {
                map[conversationId] = opt.days;
              }
              await AsyncStorage.setItem(CHAT_AUTO_DELETE_KEY, JSON.stringify(map));
              setAutoDeleteDays(opt.days);
              Alert.alert('Đã lưu', `Tin nhắn sẽ tự xóa sau ${opt.days === 0 ? 'không bao giờ (đã tắt)' : `${opt.days} ngày`}.`);
            } catch {
              Alert.alert('Không thể lưu', 'Vui lòng thử lại sau.');
            }
          }
        }))
      ]
    );
  };

  const handleCreateGroup = () => {
    if (!partnerEmail) return;
    Alert.alert(
      `Tạo nhóm với ${chatName}`,
      'Nhập tên nhóm mới',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Tạo',
          onPress: async () => {
            // For now, show a simple text input prompt via Alert
            // In a full implementation, this would open a modal
            Alert.prompt(
              'Tên nhóm mới',
              'Nhập tên cho nhóm',
              [
                { text: 'Hủy', style: 'cancel' },
                {
                  text: 'Tạo',
                  onPress: async (groupName: string | undefined) => {
                    if (!groupName || !groupName.trim()) {
                      Alert.alert('Lỗi', 'Vui lòng nhập tên nhóm');
                      return;
                    }
                    try {
                      const res = await chatPost('/groups/create', {
                        name: groupName.trim(),
                        members: [partnerEmail],
                      });
                      if (res?.ok) {
                        Alert.alert('Thành công', `Nhóm "${groupName}" đã được tạo.`);
                      } else {
                        Alert.alert('Không thể tạo', 'Vui lòng thử lại sau.');
                      }
                    } catch (error) {
                      Alert.alert('Không thể tạo', 'Vui lòng thử lại sau.');
                    }
                  }
                }
              ],
              'plain-text'
            );
          },
        },
      ]
    );
  };

  const handleAddToGroup = () => {
    if (!partnerEmail) return;
    Alert.alert(
      `Thêm ${chatName} vào nhóm`,
      'Tính năng này sẽ được cập nhật sớm. Hiện chưa hỗ trợ thêm thành viên vào nhóm từ chat detail.',
      [{ text: 'Đóng', style: 'cancel' }]
    );
  };

  const handleViewCommonGroups = async () => {
    if (!partnerEmail) return;
    try {
      setLoadingGroups(true);
      const res = await chatGet(`/groups/common?email=${encodeURIComponent(partnerEmail)}`);
      if (res?.ok && Array.isArray(res.data)) {
        setCommonGroups(res.data);
        if (res.data.length === 0) {
          Alert.alert('Nhóm chung', 'Bạn không có nhóm chung nào với người này.');
        } else {
          const groupNames = res.data.map((g: any) => g.name).join(', ');
          Alert.alert('Nhóm chung', `Bạn có ${res.data.length} nhóm chung:\n\n${groupNames}`);
        }
      } else {
        Alert.alert('Nhóm chung', 'Không thể tải danh sách nhóm chung.');
      }
    } catch (error) {
      console.error('Failed to fetch common groups', error);
      Alert.alert('Nhóm chung', 'Không thể tải danh sách nhóm chung.');
    } finally {
      setLoadingGroups(false);

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
    <View style={[styles.container, { backgroundColor: wallpaper.color }]}>
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
            onPress={chat.type === 'group' ? handleUpdateGroupAvatar : (partnerEmail ? handleOpenProfile : undefined)}
          >
            <Image source={{ uri: chatAvatar }} style={styles.largeAvatar} />
            {chat.type === 'group' && (
              <View style={styles.avatarEditBadge}>
                <Text style={styles.avatarEditIcon}>camera_alt</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={chat.type === 'group' ? undefined : handleOpenProfile} disabled={chat.type === 'group' || !partnerEmail} activeOpacity={partnerEmail ? 0.85 : 1}>
            <Text style={styles.profileName}>{chatName}</Text>
          </TouchableOpacity>
          
          <View style={styles.quickActions}>
              <TouchableOpacity style={styles.actionItem} onPress={handleSearchMessages}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>search</Text></View>
              <Text style={styles.actionLabel}>Tìm{"\n"}tin nhắn</Text>
            </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={handleOpenProfile} disabled={!partnerEmail} activeOpacity={partnerEmail ? 0.85 : 1}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>person</Text></View>
              <Text style={styles.actionLabel}>Trang{"\n"}cá nhân</Text>
            </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={handleChangeWallpaper}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>palette</Text></View>
              <Text style={styles.actionLabel}>Đổi{"\n"}hình nền</Text>
            </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={handleToggleMute}>
              <View style={styles.actionCircle}><Text style={styles.actionIcon}>notifications_none</Text></View>
                <Text style={styles.actionLabel}>{isMuted ? 'Bật\nthông báo' : 'Tắt\nthông báo'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Settings List */}
        {renderMenuItem("edit", "Đổi tên gợi nhớ", <Text style={styles.subText}>{chat.alias ? 'Đã đặt' : 'Chưa đặt'}</Text>, () => setShowAliasModal(true))}
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
            {loadingMediaPreview ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginLeft: 16 }} />
            ) : mediaPreviewItems.length > 0 ? (
              mediaPreviewItems.map((m, i) => (
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

        {renderMenuItem("group_add", `Tạo nhóm với ${chatName}`, undefined, handleCreateGroup)}
        {renderMenuItem("person_add", `Thêm ${chatName} vào nhóm`, undefined, handleAddToGroup)}
        {renderMenuItem("groups", `Xem nhóm chung (${commonGroups.length})`, undefined, handleViewCommonGroups)}

        <View style={styles.divider} />

        {renderMenuItem(
          "push_pin",
          isPinned ? "Bỏ ghim trò chuyện" : "Ghim trò chuyện",
          <Text style={styles.subText}>{isPinned ? 'Đã ghim' : 'Chưa ghim'}</Text>,
          handleTogglePin
        )}
        {renderMenuItem(
          "visibility_off",
          isHidden ? "Hiện trò chuyện" : "Ẩn trò chuyện",
          <Text style={styles.subText}>{isHidden ? 'Đang ẩn' : 'Đang hiện'}</Text>,
          handleToggleHidden
        )}
        {renderMenuItem("notifications_none", isMuted ? "Bật thông báo" : "Tắt thông báo", 
          <Text style={styles.subText}>{isMuted ? 'Đang tắt' : 'Đang bật'}</Text>,
          handleToggleMute
        )}
        {renderMenuItem("person_outline", "Cài đặt cá nhân", undefined, handleOpenPersonalSettings)}
        {renderMenuItem(
          "history", 
          "Tin nhắn tự xóa", 
          <Text style={styles.subText}>{autoDeleteDays === 0 ? 'Không tự xóa' : `${autoDeleteDays} ngày`}</Text>,
          handleAutoDelete
        )}

        <View style={styles.divider} />

        {renderMenuItem("report", "Báo xấu", undefined, handleReportConversation, '#ef4444')}
        {renderMenuItem("block", "Quản lý chặn", undefined, handleBlockUser)}
        {renderMenuItem("storage", "Dung lượng trò chuyện", undefined, handleConversationStorage)}
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
               Alert.prompt("Thêm thành viên", "Nhập email", async (email: string | undefined) => {
                  if (email && email.trim()) await addMembers(conversationId, [email.trim()]);
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

      <Modal
        visible={showAliasModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAliasModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.aliasModalCard}>
            <Text style={styles.aliasModalTitle}>Đổi tên gợi nhớ</Text>
            <Text style={styles.aliasModalSubtitle}>Tên này chỉ hiển thị trên thiết bị của bạn.</Text>
            <TextInput
              value={aliasDraft}
              onChangeText={setAliasDraft}
              placeholder="Nhập tên gợi nhớ"
              style={styles.aliasInput}
              autoFocus
            />
            <View style={styles.aliasActions}>
              <TouchableOpacity style={styles.aliasCancelBtn} onPress={() => setShowAliasModal(false)}>
                <Text style={styles.aliasCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aliasSaveBtn, savingAlias && { opacity: 0.6 }]}
                onPress={handleSaveAlias}
                disabled={savingAlias}
              >
                <Text style={styles.aliasSaveText}>{savingAlias ? 'Đang lưu' : 'Lưu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};



export default ChatDetailsScreen;
