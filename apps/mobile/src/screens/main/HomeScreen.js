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
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import styles from './style/HomeScreen.styles';
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
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
import { Modal } from 'react-native';
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

  const [activeTab, setActiveTab] = useState(initialTab || "messages");
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
  const [userProfiles, setUserProfiles] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [isFriendRequestsModalOpen, setIsFriendRequestsModalOpen] = useState(false);
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);

  const typingTimeoutRef = useRef(null);

  const messagesScrollRef = useRef(null);
  const profileLoadingRef = useRef(new Set());
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

  const getMessagePreview = (message) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";
    if (Array.isArray(message.media) && message.media.length > 0)
      return "[Ảnh/Video]";
    if (Array.isArray(message.files) && message.files.length > 0)
      return "[Tệp đính kèm]";
    return String(message.content || "Tin nhắn");
  };

  const getConversationPreview = (conv) => {
    const raw = String(conv?.lastMessageContent || conv?.lastMessage || "");
    if (!raw) return "Chưa có tin nhắn";
    if (raw.startsWith("MSG#")) return "Đang tải nội dung...";
    return raw;
  };

  const normalizeConversation = (conv) => {
    if (conv?.type !== "direct") return conv;
    const partner =
      conv.partner ||
      (Array.isArray(conv.members)
        ? conv.members.find((member) => member !== user?.email)
        : undefined);

    return {
      ...conv,
      partner,
      name: conv.name || getDisplayName(partner),
      avatar: conv.avatar || getDisplayAvatar(partner),
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
        .map(normalizeConversation)
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
    const normalizedChat = normalizeConversation(chat);
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
      quality: 0.8,
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
            if (fileToUpload.type?.startsWith("image/")) {
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
            return uploadRes.data;
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
  }, [addMessage, selectedChat?.id]);

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
              return (
                <MessageBubble
                  message={message}
                  isMe={isMe}
                  userProfile={{ avatarUrl: getDisplayAvatar(message.senderId) }}
                  onLongPress={setActionMessage}
                  onReaction={toggleReaction}
                  onReply={startReply}
                />
              );
            }}
            contentContainerStyle={{ 
              paddingHorizontal: 12, 
              paddingTop: 50, 
              paddingBottom: 20 
            }}
            showsVerticalScrollIndicator={false}
            maintainVisibleContentPosition={{
              minIndexForVisible: 0,
            }}
          />

          <ChatInput
            key={selectedChat.id} // Force remount on chat change to trigger autoFocus
            onSendMessage={handleChatSend}
            replyTarget={replyTarget}
            onClearReply={() => setReplyTarget(null)}
            onTyping={() => {
              if (SocketService.socket && selectedChat.id) {
                if (!typingTimeoutRef.current) {
                  SocketService.socket.emit("typing", { convId: selectedChat.id, isTyping: true });
                  typingTimeoutRef.current = setTimeout(() => {
                    typingTimeoutRef.current = null;
                  }, 2000);
                }
              }
            }}
          />
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
    <View style={styles.safeArea}>
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

      {actionMessage && (
        <Pressable style={styles.overlay} onPress={closeMessageAction}>
          <Pressable
            style={styles.actionSheet}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Reactions Bar - Premium Design */}
            <View style={styles.reactionBar}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={`react-${emoji}`}
                  style={styles.reactionOption}
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
                onPress={() => copyToClipboard(actionMessage.content)}
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
                <Text style={styles.actionText}>{actionMessage.pinned ? 'Bỏ ghim' : 'Ghim'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionList}>
              {actionMessage.senderId === user?.email && !actionMessage.recalled && (
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
                onPress={() => deleteMessageForMe(actionMessage.id)}
              >
                <Text style={[styles.actionListIcon, { color: '#ef4444' }]}>delete</Text>
                <Text style={[styles.actionListText, { color: '#ef4444' }]}>
                  Xóa ở phía tôi
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      )}

      {/* Forward Modal */}
      <Modal
        visible={isForwardModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsForwardModalOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsForwardModalOpen(false)}
        >
          <View style={styles.forwardSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chuyển tiếp đến...</Text>
              <TouchableOpacity onPress={() => setIsForwardModalOpen(false)}>
                <Text style={styles.closeIcon}>close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.forwardList}>
              {safeConversations.map((conv) => (
                <TouchableOpacity
                  key={conv.id}
                  style={styles.forwardItem}
                  onPress={() => handleForwardSelect(conv.id)}
                >
                  <Image
                    style={styles.forwardAvatar}
                  />
                  <Text style={styles.forwardName} numberOfLines={1}>
                    {conv.type === 'direct' ? getDisplayName(conv.partner) : conv.name}
                  </Text>
                  <Text style={styles.forwardSendIcon}>send</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Quick Action Menu (+) */}
      <Modal
        visible={isAddMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsAddMenuOpen(false)}
      >
        <Pressable 
          style={styles.addMenuOverlay} 
          onPress={() => setIsAddMenuOpen(false)}
        >
          <View style={[styles.addMenuDropdown, { top: insets.top + 50 }]}>
            <View style={styles.addMenuArrow} />
            
            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>person_add</Text>
              <Text style={styles.addMenuLabel}>Thêm bạn</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>group_add</Text>
              <Text style={styles.addMenuLabel}>Tạo nhóm</Text>
            </TouchableOpacity>

            <View style={styles.addMenuDivider} />

            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>folder_shared</Text>
              <Text style={styles.addMenuLabel}>My Documents</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addMenuItem}>
              <Text style={styles.addMenuIcon}>calendar_today</Text>
              <Text style={styles.addMenuLabel}>Lịch Zalo</Text>
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
