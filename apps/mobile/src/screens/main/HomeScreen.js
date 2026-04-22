import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
// import styles from './style/HomeScreen.styles';
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Typography } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, API_URL } from '../../utils/api';
import SocketService from '../../utils/socket';
import { useChatStore } from '../../store/chatStore';
import ContactsScreen from './ContactsScreen';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInput from '../../components/chat/ChatInput';
import * as Clipboard from 'expo-clipboard';
const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];
const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const TAB_ALIAS = {
  messages: "chat",
  friends: "contacts",
  ai: "notifications",
  chat: "chat",
  contacts: "contacts",
  notifications: "notifications",
  profile: "profile",
};

const normalizeHomeTab = (tab) =>
  TAB_ALIAS[
  String(tab || "")
    .trim()
    .toLowerCase()
  ] || "chat";

const normalizeApiPayload = (res) => {
  if (!res || typeof res !== "object") return res;
  if (Object.prototype.hasOwnProperty.call(res, "data")) return res.data;

  const numericKeys = Object.keys(res).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => res[key]);
  }

  const payload = { ...res };
  delete payload.ok;
  delete payload.status;
  return payload;
};

const normalizeConversation = (conv) => {
  if (!conv || typeof conv !== "object") return null;
  const id = String(conv.id || conv._id || "").trim();
  if (!id) return null;
  return {
    ...conv,
    id,
    type: conv.type || "direct",
    partner: String(conv.partner || "").trim(),
    name: String(conv.name || "").trim(),
    avatar: String(conv.avatar || "").trim(),
    lastMessage: conv.lastMessage || null,
    updatedAt: conv.updatedAt || conv.updated_at || null,
  };
};

const normalizeApiResponse = (res) => ({
  ...res,
  data: normalizeApiPayload(res),
});

const chatGet = async (path, query) => {
  const queryString = query
    ? `?${Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join("&")}`
    : "";

  let res = await apiRequest(`/chat${path}${queryString}`);
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}${queryString}`);
  }
  return normalizeApiResponse(res);
};

const chatPost = async (path, body) => {
  let res = await apiRequest(`/chat${path}`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    });
  }
  return normalizeApiResponse(res);
};

const chatPatch = async (path, body) => {
  let res = await apiRequest(`/chat${path}`, {
    method: "PATCH",
    body: JSON.stringify(body || {}),
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: "PATCH",
      body: JSON.stringify(body || {}),
    });
  }
  return normalizeApiResponse(res);
};

const chatUpload = async (asset) => {
  const token = await AsyncStorage.getItem("token");
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.fileName || `image-${Date.now()}.jpg`,
    type: asset.mimeType || "image/jpeg",
  });

  const upload = async (basePath) => {
    const response = await fetch(`${API_URL}${basePath}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  };

  let result = await upload("/chat/uploads");
  if (!result.ok && result.status === 404) {
    result = await upload("/api/chat/uploads");
  }
  return result;
};

const getFileIcon = (mimeType = "", fileName = "") => {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.includes("pdf") || lowerName.endsWith(".pdf"))
    return "picture_as_pdf";
  if (
    lowerMime.includes("word") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx")
  )
    return "description";
  if (
    lowerMime.includes("excel") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx")
  )
    return "table_chart";
  if (lowerMime.startsWith("image/")) return "image";
  return "draft";
};

const formatFileSize = (size) => {
  const n = Number(size || 0);
  if (!n) return "--";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const isVideoAttachment = (item = {}) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  const name = String(item?.name || item?.fileName || item?.url || item?.dataUrl || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name);
};

