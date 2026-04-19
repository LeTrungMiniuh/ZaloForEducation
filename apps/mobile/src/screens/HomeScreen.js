import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  Pressable,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Typography } from "../constants/Theme";
import Alert from "../utils/Alert";
import { useAuth } from "../context/AuthContext";
import { apiRequest, API_URL } from "../utils/api";
import SocketService from "../utils/socket";
import { useChatStore } from "../store/chatStore";
import ContactsScreen from "./ContactsScreen";
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
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [friendships, setFriendships] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearchEmail, setFriendSearchEmail] = useState("");
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [friendSearchResult, setFriendSearchResult] = useState(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  const [conversationPreviewMap, setConversationPreviewMap] = useState({});
  const [messageReactions, setMessageReactions] = useState({});
  const [replyTarget, setReplyTarget] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [userProfiles, setUserProfiles] = useState({});

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
    if (Array.isArray(message.media) && message.media.length > 0)
      return "[Ảnh/Video]";
    if (Array.isArray(message.files) && message.files.length > 0)
      return "[Tệp đính kèm]";
    return String(message.content || "Tin nhắn");
  };

  const getConversationPreview = (conv) => {
    const seeded = conversationPreviewMap[conv.id];
    if (seeded) return seeded;
    const raw = String(conv?.lastMessage || "");
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

  const upsertConversationLastMessage = (convId, content) => {
    setConversations((prev) => {
      const index = prev.findIndex((conv) => conv.id === convId);
      if (index === -1) return prev;

      const next = [...prev];
      const target = next[index];
      const updated = {
        ...target,
        lastMessage: content || target.lastMessage || "",
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
    if (!user?.email) return;
    setLoadingConversations(true);
    try {
      const res = await chatGet("/conversations");
      const normalized = (Array.isArray(res?.data) ? res.data : []).map(
        normalizeConversation,
      );
      setConversations(normalized);

      const previewSeed = {};
      normalized.forEach((conv) => {
        const raw = String(conv.lastMessage || "");
        if (!raw) previewSeed[conv.id] = "Chưa có tin nhắn";
        else if (!raw.startsWith("MSG#")) previewSeed[conv.id] = raw;
      });
      setConversationPreviewMap(previewSeed);

      normalized
        .filter((conv) => String(conv.lastMessage || "").startsWith("MSG#"))
        .forEach(async (conv) => {
          const latestRes = await chatGet(
            `/conversations/${encodeURIComponent(conv.id)}/messages`,
            { limit: 1 },
          );
          const latestMessages =
            latestRes?.messages || latestRes?.data?.messages || [];
          const latest = latestMessages[latestMessages.length - 1];
          setConversationPreviewMap((prev) => ({
            ...prev,
            [conv.id]: latest ? getMessagePreview(latest) : "Chưa có tin nhắn",
          }));
        });
    } catch (err) {
      console.error("Fetch conversations failed", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  const fetchFriendships = async () => {
    if (!user?.email) return;
    setLoadingFriends(true);
    try {
      const res = await chatGet("/friends");
      setFriendships(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      console.error("Fetch friends failed", err);
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
    setConversationPreviewMap((prev) => ({
      ...prev,
      [selectedChat.id]: "Tin nhắn đã được thu hồi",
    }));
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

  const sendMessage = async () => {
    if (
      (!inputText.trim() && attachments.length === 0) ||
      !selectedChat ||
      sending
    )
      return;

    setSending(true);
    try {
      const trimmedInput = inputText.trim();
      const currentAttachments = [...attachments];

      // Reset UI early
      setInputText("");
      setAttachments([]);
      setReplyTarget(null);

      if (currentAttachments.length > 0) {
        // --- MULTIMEDIA FLOW ---
        const { compressImage } = await import("../utils/imageUtils");

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
      }

      // Update Preview
      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: trimmedInput || "[Đa phương tiện]",
      }));
      upsertConversationLastMessage(
        selectedChat.id,
        trimmedInput || "[Đa phương tiện]",
      );
    } catch (err) {
      console.error("Send message failed", err);
      Alert.alert("Lỗi", "Không gửi được tin nhắn. Vui lòng thử lại.");
    } finally {
      setSending(false);
    }
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
        setConversationPreviewMap((prev) => ({
          ...prev,
          [incomingConvId]: getMessagePreview(msg),
        }));
        upsertConversationLastMessage(incomingConvId, getMessagePreview(msg));
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

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("presence_update", handlePresenceUpdate);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("presence_update", handlePresenceUpdate);
    };
  }, [addMessage]);

  useEffect(() => {
    if (!messagesScrollRef.current || !selectedChat?.id) return;

    const prev = scrollStateRef.current;
    const currentCount = safeMessages.length;
    const switchedConversation = prev.convId !== selectedChat.id;
    const batchLoaded = currentCount > prev.messageCount + 1;
    const shouldAnimate =
      prev.hasMounted && !switchedConversation && !batchLoaded;

    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd?.({ animated: shouldAnimate });
    }, shouldAnimate ? 60 : 0);

    scrollStateRef.current = {
      hasMounted: true,
      convId: selectedChat.id,
      messageCount: currentCount,
    };
  }, [selectedChat?.id, safeMessages.length]);

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
      style={[styles.header, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.headerContent}>
        <TouchableOpacity
          style={styles.headerAvatar}
          onPress={() => onNavigate("profile")}
        >
          {user?.avatarUrl ? (
            <Image
              key={`header-avatar-${profileVersion}`}
              source={{ uri: `${user.avatarUrl}?v=${profileVersion}` }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {user?.fullName ? user.fullName[0].toUpperCase() : "U"}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>search</Text>
          <TextInput
            placeholder="Tìm email bạn bè..."
            style={styles.searchInput}
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={friendSearchEmail}
            onChangeText={setFriendSearchEmail}
            onSubmitEditing={handleSearchFriend}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity
            style={styles.searchActionButton}
            onPress={handleSearchFriend}
          >
            {friendSearchLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.searchActionIcon}>person_search</Text>
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => onNavigate("settings")}
        >
          <Text style={styles.headerIconText}>settings</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );

  const ConversationsView = () => {
    if (selectedChat) {
      return (
        <View style={styles.chatPane}>
          <View style={styles.chatPaneHeader}>
            <TouchableOpacity onPress={() => setActiveConversation(null)}>
              <Text style={styles.chatPaneBack}>arrow_back</Text>
            </TouchableOpacity>
            <Image
              source={{
                uri:
                  selectedChat.type === "direct"
                    ? getDisplayAvatar(selectedChat.partner)
                    : selectedChat.avatar,
              }}
              style={styles.chatPaneAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.chatPaneName} numberOfLines={1}>
                {selectedChat.type === "direct"
                  ? getDisplayName(selectedChat.partner)
                  : selectedChat.name}
              </Text>
              <Text style={styles.chatPaneSub}>Đang trò chuyện</Text>
            </View>
          </View>

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

          <ScrollView
            ref={messagesScrollRef}
            style={styles.messagesContainer}
            contentContainerStyle={{ padding: 12, gap: 10 }}
          >
            {safeMessages.map((message, index) => {
              const isMe = message.senderId === user?.email;
              const reactionSummary = getReactionSummary(message);
              const contactCard = normalizeContactCard(message);
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

                    {!message.recalled && contactCard && (
                      <View style={styles.contactCardBox}>
                        <Text style={styles.contactCardLabel}>Danh thiếp liên hệ</Text>
                        <View style={styles.contactCardHeader}>
                          <Image
                            source={{ uri: contactCard.avatarUrl || getDisplayAvatar(contactCard.email) }}
                            style={styles.contactCardAvatar}
                          />
                          <View style={{ flex: 1 }}>
                            <Text numberOfLines={1} style={styles.contactCardName}>
                              {contactCard.fullName || contactCard.email}
                            </Text>
                            <Text numberOfLines={1} style={styles.contactCardEmail}>
                              {contactCard.email}
                            </Text>
                            {contactCard.phone ? (
                              <Text numberOfLines={1} style={styles.contactCardPhone}>
                                {contactCard.phone}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {contactCard.email !== user?.email && (
                          <TouchableOpacity
                            style={styles.contactCardAction}
                            onPress={() => handleOpenDirectChat(contactCard.email)}
                          >
                            <Text style={styles.contactCardActionText}>Nhắn tin</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {(Array.isArray(message.media) ||
                      Array.isArray(message.files)) && (
                      <View style={{ marginTop: 8, gap: 6 }}>
                        {(Array.isArray(message.media) ? message.media : []).map((item, index) => {
                          const file = normalizeAttachment(item);
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
                          return (
                            <Image
                              key={`m-${message.id}-${index}`}
                              source={{ uri: file.dataUrl }}
                              style={styles.messageImage}
                            />
                          );
                        })}
                        {(Array.isArray(message.files)
                          ? message.files
                          : []
                        ).map((item, index) => {
                          const file = normalizeAttachment(item);
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
                                <Text
                                  numberOfLines={1}
                                  style={styles.messageFileName}
                                >
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
            })}
          </ScrollView>

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

          <View style={styles.composer}>
            <TouchableOpacity
              onPress={pickImages}
              style={styles.composerAction}
            >
              <Text style={styles.composerActionIcon}>image</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openContactPicker}
              style={styles.composerAction}
            >
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
        </View>
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
      <ScrollView style={styles.scrollContainer}>
        <View style={styles.chatList}>
          <Text
            style={[styles.sectionTitle, { marginLeft: 20, marginBottom: 10 }]}
          >
            Tin nhắn nội bộ
          </Text>
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
            return (
              <TouchableOpacity
                key={chat.id}
                style={styles.chatItem}
                onPress={() => handleSelectChat(chat)}
              >
                <Image source={{ uri: chatAvatar }} style={styles.avatar} />
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {chatName}
                    </Text>
                    <Text style={styles.chatTime}>
                      {chat.updatedAt
                        ? new Date(chat.updatedAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "--:--"}
                    </Text>
                  </View>
                  <Text style={styles.lastMsg} numberOfLines={1}>
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

  const FriendsView = () => (
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

  const AIView = () => (
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0058bc"
        translucent={false}
      />
      {activeTab !== "contacts" && renderHeader()}

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 12 : 0}
      >
        <View style={styles.content}>
          {activeTab === "chat" && <ConversationsView />}
          {activeTab === "contacts" && (
            <ContactsScreen
              user={user}
              conversations={safeConversations}
              onNavigate={onNavigate}
              onOpenDirectChat={handleOpenDirectChat}
              onOpenGroupConversation={handleOpenGroupConversation}
            />
          )}
          {activeTab === "notifications" && <AIView />}
          {activeTab === "profile" && renderProfileView()}
        </View>

        <View style={styles.floatingTabBar}>
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
              Chat
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
              Contacts
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
              Notifications
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
              Profile
            </Text>
          </TouchableOpacity>
        </View>
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

      {actionMessage && (
        <Pressable style={styles.overlay} onPress={closeMessageAction}>
          <Pressable
            style={styles.actionSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.reactionRow}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={`react-${emoji}`}
                  onPress={() => toggleReaction(actionMessage, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => pinMessage(actionMessage)}
            >
              <Text style={styles.actionText}>Ghim tin nhắn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => startReply(actionMessage)}
            >
              <Text style={styles.actionText}>Trả lời</Text>
            </TouchableOpacity>
            {actionMessage.senderId === user?.email &&
              !actionMessage.recalled && (
                <TouchableOpacity
                  style={styles.actionItem}
                  onPress={() => recallMessage(actionMessage.id)}
                >
                  <Text style={[styles.actionText, { color: "#e53935" }]}>
                    Thu hồi
                  </Text>
                </TouchableOpacity>
              )}
          </Pressable>
        </Pressable>
      )}
    </SafeAreaView>
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
  contactCardBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#cfe0ff",
    borderRadius: 12,
    backgroundColor: "#f8fbff",
    padding: 10,
    gap: 8,
  },
  contactCardLabel: {
    ...Typography.label,
    fontSize: 10,
    color: "#0058bc",
    textTransform: "uppercase",
  },
  contactCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  contactCardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8edf5",
  },
  contactCardName: { ...Typography.heading, fontSize: 13, color: "#1f2631" },
  contactCardEmail: { ...Typography.body, fontSize: 11, color: "#5f697a" },
  contactCardPhone: { ...Typography.body, fontSize: 11, color: "#6d7685" },
  contactCardAction: {
    alignSelf: "flex-start",
    backgroundColor: "#0058bc",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  contactCardActionText: { ...Typography.label, fontSize: 12, color: "#fff" },

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
  contactPickerTitle: {
    ...Typography.heading,
    fontSize: 16,
    color: "#1f2631",
    marginBottom: 10,
  },
  contactPickerList: {
    maxHeight: 360,
  },
  contactPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
    paddingVertical: 10,
  },
  contactPickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8edf5",
  },
  contactPickerName: {
    ...Typography.heading,
    fontSize: 14,
    color: "#1f2631",
  },
  contactPickerEmail: {
    ...Typography.body,
    fontSize: 11,
    color: "#6d7685",
  },
  contactPickerSend: {
    ...Typography.label,
    fontSize: 12,
    color: "#0058bc",
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
});
