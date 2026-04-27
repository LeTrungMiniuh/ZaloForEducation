import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from 'uuid';
import {
  View,
  Text,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
  PermissionsAndroid,
  TouchableOpacity,
  Pressable,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import styles from './style/HomeScreen.styles';
import { Colors } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, chatGet, chatPost, chatPatch, chatUpload } from '../../utils/api';
import SocketService from '../../utils/socket';
import { getMessagePreview } from '../../utils/chatUtils';
import { useChatStore } from '../../store/chatStore';
import { useConversations } from "../../hooks/queries/useConversations";
import { useCallStore } from "../../store/callStore";
import ContactsScreen from './ContactsScreen';
import NotificationScreen from "./NotificationScreen";
import { HomeHeader } from "../../components/home/HomeHeader";
import { ConversationList } from "../../components/home/ConversationList";
import { MessageActionSheet } from "../../components/home/MessageActionSheet";
import { ProfileTab } from "../../components/home/ProfileTab";
import { Conversation, Message } from "../../store/types";

const TAB_ALIAS: Record<string, string> = {
  messages: "chat",
  chat: "chat",
  friends: "contacts",
  contacts: "contacts",
  ai: "notifications",
  notifications: "notifications",
  profile: "profile",
};

const normalizeHomeTab = (tab: string) => TAB_ALIAS[String(tab || "").trim().toLowerCase()] || "chat";

const DEFAULT_AVATAR = require('../../../assets/logo_blue.png');