export default function HomeScreen({
  onNavigate,
  onLogout,
  initialTab,
  onTabChange,
}) {
  const insets = useSafeAreaInsets();
  const { user, profileVersion, checkSessionStatus } = useAuth();

  // ZUSTAND STORE
  const {
    conversations,
    activeConvId,
    messages,
    isLoadingMessages,
    setActiveConversation,
    setMessages,
    sendMessageOptimistic,
    addMessage,
    updateMessage,
    setConversations,
  } = useChatStore();

  const [activeTab, setActiveTab] = useState(normalizeHomeTab(initialTab));
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [readConversations, setReadConversations] = useState(new Set());
  const [friendships, setFriendships] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearchEmail, setFriendSearchEmail] = useState("");
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchResult, setFriendSearchResult] = useState(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const [messageReactions, setMessageReactions] = useState({});
  const [replyTarget, setReplyTarget] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [userProfiles, setUserProfiles] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [isFriendRequestsModalOpen, setIsFriendRequestsModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [sendImageAsHD, setSendImageAsHD] = useState(false);

  const typingTimeoutRef = useRef(null);

  // === VOICE RECORDING ===
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingVoice, setPendingVoice] = useState(null); // { uri, durationSec }
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // === LOCATION ===
  const [isLiveSharing, setIsLiveSharing] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const liveLocationTimerRef = useRef(null);
  const liveLocationStopRef = useRef(null);
  const liveLocationUpdatesRef = useRef(0);

  // === GIF / STICKER ===
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);

  // === STICKER PACKS (static) ===
  const STICKER_PACKS = [
    { id: 'zalo_edu', name: 'ZaloEdu', stickers: [
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002734/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002735/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002736/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002737/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002738/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002739/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002740/iPhone/sticker@2x.png',
      'https://stickershop.line-scdn.net/stickershop/v1/sticker/52002741/iPhone/sticker@2x.png',
    ]},
  ];

  const messagesScrollRef = useRef(null);
  const profileLoadingRef = useRef(new Set());
  const scrollStateRef = useRef({
    hasMounted: false,
    convId: null,
    messageCount: 0,
  });
  const safeConversations = Array.isArray(conversations) ? conversations : [];
  const safeMessages = Array.isArray(messages)
    ? messages.filter((m) => m && typeof m === "object")
    : [];

  const reversedMessages = useMemo(() => [...safeMessages].reverse(), [safeMessages]);

  // Derived State
  const selectedChat = safeConversations.find((c) => c.id === activeConvId);

  useEffect(() => {
    if (checkSessionStatus) checkSessionStatus();
  }, []);

  useEffect(() => {
    if (onTabChange) onTabChange(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setActiveTab(normalizeHomeTab(initialTab));
  }, [initialTab]);

  const closeMessageAction = () => setActionMessage(null);



  const getFriendshipMeta = (friendship) => {
    const source = friendship?.senderEmail || friendship?.sender_id || "";
    const target = friendship?.receiverEmail || friendship?.receiver_id || "";
    const status = friendship?.status;
    return { source, target, status };
  };

  const getDisplayName = (email) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return user?.fullName || user?.fullname || "Bạn";
    const p = userProfiles[email];
    return p?.fullName || p?.fullname || email;
  };

  const getDisplayAvatar = (email) => {
    if (!email)
      return "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";
    if (email === user?.email)
      return (
        user?.avatarUrl ||
        "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png"
      );
    return (
      userProfiles[email]?.avatarUrl ||
      "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png"
    );
  };

  const normalizeAttachment = (item) => ({
    name: item?.name || item?.fileName || "Tệp",
    mimeType: item?.mimeType || item?.fileType || "application/octet-stream",
    size: Number(item?.size || 0),
    dataUrl: item?.dataUrl || item?.fileUrl || item?.url || "",
  });

  const normalizeContactCard = (message) => {
    const card = message?.contactCard;
    if (!card?.email) return null;
    return {
      email: String(card.email).toLowerCase(),
      fullName: card.fullName || card.fullname || card.email,
      avatarUrl: card.avatarUrl || card.urlAvatar,
      phone: card.phone,
    };
  };

  const getMessagePreview = (message) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";
    if (message.type === "contact_card" || message.contactCard?.email)
      return "[Danh thiếp]";
    if (message.location) return message.location.isLive ? "[Vị trí trực tiếp]" : "[Vị trí hiện tại]";
    const allMedia = [...(Array.isArray(message.media) ? message.media : []), ...(Array.isArray(message.files) ? message.files : [])];
    if (allMedia.length > 0) {
      const hasGif = allMedia.some(m => String(m?.mimeType || '').includes('gif'));
      const hasSticker = allMedia.some(m => String(m?.mimeType || '').includes('sticker'));
      const hasAudio = allMedia.some(m => String(m?.mimeType || '').startsWith('audio/'));
      if (hasGif) return "[GIF]";
      if (hasSticker) return "[Sticker]";
      if (hasAudio) return "[Ghi âm]";
      return "[Ảnh/Video]";
    }
    return String(message.content || "Tin nhắn");
  };

  const getConversationPreview = (conv) => {
    const raw = String(conv?.lastMessageContent || conv?.lastMessage || "");
    if (!raw) return "Chưa có tin nhắn";
    if (raw.startsWith("MSG#")) return "Đang tải nội dung...";
    return raw;
  };

  const enhanceConversationProperties = (conv) => {
    if (!conv) return null;
    const normalized = normalizeConversation(conv);
    if (!normalized || normalized.type !== "direct") return normalized;

    const partner =
      normalized.partner ||
      (Array.isArray(normalized.members)
        ? normalized.members.find((member) => member !== user?.email)
        : undefined);

    return {
      ...normalized,
      partner,
      name: normalized.name || getDisplayName(partner),
      avatar: normalized.avatar || getDisplayAvatar(partner),
    };
  };

  const upsertConversationLastMessage = (convId, content, senderId, isNewMessage = false, msgId = null) => {
    setConversations((prev) => {
      const index = prev.findIndex((conv) => conv.id === convId);
      if (index === -1) return prev;
 
      const next = [...prev];
      const target = next[index];
      
      const isCurrentlyActive = activeConvId === convId;
      // Deduplication: Don't increment if we already processed this message ID
      const isAlreadyProcessed = msgId && target.lastProcessedMsgId === msgId;
      const shouldIncrement = isNewMessage && !isAlreadyProcessed && senderId && senderId !== user?.email && !isCurrentlyActive;
      
      const updated = {
        ...target,
        lastMessage: content,
        lastMessageContent: content,
        lastMessageSenderId: senderId || target.lastMessageSenderId,
        lastProcessedMsgId: msgId || target.lastProcessedMsgId,
        unreadCount: shouldIncrement ? (target.unreadCount || 0) + 1 : (isCurrentlyActive ? 0 : target.unreadCount || 0),
        updatedAt: new Date().toISOString(),
      };
      
      next.splice(index, 1);
      next.unshift(updated);
      return next;
    });
  };

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

  const loadConversations = async () => {
    if (!user?.email) {
      console.log("[Chat] Skip loading: No user email");
      return;
    }
    console.log("[Chat] Fetching conversations for:", user.email);
    setLoadingConversations(true);
    try {
      const res = await chatGet("/conversations");
      console.log("[Chat] API Response Status:", res?.status);

      // Robust data extraction: check res.data first, then fallback to numeric keys in res
      let rawData = [];
      if (Array.isArray(res?.data)) {
        rawData = res.data;
      } else if (res && typeof res === "object") {
        const numericKeys = Object.keys(res)
          .filter((key) => /^\d+$/.test(key))
          .sort((a, b) => Number(a) - Number(b));
        if (numericKeys.length > 0) {
          rawData = numericKeys.map((key) => res[key]);
        }
      }

      const normalized = rawData
        .map(enhanceConversationProperties)
        .filter((c) => c !== null);

      console.log(`[Chat] Successfully loaded ${normalized.length} conversations`);
      setConversations(normalized);

      setReadConversations(new Set());

      normalized
        .filter((conv) => !conv.lastMessageContent && String(conv.lastMessage || "").startsWith("MSG#"))
        .forEach(async (conv) => {
          try {
            const latestRes = await chatGet(
              `/conversations/${encodeURIComponent(conv.id)}/messages`,
              { limit: 1 },
            );
            const latestMessages =
              latestRes?.data || latestRes?.messages || [];
            const latest = Array.isArray(latestMessages)
              ? latestMessages[latestMessages.length - 1]
              : null;
            if (latest) {
              upsertConversationLastMessage(conv.id, getMessagePreview(latest), latest.senderId, false, latest.id);
            }
          } catch (mErr) {
            console.warn(`[Chat] Failed to load preview for ${conv.id}`, mErr);
          }
        });
    } catch (err) {
      console.error("[Chat] Fetch conversations failed", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const fetchFriendships = async () => {
    if (!user?.email) return;
    console.log("[Friends] Fetching friends for:", user.email);
    setLoadingFriends(true);
    try {
      const res = await chatGet("/friends");
      
      let rawData = [];
      if (Array.isArray(res?.data)) {
        rawData = res.data;
      } else if (res && typeof res === "object") {
        const numericKeys = Object.keys(res)
          .filter((key) => /^\d+$/.test(key))
          .sort((a, b) => Number(a) - Number(b));
        if (numericKeys.length > 0) {
          rawData = numericKeys.map((key) => res[key]);
        }
      }

      console.log(`[Friends] Successfully loaded ${rawData.length} friendships`);
      setFriendships(rawData);
    } catch (err) {
      console.error("[Friends] Fetch friends failed", err);
      setFriendships([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleSearchFriend = async () => {
    const email = friendSearchEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert("Tìm bạn", "Vui lòng nhập email cần tìm.");
      return;
    }

    setFriendSearchLoading(true);
    try {
      const res = await chatGet("/friends/search", { email });
      const payload = res?.data || {};
      if (!res?.ok || !payload?.found) {
        setFriendSearchResult(null);
        Alert.alert("Không tìm thấy", "Không có người dùng với email này.");
        return;
      }

      const nextResult = {
        email,
        ...(payload || {}),
      };
      setFriendSearchResult(nextResult);

      if (payload?.user?.email) {
        setUserProfiles((prev) => ({
          ...prev,
          [payload.user.email]: payload.user,
        }));
      }

      if (activeTab !== "contacts") {
        setActiveTab("contacts");
      }
    } catch (err) {
      console.error("Search friend failed", err);
      Alert.alert("Lỗi", "Không thể tìm kiếm bạn bè. Vui lòng thử lại.");
    } finally {
      setFriendSearchLoading(false);
    }
  };

  const handleSendFriendRequest = async (targetEmail) => {
    if (!targetEmail || friendActionLoading) return;
    setFriendActionLoading(true);
    try {
      const res = await chatPost("/friends/request", { targetEmail });
      if (!res?.ok) {
        throw new Error("SEND_REQUEST_FAILED");
      }
      Alert.alert("Thành công", "Đã gửi lời mời kết bạn.");
      await fetchFriendships();
      await handleSearchFriend();
    } catch (err) {
      console.error("Send friend request failed", err);
      Alert.alert("Lỗi", "Không thể gửi lời mời kết bạn.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleAcceptFriendRequest = async (senderEmail) => {
    if (!senderEmail || friendActionLoading) return;
    setFriendActionLoading(true);
    try {
      const res = await chatPost("/friends/accept", { senderEmail });
      if (!res?.ok) {
        throw new Error("ACCEPT_REQUEST_FAILED");
      }
      Alert.alert("Thành công", "Đã chấp nhận lời mời kết bạn.");
      await fetchFriendships();
      if (friendSearchResult?.email) {
        await handleSearchFriend();
      }
    } catch (err) {
      console.error("Accept friend request failed", err);
      Alert.alert("Lỗi", "Không thể chấp nhận lời mời kết bạn.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleSelectChat = async (chat) => {
    const normalizedChat = enhanceConversationProperties(chat);
    if (!normalizedChat) return;

    setActiveConversation(normalizedChat.id);
    setActiveTab("chat");
    
    // Reset unread count locally
    setConversations(prev => prev.map(c => 
      c.id === normalizedChat.id ? { ...c, unreadCount: 0 } : c
    ));

    setReadConversations(prev => {
      const next = new Set(prev);
      next.add(normalizedChat.id);
      return next;
    });

    setReplyTarget(null);
    closeMessageAction();

    if (normalizedChat.type === "direct" && normalizedChat.partner) {
      loadUserProfile(normalizedChat.partner);
    }

    if (SocketService.socket) {
      SocketService.socket.emit("join_room", { convId: normalizedChat.id });
    }
  };

  const handleOpenDirectChat = async (friendEmail) => {
    const directRes = await chatPost("/conversations/direct", {
      targetEmail: friendEmail,
    });
    const convId = directRes?.id || directRes?.data?.id;
    if (!convId) return;

    setActiveTab("chat");
    handleSelectChat({ id: convId, type: "direct", partner: friendEmail });
  };

  const handleOpenGroupConversation = async (conversation) => {
    if (!conversation?.id) return;
    setActiveTab("chat");
    handleSelectChat(conversation);
  };

  const getReactionData = (message) => messageReactions[message.id] || {};

  const getCurrentUserReaction = (message) => {
    if (!user?.email) return undefined;
    const reactions = getReactionData(message);
    const found = Object.entries(reactions).find(([, users]) =>
      users.includes(user.email),
    );
    return found?.[0];
  };

  const getReactionSummary = (message) => {
    const reactions = getReactionData(message);
    return Object.entries(reactions)
      .filter(([, users]) => users.length > 0)
      .slice(0, 3);
  };

  const toggleReaction = async (message, emoji) => {
    if (!user?.email || !selectedChat?.id) return;
    const messageId = message.id;
    const reactions = getReactionData(message);
    const hasReactedWithThisEmoji = reactions[emoji]?.includes(user.email);
    const action = hasReactedWithThisEmoji ? 'remove' : 'add';

    const res = await chatPatch(
      `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
      {
        action: "react",
        reactAction: action,
        emoji,
      },
    );

    const updatedMessage = res?.data || res;
    updateMessage(messageId, updatedMessage);
    setMessageReactions((prev) => ({
      ...prev,
      [messageId]: updatedMessage.reactions || {},
    }));

    if (SocketService.socket && updatedMessage) {
      SocketService.socket.emit("sendMessage", {
        convId: selectedChat.id,
        message: updatedMessage,
      });
    }
    closeMessageAction();
  };

  const pinMessage = async (message) => {
    if (!selectedChat?.id) return;
    const res = await chatPatch(
      `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(message.id)}`,
      { action: "pin" },
    );
    const updatedMessage = res?.data || res;
    setMessages((prev) =>
      prev.map((item) => (item.id === message.id ? updatedMessage : item)),
    );
    if (SocketService.socket && updatedMessage) {
      SocketService.socket.emit("sendMessage", {
        convId: selectedChat.id,
        message: updatedMessage,
      });
    }
    closeMessageAction();
  };

  const unpinMessage = async (messageId) => {
    if (!selectedChat?.id) return;
    const res = await chatPatch(
      `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
      { action: "unpin" },
    );
    const updatedMessage = res?.data || res;
    setMessages((prev) =>
      prev.map((item) => (item.id === messageId ? updatedMessage : item)),
    );
    if (SocketService.socket && updatedMessage) {
      SocketService.socket.emit("sendMessage", {
        convId: selectedChat.id,
        message: updatedMessage,
      });
    }
    closeMessageAction();
  };

  const deleteMessageForMe = async (messageId) => {
    if (!selectedChat?.id) return;
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
        { action: "deleteForMe" },
      );
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (err) {
      console.error("Delete for me failed", err);
    }
    closeMessageAction();
  };

  const copyToClipboard = async (text) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    // Optional: show a small toast or overlay
    closeMessageAction();
  };

  const handleForwardSelect = async (targetConvId) => {
    if (!forwardTargetMessage || !targetConvId) return;

    setIsForwardModalOpen(false);
    const msg = forwardTargetMessage;

    try {
      // Logic similar to Web: Send a new message to the target conversation
      const res = await chatPost(
        `/conversations/${encodeURIComponent(targetConvId)}/messages`,
        {
          content: msg.content || (msg.media?.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
          media: msg.media || [],
          files: msg.files || [],
          type: msg.type || 'text',
        },
      );

      if (res.ok) {
        Alert.alert("Thành công", "Đã chuyển tiếp tin nhắn.");
      }
    } catch (err) {
      console.error("Forward failed", err);
      Alert.alert("Lỗi", "Không thể chuyển tiếp tin nhắn.");
    } finally {
      setForwardTargetMessage(null);
    }
  };

  const startForward = (message) => {
    setForwardTargetMessage(message);
    setIsForwardModalOpen(true);
    closeMessageAction();
  };

  const recallMessage = async (messageId) => {
    if (!selectedChat?.id) return;
    const res = await chatPatch(
      `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
      { action: "recall" },
    );

    const updatedMessage = res?.data || res;
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? updatedMessage : msg)),
    );
    upsertConversationLastMessage(selectedChat.id, "Tin nhắn đã được thu hồi");

    setMessageReactions((prev) => {
      const next = { ...prev };
      delete next[messageId];
      return next;
    });

    if (SocketService.socket && updatedMessage) {
      SocketService.socket.emit("sendMessage", {
        convId: selectedChat.id,
        message: updatedMessage,
      });
    }
    closeMessageAction();
  };

  const startReply = (message) => {
    setReplyTarget({
      id: message.id,
      senderId: message.senderId,
      content: getMessagePreview(message),
    });
    closeMessageAction();
  };

  const pickImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Quyền truy cập", "Bạn cần cấp quyền thư viện để gửi ảnh.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: sendImageAsHD ? 1 : 0.8,
      selectionLimit: MAX_ATTACHMENTS_PER_MESSAGE,
    });

    if (!result.canceled && result.assets?.length) {
      setAttachments((prev) => {
        const room = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - prev.length);
        const picked = result.assets.slice(0, room).map((asset) => ({
          name: asset.fileName || `image-${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
          size: Number(asset.fileSize || 0),
          dataUrl: asset.uri,
          file: asset,
          isHD: sendImageAsHD,
        }));
        return [...prev, ...picked];
      });
    }
  };

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
        // --- MULTIMEDIA FLOW ---
        const { compressImage } = await import("../../utils/imageUtils");

        const uploadedAttachments = await Promise.all(
          currentAttachments.map(async (item) => {
            let fileToUpload = item.file;

            // Client-side Compression for Images
            if (fileToUpload.type?.startsWith("image/") && !item.isHD) {
              try {
                const compressed = await compressImage(fileToUpload.uri);
                fileToUpload = {
                  ...fileToUpload,
                  uri: compressed.uri,
                };
              } catch (e) {
                console.warn("Compression failed", e);
              }
            }

            const uploadRes = await chatUpload(fileToUpload);
            if (!uploadRes.ok) throw new Error("UPLOAD_FAILED");
            return { ...uploadRes.data, isHD: item.isHD };
          }),
        );

        const imageAttachments = uploadedAttachments.filter(
          (f) =>
            f.fileType?.startsWith("image/") ||
            f.mimeType?.startsWith("image/"),
        );
        const fileAttachments = uploadedAttachments.filter(
          (f) => !imageAttachments.includes(f),
        );

        const res = await chatPost(
          `/conversations/${selectedChat.id}/messages`,
          {
            content:
              trimmedInput ||
              (imageAttachments.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
            media: imageAttachments,
            files: fileAttachments,
            replyTo: replyTarget || undefined,
          },
        );
        const sentMessage =
          res?.ok && res?.data && typeof res.data === "object" ? res.data : null;
        if (!sentMessage?.id) {
          throw new Error("INVALID_SEND_MESSAGE_RESPONSE");
        }
        addMessage(sentMessage);
      } else {
        // --- OPTIMISTIC TEXT FLOW ---
        await sendMessageOptimistic(selectedChat.id, user.email, trimmedInput);
        // Explicitly snap to bottom (index 0 for inverted)
        setTimeout(() => {
          messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, 100);
      }

      // Update Preview
      upsertConversationLastMessage(
        selectedChat.id,
        trimmedInput || "[Đa phương tiện]",
        user.email
      );
    } catch (err) {
      console.error("Send message failed", err);
      Alert.alert("Lỗi", "Không gửi được tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    if ((!inputText || !inputText.trim()) && attachments.length === 0) return;
    setSending(true);
    await handleChatSend(inputText, attachments);
    setInputText("");
    setAttachments([]);
  };

  const openContactPicker = async () => {
    if (!selectedChat?.id) {
      Alert.alert("Danh thiếp", "Hãy mở một cuộc trò chuyện trước khi gửi danh thiếp.");
      return;
    }
    if (acceptedFriends.length === 0) {
      Alert.alert("Danh thiếp", "Bạn chưa có liên hệ nào để chia sẻ.");
      return;
    }

    acceptedFriends.slice(0, 12).forEach((email) => loadUserProfile(email));
    setShowContactPicker(true);
  };

  const sendContactCard = async (contactEmail) => {
    if (!selectedChat?.id || !contactEmail || sending) return;

    const profile = userProfiles[contactEmail] || {};
    const contactCard = {
      email: contactEmail,
      fullName: profile.fullName || profile.fullname || contactEmail,
      avatarUrl: profile.avatarUrl || profile.urlAvatar,
      phone: profile.phone,
    };

    setShowContactPicker(false);
    setSending(true);
    try {
      const res = await chatPost(
        `/conversations/${selectedChat.id}/messages`,
        {
          content: "[Danh thiếp]",
          type: "contact_card",
          contactCard,
          replyTo: replyTarget || undefined,
        },
      );

      const sentMessage =
        res?.ok && res?.data && typeof res.data === "object" ? res.data : null;
      if (!sentMessage?.id) {
        throw new Error("INVALID_CONTACT_CARD_RESPONSE");
      }

      addMessage(sentMessage);
      setReplyTarget(null);
      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: "[Danh thiếp]",
      }));
      upsertConversationLastMessage(selectedChat.id, "[Danh thiếp]");
    } catch (err) {
      console.error("Send contact card failed", err);
      Alert.alert("Lỗi", "Không gửi được danh thiếp. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
  };

  // ===================== VOICE RECORDING =====================
  const startRecording = async () => {
    if (isRecording) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền micro', 'Bạn cần cấp quyền microphone để ghi âm.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Start recording failed', err);
      Alert.alert('Lỗi', 'Không thể ghi âm. Vui lòng thử lại.');
    }
  };

  const stopRecording = async () => {
    if (!isRecording || !recordingRef.current) return;
    try {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      const durationSec = recordingSeconds;
      recordingRef.current = null;
      setRecordingSeconds(0);
      if (uri) {
        setPendingVoice({ uri, durationSec });
      }
    } catch (err) {
      console.error('Stop recording failed', err);
    }
  };

  const cancelPendingVoice = () => setPendingVoice(null);

  const sendPendingVoice = async () => {
    if (!pendingVoice || !selectedChat?.id || sending) return;
    setSending(true);
    try {
      const token = await AsyncStorage.getItem('token');
      
      const uploadTask = await FileSystem.uploadAsync(`${API_URL}/chat/uploads`, pendingVoice.uri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (uploadTask.status !== 200 && uploadTask.status !== 201) {
        throw new Error('UPLOAD_FAILED');
      }

      let resultData;
      try {
        resultData = JSON.parse(uploadTask.body);
      } catch (e) {
        resultData = { data: { fileUrl: uploadTask.body } };
      }
      const fileData = resultData.data || resultData;

      const res = await chatPost(`/conversations/${selectedChat.id}/messages`, {
        content: '[Ghi âm]',
        files: [{
          name: fileData.name || `voice-${pendingVoice.durationSec}s.m4a`,
          mimeType: fileData.mimeType || fileData.fileType || 'audio/m4a',
          size: fileData.size || 0,
          dataUrl: fileData.fileUrl || fileData.url,
          durationSec: pendingVoice.durationSec,
        }],
        replyTo: replyTarget || undefined,
      });
      const sentMessage = res?.ok && res?.data ? res.data : null;
      if (sentMessage?.id) {
        addMessage(sentMessage);
        setReplyTarget(null);
        upsertConversationLastMessage(selectedChat.id, '[Ghi âm]');
      }
      cancelPendingVoice();
    } catch (err) {
      console.error('Send voice failed', err);
      Alert.alert('Lỗi', 'Không gửi được tin nhắn thoại.');
    } finally {
      setSending(false);
    }
  };

  // ===================== LOCATION =====================
  const stopLiveLocation = () => {
    if (liveLocationTimerRef.current) clearInterval(liveLocationTimerRef.current);
    if (liveLocationStopRef.current) clearTimeout(liveLocationStopRef.current);
    liveLocationTimerRef.current = null;
    liveLocationStopRef.current = null;
    liveLocationUpdatesRef.current = 0;
    setIsLiveSharing(false);
  };

  const sendLocationMessage = async (latitude, longitude, label, isLive, liveSessionId, sentAt, expiresAt) => {
    if (!selectedChat?.id) return;
    const res = await chatPost(`/conversations/${selectedChat.id}/messages`, {
      content: isLive ? '[Vị trí trực tiếp]' : '[Vị trí hiện tại]',
      type: 'location',
      location: { latitude, longitude, label, isLive: !!isLive, liveSessionId, sentAt, expiresAt },
      replyTo: replyTarget || undefined,
    });
    const sentMessage = res?.ok && res?.data ? res.data : null;
    if (sentMessage?.id) {
      addMessage(sentMessage);
      setReplyTarget(null);
      upsertConversationLastMessage(selectedChat.id, isLive ? '[Vị trí trực tiếp]' : '[Vị trí hiện tại]');
    }
  };

  const sendCurrentLocation = async () => {
    setShowLocationMenu(false);
    stopLiveLocation();
    if (!selectedChat?.id) { Alert.alert('', 'Hãy mở một cuộc trò chuyện trước.'); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Quyền vị trí', 'Bạn cần cấp quyền vị trí.'); return; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await sendLocationMessage(
        loc.coords.latitude, loc.coords.longitude,
        'Vị trí hiện tại', false, undefined, new Date().toISOString(), undefined
      );
    } catch (err) {
      Alert.alert('Lỗi', 'Không lấy được vị trí. Vui lòng thử lại.');
    }
  };

  const startLiveLocation = async () => {
    setShowLocationMenu(false);
    if (!selectedChat?.id) { Alert.alert('', 'Hãy mở một cuộc trò chuyện trước.'); return; }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Quyền vị trí', 'Bạn cần cấp quyền vị trí.'); return; }
    stopLiveLocation();
    const liveSessionId = `live-${Date.now()}`;
    const LIVE_DURATION_MS = 5 * 60 * 1000;
    const LIVE_INTERVAL_MS = 60 * 1000;
    const MAX_LIVE_UPDATES = 5;
    const expiresAt = new Date(Date.now() + LIVE_DURATION_MS).toISOString();
    liveLocationUpdatesRef.current = 0;

    const pushLocation = async () => {
      if (liveLocationUpdatesRef.current >= MAX_LIVE_UPDATES) { stopLiveLocation(); return; }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await sendLocationMessage(
          loc.coords.latitude, loc.coords.longitude,
          'Vị trí trực tiếp', true, liveSessionId, new Date().toISOString(), expiresAt
        );
        liveLocationUpdatesRef.current += 1;
        if (liveLocationUpdatesRef.current >= MAX_LIVE_UPDATES) stopLiveLocation();
      } catch (_) {}
    };

    pushLocation();
    setIsLiveSharing(true);
    Alert.alert('Đã bật', 'Đang chia sẻ vị trí trực tiếp (tối đa 5 lần / 5 phút).');
    liveLocationTimerRef.current = setInterval(pushLocation, LIVE_INTERVAL_MS);
    liveLocationStopRef.current = setTimeout(stopLiveLocation, LIVE_DURATION_MS);
  };

  // ===================== GIF =====================
  const TENOR_API_KEY = 'AIzaSyAhV9xFj7BtTwnkD91LKOE00k3kSfPoxE0'; // demo key
  const searchGif = async (query) => {
    setGifLoading(true);
    try {
      const q = encodeURIComponent(query || 'funny');
      const url = `https://tenor.googleapis.com/v2/search?q=${q}&key=${TENOR_API_KEY}&limit=20&media_filter=gif`;
      const res = await fetch(url);
      const data = await res.json();
      setGifResults((data.results || []).map(r => ({
        id: r.id,
        url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url || '',
        preview: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || '',
      })));
    } catch (err) {
      console.error('GIF search failed', err);
    } finally {
      setGifLoading(false);
    }
  };

  const sendGif = async (gifUrl) => {
    setShowGifPicker(false);
    if (!selectedChat?.id || !gifUrl) return;
    const res = await chatPost(`/conversations/${selectedChat.id}/messages`, {
      content: '[GIF]',
      media: [{ name: `gif-${Date.now()}.gif`, mimeType: 'image/gif', size: 1024, dataUrl: gifUrl }],
      replyTo: replyTarget || undefined,
    });
    const sentMessage = res?.ok && res?.data ? res.data : null;
    if (sentMessage?.id) {
      addMessage(sentMessage);
      setReplyTarget(null);
      upsertConversationLastMessage(selectedChat.id, '[GIF]');
    }
  };

  // ===================== STICKER =====================
  const sendSticker = async (stickerUrl) => {
    setShowStickerPicker(false);
    if (!selectedChat?.id || !stickerUrl) return;
    const res = await chatPost(`/conversations/${selectedChat.id}/messages`, {
      content: '[Sticker]',
      media: [{ name: `sticker-${Date.now()}.png`, mimeType: 'image/sticker', size: 1024, dataUrl: stickerUrl, isSticker: true }],
      replyTo: replyTarget || undefined,
    });
    const sentMessage = res?.ok && res?.data ? res.data : null;
    if (sentMessage?.id) {
      addMessage(sentMessage);
      setReplyTarget(null);
      upsertConversationLastMessage(selectedChat.id, '[Sticker]');
    }
  };

  const acceptedFriends = useMemo(
    () =>
      friendships
        .filter((item) => item.status === "accepted")
        .map((item) =>
          item.sender_id === user?.email ? item.receiver_id : item.sender_id,
        ),
    [friendships, user?.email],
  );

  const activePinnedMessages = useMemo(
    () =>
      messages
        .filter((message) => message.pinned)
        .sort((a, b) =>
          String(b.pinnedAt || "").localeCompare(String(a.pinnedAt || "")),
        )
        .slice(0, 3),
    [messages],
  );

  const conversationFiles = useMemo(
    () =>
      messages
        .flatMap((message) => {
          const media = Array.isArray(message.media)
            ? message.media.map((item) => ({
              ...normalizeAttachment(item),
              createdAt: message.createdAt,
            }))
            : [];
          const files = Array.isArray(message.files)
            ? message.files.map((item) => ({
              ...normalizeAttachment(item),
              createdAt: message.createdAt,
            }))
            : [];
          return [...media, ...files];
        })
        .filter((item) => !!item.dataUrl)
        .slice()
        .reverse(),
    [messages],
  );
  
  useEffect(() => {
    loadConversations();
  }, [user?.email]);

  useEffect(() => {
    if (activeTab === "contacts") {
      fetchFriendships();
    }
  }, [activeTab, user?.email]);

  useEffect(() => {
    safeConversations.forEach((conv) => {
      if (conv.type === "direct") {
        const partner =
          conv.partner ||
          (Array.isArray(conv.members)
            ? conv.members.find((member) => member !== user?.email)
            : undefined);
        if (partner) loadUserProfile(partner);
      }
    });
  }, [safeConversations, user?.email]);

  useEffect(() => {
    safeMessages.forEach((msg) => {
      if (msg.senderId && msg.senderId !== user?.email) {
        loadUserProfile(msg.senderId);
      }
    });
  }, [safeMessages, user?.email]);

  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket) return;

    const handleReceiveMessage = (msg) => {
      if (!msg?.id) return;

      // Zustand handles duplication, sorting, and caching
      addMessage(msg);

      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId) {
        // Match backend behavior: lastMessage is the ID, lastMessageContent is the text
        const preview = getMessagePreview(msg);
        upsertConversationLastMessage(incomingConvId, preview, msg.senderId, true, msg.id);

        // Mark as unread locally if receiving message from someone else
        if (msg.senderId !== user?.email) {
          setReadConversations(prev => {
            const next = new Set(prev);
            next.delete(incomingConvId);
            return next;
          });
        }

        // Auto-scroll snap if receiving message in active chat
        if (incomingConvId === selectedChat?.id) {
          setTimeout(() => {
            messagesScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 100);
        }
      }
    };

    const handlePresenceUpdate = (data) => {
      setUserProfiles((prev) => {
        if (!prev[data.email]) return prev;
        return {
          ...prev,
          [data.email]: { ...prev[data.email], status: data.status },
        };
      });
    };

    const handleTypingEvent = (data) => {
      const { convId, email, isTyping } = data;
      if (!convId || !email || email === user?.email) return;
      setTypingUsers((prev) => {
        const currentTyping = prev[convId] || new Set();
        const nextSet = new Set(currentTyping);
        if (isTyping) {
          nextSet.add(email);
        } else {
          nextSet.delete(email);
        }
        return { ...prev, [convId]: nextSet };
      });
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("presence_update", handlePresenceUpdate);
    socket.on("typing", handleTypingEvent);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("presence_update", handlePresenceUpdate);
      socket.off("typing", handleTypingEvent);
    };
  }, [addMessage]);

  useEffect(() => {
    if (messagesScrollRef.current) {
      setTimeout(() => {
        messagesScrollRef.current?.scrollToEnd?.({ animated: true });
      }, 60);
    }
  }, [messages]);

  const handleLogoutPress = () => {
    Alert.alert(
      "Đăng xuất",
      "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản này?",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: onLogout },
      ],
    );
  };

  const renderHeader = () => (
    <LinearGradient
      colors={["#0058bc", "#00418f"]}
      style={[styles.header, { paddingTop: insets.top }]}
    >
      <View style={styles.headerContent}>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>search</Text>
          <TextInput
            placeholder="Tìm kiếm"
            style={styles.searchInput}
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={friendSearchEmail}
            onChangeText={setFriendSearchEmail}
            onSubmitEditing={handleSearchFriend}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => onNavigate("qr-scanner")}
          >
            <Text style={styles.headerIconText}>qr_code_scanner</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => setIsAddMenuOpen(true)}
          >
            <Text style={styles.headerIconText}>add</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );

  const renderConversationsView = () => {
    if (selectedChat) {
      const currentTypingSet = typingUsers[selectedChat.id];
      const partnerProfile = selectedChat.type === "direct" ? userProfiles[selectedChat.partner] : null;
      const isOnline = partnerProfile?.status === "online";
      
      let displayStatus = selectedChat.type === "direct" 
        ? (isOnline ? "Đang hoạt động" : "Đang ngoại tuyến")
        : "Đang trò chuyện";

      if (currentTypingSet && currentTypingSet.size > 0) {
        const firstEmail = Array.from(currentTypingSet)[0];
        displayStatus = `${getDisplayName(firstEmail)} đang gõ...`;
      }

      return (
        <KeyboardAvoidingView 
          style={styles.chatPane}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
          <LinearGradient
            colors={["#0058bc", "#00418f"]}
            style={[styles.chatPaneHeader, { paddingTop: insets.top }]}
          >
            <TouchableOpacity onPress={() => setActiveConversation(null)}>
              <Text style={styles.chatPaneBack}>arrow_back</Text>
            </TouchableOpacity>
            <View style={styles.avatarContainer}>
              <Image
                source={{
                  uri:
                    selectedChat.type === "direct"
                      ? getDisplayAvatar(selectedChat.partner)
                      : selectedChat.avatar,
                }}
                style={styles.chatPaneAvatar}
              />
              {selectedChat.type === "direct" && userProfiles[selectedChat.partner]?.status === "online" && (
                <View style={[styles.onlineBadge, { borderColor: '#0058bc' }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.chatPaneName} numberOfLines={1}>
                {selectedChat.type === "direct"
                  ? getDisplayName(selectedChat.partner)
                  : selectedChat.name}
              </Text>
              <Text style={[styles.chatPaneSub, displayStatus.includes("đang gõ...") && { color: "#fff", fontWeight: "700" }]}>
                {displayStatus}
              </Text>
            </View>

            <View style={styles.chatHeaderIcons}>
              <TouchableOpacity style={styles.chatHeaderIconButton}>
                <Text style={styles.chatHeaderIcon}>call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chatHeaderIconButton}>
                <Text style={styles.chatHeaderIcon}>videocam</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.chatHeaderIconButton}>
                <Text style={styles.chatHeaderIcon}>list</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {activePinnedMessages.length > 0 && (
            <View style={styles.pinStrip}>
              {activePinnedMessages.map((message) => (
                <View key={`pin-${message.id}`} style={styles.pinItem}>
                  <Text style={styles.pinIcon}>push_pin</Text>
                  <Text style={styles.pinText} numberOfLines={1}>
                    {getMessagePreview(message)}
                  </Text>
                  <TouchableOpacity onPress={() => unpinMessage(message.id)}>
                    <Text style={styles.pinUnpin}>Bỏ</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <FlatList
            key={`chat-list-${selectedChat.id}`}
            ref={messagesScrollRef}
            data={reversedMessages}
            inverted={true}
            keyExtractor={(item, index) => item.id || `msg-${index}`}
            renderItem={({ item: message }) => {
              const isMe = message.senderId === user?.email;
              const reactionSummary = getReactionSummary(message);
              return (
                <Pressable
                  key={message.id || `msg-${index}`}
                  onLongPress={() => setActionMessage(message)}
                  style={[
                    styles.messageRow,
                    isMe ? styles.messageRowMe : styles.messageRowOther,
                  ]}
                >
                  {!isMe && (
                    <Image
                      source={{ uri: getDisplayAvatar(message.senderId) }}
                      style={styles.msgAvatar}
                    />
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                    ]}
                  >
                    {message.replyTo && (
                      <View style={styles.replyBlock}>
                        <Text style={styles.replySender}>
                          Trả lời {message.replyTo.senderId || "tin nhắn"}
                        </Text>
                        <Text style={styles.replyContent} numberOfLines={1}>
                          {message.replyTo.content}
                        </Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.messageText,
                        message.recalled && styles.recalledText,
                      ]}
                    >
                      {message.content}
                    </Text>

                    {(!message.recalled && message.contactCard) && (
                      <View style={styles.contactCardBox}>
                        <Text style={styles.contactCardLabel}>Danh thiếp</Text>
                        <View style={styles.contactCardHeader}>
                          <Image
                            source={{ uri: message.contactCard.avatarUrl || getDisplayAvatar(message.contactCard.email) }}
                            style={styles.contactCardAvatar}
                          />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={styles.contactCardName}>
                              {message.contactCard.fullName || message.contactCard.email}
                            </Text>
                            <Text numberOfLines={1} style={styles.contactCardEmail}>
                              {message.contactCard.email}
                            </Text>
                            {message.contactCard.phone ? (
                              <Text numberOfLines={1} style={styles.contactCardPhone}>
                                {message.contactCard.phone}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {message.contactCard.email !== user?.email && (
                          <TouchableOpacity
                            style={styles.contactCardAction}
                            onPress={() => handleOpenDirectChat(message.contactCard.email)}
                          >
                            <Text style={styles.contactCardActionText}>Nhắn tin</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Location render */}
                    {!message.recalled && message.location && (
                      <View style={styles.locationCard}>
                        <Text style={styles.locationCardLabel}>
                          {message.location.isLive ? '📡 Vị trí trực tiếp' : '📍 Vị trí hiện tại'}
                        </Text>
                        <Text style={styles.locationCardCoords}>
                          {Number(message.location.latitude).toFixed(5)}, {Number(message.location.longitude).toFixed(5)}
                        </Text>
                        {message.location.label ? (
                          <Text style={styles.locationCardText}>{message.location.label}</Text>
                        ) : null}
                        <TouchableOpacity
                          style={styles.locationCardBtn}
                          onPress={() => Linking.openURL(`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`)}
                        >
                          <Text style={styles.locationCardBtnText}>Mở bản đồ</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {(Array.isArray(message.media) ||
                      Array.isArray(message.files)) && (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {(Array.isArray(message.media) ? message.media : []).map((item, index) => {
                          const file = normalizeAttachment(item);
                          const mimeStr = String(file.mimeType || '').toLowerCase();
                          // Sticker
                          if (mimeStr.includes('sticker') || item?.isSticker) {
                            return <Image key={`m-${message.id}-${index}`} source={{ uri: file.dataUrl }} style={{ width: 100, height: 100 }} resizeMode="contain" />;
                          }
                          // GIF
                          if (mimeStr === 'image/gif' || String(file.name || '').endsWith('.gif')) {
                            return <Image key={`m-${message.id}-${index}`} source={{ uri: file.dataUrl }} style={[styles.messageImage, { borderRadius: 8 }]} resizeMode="contain" />;
                          }
                          if (isVideoAttachment(item)) {
                            return (
                              <TouchableOpacity
                                key={`m-${message.id}-${index}`}
                                style={styles.messageFile}
                                onPress={() => file.dataUrl && Linking.openURL(file.dataUrl)}
                              >
                                <Text style={styles.messageFileIcon}>play_circle</Text>
                                <View style={{ flex: 1 }}>
                                  <Text numberOfLines={1} style={styles.messageFileName}>{file.name || 'Video'}</Text>
                                  <Text style={styles.messageFileSize}>Nhấn để mở video</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          }
                          return <Image key={`m-${message.id}-${index}`} source={{ uri: file.dataUrl }} style={styles.messageImage} />;
                        })}
                        {(Array.isArray(message.files) ? message.files : []).map((item, index) => {
                          const file = normalizeAttachment(item);
                          const mimeStr = String(file.mimeType || '').toLowerCase();
                          // Audio file
                          if (mimeStr.startsWith('audio/')) {
                            return (
                              <TouchableOpacity
                                key={`f-${message.id}-${index}`}
                                style={[styles.messageFile, { backgroundColor: '#e8f4ff' }]}
                                onPress={() => file.dataUrl && Linking.openURL(file.dataUrl)}
                              >
                                <Text style={styles.messageFileIcon}>mic</Text>
                                <View style={{ flex: 1 }}>
                                  <Text numberOfLines={1} style={styles.messageFileName}>{file.name || 'Ghi âm'}</Text>
                                  <Text style={styles.messageFileSize}>Nhấn để nghe</Text>
                                </View>
                              </TouchableOpacity>
                            );
                          }
                          return (
                            <TouchableOpacity
                              key={`f-${message.id}-${index}`}
                              style={styles.messageFile}
                              onPress={() => Linking.openURL(file.dataUrl)}
                            >
                              <Text style={styles.messageFileIcon}>
                                {getFileIcon(file.mimeType, file.name)}
                              </Text>
                              <View style={{ flex: 1 }}>
                                <Text numberOfLines={1} style={styles.messageFileName}>
                                  {file.name}
                                </Text>
                                <Text style={styles.messageFileSize}>
                                  {formatFileSize(file.size)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {reactionSummary.length > 0 && (
                      <View
                        style={[
                          styles.reactionSummaryRow,
                          isMe ? { justifyContent: "flex-end" } : null,
                        ]}
                      >
                        {reactionSummary.map(([emoji, users]) => (
                          <TouchableOpacity
                            key={`${message.id}-${emoji}`}
                            style={styles.reactionSummaryChip}
                            onPress={() => toggleReaction(message, emoji)}
                          >
                            <Text style={styles.reactionSummaryText}>
                              {emoji} {users.length}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={[styles.messageMetaRow, isMe && styles.messageMetaRowMe]}>
                      <Text style={styles.messageTime}>
                        {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                  </View>
                </Pressable>

              );
            }}
          />

          {replyTarget && (
            <View style={styles.replyComposer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.replyComposerTitle}>
                  Đang trả lời {replyTarget.senderId || "tin nhắn"}
                </Text>
                <Text numberOfLines={1} style={styles.replyComposerText}>
                  {replyTarget.content}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTarget(null)}>
                <Text style={styles.replyComposerCancel}>x</Text>
              </TouchableOpacity>
            </View>
          )}

          {attachments.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.attachmentStrip}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 10 }}
            >
              {attachments.map((item, index) => (
                <View key={`a-${index}`} style={styles.attachmentChip}>
                  <Text style={styles.attachmentIcon}>
                    {getFileIcon(item.mimeType, item.name)}
                  </Text>
                  <Text numberOfLines={1} style={styles.attachmentName}>
                    {item.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setAttachments((prev) =>
                        prev.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Text style={styles.attachmentRemove}>x</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Pending voice preview */}
          {pendingVoice && !isRecording && (
            <View style={styles.pendingVoiceBar}>
              {/* Waveform icon */}
              <View style={styles.pendingVoiceIconBox}>
                <Text style={styles.pendingVoiceIcon}>graphic_eq</Text>
              </View>
              {/* Mini waveform bars */}
              <View style={styles.pendingVoiceWave}>
                {[3,5,7,4,8,5,6,8,4,6,7,5].map((h, i) => (
                  <View key={i} style={[styles.pendingVoiceBar2, { height: h * 2.5 }]} />
                ))}
              </View>
              {/* Duration */}
              <Text style={styles.pendingVoiceDuration}>
                {Math.floor(pendingVoice.durationSec / 60).toString().padStart(2,'0')}:{(pendingVoice.durationSec % 60).toString().padStart(2,'0')}
              </Text>
              {/* Cancel */}
              <TouchableOpacity onPress={cancelPendingVoice} style={styles.pendingVoiceCancelBtn}>
                <Text style={styles.pendingVoiceCancelIcon}>close</Text>
              </TouchableOpacity>
              {/* Send */}
              <TouchableOpacity onPress={sendPendingVoice} disabled={sending} style={styles.pendingVoiceSendBtn}>
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.pendingVoiceSendText}>Gửi voice</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Feature toolbar: sticker, GIF, location, voice */}
          <View style={styles.featureToolbar}>
            <TouchableOpacity onPress={() => { setShowStickerPicker(true); setShowGifPicker(false); setShowLocationMenu(false); }} style={styles.featureBtn}>
              <Text style={styles.featureBtnIcon}>emoji_emotions</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowGifPicker(true); setShowStickerPicker(false); setShowLocationMenu(false); searchGif('funny'); }} style={styles.featureBtn}>
              <Text style={styles.featureBtnIcon}>gif_box</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowLocationMenu(v => !v); setShowStickerPicker(false); setShowGifPicker(false); }} style={[styles.featureBtn, isLiveSharing && { backgroundColor: '#fce4e4' }]}>
              <Text style={[styles.featureBtnIcon, isLiveSharing && { color: '#e53935' }]}>location_on</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />
            
            <TouchableOpacity 
              style={[
                { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, alignSelf: 'center', marginRight: 8 },
                sendImageAsHD ? { backgroundColor: "#0058bc", borderColor: "#0058bc" } : { backgroundColor: "#f1f5fa", borderColor: "#e5eaf2" }
              ]}
              onPress={() => setSendImageAsHD(!sendImageAsHD)}
            >
              <Text style={[{ fontSize: 10, fontWeight: 'bold' }, sendImageAsHD ? { color: "#fff" } : { color: "#64748b" }]}>HD</Text>
            </TouchableOpacity>

            {showLocationMenu && (
              <View style={styles.locationMenu}>
                <TouchableOpacity onPress={sendCurrentLocation} style={styles.locationMenuItem}>
                  <Text style={styles.locationMenuText}>📍 Gửi vị trí hiện tại</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={startLiveLocation} style={styles.locationMenuItem}>
                  <Text style={styles.locationMenuText}>📡 Chia sẻ trực tiếp (5 phút)</Text>
                </TouchableOpacity>
                {isLiveSharing && (
                  <TouchableOpacity onPress={stopLiveLocation} style={styles.locationMenuItem}>
                    <Text style={[styles.locationMenuText, { color: '#e53935' }]}>⏹ Dừng chia sẻ</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.composer}>
            <TouchableOpacity onPress={pickImages} style={styles.composerAction}>
              <Text style={styles.composerActionIcon}>image</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openContactPicker} style={styles.composerAction}>
              <Text style={styles.composerActionIcon}>contact_page</Text>
            </TouchableOpacity>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Nhập tin nhắn..."
              placeholderTextColor="#8a9099"
              style={styles.composerInput}
              multiline
            />
            {/* Voice record button */}
            {isRecording ? (
              <View style={styles.recordingInline}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimer}>
                  {Math.floor(recordingSeconds / 60).toString().padStart(2,'0')}:{(recordingSeconds % 60).toString().padStart(2,'0')}
                </Text>
                <TouchableOpacity onPress={stopRecording} style={styles.recordingStopBtn}>
                  <Text style={styles.recordingStopIcon}>stop_circle</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={startRecording} style={styles.composerAction}>
                <Text style={styles.composerActionIcon}>mic</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={sendMessage}
              style={[styles.sendButton, sending && { opacity: 0.6 }]}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>send</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      );
    }

    if (loadingConversations) {
      return (
        <View style={styles.centeredView}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.aiSubtitle}>Đang tải hội thoại...</Text>
        </View>
      );
    }

    return (
      <ScrollView key="conversations-list-scroll" style={styles.scrollContainer}>
        <View style={styles.chatList}>
          {safeConversations.map((chat) => {
            const partnerEmail =
              chat.type === "direct"
                ? chat.partner ||
                (Array.isArray(chat.members)
                  ? chat.members.find((member) => member !== user?.email)
                  : undefined)
                : undefined;
            const chatName =
              chat.type === "direct"
                ? getDisplayName(partnerEmail)
                : chat.name || chat.id.slice(0, 6);
            const chatAvatar =
              chat.type === "direct"
                ? getDisplayAvatar(partnerEmail)
                : chat.avatar || getDisplayAvatar();
            const isUnread = chat.lastMessageSenderId && 
                            chat.lastMessageSenderId !== user?.email && 
                            !readConversations.has(chat.id);
            const partnerProfile = partnerEmail ? userProfiles[partnerEmail] : null;
            const isOnline = partnerProfile?.status === 'online';

            return (
              <TouchableOpacity
                key={chat.id}
                style={styles.chatItem}
                onPress={() => handleSelectChat(chat)}
              >
                <View style={styles.avatarContainer}>
                  <Image source={{ uri: chatAvatar }} style={styles.avatar} />
                  {isOnline && <View style={styles.onlineBadge} />}
                  {chat.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeader}>
                    <Text 
                      style={[styles.chatName, isUnread && { fontWeight: '700', color: '#000' }]} 
                      numberOfLines={1}
                    >
                      {chatName}
                    </Text>
                    <Text style={[styles.chatTime, isUnread && { color: Colors.primary, fontWeight: '600' }]}>
                      {chat.updatedAt
                        ? new Date(chat.updatedAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                        : "--:--"}
                    </Text>
                  </View>
                  <Text 
                    style={[
                      styles.lastMsg, 
                      chat.unreadCount > 0 && { color: '#000', fontWeight: '700', fontSize: 14 }
                    ]} 
                    numberOfLines={1}
                  >
                    {getConversationPreview(chat)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  const renderFriendsView = () => (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Danh sách bạn bè</Text>
      </View>
      {friendSearchResult && (
        <View style={styles.searchResultCard}>
          <View style={styles.searchResultHeader}>
            <Image
              source={{
                uri:
                  friendSearchResult?.user?.avatarUrl ||
                  getDisplayAvatar(friendSearchResult?.email),
              }}
              style={styles.searchResultAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.searchResultName}>
                {friendSearchResult?.user?.fullName ||
                  friendSearchResult?.user?.fullname ||
                  friendSearchResult?.email}
              </Text>
              <Text style={styles.searchResultEmail}>
                {friendSearchResult?.email}
              </Text>
            </View>
          </View>

          {friendSearchResult?.isSelf ? (
            <Text style={styles.searchResultHint}>
              Đây là tài khoản của bạn.
            </Text>
          ) : (
            (() => {
              const meta = getFriendshipMeta(friendSearchResult?.friendship);
              if (meta.status === "accepted") {
                return (
                  <TouchableOpacity
                    style={styles.searchResultPrimaryButton}
                    onPress={() =>
                      handleOpenDirectChat(friendSearchResult?.email)
                    }
                  >
                    <Text style={styles.searchResultPrimaryText}>Nhắn tin</Text>
                  </TouchableOpacity>
                );
              }

              if (meta.status === "pending" && meta.source === user?.email) {
                return (
                  <Text style={styles.searchResultHint}>
                    Đã gửi lời mời kết bạn.
                  </Text>
                );
              }

              if (meta.status === "pending" && meta.target === user?.email) {
                return (
                  <TouchableOpacity
                    style={styles.searchResultPrimaryButton}
                    disabled={friendActionLoading}
                    onPress={() => handleAcceptFriendRequest(meta.source)}
                  >
                    <Text style={styles.searchResultPrimaryText}>
                      Chấp nhận lời mời
                    </Text>
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  style={styles.searchResultPrimaryButton}
                  disabled={friendActionLoading}
                  onPress={() =>
                    handleSendFriendRequest(friendSearchResult?.email)
                  }
                >
                  <Text style={styles.searchResultPrimaryText}>Kết bạn</Text>
                </TouchableOpacity>
              );
            })()
          )}
        </View>
      )}

      {!loadingFriends &&
        friendships.some(
          (item) =>
            item.status === "pending" && item.receiver_id === user?.email,
        ) && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionTitle}>Lời mời kết bạn</Text>
            {friendships
              .filter(
                (item) =>
                  item.status === "pending" && item.receiver_id === user?.email,
              )
              .map((item) => {
                const email = item.sender_id;
                return (
                  <View key={`pending-${email}`} style={styles.pendingItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingName}>
                        {getDisplayName(email)}
                      </Text>
                      <Text style={styles.pendingEmail}>{email}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.pendingAcceptButton}
                      disabled={friendActionLoading}
                      onPress={() => handleAcceptFriendRequest(email)}
                    >
                      <Text style={styles.pendingAcceptText}>Chấp nhận</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </View>
        )}

      {loadingFriends ? (
        <View style={styles.centeredView}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.aiSubtitle}>Đang tải danh sách bạn bè...</Text>
        </View>
      ) : acceptedFriends.length === 0 ? (
        <View style={styles.centeredView}>
          <Text style={styles.aiSubtitle}>Bạn chưa có bạn bè nào.</Text>
        </View>
      ) : (
        acceptedFriends.map((friendEmail) => (
          <TouchableOpacity
            key={friendEmail}
            style={styles.friendItem}
            onPress={() => handleOpenDirectChat(friendEmail)}
          >
            <Image
              source={{ uri: getDisplayAvatar(friendEmail) }}
              style={styles.friendAvatar}
            />
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>
                {getDisplayName(friendEmail)}
              </Text>
              <Text style={styles.friendStatus}>
                Nhấn để mở trò chuyện riêng
              </Text>
            </View>
            <View style={styles.friendAction}>
              <Text style={styles.friendActionIcon}>chat</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );

  const renderAIView = () => (
    <View style={styles.centeredView}>
      <Text style={styles.aiIcon}>notifications</Text>
      <Text style={styles.aiTitle}>Notifications</Text>
      <Text style={styles.aiSubtitle}>Đang được nâng cấp. Sắp ra mắt!</Text>
    </View>
  );

  const renderProfileView = () => (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.profileHeader}>
        <View style={styles.largeAvatarBox}>
          {user?.avatarUrl ? (
            <Image
              key={`profile-tab-avatar-${profileVersion}`}
              source={{ uri: `${user.avatarUrl}?v=${profileVersion}` }}
              style={styles.largeAvatarImage}
            />
          ) : (
            <Text style={styles.avatarInitial}>
              {user?.fullName ? user.fullName[0].toUpperCase() : "U"}
            </Text>
          )}
        </View>
        <Text style={styles.profileName}>{user?.fullName || "Người dùng"}</Text>
        <Text style={styles.profileEmail}>{user?.email}</Text>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate("profile")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#E3F2FD" }]}>
            <Text style={[styles.menuIcon, { color: "#2196F3" }]}>person</Text>
          </View>
          <Text style={styles.menuLabel}>Thông tin cá nhân</Text>
          <Text style={styles.menuArrow}>chevron_right</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => onNavigate("sessions")}
        >
          <View style={[styles.menuIconBox, { backgroundColor: "#E8F5E9" }]}>
            <Text style={[styles.menuIcon, { color: "#4CAF50" }]}>devices</Text>
          </View>
          <Text style={styles.menuLabel}>Quản lý thiết bị</Text>
          <Text style={styles.menuArrow}>chevron_right</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.menuItem} onPress={handleLogoutPress}>
          <View style={[styles.menuIconBox, { backgroundColor: "#FFEBEE" }]}>
            <Text style={[styles.menuIcon, { color: "#F44336" }]}>logout</Text>
          </View>
          <Text style={[styles.menuLabel, { color: "#F44336" }]}>
            Đăng xuất
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Tài liệu & Files</Text>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 100 }}>
        {conversationFiles.length === 0 ? (
          <Text style={styles.friendStatus}>
            Chưa có tệp nào trong cuộc hội thoại hiện tại.
          </Text>
        ) : (
          conversationFiles.slice(0, 10).map((item, index) => (
            <TouchableOpacity
              key={`history-${index}`}
              style={styles.fileHistoryItem}
              onPress={() => Linking.openURL(item.dataUrl)}
            >
              <Text style={styles.fileHistoryIcon}>
                {getFileIcon(item.mimeType, item.name)}
              </Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.fileHistoryName}>
                  {item.name}
                </Text>
                <Text style={styles.fileHistoryMeta}>
                  {formatFileSize(item.size)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  return (
    <>
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent={true}
      />
      {activeTab !== "contacts" && !selectedChat && renderHeader()}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.content, selectedChat && { paddingBottom: Platform.OS === 'ios' ? 8 : 4 }]}>
          {activeTab === "chat" && renderConversationsView()}
          {activeTab === "contacts" && (
            <ContactsScreen
              user={user}
              conversations={safeConversations}
              onNavigate={onNavigate}
              onOpenDirectChat={handleOpenDirectChat}
              onOpenGroupConversation={handleOpenGroupConversation}
            />
          )}
          {activeTab === "notifications" && renderAIView()}
          {activeTab === "profile" && renderProfileView()}
        </View>

        {!selectedChat && (
          <View style={[
            styles.floatingTabBar, 
            Platform.OS === 'ios' && { 
              paddingBottom: Math.max(insets.bottom, 12),
              height: 60 + Math.max(insets.bottom, 12)
            }
          ]}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("chat")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "chat" && styles.tabIconActive,
                ]}
              >
                chat
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "chat" && styles.tabLabelActive,
                ]}
              >
                Tin nhắn
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("contacts")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "contacts" && styles.tabIconActive,
                ]}
              >
                contact_page
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "contacts" && styles.tabLabelActive,
                ]}
              >
                Danh bạ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("notifications")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "notifications" && styles.tabIconActive,
                ]}
              >
                notifications
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "notifications" && styles.tabLabelActive,
                ]}
              >
                Thông báo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("profile")}
            >
              <Text
                style={[
                  styles.tabIcon,
                  activeTab === "profile" && styles.tabIconActive,
                ]}
              >
                person
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === "profile" && styles.tabLabelActive,
                ]}
              >
                Cá nhân
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {showContactPicker && (
        <Pressable style={styles.overlay} onPress={() => setShowContactPicker(false)}>
          <Pressable
            style={styles.actionSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.contactPickerTitle}>Chia sẻ danh thiếp</Text>
            <ScrollView style={styles.contactPickerList}>
              {acceptedFriends.map((email) => {
                const profile = userProfiles[email] || {};
                const displayName = profile.fullName || profile.fullname || email;
                const avatar = profile.avatarUrl || profile.urlAvatar || getDisplayAvatar(email);
                return (
                  <TouchableOpacity
                    key={`card-${email}`}
                    style={styles.contactPickerItem}
                    onPress={() => sendContactCard(email)}
                  >
                    <Image source={{ uri: avatar }} style={styles.contactPickerAvatar} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactPickerName} numberOfLines={1}>{displayName}</Text>
                      <Text style={styles.contactPickerEmail} numberOfLines={1}>{email}</Text>
                    </View>
                    <Text style={styles.contactPickerSend}>Gửi</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      <Modal visible={!!actionMessage} transparent animationType="fade" onRequestClose={closeMessageAction}>
        <Pressable style={styles.overlay} onPress={closeMessageAction}>
          <View
            style={styles.actionSheet}
            onStartShouldSetResponder={() => true}
            onResponderRelease={(e) => e.stopPropagation()}
          >
            {/* Reactions Bar - Premium Design */}
            <View style={styles.reactionBar}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={`react-${emoji}`}
                  style={[styles.reactionOption, { padding: 6 }]}
                  onPress={() => toggleReaction(actionMessage, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionGrid}>
              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => startReply(actionMessage)}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#f0f7ff' }]}>
                  <Text style={[styles.actionIcon, { color: Colors.primary }]}>reply</Text>
                </View>
                <Text style={styles.actionText}>Trả lời</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => copyToClipboard(actionMessage?.content)}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#f0fff4' }]}>
                  <Text style={[styles.actionIcon, { color: '#22c55e' }]}>content_copy</Text>
                </View>
                <Text style={styles.actionText}>Sao chép</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => startForward(actionMessage)}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#fff7ed' }]}>
                  <Text style={[styles.actionIcon, { color: '#f97316' }]}>forward</Text>
                </View>
                <Text style={styles.actionText}>Chuyển tiếp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={() => pinMessage(actionMessage)}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.actionIcon, { color: '#d97706' }]}>push_pin</Text>
                </View>
                <Text style={styles.actionText}>{actionMessage?.pinned ? 'Bỏ ghim' : 'Ghim'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionList}>
              {actionMessage?.senderId === user?.email && !actionMessage?.recalled && (
                <TouchableOpacity
                  style={styles.actionListItem}
                  onPress={() => recallMessage(actionMessage.id)}
                >
                  <Text style={styles.actionListIcon}>history_toggle_off</Text>
                  <Text style={[styles.actionListText, { color: '#ef4444' }]}>
                    Thu hồi tin nhắn
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionListItem}
                onPress={() => deleteMessageForMe(actionMessage?.id)}
              >
                <Text style={[styles.actionListIcon, { color: '#ef4444' }]}>delete</Text>
                <Text style={[styles.actionListText, { color: '#ef4444' }]}>
                  Xóa ở phía tôi
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>

      {/* === GIF PICKER MODAL === */}
      <Modal visible={showGifPicker} transparent animationType="slide" onRequestClose={() => setShowGifPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowGifPicker(false)}>
          <Pressable style={[styles.actionSheet, { height: '70%' }]} onPress={e => e.stopPropagation()}>
            <Text style={styles.contactPickerTitle}>Chọn GIF</Text>
            <View style={{ flexDirection: 'row', padding: 10, gap: 8 }}>
              <TextInput
                value={gifSearchQuery}
                onChangeText={setGifSearchQuery}
                placeholder="Tìm GIF..."
                style={[styles.composerInput, { flex: 1, borderWidth: 1, borderColor: '#dde3ea', borderRadius: 12, paddingHorizontal: 12, height: 38 }]}
                returnKeyType="search"
                onSubmitEditing={() => searchGif(gifSearchQuery)}
              />
              <TouchableOpacity onPress={() => searchGif(gifSearchQuery)} style={[styles.sendButton, { borderRadius: 12, paddingHorizontal: 16 }]}>
                <Text style={styles.sendButtonText}>search</Text>
              </TouchableOpacity>
            </View>
            {gifLoading ? (
              <ActivityIndicator color="#0058bc" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={gifResults}
                numColumns={2}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 8, gap: 8 }}
                columnWrapperStyle={{ gap: 8 }}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => sendGif(item.url)} style={{ flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f0f2f5' }}>
                    <Image source={{ uri: item.preview }} style={{ width: '100%', aspectRatio: 1.5, borderRadius: 10 }} resizeMode="cover" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#8a9099', marginTop: 20 }}>Nhấn Search để tìm GIF</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* === STICKER PICKER MODAL === */}
      <Modal visible={showStickerPicker} transparent animationType="slide" onRequestClose={() => setShowStickerPicker(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowStickerPicker(false)}>
          <Pressable style={[styles.actionSheet, { maxHeight: '60%' }]} onPress={e => e.stopPropagation()}>
            <Text style={styles.contactPickerTitle}>Chọn Sticker</Text>
            {STICKER_PACKS.map(pack => (
              <View key={pack.id}>
                <Text style={{ paddingHorizontal: 16, paddingVertical: 8, fontWeight: 'bold', color: '#3c4a5a', fontSize: 13 }}>{pack.name}</Text>
                <FlatList
                  data={pack.stickers}
                  numColumns={4}
                  keyExtractor={(url, i) => `${pack.id}-${i}`}
                  contentContainerStyle={{ paddingHorizontal: 8 }}
                  columnWrapperStyle={{ gap: 4 }}
                  scrollEnabled={false}
                  renderItem={({ item: url }) => (
                    <TouchableOpacity onPress={() => sendSticker(url)} style={{ flex: 1, padding: 4, alignItems: 'center' }}>
                      <Image source={{ uri: url }} style={{ width: 64, height: 64 }} resizeMode="contain" />
                    </TouchableOpacity>
                  )}
                />
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f7f9fb" },
  keyboardAvoidingContainer: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: 16 },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerAvatar: { width: 40, height: 40 },
  avatarImage: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  avatarInitial: { color: "#fff", fontWeight: "700", fontSize: 18 },
  searchContainer: {
    flex: 1,
    height: 42,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  searchIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#fff",
    marginRight: 8,
  },
  searchInput: { flex: 1, color: "#fff", ...Typography.body, fontSize: 15 },
  searchActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    marginLeft: 8,
  },
  searchActionIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 18,
    color: "#fff",
  },
  iconButton: { padding: 6 },
  headerIconText: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#fff",
  },

  content: { flex: 1, paddingBottom: 92 },
  scrollContainer: { flex: 1 },

  sectionHeader: { padding: 16, paddingBottom: 8 },
  sectionTitle: { ...Typography.heading, fontSize: 18, color: "#00418f" },

  chatList: { paddingBottom: 110 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: Platform.OS === "android" ? 1 : 0.5,
    borderBottomColor: "#eceef0",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginRight: 14,
    backgroundColor: "#e0e3e5",
  },
  chatInfo: { flex: 1 },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  chatName: {
    ...Typography.heading,
    fontSize: 15,
    color: "#191c1e",
    flex: 1,
    marginRight: 8,
  },
  chatTime: { ...Typography.body, fontSize: 12, color: "#727784" },
  lastMsg: { ...Typography.body, fontSize: 13, color: "#727784" },

  chatPane: { flex: 1, backgroundColor: "#f7f9fb" },
  chatPaneHeader: {
    height: 58,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e8ecf0",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatPaneBack: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 26,
    color: "#00418f",
  },
  chatPaneAvatar: { width: 38, height: 38, borderRadius: 19 },
  chatPaneName: { ...Typography.heading, fontSize: 15, color: "#191c1e" },
  chatPaneSub: { ...Typography.body, fontSize: 12, color: "#727784" },

  pinStrip: { paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  pinItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e6f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 8,
  },
  pinIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 16,
    color: "#0058bc",
  },
  pinText: { flex: 1, ...Typography.body, fontSize: 12, color: "#2f3a4a" },
  pinUnpin: { ...Typography.label, fontSize: 11, color: "#0058bc" },

  messagesContainer: { flex: 1 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  messageRowMe: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  messageBubble: {
    maxWidth: "78%",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
  },
  messageBubbleMe: { backgroundColor: "#dfefff", borderColor: "#c8dcff" },
  messageBubbleOther: { backgroundColor: "#fff", borderColor: "#e3e8f0" },
  messageText: { ...Typography.body, fontSize: 14, color: "#1f2631" },
  recalledText: { fontStyle: "italic", opacity: 0.72 },
  replyBlock: {
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "#d9e1f0",
    borderRadius: 8,
    padding: 6,
    marginBottom: 6,
  },
  replySender: { ...Typography.label, fontSize: 11, color: "#0058bc" },
  replyContent: { ...Typography.body, fontSize: 12, color: "#5f6570" },
  messageImage: {
    width: 190,
    height: 190,
    borderRadius: 10,
    backgroundColor: "#e8edf5",
  },
  messageFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#dfe5ef",
    borderRadius: 10,
    padding: 8,
  },
  messageFileIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#51617a",
  },
  messageFileName: { ...Typography.label, fontSize: 12, color: "#1f2631" },
  messageFileSize: { ...Typography.body, fontSize: 11, color: "#7a8391" },

  replyComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  replyComposerTitle: { ...Typography.label, fontSize: 12, color: "#0058bc" },
  replyComposerText: { ...Typography.body, fontSize: 12, color: "#6e7683" },
  replyComposerCancel: {
    ...Typography.heading,
    fontSize: 16,
    color: "#6e7683",
  },

  attachmentStrip: { maxHeight: 56, backgroundColor: "#fff" },
  attachmentChip: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f4f7fb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dfe5ef",
  },
  attachmentIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 16,
    color: "#5b6b84",
  },
  attachmentName: {
    ...Typography.body,
    fontSize: 12,
    maxWidth: 150,
    color: "#2f3a4a",
  },
  attachmentRemove: { ...Typography.heading, fontSize: 12, color: "#677389" },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: Platform.OS === "ios" ? 14 : 8,
  },
  composerAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5fa",
  },
  composerActionIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#52627f",
  },
  composerInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#dfe5ef",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    ...Typography.body,
    fontSize: 14,
    color: "#1f2631",
    backgroundColor: "#fff",
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0058bc",
  },
  sendButtonText: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#fff",
  },

  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: Platform.OS === "android" ? 1 : 0.5,
    borderBottomColor: "#eceef0",
  },
  friendAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 16 },
  friendInfo: { flex: 1 },
  friendName: { ...Typography.heading, fontSize: 16, color: "#191c1e" },
  friendStatus: { ...Typography.body, fontSize: 12, color: "#727784" },
  friendAction: { padding: 8 },
  friendActionIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#00418f",
  },

  searchResultCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0e6f0",
  },
  searchResultHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  searchResultAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: 10,
    backgroundColor: "#e8edf5",
  },
  searchResultName: { ...Typography.heading, fontSize: 15, color: "#1f2631" },
  searchResultEmail: { ...Typography.body, fontSize: 12, color: "#6d7685" },
  searchResultHint: { ...Typography.body, fontSize: 12, color: "#5f697a" },
  searchResultPrimaryButton: {
    backgroundColor: "#0058bc",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
  },
  searchResultPrimaryText: { ...Typography.label, fontSize: 13, color: "#fff" },

  pendingSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e0e6f0",
    overflow: "hidden",
  },
  pendingSectionTitle: {
    ...Typography.heading,
    fontSize: 14,
    color: "#1f2631",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  pendingItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf1f7",
  },
  pendingName: { ...Typography.heading, fontSize: 14, color: "#1f2631" },
  pendingEmail: { ...Typography.body, fontSize: 11, color: "#6d7685" },
  pendingAcceptButton: {
    backgroundColor: "#0058bc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pendingAcceptText: { ...Typography.label, fontSize: 12, color: "#fff" },

  centeredView: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  aiIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 80,
    color: "#00418f",
    marginBottom: 20,
    opacity: 0.8,
  },
  aiTitle: {
    ...Typography.heading,
    fontSize: 24,
    color: "#191c1e",
    marginBottom: 8,
  },
  aiSubtitle: {
    ...Typography.body,
    fontSize: 16,
    color: "#727784",
    textAlign: "center",
  },

  profileHeader: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eceef0",
  },
  largeAvatarBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#0058bc",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  largeAvatarImage: { width: 100, height: 100, borderRadius: 50 },
  profileName: {
    ...Typography.heading,
    fontSize: 22,
    color: "#191c1e",
    marginBottom: 4,
  },
  profileEmail: { ...Typography.body, fontSize: 14, color: "#727784" },
  menuContainer: { padding: 16, paddingTop: 24 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  menuIcon: { fontFamily: "Material Symbols Outlined", fontSize: 22 },
  menuLabel: { flex: 1, ...Typography.heading, fontSize: 16, color: "#191c1e" },
  menuArrow: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#c2c6d5",
  },
  divider: {
    height: 1,
    backgroundColor: "#eceef0",
    marginVertical: 12,
    marginHorizontal: 8,
  },

  fileHistoryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f6",
  },
  fileHistoryIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#5a6781",
  },
  fileHistoryName: { ...Typography.label, fontSize: 13, color: "#1f2631" },
  fileHistoryMeta: { ...Typography.body, fontSize: 11, color: "#7a8391" },

  floatingTabBar: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 24 : 16,
    left: 20,
    right: 20,
    height: 64,
    backgroundColor: "#fff",
    borderRadius: 32,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    elevation: 12,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  tabIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#727784",
    marginBottom: 4,
  },
  tabIconActive: { color: "#00418f", fontVariationSettings: "'FILL' 1" },
  tabLabel: { ...Typography.label, fontSize: 10, color: "#727784" },
  tabLabelActive: { color: "#00418f" },

  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 12,
    paddingBottom: 20,
  },
  reactionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 10,
    paddingVertical: 6,
  },
  reactionEmoji: { fontSize: 24 },
  reactionSummaryRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  reactionSummaryChip: {
    borderWidth: 1,
    borderColor: "#dce4ef",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#fff",
  },
  reactionSummaryText: {
    ...Typography.body,
    fontSize: 11,
    color: "#2f3a4a",
  },
  messageMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  messageMetaRowMe: {
    justifyContent: 'flex-end',
  },
  messageTime: {
    ...Typography.body,
    fontSize: 10,
    color: '#7a8391',
    fontWeight: '600',
  },
  actionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  actionText: { ...Typography.body, fontSize: 15, color: "#1f2631" },

  // ── LOCATION CARD ──────────────────────────────────────────
  locationCard: {
    marginTop: 8,
    backgroundColor: '#e8f4ff',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  locationCardLabel: { ...Typography.heading, fontSize: 13, color: '#0058bc' },
  locationCardCoords: { ...Typography.body, fontSize: 11, color: '#5f697a' },
  locationCardText: { ...Typography.body, fontSize: 12, color: '#3c4a5a' },
  locationCardBtn: {
    marginTop: 6,
    backgroundColor: '#0058bc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  locationCardBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  // ── PENDING VOICE BAR ───────────────────────────────────────
  pendingVoiceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#f7f9fb',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
  },
  pendingVoiceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dceeff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingVoiceIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#0058bc',
  },
  pendingVoiceWave: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  pendingVoiceBar2: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#0058bc',
    opacity: 0.6,
  },
  pendingVoiceDuration: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: '700',
    color: '#3c4a5a',
    minWidth: 32,
  },
  pendingVoiceCancelBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fce4e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingVoiceCancelIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#e53935',
  },
  pendingVoiceSendBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#0058bc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingVoiceSendText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  // ── RECORDING INLINE ────────────────────────────────────────
  recordingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  recordingTimer: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e53935',
    minWidth: 34,
  },
  recordingStopBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fce4e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingStopIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#e53935',
  },

  // ── FEATURE TOOLBAR ─────────────────────────────────────────
  featureToolbar: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f7f9fb',
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    position: 'relative',
  },
  featureBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dde3ea',
  },
  featureBtnIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#0058bc',
  },

  // ── LOCATION MENU ───────────────────────────────────────────
  locationMenu: {
    position: 'absolute',
    bottom: 44,
    left: 80,
    backgroundColor: '#fff',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
    minWidth: 220,
    overflow: 'hidden',
  },
  locationMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  locationMenuText: { ...Typography.body, fontSize: 14, color: '#1f2631' },

  // ── CONTACT PICKER ──────────────────────────────────────────
  contactPickerTitle: {
    ...Typography.heading,
    fontSize: 18,
    color: '#1f2631',
    marginBottom: 16,
    textAlign: 'center',
  },
  contactPickerList: {
    maxHeight: 300,
  },
  contactPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f2f5',
  },
  contactPickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  contactPickerName: {
    ...Typography.heading,
    fontSize: 15,
    color: '#1f2631',
    marginBottom: 2,
  },
  contactPickerEmail: {
    ...Typography.body,
    fontSize: 12,
    color: '#6d7685',
  },
  contactPickerSend: {
    ...Typography.label,
    fontSize: 14,
    color: '#0058bc',
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});

