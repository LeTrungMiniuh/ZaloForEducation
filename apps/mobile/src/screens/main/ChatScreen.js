import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Modal,
  ScrollView,
  Linking
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from 'expo-clipboard';
import { v4 as uuidv4 } from 'uuid';

import styles from './style/ChatScreen.styles';
import { Colors } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { useAuth } from '../../context/AuthContext';
import { chatGet, chatPost, chatPatch, chatUpload } from '../../utils/api';
import SocketService from '../../utils/socket';
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from "../../store/callStore";

import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import SystemCallMessageItem from '../../components/chat/SystemCallMessageItem';

const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];
const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export default function ChatScreen({ onNavigate, goBack, params }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const conversationId = params?.conversationId;
  const targetMessageId = params?.targetMessageId;
  const highlightKeyword = params?.highlightKeyword;

  // ZUSTAND STORE
  const {
    conversations,
    messages,
    setActiveConversation,
    sendMessageOptimistic,
    addMessage,
    updateMessage,
    setMessages,
    setConversations,
    upsertConversationLastMessage
  } = useChatStore();

  const { startOutgoingCall, resetCall, setMeetingInfo } = useCallStore();

  // Local UI State
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [userProfiles, setUserProfiles] = useState({});
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [messageReactions, setMessageReactions] = useState({});

  const typingTimeoutRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const profileLoadingRef = useRef(new Set());

  // Derived Values
  const selectedChat = useMemo(() =>
    conversations.find(c => c.id === conversationId),
    [conversations, conversationId]);

  const reversedMessages = useMemo(() =>
    Array.isArray(messages) ? [...messages].reverse() : [],
    [messages]);

  const activePinnedMessages = useMemo(() =>
    messages
      .filter((message) => message.pinned)
      .sort((a, b) => String(b.pinnedAt || "").localeCompare(String(a.pinnedAt || "")))
      .slice(0, 3),
    [messages]);

  // Profile Helpers
  const getDisplayName = useCallback((email) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return user?.fullName || user?.fullname || "Bạn";
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
        setUserProfiles((prev) => ({ ...prev, [email]: res.user }));
      }
    } catch (err) {
      console.error("Load profile failed", err);
    } finally {
      profileLoadingRef.current.delete(email);
    }
  };

  // Chat Helpers
  const getMessagePreview = (message) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";
    if (Array.isArray(message.media) && message.media.length > 0) return "[Ảnh/Video]";
    if (Array.isArray(message.files) && message.files.length > 0) return "[Tệp đính kèm]";
    return String(message.content || "Tin nhắn");
  };



  // Logic Initializing
  useEffect(() => {
    if (!conversationId) return;

    // 1. Set active in store
    setActiveConversation(conversationId);

    // 2. Load context if needed
    if (selectedChat?.type === "direct") {
      loadUserProfile(selectedChat.partner);
    }

    // 3. Socket Join
    if (SocketService.socket) {
      SocketService.socket.emit("join_room", { convId: conversationId });
      SocketService.socket.emit("conversation_marked_read", { convId: conversationId });
    }

    // 4. Cleanup
    return () => {
      setActiveConversation(null);
      if (SocketService.socket && conversationId) {
        SocketService.socket.emit("typing", { convId: conversationId, isTyping: false });
      }
    };
  }, [conversationId]);

  // Deep link scroll to target message
  useEffect(() => {
    if (!targetMessageId || !messagesScrollRef.current) return;

    // Since inverted + reversed, find index from end
    const index = reversedMessages.findIndex(msg => msg.id === targetMessageId);
    if (index !== -1) {
      messagesScrollRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5 // Center vertically
      });
    }
    // Note: If not found, user can scroll up; future: load more pages
  }, [targetMessageId, reversedMessages]);

  // Message Handling
  const handleChatSend = async (textToSend, attachmentsToSend) => {
    if (!selectedChat) return;

    try {
      const trimmedInput = textToSend.trim();
      const currentAttachments = [...attachmentsToSend];

      setReplyTarget(null);
      if (SocketService.socket && selectedChat.id) {
        SocketService.socket.emit("typing", { convId: selectedChat.id, isTyping: false });
      }

      if (currentAttachments.length > 0) {
        setSending(true);
        // Optimization: Image Compression (If needed, but keeping it simple for now)
        const uploadedAttachments = await Promise.all(
          currentAttachments.map(async (item) => {
            const uploadRes = await chatUpload(item.file || item);
            if (!uploadRes.ok) throw new Error("UPLOAD_FAILED");
            return uploadRes.data;
          }),
        );

        const imageAttachments = uploadedAttachments.filter(f => (f.fileType || f.mimeType || '').startsWith("image/"));
        const fileAttachments = uploadedAttachments.filter(f => !imageAttachments.includes(f));

        const res = await chatPost(`/conversations/${selectedChat.id}/messages`, {
          content: trimmedInput || (imageAttachments.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
          media: imageAttachments,
          files: fileAttachments,
          replyTo: replyTarget || undefined,
        });

        if (res.ok && res.data) {
          addMessage(res.data);
          upsertConversationLastMessage(selectedChat.id, res.data.content || "[Đa phương tiện]", user.email);
        }
      } else if (trimmedInput) {
        // OPTIMISTIC FLOW
        await sendMessageOptimistic(selectedChat.id, user.email, trimmedInput);
        upsertConversationLastMessage(selectedChat.id, trimmedInput, user.email);
        setTimeout(() => {
          messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
      }
    } catch (err) {
      console.error("Send message failed", err);
      Alert.alert("Lỗi", "Không gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  // REACTIONS & ACTIONS
  const toggleReaction = async (message, emoji) => {
    if (!user?.email || !selectedChat?.id) return;
    const messageId = message.id;
    const reactions = message.reactions || {};
    const hasReacted = reactions[emoji]?.includes(user.email);
    const action = hasReacted ? 'remove' : 'add';

    const res = await chatPatch(`/conversations/${selectedChat.id}/messages/${messageId}`, {
      action: "react",
      reactAction: action,
      emoji,
    });

    if (res.ok) {
      const updated = res.data || res;
      updateMessage(messageId, updated);
      if (SocketService.socket) {
        SocketService.socket.emit("sendMessage", { convId: selectedChat.id, message: updated });
      }
    }
    setActionMessage(null);
  };

  const pinMessage = async (message) => {
    if (!selectedChat?.id) return;
    const res = await chatPatch(`/conversations/${selectedChat.id}/messages/${message.id}`, { action: "pin" });
    if (res.ok) {
      const updated = res.data || res;
      updateMessage(message.id, updated);
      if (SocketService.socket) {
        SocketService.socket.emit("sendMessage", { convId: selectedChat.id, message: updated });
      }
    }
    setActionMessage(null);
  };

  const recallMessage = async (messageId) => {
    if (!selectedChat?.id) return;
    const res = await chatPatch(`/conversations/${selectedChat.id}/messages/${messageId}`, { action: "recall" });
    if (res.ok) {
      const updated = res.data || res;
      updateMessage(messageId, updated);
      upsertConversationLastMessage(selectedChat.id, "Tin nhắn đã được thu hồi");
      if (SocketService.socket) {
        SocketService.socket.emit("sendMessage", { convId: selectedChat.id, message: updated });
      }
    }
    setActionMessage(null);
  };

  // CALL LOGIC (Preserving Chime)
  const handleStartCall = async (type) => {
    if (!selectedChat || selectedChat.type !== 'direct') {
      Alert.alert('Thất bại', 'Hiện tại chỉ hỗ trợ gọi 1:1');
      return;
    }

    // Permission Sync All-in-one (Video + Audio)
    if (Platform.OS === 'android') {
      try {
        const audioGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        const cameraGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);

        if (audioGranted !== PermissionsAndroid.RESULTS.GRANTED || cameraGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Thiếu quyền', 'Cần quyền Camera và Microphone để thực hiện cuộc gọi.');
          return;
        }
      } catch (err) { return; }
    }

    const partnerEmail = selectedChat.partner;
    const partnerProfile = userProfiles[partnerEmail] || { email: partnerEmail, fullName: getDisplayName(partnerEmail) };
    const activeCallId = uuidv4();

    startOutgoingCall(partnerProfile, type, selectedChat.id, activeCallId);

    try {
      const res = await chatPost('/call/create', { conversationId: selectedChat.id, callId: activeCallId, type });
      if (res.ok && res.data) {
        const payload = res.data;
        setMeetingInfo(payload.meeting, payload.attendee);
        SocketService.socket.emit('call:invite', {
          convId: selectedChat.id,
          callId: activeCallId,
          fromEmail: user.email,
          toEmail: partnerEmail,
          callerProfile: { email: user.email, fullName: user.fullName || user.email, avatarUrl: user.avatarUrl },
          callType: type
        });
      } else {
        resetCall();
        Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
      }
    } catch (err) {
      resetCall();
      Alert.alert('Lỗi kết nối', 'Vui lòng thử lại sau');
    }
  };

  // Socket Listeners
  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket) return;

    const onTyping = (data) => {
      if (data.convId !== conversationId || data.email === user?.email) return;
      setTypingUsers(prev => {
        const next = new Set(prev);
        if (data.isTyping) next.add(data.email);
        else next.delete(data.email);
        return next;
      });
    };

    const onPresence = (data) => {
      if (selectedChat?.type === 'direct' && data.email === selectedChat.partner) {
        setUserProfiles(prev => ({ ...prev, [data.email]: { ...prev[data.email], status: data.status } }));
      }
    };

    socket.on("typing_update", onTyping);
    socket.on("presence_update", onPresence);
    return () => {
      socket.off("typing_update", onTyping);
      socket.off("presence_update", onPresence);
    };
  }, [conversationId, selectedChat]);

  // RENDERING
  if (!selectedChat) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={{ marginTop: 12 }}>Đang tải hội thoại...</Text>
      </View>
    );
  }

  const isOnline = selectedChat.type === 'direct' && userProfiles[selectedChat.partner]?.status === 'online';
  const typingText = typingUsers.size > 0 ? `${getDisplayName(Array.from(typingUsers)[0])} đang gõ...` : (isOnline ? "Đang hoạt động" : "Ngoại tuyến");

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* HEADER */}
      <LinearGradient colors={["#0058bc", "#00418f"]} style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={goBack} style={styles.backButton}>
            <Text style={styles.backIcon}>arrow_back</Text>
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: selectedChat.type === 'direct' ? getDisplayAvatar(selectedChat.partner) : selectedChat.avatar }} style={styles.avatar} />
              {isOnline && <View style={styles.onlineBadge} />}
            </View>
            <View style={styles.headerText}>
              <Text style={styles.name} numberOfLines={1}>
                {selectedChat.type === 'direct' ? getDisplayName(selectedChat.partner) : selectedChat.name}
              </Text>
              <Text style={styles.status}>{typingText}</Text>
            </View>
          </View>

          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.headerIconButton} onPress={() => handleStartCall('audio')}>
              <Text style={styles.headerIcon}>call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} onPress={() => handleStartCall('video')}>
              <Text style={styles.headerIcon}>videocam</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton}>
              <Text style={styles.headerIcon}>more_vert</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* PIN STRIP */}
      {activePinnedMessages.length > 0 && (
        <View style={styles.pinStrip}>
          {activePinnedMessages.map((msg) => (
            <View key={msg.id} style={styles.pinItem}>
              <Text style={styles.pinIcon}>push_pin</Text>
              <Text style={styles.pinText} numberOfLines={1}>{getMessagePreview(msg)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* MESSAGES LIST */}
      <FlatList
        ref={messagesScrollRef}
        data={reversedMessages}
        inverted
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          if (item.type === 'call') {
            return (
              <SystemCallMessageItem
                message={item}
                currentUserEmail={user?.email}
                onCallBack={() => handleStartCall(item.callType || 'audio')}
              />
            );
          }
          return (
            <MessageBubble
              message={item}
              isMe={item.senderId === user?.email}
              userProfile={{ avatarUrl: getDisplayAvatar(item.senderId) }}
              onLongPress={setActionMessage}
              onReaction={toggleReaction}
              onReply={id => setReplyTarget(id)}
              isHighlighted={item.id === targetMessageId}
              highlightKeyword={highlightKeyword}
            />
          );
        }}
        contentContainerStyle={styles.listContent}
      />

      {/* INPUT */}
      <ChatInput
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

      {/* MODALS */}
      {actionMessage && (
        <Pressable style={styles.overlay} onPress={() => setActionMessage(null)}>
          <View style={styles.actionSheet}>
            <View style={styles.reactionBar}>
              {REACTION_OPTIONS.map(emoji => (
                <TouchableOpacity key={emoji} onPress={() => toggleReaction(actionMessage, emoji)}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.actionItem} onPress={() => { setReplyTarget(actionMessage); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#e3f2fd' }]}><Text style={[styles.actionIcon, { color: '#2196f3' }]}>reply</Text></View>
                <Text style={styles.actionText}>Trả lời</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={() => { Clipboard.setStringAsync(actionMessage.content); setActionMessage(null); }}>
                <View style={[styles.actionIconBox, { backgroundColor: '#e8f5e9' }]}><Text style={[styles.actionIcon, { color: '#4caf50' }]}>content_copy</Text></View>
                <Text style={styles.actionText}>Sao chép</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionItem} onPress={() => pinMessage(actionMessage)}>
                <View style={[styles.actionIconBox, { backgroundColor: '#fff3e0' }]}><Text style={[styles.actionIcon, { color: '#ff9800' }]}>push_pin</Text></View>
                <Text style={styles.actionText}>{actionMessage.pinned ? 'Bỏ ghim' : 'Ghim'}</Text>
              </TouchableOpacity>
              {actionMessage.senderId === user?.email && (
                <TouchableOpacity style={styles.actionItem} onPress={() => recallMessage(actionMessage.id)}>
                  <View style={[styles.actionIconBox, { backgroundColor: '#ffebee' }]}><Text style={[styles.actionIcon, { color: '#f44336' }]}>history</Text></View>
                  <Text style={styles.actionText}>Thu hồi</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );
}