export default function HomeScreen({
  navigation,
  route,
  params: directParams,
}: any) {
  const insets = useSafeAreaInsets();
  const { user, profileVersion, checkSessionStatus, logout }: any = useAuth();
  
  const { 
    conversations, 
    fetchConversations, 
    setActiveConversation, 
    unreadNotificationCount,
    userProfiles,
    upsertProfiles,
    loadUserProfile
  } = useChatStore();

  const { refetch: refetchConversations, isFetching: isRefreshing } = useConversations();
  const { startOutgoingCall, resetCall, setMeetingInfo }: any = useCallStore();

  const initialTab = directParams?.tab || route.params?.tab || "messages";
  const [activeTab, setActiveTab] = useState(normalizeHomeTab(initialTab));
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [friendSearchEmail, setFriendSearchEmail] = useState("");
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  useEffect(() => {
    if (checkSessionStatus) checkSessionStatus();
  }, []);

  useEffect(() => {
    setActiveTab(normalizeHomeTab(directParams?.tab || initialTab));
  }, [directParams?.tab, initialTab]);

  const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

  const getDisplayName = (email: string) => {
    if (!email) return "Người dùng";
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail === normalizeEmail(user?.email)) {
      return user?.nickname || user?.fullName || user?.fullname || "Bạn";
    }
    const p = userProfiles[normalizedEmail] || {};
    return p?.nickname || p?.fullName || p?.fullname || normalizedEmail;
  };

  const getDisplayAvatar = (email?: string) => {
    const normalizedEmail = email ? normalizeEmail(email) : "";
    if (!normalizedEmail) return DEFAULT_AVATAR;
    if (normalizedEmail === normalizeEmail(user?.email)) {
       return user?.avatarUrl ? { uri: user.avatarUrl } : DEFAULT_AVATAR;
    }
    const avatarUri = userProfiles[normalizedEmail]?.avatarUrl;
    return avatarUri ? { uri: avatarUri } : DEFAULT_AVATAR;
  };

  const getConversationPreview = (conv: Conversation) => {
    const isMe = conv?.lastMessageSenderId === user?.email;
    const prefix = isMe ? 'Bạn: ' : '';

    // Create a mock message object to use getMessagePreview
    const mockMsg = {
      content: conv?.lastMessageContent || (String(conv?.lastMessage || '').startsWith('MSG#') ? '' : conv?.lastMessage) || '',
      type: (conv as any).lastMessageType,
      media: (conv as any).lastMessageMedia,
      files: (conv as any).lastMessageFiles,
    };

    const preview = getMessagePreview(mockMsg);
    if (preview === 'Tin nhắn' && !mockMsg.content) return 'Chưa có tin nhắn';
    
    return `${prefix}${preview}`;
  };

  const onRefresh = useCallback(async () => {
    refetchConversations();
  }, [refetchConversations]);

  const fetchConversationsData = useCallback(async () => {
    if (user?.email) {
      await fetchConversations();
      setLoadingConversations(false);
    }
  }, [user?.email, fetchConversations]);

  useEffect(() => {
    fetchConversationsData();
  }, [fetchConversationsData]);

  const handleSelectChat = (chat: Conversation) => {
    navigation.navigate('Chat', { conversationId: chat.id });
  };

  const handleLogoutPress = () => {
    Alert.alert("Đăng xuất", "Bạn có chắc chắn muốn đăng xuất?", [
      { text: "Hủy", style: "cancel" },
      { text: "Đăng xuất", style: "destructive", onPress: logout },
    ]);
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      
      {activeTab !== "contacts" && (
        <HomeHeader 
          searchEmail={friendSearchEmail}
          onSearchPress={() => navigation.navigate('Search')}
          onQRScannerPress={() => navigation.navigate('QRScanner')}
          onAddPress={() => setIsAddMenuOpen(true)}
        />
      )}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          {activeTab === "chat" && (
            <ConversationList 
              conversations={conversations}
              loading={loadingConversations}
              currentUserEmail={user?.email || ""}
              userProfiles={userProfiles}
              onSelectChat={handleSelectChat}
              getDisplayName={getDisplayName}
              getDisplayAvatar={getDisplayAvatar}
              getConversationPreview={getConversationPreview}
            />
          )}
          {activeTab === "contacts" && (
            <ContactsScreen
              user={user}
              conversations={conversations}
              onNavigate={(screen: string, p: any) => navigation.navigate(screen, p)}
              onOpenDirectChat={(email: string) => navigation.navigate('Chat', { targetEmail: email })}
              onOpenGroupConversation={(conv: any) => navigation.navigate('Chat', { conversationId: conv.id })}
            />
          )}
          {activeTab === "notifications" && <NotificationScreen onNavigate={(s: string, p: any) => navigation.navigate(s, p)} />}
          {activeTab === "profile" && (
            <ProfileTab 
              user={user}
              profileVersion={profileVersion}
              onNavigate={(s: string, p: any) => navigation.navigate(s, p)}
              onLogoutPress={handleLogoutPress}
              conversationFiles={[]}
              getFileIcon={() => "insert_drive_file"}
              formatFileSize={() => "0 KB"}
              DEFAULT_AVATAR={DEFAULT_AVATAR}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <MessageActionSheet 
        isVisible={!!actionMessage}
        message={actionMessage}
        userEmail={user?.email || ""}
        onClose={() => setActionMessage(null)}
        onReact={() => {}}
        onReply={() => {}}
        onCopy={() => {}}
        onForward={() => {}}
        onPin={() => {}}
        onRecall={() => {}}
        onDeleteForMe={() => {}}
      />

      <Modal
        visible={isAddMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsAddMenuOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setIsAddMenuOpen(false)}>
          <View style={[styles.addMenu, { top: insets.top + 50 }]}>
            <TouchableOpacity 
              style={styles.addMenuItem} 
              onPress={() => { setIsAddMenuOpen(false); navigation.navigate('Search'); }}
            >
              <Text style={styles.addMenuIcon}>person_add</Text>
              <Text style={styles.addMenuLabel}>Thêm bạn</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.addMenuItem} 
              onPress={() => { setIsAddMenuOpen(false); navigation.navigate('CreateGroup'); }}
            >
              <Text style={styles.addMenuIcon}>group_add</Text>
              <Text style={styles.addMenuLabel}>Tạo nhóm</Text>
            </TouchableOpacity>

            <View style={styles.addMenuDivider} />

            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>videocam</Text>
              <Text style={styles.addMenuLabel}>Tạo cuộc gọi nhóm</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>devices</Text>
              <Text style={styles.addMenuLabel}>Thiết bị đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}