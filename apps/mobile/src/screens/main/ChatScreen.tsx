import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
  ActivityIndicator,
  Alert
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from "../../store/callStore";
import { useAuth } from '../../context/AuthContext';
import { chatGet, chatPatch, apiPost, chatUpload } from '../../utils/api';
import SocketService from '../../utils/socket';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import SystemCallMessageItem from '../../components/chat/SystemCallMessageItem';
import SystemNotificationItem from '../../components/chat/SystemNotificationItem';
import styles from './style/ChatScreen.styles';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { 
  pruneExpiredSchedules, 
  getMuteLabel, 
  createMuteUntilHours, 
  createMuteUntilMorning, 
  createCustomWindowMuteSchedule, 
  isValidTimeString
} from '../../utils/chatUtils';

// Components
import { ChatHeader } from "../../components/chat/ChatHeader";
import { PinBanner } from "../../components/chat/PinBanner";
import { ChatModals } from "../../components/chat/ChatModals";
import { ForwardModal } from "../../components/chat/ForwardModal";

const CHAT_MUTE_SCHEDULE_KEY = "chat_notification_mute_schedule_v1";

interface ChatScreenProps {
  onNavigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  params: {
    conversationId: string;
    targetMessageId?: string;
  };
}

export default function ChatScreen({ onNavigate, goBack, params }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { conversationId } = params || {};

  // ZUSTAND STORE
  const {
    conversations,
    messages,
    setActiveConversation,
    updateMessage,
    setConversations,
    sendMessageOptimistic,
    userProfiles,
    fetchMoreMessages,
    isLoadingMessages,
    nextCursor,
    fetchToken,
    targetMessageId,
    patchMessageOptimistic,
    deleteMessageOptimistic,
    markNotificationsRead
  } = useChatStore();

  const { startOutgoingCall, resetCall, setMeetingInfo } = useCallStore();

  // LOCAL STATE
  const [localConversation, setLocalConversation] = useState<any>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isPinsExpanded, setIsPinsExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [muteScheduleMap, setMuteScheduleMap] = useState<Record<string, any>>({});
  const [showMuteMenuModal, setShowMuteMenuModal] = useState(false);
  const [showCustomMuteModal, setShowCustomMuteModal] = useState(false);
  const [customMuteStartTime, setCustomMuteStartTime] = useState("22:00");
  const [customMuteEndTime, setCustomMuteEndTime] = useState("07:00");

  const typingTimeoutRef = useRef<any>(null);
  const messagesScrollRef = useRef<FlatList>(null);

  // DERIVED
  const selectedChat = useMemo(() => 
    conversations.find(c => c.id === conversationId) || localConversation, 
    [conversations, conversationId, localConversation]
  );

  const safeMessages = useMemo(() => {
    const raw = Array.isArray(messages) ? messages : [];
    const seen = new Set();
    return raw.filter((m) => {
      if (!m || typeof m !== "object") return false;
      if (!m.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [messages]);

  const activePinnedMessages = useMemo(() => {
    const ids: string[] = selectedChat?.pinnedMessageIds || [];
    return ids.map(id => {
      const msg = messages.find(m => m.id === id);
      return msg ? msg : { id, isPlaceholder: true };
    }).slice(0, 3);
  }, [selectedChat?.pinnedMessageIds, messages]);

  // UTILS
  const normalizeEmail = useCallback((email: string | null | undefined) => String(email || "").trim().toLowerCase(), []);
  const getDisplayName = useCallback((email: string | null | undefined) => {
    if (!email) return "Người dùng";
    const normalized = normalizeEmail(email);
    if (normalized === normalizeEmail(user?.email)) return "Bạn";
    const p = userProfiles[normalized];
    return p?.nickname || p?.fullName || p?.fullname || normalized;
  }, [userProfiles, user, normalizeEmail]);

  const getDisplayAvatar = useCallback((email?: string) => {
    const defaultAvatar = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";
    const normalized = normalizeEmail(email);
    if (!normalized) return defaultAvatar;
    if (normalized === normalizeEmail(user?.email)) return user?.avatarUrl || defaultAvatar;
    return userProfiles[normalized]?.avatarUrl || defaultAvatar;
  }, [userProfiles, user, normalizeEmail]);

  // PERSISTENCE
  const persistMuteSchedules = async (nextMap: Record<string, any>) => {
    const normalized = pruneExpiredSchedules(nextMap);
    setMuteScheduleMap(normalized);
    try {
      await AsyncStorage.setItem(CHAT_MUTE_SCHEDULE_KEY, JSON.stringify(normalized));
    } catch (error) { console.error("Save mute schedule failed", error); }
  };

  useEffect(() => {
    const loadNotificationPrefs = async () => {
      const muteRaw = await AsyncStorage.getItem(CHAT_MUTE_SCHEDULE_KEY);
      if (muteRaw) {
        const parsed = JSON.parse(muteRaw);
        if (parsed) setMuteScheduleMap(pruneExpiredSchedules(parsed));
      }
    };
    loadNotificationPrefs();
  }, []);

  // INITIALIZATION
  useEffect(() => {
    if (!conversationId) return;
    setActiveConversation(conversationId, params?.targetMessageId || null);
    if (!conversations.find(c => c.id === conversationId)) {
      (async () => {
        setIsLoadingMetadata(true);
        try {
          const res = await chatGet(`/conversations/${encodeURIComponent(conversationId)}/metadata`);
          if (res.ok) setLocalConversation(res.data);
        } finally { setIsLoadingMetadata(false); }
      })();
    }
    if (SocketService.socket) SocketService.socket.emit("join_room", { convId: conversationId });
    useChatStore.getState().markReadLocal(conversationId);
    markNotificationsRead(conversationId);
    chatPatch(`/conversations/${encodeURIComponent(conversationId)}/read`, {}).catch(() => {});

    return () => {
      if (SocketService.socket) SocketService.socket.emit("leave_room", { convId: conversationId });
      setActiveConversation(null);
    };
  }, [conversationId, setActiveConversation]);

  // Load partner profile if missing
  useEffect(() => {
    if (selectedChat?.type === 'direct' && selectedChat?.members) {
      const partnerEmail = selectedChat.members.find((m: string) => normalizeEmail(m) !== normalizeEmail(user?.email));
      if (partnerEmail && !userProfiles[normalizeEmail(partnerEmail)]) {
        useChatStore.getState().loadUserProfile(partnerEmail);
      }
    }
  }, [selectedChat, user?.email, userProfiles, normalizeEmail]);

  // SOCKET EVENTS
  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket) return;
    const handleTyping = (data: any) => {
      if (data.convId !== conversationId || data.email === user?.email) return;
      setTypingUsers(prev => {
        const next = new Set(prev);
        data.isTyping ? next.add(data.email) : next.delete(data.email);
        return next;
      });
    };
    const handleMessageReaction = (data: any) => { if (data.messageId) updateMessage(data.messageId, { reactions: data.reactions }); };
    const handlePinUpdate = (data: any) => {
      const convId = data.conversationId || data.convId;
      if (convId && data.pinnedMessageIds) {
        setConversations((prev: any[]) => prev.map(c => c.id === convId ? { ...c, pinnedMessageIds: data.pinnedMessageIds } : c));
      }
    };
    socket.on("typing", handleTyping);
    socket.on("message_reaction", handleMessageReaction);
    socket.on("PIN_UPDATE", handlePinUpdate);
    return () => {
      socket.off("typing", handleTyping);
      socket.off("message_reaction", handleMessageReaction);
      socket.off("PIN_UPDATE", handlePinUpdate);
    };
  }, [conversationId, user?.email, updateMessage, setConversations]);

  // HANDLERS
  const handleChatSend = async (content: string, attachments: any[] = []) => {
    if (!selectedChat?.id) return;
    try {
      const uploaded = await Promise.all(attachments.map(async (item) => {
        if (item.isSticker || (item.dataUrl && item.dataUrl.startsWith('http'))) return item;
        const res = await chatUpload(item.file || { uri: item.dataUrl, name: item.name, type: item.mimeType });
        return res.ok ? { ...item, dataUrl: res.data.fileUrl || res.data.url } : item;
      }));
      sendMessageOptimistic(selectedChat.id, user?.email, content, "text", { attachments: uploaded });
    } catch (err) { Alert.alert("Lỗi", "Không thể gửi tin nhắn."); }
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!selectedChat || selectedChat.type !== 'direct') return Alert.alert('Thất bại', 'Chỉ hỗ trợ gọi 1:1');
    const partnerEmail = selectedChat.partner || (Array.isArray(selectedChat.members) ? selectedChat.members.find((m: string) => m !== user?.email) : undefined);
    const activeCallId = uuidv4();
    startOutgoingCall({ email: partnerEmail, fullName: getDisplayName(partnerEmail) }, type, selectedChat.id, activeCallId);
    const res = await apiPost('/call/create', { conversationId: selectedChat.id, callId: activeCallId, type });
    if (res.ok) {
      setMeetingInfo(res.meeting, res.attendee);
      SocketService.socket?.emit('call:invite', { convId: selectedChat.id, callId: activeCallId, fromEmail: user.email, toEmail: partnerEmail, callerProfile: { email: user.email, fullName: user.fullName || user.email, avatarUrl: user.avatarUrl }, callType: type });
    } else { resetCall(); Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi'); }
  };

  const toggleReaction = async (message: any, emoji: string) => {
    if (!user?.email || !selectedChat?.id) return;
    const isRemove = message.reactions?.[emoji]?.includes(user.email);
    patchMessageOptimistic(selectedChat.id, message.id, { action: "react", reactAction: isRemove ? 'remove' : 'add', emoji });
  };

  const handleSelectMuteSchedule = async (type: string) => {
    if (!selectedChat?.id) return;
    setShowMuteMenuModal(false);
    const nextMap: Record<string, any> = { ...muteScheduleMap };
    if (type === "unmute") delete nextMap[selectedChat.id];
    else if (type === "1h") nextMap[selectedChat.id] = createMuteUntilHours(1);
    else if (type === "4h") nextMap[selectedChat.id] = createMuteUntilHours(4);
    else if (type === "custom") return setShowCustomMuteModal(true);
    else nextMap[selectedChat.id] = createMuteUntilMorning(8);
    await persistMuteSchedules(nextMap);
    Alert.alert("Thông báo", getMuteLabel(nextMap[selectedChat.id]));
  };

  const typingText = typingUsers.size > 0 ? `${getDisplayName([...typingUsers][0])} đang gõ...` : "Đang hoạt động";

  if (!selectedChat) return <View style={styles.container}><ActivityIndicator color="#fff" /></View>;

  const partner = selectedChat.partner || (Array.isArray(selectedChat.members) ? selectedChat.members.find((m: string) => m !== user?.email) : undefined);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ChatHeader 
          insets={insets} goBack={goBack} selectedChat={selectedChat}
          displayName={selectedChat.type === 'direct' ? getDisplayName(partner) : selectedChat.name}
          displayAvatar={selectedChat.type === 'direct' ? getDisplayAvatar(partner) : (selectedChat.avatar || getDisplayAvatar())}
          isOnline={selectedChat.type === 'direct' && userProfiles[partner]?.status === 'online'}
          typingText={typingText} onStartCall={handleStartCall}
        />

        <PinBanner 
          activePinnedMessages={activePinnedMessages} isPinsExpanded={isPinsExpanded} setIsPinsExpanded={setIsPinsExpanded}
          onJumpToMessage={(id) => setActiveConversation(selectedChat.id, id)}
          onUnpin={(id) => chatPatch(`/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(id)}`, { action: "unpin" })}
        />

        <FlatList
          ref={messagesScrollRef}
          data={safeMessages}
          inverted
          keyExtractor={(m) => m.id}
          onScroll={(e) => setShowScrollToBottom(e.nativeEvent.contentOffset.y > 300)}
          onEndReached={() => selectedChat?.id && nextCursor && !isLoadingMessages && fetchMoreMessages(selectedChat.id, 30, fetchToken)}
          onEndReachedThreshold={0.3}
          renderItem={({ item: m }) => {
            if (m.type === 'call' || m.type === 'SYSTEM_CALL' || (m.type === 'system' && m.content?.includes('Cuộc gọi'))) return <SystemCallMessageItem message={m} currentUserEmail={user?.email} onCallBack={handleStartCall} />;
            if (m.type === 'system') return <SystemNotificationItem message={m} onJump={(id) => setActiveConversation(selectedChat.id, id)} />;
            return <MessageBubble message={m} isMe={normalizeEmail(m.senderId) === normalizeEmail(user?.email)} userProfile={userProfiles[normalizeEmail(m.senderId)]} onLongPress={setActionMessage} onReaction={toggleReaction} onReply={setReplyTarget} onSystemMessagePress={(id) => setActiveConversation(selectedChat.id, id)} isHighlighted={!!targetMessageId && (m.id === targetMessageId || m.SK === targetMessageId)} />;
          }}
        />

        {showScrollToBottom && (
          <TouchableOpacity style={styles.scrollToBottomBtn} onPress={() => messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true })}>
            <Text style={styles.scrollToBottomIcon}>arrow_downward</Text>
          </TouchableOpacity>
        )}

        <ChatInput 
          key={`input-${selectedChat.id}`} onSendMessage={handleChatSend} replyTarget={replyTarget} onClearReply={() => setReplyTarget(null)}
          onTyping={() => { if (SocketService.socket && selectedChat.id && !typingTimeoutRef.current) { SocketService.socket.emit("typing", { convId: selectedChat.id, isTyping: true }); typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000); } }}
        />
      </KeyboardAvoidingView>

      <ChatModals 
        actionMessage={actionMessage} setActionMessage={setActionMessage} onReaction={toggleReaction} onReply={setReplyTarget} 
        onForward={(m) => { setActionMessage(null); setIsForwardModalOpen(true); }}
        onRecall={(m) => patchMessageOptimistic(selectedChat.id, m.id, { action: 'recall' })}
        onDelete={(m) => deleteMessageOptimistic(selectedChat.id, m.id)}
        userEmail={user?.email} showMuteMenuModal={showMuteMenuModal} setShowMuteMenuModal={setShowMuteMenuModal}
        onSelectMuteSchedule={handleSelectMuteSchedule} showCustomMuteModal={showCustomMuteModal} setShowCustomMuteModal={setShowCustomMuteModal}
        customMuteStartTime={customMuteStartTime} setCustomMuteStartTime={setCustomMuteStartTime} customMuteEndTime={customMuteEndTime} setCustomMuteEndTime={setCustomMuteEndTime}
        onApplyCustomMuteSchedule={async () => {
          if (!isValidTimeString(customMuteStartTime) || !isValidTimeString(customMuteEndTime)) return Alert.alert("Lỗi", "Giờ không hợp lệ");
          const nextMap: Record<string, any> = { ...muteScheduleMap, [selectedChat.id]: createCustomWindowMuteSchedule(customMuteStartTime, customMuteEndTime) };
          await persistMuteSchedules(nextMap); setShowCustomMuteModal(false); Alert.alert("Thông báo", getMuteLabel(nextMap[selectedChat.id]));
        }}
      />

      <ForwardModal 
        visible={isForwardModalOpen} onClose={() => setIsForwardModalOpen(false)} message={actionMessage}
        onForward={(targetId) => sendMessageOptimistic(targetId, user?.email, actionMessage.content, actionMessage.type, { attachments: actionMessage.media || actionMessage.files })}
      />
    </View>
  );
}
