import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  Modal,
  Alert,
  Keyboard,
  StyleSheet,
  TextInput,
  ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from "../../store/callStore";
import { useAuth } from '../../context/AuthContext';
import { chatGet, chatPost, chatPatch, apiPost, apiPatch } from '../../utils/api';
import SocketService from '../../utils/socket';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import SystemCallMessageItem from '../../components/chat/SystemCallMessageItem';
import styles from './style/ChatScreen.styles';
import { v4 as uuidv4 } from 'uuid';

const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];

const CHAT_MUTE_SCHEDULE_KEY = "chat_notification_mute_schedule_v1";

const timeToMinutes = (timeString) => {
  const [hours, minutes] = String(timeString || "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

const isValidTimeString = (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());

const createMuteUntilHours = (hours) => {
  const now = Date.now();
  const endAt = now + hours * 60 * 60 * 1000;
  return { enabled: true, mode: `hours_${hours}`, endAt, createdAt: now };
};

const createMuteUntilMorning = (targetHour = 8) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(targetHour, 0, 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return { enabled: true, mode: "until_morning", endAt: end.getTime(), createdAt: now.getTime() };
};

const createCustomWindowMuteSchedule = (startTime, endTime) => ({
  enabled: true, mode: "custom_window", startTime, endTime, createdAt: Date.now()
});

const pruneExpiredSchedules = (map) => {
  const safeMap = map && typeof map === "object" ? map : {};
  const now = Date.now();
  const next = {};
  Object.entries(safeMap).forEach(([convId, schedule]) => {
    if (!schedule || schedule.enabled !== true) return;
    if (schedule.mode === "custom_window") {
      if (!isValidTimeString(schedule.startTime) || !isValidTimeString(schedule.endTime)) return;
      next[convId] = schedule;
      return;
    }
    if (typeof schedule.endAt !== "number") return;
    if (schedule.endAt <= now) return;
    next[convId] = schedule;
  });
  return next;
};

const getMuteLabel = (schedule) => {
  if (!schedule) return "Đã tắt thông báo";
  if (schedule.mode === "custom_window" && schedule.startTime && schedule.endTime) {
    return `Đã tắt theo khung ${schedule.startTime} - ${schedule.endTime}`;
  }
  if (typeof schedule.endAt !== "number") return "Đã tắt thông báo";
  const endTime = new Date(schedule.endAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit", minute: "2-digit"
  });
  return `Đã tắt thông báo đến ${endTime}`;
};

export default function ChatScreen({ onNavigate, goBack, params }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { conversationId, targetMessageId, highlightKeyword } = params || {};

  // ZUSTAND STORE
  const {
    conversations,
    messages,
    setActiveConversation,
    addMessage,
    updateMessage,
    setConversations,
    upsertConversationLastMessage,
    sendMessageOptimistic,
    userProfiles,
    upsertProfiles,
    fetchMoreMessages,
    isLoadingMessages,
    nextCursor,
    fetchToken,
    markNotificationsRead
  } = useChatStore();

  const { startOutgoingCall, resetCall, setMeetingInfo, callState } = useCallStore();

  // Dismiss keyboard when a call comes in
  useEffect(() => {
    if (callState === 'RINGING') {
      Keyboard.dismiss();
    }
  }, [callState]);

  // LOCAL STATE
  const [localConversation, setLocalConversation] = useState(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [replyTarget, setReplyTarget] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);

  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // MUTE NOTIFICATIONS STATE
  const [muteScheduleMap, setMuteScheduleMap] = useState({});
  const [showMuteMenuModal, setShowMuteMenuModal] = useState(false);
  const [showCustomMuteModal, setShowCustomMuteModal] = useState(false);
  const [customMuteStartTime, setCustomMuteStartTime] = useState("22:00");
  const [customMuteEndTime, setCustomMuteEndTime] = useState("07:00");

  const typingTimeoutRef = useRef(null);

  const handleScroll = (event) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    // Since list is inverted, offsetY > 0 means scrolled up
    if (offsetY > 300) {
      setShowScrollToBottom(true);
    } else {
      setShowScrollToBottom(false);
    }
  };

  const scrollToBottom = () => {
    messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const messagesScrollRef = useRef(null);
  const profileLoadingRef = useRef(new Set());

  // DERIVED
  const selectedChatFromStore = useMemo(() => 
    conversations.find(c => c.id === conversationId), 
    [conversations, conversationId]
  );
  
  const selectedChat = selectedChatFromStore || localConversation;

  const selectedChatMuteSchedule = selectedChat?.id && muteScheduleMap[selectedChat.id] ? muteScheduleMap[selectedChat.id] : null;
  const isSelectedChatMuted = Boolean(selectedChatMuteSchedule);

  const persistMuteSchedules = async (nextMap) => {
    const normalized = pruneExpiredSchedules(nextMap);
    setMuteScheduleMap(normalized);
    try {
      await AsyncStorage.setItem(CHAT_MUTE_SCHEDULE_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.error("Save mute schedule failed", error);
    }
  };

  useEffect(() => {
    const loadNotificationPrefs = async () => {
      try {
        const muteRaw = await AsyncStorage.getItem(CHAT_MUTE_SCHEDULE_KEY);
        if (muteRaw) {
          const parsedMute = JSON.parse(muteRaw);
          if (parsedMute && typeof parsedMute === "object") {
            const cleaned = pruneExpiredSchedules(parsedMute);
            setMuteScheduleMap(cleaned);
          }
        }
      } catch (error) {
        console.error("Load notification preferences failed", error);
      }
    };
    loadNotificationPrefs();
  }, []);

  const handleSelectMuteSchedule = async (type) => {
    if (!selectedChat?.id) return;
    setShowMuteMenuModal(false);
    const convId = selectedChat.id;
    const nextMap = { ...muteScheduleMap };

    if (type === "unmute") {
      delete nextMap[convId];
      await persistMuteSchedules(nextMap);
      Alert.alert("Thông báo", "Đã bật lại thông báo.");
      return;
    }

    if (type === "1h") nextMap[convId] = createMuteUntilHours(1);
    else if (type === "4h") nextMap[convId] = createMuteUntilHours(4);
    else if (type === "custom") {
      setShowCustomMuteModal(true);
      return;
    } else nextMap[convId] = createMuteUntilMorning(8);

    await persistMuteSchedules(nextMap);
    Alert.alert("Thông báo", getMuteLabel(nextMap[convId]));
  };

  const handleApplyCustomMuteSchedule = async () => {
    if (!selectedChat?.id) return;
    const start = customMuteStartTime.trim();
    const end = customMuteEndTime.trim();

    if (!isValidTimeString(start) || !isValidTimeString(end)) {
      Alert.alert("Giờ không hợp lệ", "Vui lòng nhập đúng định dạng HH:mm (ví dụ 22:00).");
      return;
    }

    const convId = selectedChat.id;
    const nextMap = { ...muteScheduleMap, [convId]: createCustomWindowMuteSchedule(start, end) };
    await persistMuteSchedules(nextMap);
    setShowCustomMuteModal(false);
    Alert.alert("Thông báo", getMuteLabel(nextMap[convId]));
  };

  const openMuteMenu = useCallback(() => setShowMuteMenuModal(true), []);

  const safeMessages = useMemo(() => {
    const raw = Array.isArray(messages) ? messages : [];
    const seen = new Set();
    return raw.filter((m) => {
      if (!m || typeof m !== "object") return false;
      const mid = m.id; // Store already normalizes this
      if (!mid || seen.has(mid)) return false;
      seen.add(mid);
      return true;
    });
  }, [messages]);

  // REMOVED redundant reversedMessages useMemo since safeMessages is now newest-first

  const activePinnedMessages = useMemo(() =>
    messages
      .filter((m) => m.pinned)
      .sort((a, b) => String(b.pinnedAt || "").localeCompare(String(a.pinnedAt || "")))
      .slice(0, 3),
    [messages]
  );

  // HELPERS
  const getDisplayName = useCallback((email) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return "Bạn";
    const p = userProfiles[email];
    return p?.fullName || p?.fullname || email;
  }, [userProfiles, user]);

  const getDisplayAvatar = useCallback((email) => {
    const defaultAvatar = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";
    if (!email) return defaultAvatar;
    if (email === user?.email) return user?.avatarUrl || defaultAvatar;
    return userProfiles[email]?.avatarUrl || defaultAvatar;
  }, [userProfiles, user]);

  const loadUserProfile = async (email) => {
    if (!email || email === user?.email || userProfiles[email]) return;
    if (profileLoadingRef.current.has(email)) return;
    profileLoadingRef.current.add(email);
    try {
      const res = await chatGet("/friends/search", { email });
      if (res?.ok && res?.found && res?.user) {
        upsertProfiles({ [email]: res.user });
      }
    } catch (err) {
      console.error("Load profile failed", err);
    } finally {
      profileLoadingRef.current.delete(email);
    }
  };

  const fetchMetadata = async (id) => {
    if (!id || isLoadingMetadata) return;
    setIsLoadingMetadata(true);
    try {
      const res = await chatGet(`/conversations/${id}/metadata`);
      if (res.ok && res.data) {
        const conv = res.data;
        // Enrich with partner for direct chats if missing
        if (conv.type === 'direct' && !conv.partner && Array.isArray(conv.members)) {
          conv.partner = conv.members.find(m => m !== user?.email);
        }
        setLocalConversation(conv);
      }
    } catch (err) {
      console.error("[Chat] Failed to fetch metadata", err);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  // INITIALIZATION
  useEffect(() => {
    if (!conversationId) return;
    setActiveConversation(conversationId, targetMessageId);
    
    if (!selectedChatFromStore) {
      fetchMetadata(conversationId);
    }

    if (SocketService.socket) {
      SocketService.socket.emit("join_room", { convId: conversationId });
    }

    const markReadProcess = async () => {
      // 1. Cập nhật local ngay lập tức (Optimistic UI)
      useChatStore.getState().markReadLocal(conversationId);
      markNotificationsRead(conversationId);

      // 2. Gọi API thông báo cho server sau
      try {
        // Dùng hàm chatPatch (đã có tiền tố /chat) thay vì apiPatch
        await chatPatch(`/conversations/${conversationId}/read`);
      } catch (err) {
        console.warn("[Chat] Server sync read failed", err);
      }
    };
    markReadProcess();

    return () => {
      if (SocketService.socket && conversationId) {
        SocketService.socket.emit("leave_room", { convId: conversationId });
      }
      setActiveConversation(null);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [conversationId, setActiveConversation]);

  // [SENIOR] Mark as Read when new messages arrive while chat is active
  useEffect(() => {
    if (!conversationId || safeMessages.length === 0) return;
    
    // Only mark as read if the latest message is NOT from me
    const newest = safeMessages[0];
    if (newest && newest.senderId !== user?.email) {
      apiPatch(`/chat/conversations/${conversationId}/read`).catch(() => {});
    }
  }, [safeMessages.length, conversationId, user?.email]);

  useEffect(() => {
    const partner = selectedChat?.partner || (selectedChat?.type === 'direct' && Array.isArray(selectedChat?.members) ? selectedChat.members.find(m => m !== user?.email) : undefined);
    if (selectedChat?.type === "direct" && partner) {
      loadUserProfile(partner);
    }
  }, [selectedChat?.partner, selectedChat?.type, selectedChat?.members, user?.email]);

  // SOCKET EVENTS
  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket) return;

    const handleTyping = (data) => {
      if (data.convId !== conversationId || data.email === user?.email) return;
      setTypingUsers(prev => {
        const next = new Set(prev);
        if (data.isTyping) next.add(data.email);
        else next.delete(data.email);
        return next;
      });
    };

    const handleReceiveMessage = (msg) => {
      if (!msg || !conversationId) return;
      const incomingId = msg.conversationId || msg.convId;
      if (incomingId && incomingId.toLowerCase() === conversationId.toLowerCase()) {
        // [SENIOR] addMessage is now handled globally by AuthContext.
        // We only handle UI side-effects here (scrolling).
        setTimeout(() => {
          messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
      }
    };

    SocketService.on("receiveMessage", handleReceiveMessage);
    SocketService.on("typing", handleTyping);
    return () => {
      SocketService.off("receiveMessage", handleReceiveMessage);
      SocketService.off("typing", handleTyping);
    };
  }, [conversationId, user?.email, addMessage]);

  // DEEP LINK SCROLL
  useEffect(() => {
    if (!targetMessageId || !messagesScrollRef.current || safeMessages.length === 0) return;
    
    // Using a slightly longer timeout to ensure FlatList has rendered the items
    const timeout = setTimeout(() => {
      const index = safeMessages.findIndex(m => m.id === targetMessageId || m.SK === targetMessageId);
      
      console.log(`[ChatScroll] Targeting message ${targetMessageId} at index ${index} of ${safeMessages.length}`);
      
      if (index !== -1) {
        console.log(`[ChatScroll] Found at index ${index}. Executing scroll...`);
        try {
          messagesScrollRef.current.scrollToIndex({ 
            index, 
            animated: true, 
            viewPosition: 0.5 
          });
        } catch (err) {
          console.warn("[ChatScroll] scrollToIndex failed, trying offset fallback", err);
          messagesScrollRef.current.scrollToOffset({ offset: index * 100, animated: true });
        }
      } else {
        console.log("[ChatScroll] Message not in current view. May need to load more.");
      }
    }, 1000); 
    
    return () => clearTimeout(timeout);
  }, [targetMessageId, safeMessages.length]);

  // HANDLERS
  const handleChatSend = async (content, attachments = []) => {
    if (!selectedChat?.id) return;
    sendMessageOptimistic(selectedChat.id, user?.email, content, "text", { attachments });
  };

  const handleStartCall = async (type) => {
    Keyboard.dismiss();
    if (!selectedChat || selectedChat.type !== 'direct') {
      Alert.alert('Thất bại', 'Hiện tại chỉ hỗ trợ gọi 1:1');
      return;
    }
    const partnerEmail = selectedChat.partner || (selectedChat.type === 'direct' && Array.isArray(selectedChat.members) ? selectedChat.members.find(m => m !== user?.email) : undefined);
    const partnerProfile = userProfiles[partnerEmail] || { email: partnerEmail, fullName: getDisplayName(partnerEmail) };
    const activeCallId = uuidv4();

    startOutgoingCall(partnerProfile, type, selectedChat.id, activeCallId);

    try {
      const res = await apiPost('/call/create', { conversationId: selectedChat.id, callId: activeCallId, type });
      if (res.ok) {
        setMeetingInfo(res.meeting, res.attendee);
        SocketService.socket.emit('call:invite', {
          convId: selectedChat.id,
          callId: activeCallId,
          fromEmail: user.email,
          toEmail: partnerEmail,
          callerProfile: { email: user.email, fullName: user.fullName || user.fullname || user.email, avatarUrl: user.avatarUrl || user.avatar },
          callType: type
        });
      } else {
        resetCall();
        Alert.alert('Lỗi', res.message || 'Không thể khởi tạo cuộc gọi');
      }
    } catch (err) {
      resetCall();
      Alert.alert('Lỗi kết nối', 'Vui lòng kiểm tra lại mạng');
    }
  };

  const toggleReaction = async (message, emoji) => {
    if (!user?.email || !selectedChat?.id) return;
    const isRemove = message.reactions?.[emoji]?.includes(user.email);
    await chatPatch(`/conversations/${selectedChat.id}/messages/${message.id}`, {
      action: "react",
      reactAction: isRemove ? 'remove' : 'add',
      emoji
    });
  };

  const unpinMessage = async (msgId) => {
    if (!selectedChat?.id) return;
    await chatPatch(`/conversations/${selectedChat.id}/messages/${msgId}`, { action: "unpin" });
  };

  const getMessagePreview = (message) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";

    const contentStr = typeof message.content === "string" ? message.content : "";
    if (message.type === 'call' || message.type === 'SYSTEM_CALL' || (message.type === 'system' && contentStr.includes('Cuộc gọi'))) {
      const meta = message.metadata || {};
      const isVideo = meta.callType === 'video' || contentStr.includes('video');
      const label = isVideo ? 'Video' : 'Thoại';
      const status = (meta.callStatus || '').toLowerCase();
      if (status === 'missed' || status === 'no_answer' || status === 'cancelled') {
        return `[Cuộc gọi ${label} nhỡ]`;
      }
      return `[Cuộc gọi ${label}]`;
    }

    if (message.media?.length > 0) return "[Ảnh/Video]";
    if (message.files?.length > 0) return "[Tệp đính kèm]";
    return message.content || "Tin nhắn";
  };

  if (!selectedChat) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={["#0058bc", "#00418f"]} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} />
        <Text style={{ color: '#fff' }}>Đang tải...</Text>
      </View>
    );
  }

  const typingText = typingUsers.size > 0 ? `${getDisplayName([...typingUsers][0])} đang gõ...` : "Đang hoạt động";

  const memoizedHeader = useMemo(() => {
    const partner = selectedChat.partner || (Array.isArray(selectedChat.members) ? selectedChat.members.find(m => m !== user?.email) : undefined);
    const displayName = selectedChat.type === 'direct' ? getDisplayName(partner) : selectedChat.name;
    const displayAvatar = selectedChat.type === 'direct' ? getDisplayAvatar(partner) : (selectedChat.avatar || getDisplayAvatar());
    const isOnline = selectedChat.type === 'direct' && userProfiles[partner]?.status === 'online';

    return (
      <LinearGradient colors={["#0058bc", "#00418f"]} style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity 
          onPress={goBack}
          style={{ paddingRight: 10, paddingVertical: 5 }}
        >
          <Text style={styles.headerBack}>arrow_back</Text>
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Image 
            source={{ uri: displayAvatar }} 
            style={styles.headerAvatar} 
          />
          {isOnline && (
            <View style={styles.onlineBadge} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.headerSub}>{typingText}</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => handleStartCall('audio')}>
            <Text style={styles.headerIcon}>call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconButton} onPress={() => handleStartCall('video')}>
            <Text style={styles.headerIcon}>videocam</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconButton}>
            <Text style={styles.headerIcon}>list</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }, [
    selectedChat?.id, 
    selectedChat?.name, 
    selectedChat?.avatar, 
    selectedChat?.partner, 
    typingText, 
    userProfiles[selectedChat?.partner]?.status,
    insets.top
  ]);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {memoizedHeader}

        {activePinnedMessages.length > 0 && (
          <View style={styles.pinStrip}>
            {activePinnedMessages.map((m) => (
              <View key={`pin-${m.id}`} style={styles.pinItem}>
                <Text style={styles.pinIcon}>push_pin</Text>
                <Text style={styles.pinText} numberOfLines={1}>{getMessagePreview(m)}</Text>
                <TouchableOpacity onPress={() => unpinMessage(m.id)}>
                  <Text style={styles.pinUnpin}>Bỏ</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ flex: 1, position: 'relative' }}>
          <FlatList
            ref={messagesScrollRef}
            data={safeMessages}
            inverted
            keyExtractor={(m, i) => m.id || `msg-${i}`}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onEndReached={() => {
              // Standardized guard: check for both ID and cursor
              if (selectedChat?.id && nextCursor && !isLoadingMessages) {
                fetchMoreMessages(selectedChat.id, 30, fetchToken);
              }
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={() => (
              isLoadingMessages && nextCursor ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator color="#0084ff" size="small" />
                </View>
              ) : (
                <View style={{ height: 20 }} />
              )
            )}
            renderItem={({ item: m }) => {
              if (m.type === 'call' || m.type === 'SYSTEM_CALL' || (m.type === 'system' && m.content?.includes('Cuộc gọi'))) {
                return <SystemCallMessageItem message={m} currentUserEmail={user?.email} onCallBack={handleStartCall} />;
              }
              return (
                <MessageBubble
                  message={m}
                  isMe={m.senderId === user?.email}
                  userProfile={userProfiles[m.senderId]}
                  onLongPress={setActionMessage}
                  onReaction={toggleReaction}
                  onReply={setReplyTarget}
                  isHighlighted={!!targetMessageId && (m.id === targetMessageId || m.SK === targetMessageId)}
                />
              );
            }}
          />

          {showScrollToBottom && (
            <TouchableOpacity 
              style={styles.scrollToBottomBtn} 
              onPress={scrollToBottom}
              activeOpacity={0.8}
            >
              <Text style={styles.scrollToBottomIcon}>arrow_downward</Text>
            </TouchableOpacity>
          )}
        </View>

        <ChatInput
          key={`input-${selectedChat.id}`}
          onSendMessage={handleChatSend}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          onTyping={() => {
            if (SocketService.socket && selectedChat.id) {
              if (!typingTimeoutRef.current) {
                SocketService.socket.emit("typing", { convId: selectedChat.id, isTyping: true });
                typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
              }
            }
          }}
        />
      </KeyboardAvoidingView>

      {/* ACTION SHEET */}
      {actionMessage && (
        <Pressable style={styles.overlay} onPress={() => setActionMessage(null)}>
          <View style={styles.actionSheet}>
            <View style={styles.reactionBar}>
              {REACTION_OPTIONS.map(e => (
                <TouchableOpacity key={e} onPress={() => { toggleReaction(actionMessage, e); setActionMessage(null); }}>
                  <Text style={styles.reactionEmoji}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyTarget(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#e0f2fe' }]}><Text style={[styles.actionIcon, { color: '#0ea5e9' }]}>reply</Text></View>
                <Text style={styles.actionText}>Trả lời</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={() => { setMessageToForward(actionMessage); setIsForwardModalOpen(true); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#f0fdf4' }]}><Text style={[styles.actionIcon, { color: '#22c55e' }]}>forward</Text></View>
                <Text style={styles.actionText}>Chuyển tiếp</Text>
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

            <TouchableOpacity style={styles.muteMenuItem} onPress={() => handleSelectMuteSchedule("1h")}>
              <Text style={styles.muteMenuItemText}>Tắt 1 giờ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => handleSelectMuteSchedule("4h")}>
              <Text style={styles.muteMenuItemText}>Tắt 4 giờ</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => handleSelectMuteSchedule("morning")}>
              <Text style={styles.muteMenuItemText}>Tắt đến 8:00 sáng</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.muteMenuItem} onPress={() => handleSelectMuteSchedule("custom")}>
              <Text style={styles.muteMenuItemText}>Khung giờ tùy chỉnh</Text>
            </TouchableOpacity>

            <View style={styles.muteMenuDivider} />

            <TouchableOpacity style={styles.muteMenuItem} onPress={() => handleSelectMuteSchedule("unmute")}>
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
              <TouchableOpacity style={styles.muteModalApplyBtn} onPress={handleApplyCustomMuteSchedule}>
                <Text style={styles.muteModalApplyText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
