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
  StyleSheet
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from "../../store/callStore";
import { useAuth } from '../../context/AuthContext';
import { chatGet, chatPost, chatPatch, apiPost } from '../../utils/api';
import SocketService from '../../utils/socket';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import SystemCallMessageItem from '../../components/chat/SystemCallMessageItem';
import styles from './style/ChatScreen.styles';
import { v4 as uuidv4 } from 'uuid';

const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];

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
    upsertProfiles
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

  const safeMessages = useMemo(() => {
    const raw = Array.isArray(messages) ? messages : [];
    const seen = new Set();
    return raw.filter((m) => {
      if (!m || typeof m !== "object") return false;
      const mid = m.id || m._id;
      if (!mid || seen.has(mid)) return false;
      seen.add(mid);
      return true;
    });
  }, [messages]);

  const reversedMessages = useMemo(() => [...safeMessages].reverse(), [safeMessages]);

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
        setLocalConversation(res.data);
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

    return () => {
      setActiveConversation(null);
    };
  }, [conversationId]);

  useEffect(() => {
    if (selectedChat?.type === "direct" && selectedChat?.partner) {
      loadUserProfile(selectedChat.partner);
    }
  }, [selectedChat?.partner, selectedChat?.type]);

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

    socket.on("typing", handleTyping);
    return () => socket.off("typing", handleTyping);
  }, [conversationId]);

  // DEEP LINK SCROLL
  useEffect(() => {
    if (!targetMessageId || !messagesScrollRef.current || safeMessages.length === 0) return;
    
    // Using a slightly longer timeout to ensure FlatList has rendered the items
    const timeout = setTimeout(() => {
      // safeMessages is what FlatList uses (it's NOT reversed, reversedMessages is used for something else maybe?)
      // Actually, FlatList uses 'reversedMessages' at line 364 (Wait, let me check)
      const index = reversedMessages.findIndex(m => m.id === targetMessageId || m.SK === targetMessageId);
      
      console.log(`[ChatScroll] Targeting message ${targetMessageId} at index ${index} of ${reversedMessages.length}`);
      
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
    }, 1000); // Increased to 1s for more reliability
    
    return () => clearTimeout(timeout);
  }, [targetMessageId, reversedMessages.length]);

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
    const partnerEmail = selectedChat.partner;
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

    if (message.type === 'call' || message.type === 'SYSTEM_CALL' || (message.type === 'system' && message.content?.includes('Cuộc gọi'))) {
      const meta = message.metadata || {};
      const isVideo = meta.callType === 'video' || (message.content && message.content.includes('video'));
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
    const displayName = selectedChat.type === 'direct' ? getDisplayName(selectedChat.partner) : selectedChat.name;
    const displayAvatar = selectedChat.type === 'direct' ? getDisplayAvatar(selectedChat.partner) : (selectedChat.avatar || getDisplayAvatar());
    const isOnline = selectedChat.type === 'direct' && userProfiles[selectedChat.partner]?.status === 'online';

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
    selectedChat.id, 
    selectedChat.name, 
    selectedChat.avatar, 
    selectedChat.partner, 
    typingText, 
    userProfiles[selectedChat.partner]?.status,
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
            data={reversedMessages}
            inverted
            keyExtractor={(m, i) => m.id || `msg-${i}`}
            onScroll={handleScroll}
            scrollEventThrottle={16}
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
    </View>
  );
}
