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
  Alert,
  useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useChatStore } from '../../store/chatStore';
import { useCallStore } from "../../store/callStore";
import { useAuth } from '../../context/AuthContext';
import { chatGet, chatPost, chatPatch, apiPost, chatUpload } from '../../utils/api';
import SocketService from '../../utils/socket';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import SystemCallMessageItem from '../../components/chat/SystemCallMessageItem';
import SystemNotificationItem from '../../components/chat/SystemNotificationItem';
import { ConversationList } from '../../components/home/ConversationList';
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
const CHAT_PINNED_CONVERSATIONS_KEY = 'chat_pinned_conversations_v1';
const CHAT_HIDDEN_CONVERSATIONS_KEY = 'chat_hidden_conversations_v1';
const CHAT_ALIAS_CONVERSATIONS_KEY = 'chat_alias_conversations_v1';

interface ChatScreenProps {
  onNavigate?: (screen: string, params?: any) => void;
  goBack?: () => void;
  params: {
    conversationId?: string;
    targetMessageId?: string;
    targetEmail?: string;
    startCall?: 'audio' | 'video';
  };
}

export default function ChatScreen({ onNavigate, goBack, params }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 768; // Tablet/Web Responsive
  const { conversationId, targetEmail, startCall, targetMessageId: paramTargetMessageId } = params || {};

  // ZUSTAND STORE
  const {
    conversations,
    messages,
    setActiveConversation,
    startDirectChat,
    updateMessage,
    setConversations,
    sendMessageOptimistic,
    userProfiles,
    fetchMoreMessages,
    isLoadingMessages,
    nextCursor,
    fetchToken,
    targetMessageId, // from store
    patchMessageOptimistic,
    deleteMessageOptimistic,
    markNotificationsRead,
    currentUserEmail
  } = useChatStore();

  const { startOutgoingCall, resetCall, setMeetingInfo } = useCallStore();

  // LOCAL STATE
  const [localConversation, setLocalConversation] = useState<any>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isPinsExpanded, setIsPinsExpanded] = useState(false);
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [actionMessage, setActionMessage] = useState<any>(null);
  const [detailMessage, setDetailMessage] = useState<any>(null);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [muteScheduleMap, setMuteScheduleMap] = useState<Record<string, any>>({});
  const [showMuteMenuModal, setShowMuteMenuModal] = useState(false);
  const [showCustomMuteModal, setShowCustomMuteModal] = useState(false);
  const [customMuteStartTime, setCustomMuteStartTime] = useState("22:00");
  const [customMuteEndTime, setCustomMuteEndTime] = useState("07:00");

  const typingTimeoutRef = useRef<any>(null);
  const messagesScrollRef = useRef<FlatList>(null);
  const lastScrolledMessageId = useRef<string | null>(null);

  const normalizeEmail = useCallback((email: string | null | undefined) => String(email || "").trim().toLowerCase(), []);

  // LOGIC PHÂN NHÓM VÀ NGÀY THÁNG (MESSENGER STYLE)
  const processedMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [];
    
    // Deduplicate to prevent "Two children with the same key" error
    const seenIds = new Set();
    const uniqueMessages = messages.filter(m => {
      if (!m.id || seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });

    const results: any[] = [];
    const sorted = [...uniqueMessages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = sorted[i - 1]; // Tin nhắn mới hơn (vì list inverted)
      const prev = sorted[i + 1]; // Tin nhắn cũ hơn

      // Kiểm tra Grouping
      const isMe = normalizeEmail(current.senderId) === normalizeEmail(currentUserEmail);
      const prevIsMe = prev && normalizeEmail(prev.senderId) === normalizeEmail(current.senderId);
      const nextIsMe = next && normalizeEmail(next.senderId) === normalizeEmail(current.senderId);

      const diffPrev = prev ? Math.abs(new Date(current.createdAt).getTime() - new Date(prev.createdAt).getTime()) : Infinity;
      const diffNext = next ? Math.abs(new Date(current.createdAt).getTime() - new Date(next.createdAt).getTime()) : Infinity;

      const gapLimit = 5 * 60 * 1000; // 5 phút

      let groupPosition: 'first' | 'middle' | 'last' | 'single' = 'single';
      if (prevIsMe && diffPrev < gapLimit && nextIsMe && diffNext < gapLimit) groupPosition = 'middle';
      else if (prevIsMe && diffPrev < gapLimit) groupPosition = 'last';
      else if (nextIsMe && diffNext < gapLimit) groupPosition = 'first';

      results.push({
        ...current,
        groupPosition,
        showAvatar: !isMe && (groupPosition === 'last' || groupPosition === 'single'),
      });

      // Thêm Date Separator nếu cần
      if (prev) {
        const currDate = new Date(current.createdAt).toDateString();
        const prevDate = new Date(prev.createdAt).toDateString();
        if (currDate !== prevDate) {
          results.push({
            id: `date-${current.id}`,
            type: 'date_separator',
            date: currDate,
          });
        }
      } else if (i === sorted.length - 1) {
        results.push({
          id: `date-start`,
          type: 'date_separator',
          date: new Date(current.createdAt).toDateString(),
        });
      }
    }
    return results;
  }, [messages, currentUserEmail, normalizeEmail]);

  // SCROLL TO MESSAGE LOGIC
  const [hasScrolledToTarget, setHasScrolledToTarget] = useState(false);

  const performScrollToMessage = useCallback(() => {
    if (!targetMessageId || !messagesScrollRef.current || processedMessages.length === 0 || hasScrolledToTarget) return;

    const index = processedMessages.findIndex(m => m.id === targetMessageId || m.SK === targetMessageId);
    if (index !== -1) {
      console.log("[ChatScreen] Force scrolling to index", index, "for message", targetMessageId);
      messagesScrollRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      setHasScrolledToTarget(true);
      lastScrolledMessageId.current = targetMessageId;
    }
  }, [targetMessageId, processedMessages, hasScrolledToTarget]);

  useEffect(() => {
    if (!isLoadingMessages && targetMessageId && !hasScrolledToTarget) {
      const t = setTimeout(performScrollToMessage, 1000);
      return () => clearTimeout(t);
    }
  }, [isLoadingMessages, targetMessageId, hasScrolledToTarget, performScrollToMessage]);

  useEffect(() => {
    setHasScrolledToTarget(false);
  }, [targetMessageId]);

  // DERIVED
  const selectedChat = useMemo(() => 
    conversations.find(c => c.id === conversationId) || localConversation, 
    [conversations, conversationId, localConversation]
  );


  const activePinnedMessages = useMemo(() => {
    const ids: string[] = selectedChat?.pinnedMessageIds || [];
    return ids.map(id => {
      const msg = messages.find(m => m.id === id);
      return msg ? msg : { id, isPlaceholder: true };
    }).slice(0, 3);
  }, [selectedChat?.pinnedMessageIds, messages]);

  // UTILS
  const getDisplayName = useCallback((email: string | null | undefined) => {
    if (!email) return "Người dùng";
    const normalized = normalizeEmail(email);
    
    // Check if there's an alias for this conversation
    if (selectedChat?.alias) return selectedChat.alias;
    
    if (normalized === normalizeEmail(user?.email)) return "Bạn";
    const p = userProfiles[normalized];
    return p?.nickname || p?.fullName || p?.fullname || normalized;
  }, [userProfiles, user, normalizeEmail, selectedChat?.alias]);

  const getDisplayAvatar = useCallback((email?: string) => {
    const defaultAvatar = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";
    const normalized = normalizeEmail(email);
    if (!normalized) return defaultAvatar;
    if (normalized === normalizeEmail(user?.email)) return user?.avatarUrl || defaultAvatar;
    const profile = userProfiles[normalized];
    return profile?.avatarUrl || profile?.avatar || defaultAvatar;
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

  useEffect(() => {
    const syncConversationPreferences = async () => {
      try {
        const [pinnedRaw, hiddenRaw, aliasRaw] = await Promise.all([
          AsyncStorage.getItem(CHAT_PINNED_CONVERSATIONS_KEY),
          AsyncStorage.getItem(CHAT_HIDDEN_CONVERSATIONS_KEY),
          AsyncStorage.getItem(CHAT_ALIAS_CONVERSATIONS_KEY),
        ]);

        const pinnedMap = pinnedRaw ? JSON.parse(pinnedRaw) : {};
        const hiddenMap = hiddenRaw ? JSON.parse(hiddenRaw) : {};
        const aliasMap = aliasRaw ? JSON.parse(aliasRaw) : {};

        setConversations((prev: any[]) => prev.map((conv) => ({
          ...conv,
          pinned: !!pinnedMap?.[conv.id],
          hidden: !!hiddenMap?.[conv.id],
          alias: aliasMap?.[conv.id] || conv.alias || '',
        })));
      } catch (error) {
        console.warn('[ChatScreen] Failed to sync conversation preferences', error);
      }
    };

    syncConversationPreferences();
  }, [setConversations]);

  // INITIALIZATION
  useEffect(() => {
    const initChat = async () => {
      let activeId = conversationId;
      if (!activeId && targetEmail) {
        setIsLoadingMetadata(true);
        activeId = await startDirectChat(targetEmail);
        setIsLoadingMetadata(false);
      }

      if (activeId) {
        setActiveConversation(activeId, paramTargetMessageId || null);
        
        // Auto-call
        if (startCall) {
          setTimeout(() => {
            handleStartCall(startCall);
          }, 1000);
        }

        if (!conversations.find(c => c.id === activeId)) {
          (async () => {
            setIsLoadingMetadata(true);
            try {
              const res = await chatGet(`/conversations/${encodeURIComponent(activeId)}/metadata`);
              if (res.ok) setLocalConversation(res.data);
            } finally { setIsLoadingMetadata(false); }
          })();
        }
        if (SocketService.socket) SocketService.socket.emit("join_room", { convId: activeId });
        useChatStore.getState().markReadLocal(activeId);
        markNotificationsRead(activeId);
        chatPatch(`/conversations/${encodeURIComponent(activeId)}/read`, {}).catch(() => {});
      }
    };

    initChat();

    return () => {
      if (SocketService.socket && conversationId) {
        SocketService.socket.emit("leave_room", { convId: conversationId });
      }
      setActiveConversation(null);
    };
  }, [conversationId, targetEmail, startCall]);

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
    const handleMessageUpdate = (data: any) => {
      if (data.convId === conversationId || data.conversationId === conversationId) {
        updateMessage(data.messageId || data.id, data.updates || data);
      }
    };
    const handleMessageDelete = (data: any) => {
      if (data.convId === conversationId || data.conversationId === conversationId) {
        useChatStore.getState().setMessages((prev: any[]) => prev.filter(m => m.id !== (data.messageId || data.id)));
      }
    };
    const handlePinUpdate = (data: any) => {
      const convId = data.conversationId || data.convId;
      if (convId && data.pinnedMessageIds) {
        setConversations((prev: any[]) => prev.map(c => c.id === convId ? { ...c, pinnedMessageIds: data.pinnedMessageIds } : c));
      }
    };
    const handleGroupUpdate = (data: any) => {
      if (data.convId === conversationId || data.id === conversationId) {
        setConversations((prev: any[]) => prev.map(c => c.id === data.id ? { ...c, ...data.updates } : c));
        if (data.updates) {
          setLocalConversation((prev: any) => prev ? { ...prev, ...data.updates } : null);
        }
      }
    };
    const handleGroupDissolve = (data: any) => {
      if (data.convId === conversationId || data.id === conversationId) {
        Alert.alert("Thông báo", "Nhóm đã bị giải tán bởi trưởng nhóm.");
        if (goBack) goBack();
      }
    };
    const handleConversationUpdated = (data: any) => {
      const convId = data.conversationId || data.convId || data.id;
      if (convId === conversationId) {
        setConversations((prev: any[]) => prev.map(c => c.id === convId ? { ...c, ...data.updates } : c));
        if (data.updates) {
          setLocalConversation((prev: any) => prev ? { ...prev, ...data.updates } : null);
        }
      }
    };
    socket.on("typing", handleTyping);
    socket.on("message_reaction", handleMessageReaction);
    socket.on("message_update", handleMessageUpdate);
    socket.on("message_delete", handleMessageDelete);
    socket.on("PIN_UPDATE", handlePinUpdate);
    socket.on("group_updated", handleGroupUpdate);
    socket.on("conversation:updated", handleConversationUpdated);
    socket.on("group_dissolved", handleGroupDissolve);
    return () => {
      socket.off("typing", handleTyping);
      socket.off("message_reaction", handleMessageReaction);
      socket.off("message_update", handleMessageUpdate);
      socket.off("message_delete", handleMessageDelete);
      socket.off("PIN_UPDATE", handlePinUpdate);
      socket.off("group_updated", handleGroupUpdate);
      socket.off("conversation:updated", handleConversationUpdated);
      socket.off("group_dissolved", handleGroupDissolve);
    };
  }, [conversationId, currentUserEmail, updateMessage, setConversations]);

  const handleReply = useCallback((message: any) => {
    const senderEmail = normalizeEmail(message.senderId);
    const senderName = (() => {
      if (senderEmail === normalizeEmail(currentUserEmail)) return "Bạn";
      const p = userProfiles?.[senderEmail];
      return p?.nickname || p?.fullName || p?.fullname || senderEmail;
    })();
    setReplyTarget({ ...message, senderName });
  }, [currentUserEmail, userProfiles, normalizeEmail]);

  const handleViewMessageDetail = useCallback((message: any) => {
    const senderEmail = normalizeEmail(message.senderId);
    const senderName = senderEmail === normalizeEmail(currentUserEmail)
      ? 'Bạn'
      : (userProfiles?.[senderEmail]?.nickname || userProfiles?.[senderEmail]?.fullName || userProfiles?.[senderEmail]?.fullname || senderEmail || 'Người dùng');
    const senderAvatar = senderEmail === normalizeEmail(currentUserEmail)
      ? (user?.avatarUrl || '')
      : (userProfiles?.[senderEmail]?.avatarUrl || userProfiles?.[senderEmail]?.avatar || '');
    setDetailMessage({ ...message, senderName, senderAvatar });
  }, [currentUserEmail, normalizeEmail, userProfiles]);

  const handleMarkMessage = useCallback((message: any) => {
    updateMessage(message.id, { marked: !message.marked });
    Alert.alert('Đã cập nhật', message.marked ? 'Đã bỏ đánh dấu tin nhắn.' : 'Tin nhắn đã được đánh dấu.');
  }, [updateMessage]);

  const handleStartMultiSelect = useCallback((message: any) => {
    setIsMultiSelectMode(true);
    setSelectedMessageIds((prev) => prev.includes(message.id) ? prev : [...prev, message.id]);
  }, []);

  const handleToggleSelectedMessage = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => (
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    ));
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedMessageIds([]);
  }, []);

  const handleDeleteSelectedMessages = useCallback(async () => {
    if (!selectedChat?.id || selectedMessageIds.length === 0) return;
    await Promise.all(selectedMessageIds.map((id) => deleteMessageOptimistic(selectedChat.id, id)));
    exitMultiSelectMode();
  }, [deleteMessageOptimistic, exitMultiSelectMode, selectedChat?.id, selectedMessageIds]);

  const handleCopySelectedMessages = useCallback(async () => {
    const selected = messages.filter((message) => selectedMessageIds.includes(message.id));
    const text = selected.map((message) => `${getDisplayName(message.senderId)}: ${message.content || '[Đính kèm]'}`).join('\n');
    if (text) {
      await Clipboard.setStringAsync(text);
      Alert.alert('Đã sao chép', 'Nội dung các tin nhắn đã được sao chép.');
    }
  }, [getDisplayName, messages, selectedMessageIds]);

  const handleMarkSelectedMessages = useCallback(() => {
    selectedMessageIds.forEach((messageId) => {
      const message = messages.find((item) => item.id === messageId);
      if (message) updateMessage(messageId, { marked: !message.marked });
    });
    Alert.alert('Đã cập nhật', `Đã đánh dấu ${selectedMessageIds.length} tin nhắn.`);
  }, [messages, selectedMessageIds, updateMessage]);

  const handlePinSelectedMessages = useCallback(() => {
    selectedMessageIds.forEach((messageId) => {
      const message = messages.find((item) => item.id === messageId);
      if (message) patchMessageOptimistic(selectedChat.id, messageId, { action: message.pinned ? 'unpin' : 'pin' });
    });
    Alert.alert('Đã cập nhật', `Đã xử lý ghim cho ${selectedMessageIds.length} tin nhắn.`);
  }, [messages, patchMessageOptimistic, selectedChat?.id, selectedMessageIds]);

  // HANDLERS
  const handleChatSend = async (content: string, attachments: any[] = []) => {
    const chatId = selectedChat?.id;
    if (!chatId) return;
    
    const replyToData = replyTarget ? {
      id: replyTarget.id,
      content: replyTarget.content,
      senderId: replyTarget.senderId,
      media: replyTarget.media,
      files: replyTarget.files
    } : undefined;

    // 1. Send optimistic message immediately
    const tempId = sendMessageOptimistic(chatId, currentUserEmail || "", content, "text", { 
      attachments,
      replyTo: replyToData,
      skipApi: true
    });
    
    setReplyTarget(null);

    // 2. Background process
    (async () => {
      try {
        console.log(`[ChatScreen] Starting background send for ${tempId}`);
        const uploaded = await Promise.all(attachments.map(async (item) => {
          if (
            item.isSticker || 
            (item.dataUrl && item.dataUrl.startsWith('http')) || 
            item.mimeType === 'application/location' || 
            item.mimeType === 'application/contact'
          ) return item;

          const uploadUri = item.dataUrl || item.uri || (item.file?.uri);
          if (!uploadUri) return item;

          const res = await chatUpload(item.file || { uri: uploadUri, name: item.name, type: item.mimeType });
          return res.ok ? { ...item, dataUrl: res.data.fileUrl || res.data.url } : item;
        }));

        const isVideo = (a: any) => {
          const mime = String(a.mimeType || "").toLowerCase();
          const name = String(a.name || "").toLowerCase();
          return mime.startsWith("video/") || /\.(mp4|mov|avi|wmv|webm|mkv|3gp|flv|m4v)(\?.*)?$/.test(name);
        };
        const isImage = (a: any) => {
          const mime = String(a.mimeType || "").toLowerCase();
          const name = String(a.name || "").toLowerCase();
          return mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|heic|heif)(\?.*)?$/.test(name);
        };

        const media = uploaded.filter((a: any) => isImage(a) || isVideo(a)).map((a: any) => ({
          url: a.dataUrl, dataUrl: a.dataUrl, name: a.name, mimeType: a.mimeType, size: a.size, isSticker: a.isSticker === true, isHD: a.isHD === true,
        }));
        const files = uploaded.filter((a: any) => !isImage(a) && !isVideo(a)).map((a: any) => ({
          url: a.dataUrl, dataUrl: a.dataUrl, name: a.name, mimeType: a.mimeType, size: a.size,
        }));

        const payload = { 
          content: content || (media.length > 0 ? '[Hình ảnh]' : files.length > 0 ? '[Tệp tin]' : ''), 
          type: (media.length > 0 || files.length > 0) ? 'media' : 'text',
          media: media.length > 0 ? media : undefined, 
          files: files.length > 0 ? files : undefined, 
          replyTo: replyToData 
        };

        const res = await chatPost(`/conversations/${encodeURIComponent(chatId)}/messages`, payload);
        if (res.ok && res.data) {
          console.log(`[ChatScreen] Background send success for ${tempId}`);
          updateMessage(tempId, { ...res.data, status: "sent" });
        } else {
          console.error(`[ChatScreen] Background send failed for ${tempId}:`, res.message || 'Unknown error');
          updateMessage(tempId, { status: "error" });
        }
      } catch (err) {
        console.error(`[ChatScreen] Background send exception for ${tempId}:`, err);
        updateMessage(tempId, { status: "error" });
      }
    })();
  };

  const handleStartCall = async (type: 'audio' | 'video') => {
    if (!selectedChat || selectedChat.type !== 'direct') return Alert.alert('Thất bại', 'Chỉ hỗ trợ gọi 1:1');
    const partnerEmail = selectedChat.partner || (Array.isArray(selectedChat.members) ? selectedChat.members.find((m: string) => m !== user?.email) : undefined);
    if (!partnerEmail) return Alert.alert('Lỗi', 'Không tìm thấy thông tin đối phương');
    const activeCallId = uuidv4();
    startOutgoingCall({ email: partnerEmail, fullName: getDisplayName(partnerEmail), avatarUrl: getDisplayAvatar(partnerEmail) }, type, selectedChat.id, activeCallId);
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

  const handlePinMessage = async (message: any) => {
    if (!selectedChat?.id) return;
    const isPin = !message.pinned;
    patchMessageOptimistic(selectedChat.id, message.id, { action: isPin ? "pin" : "unpin" });
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

  if (!selectedChat) return <View style={styles.container}><ActivityIndicator color="#fff" /></View>;

  const partner = selectedChat.partner || (Array.isArray(selectedChat.members) ? selectedChat.members.find((m: string) => m !== user?.email) : undefined);

  const partnerProfile = userProfiles[normalizeEmail(partner)];
  const isOnline = selectedChat?.type === 'direct' && partnerProfile?.status === 'online';
  const typingText = typingUsers.size > 0 
    ? `${getDisplayName([...typingUsers][0])} đang gõ...` 
    : (selectedChat?.type === 'direct' 
        ? (partnerProfile?.statusMessage || partnerProfile?.currentStatus || (isOnline ? "Đang hoạt động" : "Vừa mới truy cập")) 
        : `${selectedChat?.members?.length || 0} thành viên`);

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#fff' }}>
      
      {/* 1. SIDEBAR (Chỉ hiện trên màn hình lớn - Giống bản Web) */}
      {isLargeScreen && (
        <View style={{ width: 350, borderRightWidth: 1, borderRightColor: '#eee', backgroundColor: '#f9f9f9' }}>
           <View style={{ paddingTop: insets.top, flex: 1 }}>
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Tin nhắn</Text>
              </View>
              <ConversationList 
                conversations={conversations}
                loading={false}
                currentUserEmail={user?.email || ""}
                userProfiles={userProfiles}
                onSelectChat={(chat) => {
                  if (onNavigate) onNavigate('Chat', { conversationId: chat.id });
                }}
                getDisplayName={getDisplayName}
                getDisplayAvatar={getDisplayAvatar}
                getConversationPreview={(conv) => conv.lastMessageContent || "Chưa có tin nhắn"}
              />
           </View>
        </View>
      )}

      {/* 2. CHAT AREA (Logic cũ của bạn) */}
      <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ChatHeader 
          insets={insets} goBack={goBack} selectedChat={selectedChat}
          displayName={selectedChat.type === 'direct' ? getDisplayName(partner) : selectedChat.name}
          displayAvatar={selectedChat.type === 'direct' ? getDisplayAvatar(partner) : (selectedChat.avatar || getDisplayAvatar())}
          isOnline={selectedChat.type === 'direct' && userProfiles[partner]?.status === 'online'}
          typingText={typingText} onStartCall={handleStartCall}
          onOpenDetails={() => {
            if (onNavigate) onNavigate('ChatDetails', { conversationId: selectedChat.id });
          }}
        />

        <PinBanner 
          activePinnedMessages={activePinnedMessages} isPinsExpanded={isPinsExpanded} setIsPinsExpanded={setIsPinsExpanded}
          onJumpToMessage={(id) => setActiveConversation(selectedChat.id, id)}
          onUnpin={(id) => chatPatch(`/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(id)}`, { action: "unpin" })}
        />

        <FlatList
          ref={messagesScrollRef}
          data={processedMessages}
          inverted
          keyExtractor={(m) => m.id}
          onScroll={(e) => setShowScrollToBottom(e.nativeEvent.contentOffset.y > 300)}
          onContentSizeChange={() => {
            if (targetMessageId && !hasScrolledToTarget) {
              performScrollToMessage();
            }
          }}
          onEndReached={() => selectedChat?.id && nextCursor && !isLoadingMessages && fetchMoreMessages(selectedChat.id, 30, fetchToken)}
          onEndReachedThreshold={0.3}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              messagesScrollRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            });
          }}
          renderItem={({ item: m }) => {
            if (m.type === 'date_separator') {
              return (
                <View style={{ alignItems: 'center', marginVertical: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
                    {m.date === new Date().toDateString() ? "Hôm nay" : m.date}
                  </Text>
                </View>
              );
            }
            if (m.type === 'call' || m.type === 'SYSTEM_CALL' || (m.type === 'system' && m.content?.includes('Cuộc gọi'))) return <SystemCallMessageItem message={m} currentUserEmail={user?.email} onCallBack={handleStartCall} />;
            if (m.type === 'system') return <SystemNotificationItem message={m} onJump={(id) => setActiveConversation(selectedChat.id, id)} />;
            
            // Tìm xem đối phương đã đọc đến đây chưa (Messenger Style: Hiện Avatar seen dưới tin nhắn của MÌNH)
            const isSeen = m.senderId === user?.email && m.id === selectedChat.lastReadMessageId;

            return (
              <MessageBubble 
                message={m} 
                isMe={normalizeEmail(m.senderId) === normalizeEmail(currentUserEmail)} 
                userProfile={userProfiles[normalizeEmail(m.senderId)]} 
                userProfiles={userProfiles} 
                onLongPress={setActionMessage} 
                onPress={isMultiSelectMode ? (msg) => handleToggleSelectedMessage(msg.id) : undefined}
                onReaction={toggleReaction} 
                onReply={handleReply} 
                onReplyPress={(id) => setActiveConversation(selectedChat.id, id)} 
                onSystemMessagePress={(id) => setActiveConversation(selectedChat.id, id)} 
                isHighlighted={!!targetMessageId && (m.id === targetMessageId || m.SK === targetMessageId)}
                showAvatar={m.showAvatar}
                groupPosition={m.groupPosition}
                isSeen={isSeen}
                onNavigate={onNavigate}
                isSelectionMode={isMultiSelectMode}
                isSelected={selectedMessageIds.includes(m.id)}
              />
            );
          }}
        />

        {isMultiSelectMode && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#eff6ff', borderTopWidth: 1, borderTopColor: '#dbeafe' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1d4ed8' }}>
                Đã chọn {selectedMessageIds.length} tin nhắn
              </Text>
              <TouchableOpacity onPress={exitMultiSelectMode} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155' }}>Hủy chọn</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={handleCopySelectedMessages} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fff' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#8b5cf6' }}>Sao chép</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMarkSelectedMessages} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f0fdf4' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>Đánh dấu</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePinSelectedMessages} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#fefce8' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#ca8a04' }}>Ghim</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeleteSelectedMessages} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#ef4444' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Xóa</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {showScrollToBottom && (
          <TouchableOpacity 
            style={styles.scrollToBottomBtn} 
            onPress={() => {
              messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
              if (targetMessageId) useChatStore.getState().setTargetMessageId(null);
            }}
          >
            {targetMessageId && (
              <View style={styles.jumpToLatestBadge}>
                <Text style={styles.jumpToLatestText}>Về tin nhắn mới</Text>
              </View>
            )}
            <Text style={styles.scrollToBottomIcon}>arrow_downward</Text>
          </TouchableOpacity>
        )}

        <ChatInput 
          key={`input-${selectedChat.id}`} onSendMessage={handleChatSend} replyTarget={replyTarget} onClearReply={() => setReplyTarget(null)}
          onTyping={() => { if (SocketService.socket && selectedChat.id && !typingTimeoutRef.current) { SocketService.socket.emit("typing", { convId: selectedChat.id, isTyping: true }); typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000); } }}
        />
      </KeyboardAvoidingView>

      <ChatModals 
        actionMessage={actionMessage} setActionMessage={setActionMessage} detailMessage={detailMessage} setDetailMessage={setDetailMessage} onReaction={toggleReaction} onReply={handleReply} 
        onForward={(m) => { setActionMessage(null); setIsForwardModalOpen(true); }}
        onRecall={(m) => patchMessageOptimistic(selectedChat.id, m.id, { action: 'recall' })}
        onDelete={(m) => deleteMessageOptimistic(selectedChat.id, m.id)}
        onPin={handlePinMessage}
        onMark={handleMarkMessage}
        onViewDetail={handleViewMessageDetail}
        onStartMultiSelect={handleStartMultiSelect}
        userEmail={currentUserEmail || ""} showMuteMenuModal={showMuteMenuModal} setShowMuteMenuModal={setShowMuteMenuModal}
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
    </View>
  );
}
