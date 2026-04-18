import React, { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProfileModal from "../components/ProfileModal";
import Swal from "sweetalert2";

type Friendship = {
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted";
};

type ReactionMap = Record<string, Record<string, string[]>>;
type UserProfile = {
  email: string;
  fullName?: string;
  fullname?: string;
  avatarUrl?: string;
};
type Attachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  fileUrl?: string;
  file?: File;
};

const REACTION_OPTIONS = ["❤️", "👍", "😂", "😮", "😢", "😡"];
const MAX_FILE_KB = 10240;
const MAX_FILE_BYTES = MAX_FILE_KB * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 8;

const getFileIcon = (mimeType?: string, fileName?: string) => {
  const lowerName = (fileName || "").toLowerCase();
  const lowerMime = (mimeType || "").toLowerCase();
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
  if (
    lowerMime.includes("zip") ||
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".rar")
  )
    return "folder_zip";
  if (lowerMime.includes("audio")) return "audio_file";
  if (lowerMime.includes("video")) return "video_file";
  if (lowerMime.startsWith("image/")) return "image";
  return "draft";
};

const formatFileSize = (size?: number) => {
  if (!size || Number.isNaN(size)) return "--";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const chatGet = async (path: string, params?: any) => {
  try {
    return await api.get(`/chat${path}`, { params });
  } catch {
    return await api.get(`/api/chat${path}`, { params });
  }
};

const chatPost = async (path: string, body: any) => {
  try {
    return await api.post(`/chat${path}`, body);
  } catch {
    return await api.post(`/api/chat${path}`, body);
  }
};

const chatPatch = async (path: string, body: any) => {
  try {
    return await api.patch(`/chat${path}`, body);
  } catch {
    return await api.patch(`/api/chat${path}`, body);
  }
};

const chatUpload = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  try {
    return await api.post("/chat/uploads", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  } catch {
    return await api.post("/api/chat/uploads", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
};

const HomePage: React.FC = () => {
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const openedDirectChatEmailRef = useRef<string | null>(null);

  // STATE MANAGEMENT giống cấu trúc Zalo
  const [activeTab, setActiveTab] = useState<
    "chat" | "contacts" | "notifications" | "cloud"
  >("chat");
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [friendSortOrder, setFriendSortOrder] = useState<"asc" | "desc">("asc");
  const [friendNotifications, setFriendNotifications] = useState<
    Array<{
      id: string;
      senderEmail: string;
      senderName: string;
      senderAvatar?: string;
      createdAt: string;
    }>
  >([]);
  const [friendActionMenu, setFriendActionMenu] = useState<{
    email: string;
    x: number;
    y: number;
  } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [messageReactions, setMessageReactions] = useState<ReactionMap>({});
  const [conversationPreviewMap, setConversationPreviewMap] = useState<
    Record<string, string>
  >({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>(
    {},
  );
  const [replyTarget, setReplyTarget] = useState<any | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    message: any;
    x: number;
    y: number;
  } | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Profile & Settings state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileLoadingRef = useRef<Set<string>>(new Set());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const upsertConversationLastMessage = (convId: string, content?: string) => {
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

  const getMessagePreview = (message: any) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";
    if (Array.isArray(message.media) && message.media.length > 0)
      return "[Hình ảnh]";
    if (Array.isArray(message.files) && message.files.length > 0)
      return "[Tệp đính kèm]";
    return String(message.content || "Tin nhắn");
  };

  const normalizeAttachment = (item: any) => {
    const name = item?.name || item?.fileName || "Tệp";
    const mimeType =
      item?.mimeType || item?.fileType || "application/octet-stream";
    const size = Number(item?.size || 0);
    const dataUrl = item?.dataUrl || item?.fileUrl || item?.url || "";
    return { name, mimeType, size, dataUrl };
  };

  const getConversationPreview = (conv: any) => {
    const seeded = conversationPreviewMap[conv.id];
    if (seeded) return seeded;
    const raw = String(conv?.lastMessage || "");
    if (!raw) return "Chưa có tin nhắn";
    if (raw.startsWith("MSG#")) return "Đang tải nội dung...";
    return raw;
  };

  const getDisplayName = (email?: string) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return user?.fullName || user?.fullname || "Bạn";
    const profile = userProfiles[email];
    return profile?.fullName || profile?.fullname || email;
  };

  const getDisplayAvatar = (email?: string) => {
    if (!email) return "/logo_blue.png";
    if (email === user?.email) return user?.avatarUrl || "/logo_blue.png";
    return userProfiles[email]?.avatarUrl || "/logo_blue.png";
  };

  const normalizeConversation = (conv: any) => {
    if (conv?.type !== "direct") return conv;
    const partner =
      conv.partner ||
      (Array.isArray(conv.members)
        ? conv.members.find((member: string) => member !== user?.email)
        : undefined);

    return {
      ...conv,
      partner,
      name: conv.name || getDisplayName(partner),
      avatar: conv.avatar || getDisplayAvatar(partner),
    };
  };

  const loadUserProfile = async (email?: string) => {
    if (!email || email === user?.email || userProfiles[email]) return;
    if (profileLoadingRef.current.has(email)) return;

    profileLoadingRef.current.add(email);
    try {
      const res = await chatGet("/friends/search", { email });
      if (res.data?.found && res.data?.user) {
        setUserProfiles((prev) => ({
          ...prev,
          [email]: res.data.user,
        }));
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      profileLoadingRef.current.delete(email);
    }
  };

  const getFriendDisplayName = (email?: string, nickname?: string) => {
    if (!email) return "Người dùng";
    if (email === user?.email) return user?.fullName || user?.fullname || "Bạn";
    const profile = userProfiles[email];
    return nickname || profile?.fullName || profile?.fullname || email;
  };

  const getFriendAvatar = (email?: string) => {
    if (!email) return "/logo_blue.png";
    if (email === user?.email) return user?.avatarUrl || "/logo_blue.png";
    return userProfiles[email]?.avatarUrl || "/logo_blue.png";
  };

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const openContextMenuForMessage = (message: any, x: number, y: number) => {
    setContextMenu({ message, x, y });
    setReactionPicker({ messageId: message.id, x, y: y - 42 });
  };

  const closeOverlays = () => {
    setContextMenu(null);
    setReactionPicker(null);
  };

  const getReactionData = (message: any) => messageReactions[message.id] || {};

  const getCurrentUserReaction = (message: any) => {
    if (!user?.email) return undefined;
    const reactions = getReactionData(message);
    return Object.entries(reactions).find(([, users]) =>
      users.includes(user.email),
    )?.[0];
  };

  const getReactionSummary = (message: any) => {
    const reactions = getReactionData(message);
    return Object.entries(reactions)
      .filter(([, users]) => users.length > 0)
      .slice(0, 3);
  };

  const handlePickFiles = async (
    event: React.ChangeEvent<HTMLInputElement>,
    acceptType: "image" | "file",
  ) => {
    const picked = Array.from(event.target.files || []);
    if (picked.length === 0) return;

    try {
      if (attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        alert(`Mỗi tin nhắn tối đa ${MAX_ATTACHMENTS_PER_MESSAGE} tệp.`);
        return;
      }

      const tooLarge = picked.find((item) => item.size > MAX_FILE_BYTES);
      if (tooLarge) {
        alert(`Tệp quá lớn. Tối đa ${MAX_FILE_KB} KB mỗi tệp.`);
        return;
      }

      const normalized =
        acceptType === "image"
          ? picked.filter((item) => item.type.startsWith("image/"))
          : picked;

      if (normalized.length === 0) {
        alert("Không tìm thấy tệp hợp lệ để gửi.");
        return;
      }

      const converted: Attachment[] = [];
      for (const file of normalized.slice(
        0,
        MAX_ATTACHMENTS_PER_MESSAGE - attachments.length,
      )) {
        const dataUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        converted.push({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
          file,
        });
      }

      setAttachments((prev) => [...prev, ...converted]);
    } catch (err) {
      console.error("Failed to process attachments", err);
      alert("Không thể xử lý tệp. Vui lòng thử lại.");
    } finally {
      event.target.value = "";
    }
  };

  const toggleReaction = async (message: any, emoji: string) => {
    if (!user?.email || !selectedChat?.id) return;
    const messageId = message.id;
    const currentEmoji = getCurrentUserReaction(message);
    const action = currentEmoji === emoji ? "remove" : "add";

    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
        {
          action: "react",
          reactAction: action,
          emoji,
          previousEmoji: currentEmoji,
        },
      );

      const updatedMessage = res.data;
      setMessages((prev) =>
        prev.map((item) => (item.id === messageId ? updatedMessage : item)),
      );
      setMessageReactions((prev) => ({
        ...prev,
        [messageId]: updatedMessage.reactions || {},
      }));

      if (socket && updatedMessage) {
        socket.emit("sendMessage", {
          convId: selectedChat.id,
          message: updatedMessage,
        });
      }
    } catch (err) {
      console.error("Failed to update reaction", err);
    } finally {
      closeOverlays();
    }
  };

  const pinMessage = async (message: any) => {
    if (!selectedChat?.id) return;
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(message.id)}`,
        { action: "pin" },
      );
      const updatedMessage = res.data;
      setMessages((prev) =>
        prev.map((item) => (item.id === message.id ? updatedMessage : item)),
      );
      if (socket && updatedMessage) {
        socket.emit("sendMessage", {
          convId: selectedChat.id,
          message: updatedMessage,
        });
      }
    } catch (err) {
      console.error("Failed to pin message", err);
    } finally {
      closeOverlays();
    }
  };

  const unpinMessage = async (messageId: string) => {
    if (!selectedChat?.id) return;
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
        { action: "unpin" },
      );
      const updatedMessage = res.data;
      setMessages((prev) =>
        prev.map((item) => (item.id === messageId ? updatedMessage : item)),
      );
      if (socket && updatedMessage) {
        socket.emit("sendMessage", {
          convId: selectedChat.id,
          message: updatedMessage,
        });
      }
    } catch (err) {
      console.error("Failed to unpin message", err);
    } finally {
      closeOverlays();
    }
  };

  const recallMessage = async (messageId: string) => {
    if (!selectedChat?.id) return;
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(messageId)}`,
        { action: "recall" },
      );
      const updatedMessage = res.data;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? updatedMessage : message,
        ),
      );

      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: "Tin nhắn đã được thu hồi",
      }));

      upsertConversationLastMessage(
        selectedChat.id,
        "Tin nhắn đã được thu hồi",
      );

      setMessageReactions((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });

      if (socket && updatedMessage) {
        socket.emit("sendMessage", {
          convId: selectedChat.id,
          message: updatedMessage,
        });
      }
    } catch (err) {
      console.error("Failed to recall message", err);
    } finally {
      closeOverlays();
    }
  };

  const startReply = (message: any) => {
    setReplyTarget({
      id: message.id,
      senderId: message.senderId,
      content: getMessagePreview(message),
    });
    closeOverlays();
  };

  // FETCH CONVERSATIONS ON LOAD
  useEffect(() => {
    if (!user?.email) return;

    const fetchConversations = async () => {
      try {
        // Fetch inbox / group matches for this user
        const res = await chatGet("/conversations");
        const normalized = (Array.isArray(res.data) ? res.data : []).map(
          normalizeConversation,
        );
        setConversations(normalized);

        const previewSeed: Record<string, string> = {};
        normalized.forEach((conv: any) => {
          const raw = String(conv.lastMessage || "");
          if (!raw) {
            previewSeed[conv.id] = "Chưa có tin nhắn";
          } else if (!raw.startsWith("MSG#")) {
            previewSeed[conv.id] = raw;
          }
        });
        setConversationPreviewMap(previewSeed);

        // Some records store lastMessage as message id (MSG#...), hydrate with latest content.
        normalized
          .filter((conv: any) =>
            String(conv.lastMessage || "").startsWith("MSG#"),
          )
          .forEach(async (conv: any) => {
            try {
              const latestRes = await chatGet(
                `/conversations/${encodeURIComponent(conv.id)}/messages`,
                { limit: 1 },
              );
              const latestMessages = latestRes.data?.messages || [];
              const latest = latestMessages[latestMessages.length - 1];
              setConversationPreviewMap((prev) => ({
                ...prev,
                [conv.id]: latest
                  ? getMessagePreview(latest)
                  : "Chưa có tin nhắn",
              }));
            } catch {
              setConversationPreviewMap((prev) => ({
                ...prev,
                [conv.id]: "Chưa có tin nhắn",
              }));
            }
          });
      } catch (err) {
        console.error("Error fetching conversations:", err);
      }
    };
    fetchConversations();
  }, [user?.email]);

  useEffect(() => {
    conversations.forEach((conv) => {
      if (conv.type === "direct") {
        const partner =
          conv.partner ||
          (Array.isArray(conv.members)
            ? conv.members.find((member: string) => member !== user?.email)
            : undefined);
        if (partner) loadUserProfile(partner);
      }
    });
  }, [conversations, user?.email]);

  useEffect(() => {
    messages.forEach((message) => {
      if (message.senderId && message.senderId !== user?.email) {
        loadUserProfile(message.senderId);
      }
    });
  }, [messages, user?.email]);

  useEffect(() => {
    friendships
      .filter((item) => item.status === "accepted")
      .forEach((item) => {
        const friendEmail =
          item.sender_id === user?.email ? item.receiver_id : item.sender_id;
        loadUserProfile(friendEmail);
      });
  }, [friendships, user?.email]);

  // SOCKET: RECEIVE MESSAGES REAL-TIME
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg: any) => {
      if (!msg?.id) return;
      const incomingConvId = msg.conversationId || msg.convId;
      if (!incomingConvId) return;

      // Append if we are viewing this chat right now
      if (selectedChat?.id === incomingConvId) {
        setMessages((prev) => {
          const existed = prev.some((item) => item.id === msg.id);
          if (existed) {
            return prev.map((item) => (item.id === msg.id ? msg : item));
          }
          return [...prev, msg];
        });
      }

      if (msg.reactions && typeof msg.reactions === "object") {
        setMessageReactions((prev) => ({ ...prev, [msg.id]: msg.reactions }));
      }

      setConversationPreviewMap((prev) => ({
        ...prev,
        [incomingConvId]: getMessagePreview(msg),
      }));

      upsertConversationLastMessage(incomingConvId, getMessagePreview(msg));
    };

    socket.on("receiveMessage", handleReceiveMessage);
    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
    };
  }, [socket, selectedChat?.id]);

  // AUTO-SCROLL TO BOTTOM OF CHAT
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchFriendships = async () => {
    setLoadingFriends(true);
    try {
      const res = await chatGet("/friends");
      setFriendships(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching friends:", err);
      setFriendships([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  useEffect(() => {
    if (!user?.email || activeTab !== "contacts") return;
    fetchFriendships();
  }, [user?.email, activeTab]);

  useEffect(() => {
    const handleFriendRequestReceived = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const senderEmail = String(detail.senderEmail || "")
        .trim()
        .toLowerCase();
      if (!senderEmail) return;

      setFriendNotifications((prev) => {
        const next = [
          {
            id: `${senderEmail}-${Date.now()}`,
            senderEmail,
            senderName:
              detail.senderProfile?.fullName ||
              detail.senderProfile?.fullname ||
              senderEmail,
            senderAvatar: detail.senderProfile?.avatarUrl,
            createdAt: detail.createdAt || new Date().toISOString(),
          },
          ...prev,
        ];
        return next.slice(0, 3);
      });

      if (activeTab === "contacts") {
        fetchFriendships();
      }

      window.setTimeout(() => {
        setFriendNotifications((prev) =>
          prev.filter((item) => item.senderEmail !== senderEmail),
        );
      }, 6000);
    };

    const handleFriendshipUpdated = () => {
      fetchFriendships();
    };

    window.addEventListener(
      "friend-request-received",
      handleFriendRequestReceived as EventListener,
    );
    window.addEventListener(
      "friendship-updated",
      handleFriendshipUpdated as EventListener,
    );

    return () => {
      window.removeEventListener(
        "friend-request-received",
        handleFriendRequestReceived as EventListener,
      );
      window.removeEventListener(
        "friendship-updated",
        handleFriendshipUpdated as EventListener,
      );
    };
  }, [activeTab]);

  // SWITCH CHAT: FETCH MESSAGES & JOIN ROOM
  const handleSelectChat = async (chat: any) => {
    const normalizedChat = normalizeConversation(chat);
    setSelectedChat(normalizedChat);
    setReplyTarget(null);
    closeOverlays();
    if (!normalizedChat) return;

    if (normalizedChat.type === "direct" && normalizedChat.partner) {
      loadUserProfile(normalizedChat.partner);
    }

    // Join Socket Room
    if (socket) {
      socket.emit("join_room", { convId: normalizedChat.id });
    }

    try {
      const res = await chatGet(
        `/conversations/${encodeURIComponent(normalizedChat.id)}/messages`,
      );
      const loadedMessages = res.data.messages || [];
      setMessages(loadedMessages);
      const last = loadedMessages[loadedMessages.length - 1];
      if (last) {
        setConversationPreviewMap((prev) => ({
          ...prev,
          [normalizedChat.id]: getMessagePreview(last),
        }));
      }
      const seedReactions: ReactionMap = {};
      loadedMessages.forEach((message: any) => {
        if (message.reactions && typeof message.reactions === "object") {
          seedReactions[message.id] = message.reactions;
        }
      });
      setMessageReactions(seedReactions);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  const handleOpenDirectChat = async (friendEmail: string) => {
    try {
      const directRes = await chatPost("/conversations/direct", {
        targetEmail: friendEmail,
      });
      const convId = directRes.data?.id;
      if (!convId) return;

      const existing = conversations.find((item) => item.id === convId);
      const directChat = normalizeConversation(
        existing || {
          id: convId,
          name: getDisplayName(friendEmail),
          avatar: getDisplayAvatar(friendEmail),
          partner: friendEmail,
          type: "direct",
        },
      );

      if (!existing) {
        setConversations((prev) => [directChat, ...prev]);
      }

      setActiveTab("chat");
      await handleSelectChat(directChat);
    } catch (err) {
      console.error("Failed to open direct chat", err);
    }
  };

  useEffect(() => {
    const targetEmail = String(
      (location.state as { openDirectChatEmail?: string } | null)
        ?.openDirectChatEmail || "",
    )
      .trim()
      .toLowerCase();

    if (!targetEmail || !user?.email) return;
    if (openedDirectChatEmailRef.current === targetEmail) return;

    openedDirectChatEmailRef.current = targetEmail;
    setActiveTab("chat");

    handleOpenDirectChat(targetEmail)
      .catch((error) => {
        console.error("Failed to open direct chat from route state", error);
      })
      .finally(() => {
        navigate("/chat", { replace: true, state: {} });
      });
  }, [handleOpenDirectChat, location.state, navigate, user?.email]);

  // SEND A TEXT MESSAGE
  const handleSendMessage = async () => {
    if ((!inputText.trim() && attachments.length === 0) || !selectedChat)
      return;
    try {
      const trimmedInput = inputText.trim();
      const uploadedAttachments: Attachment[] = [];
      for (const item of attachments) {
        if (item.file) {
          const uploadRes = await chatUpload(item.file);
          uploadedAttachments.push(uploadRes.data);
        } else {
          uploadedAttachments.push(item);
        }
      }

      const imageAttachments = uploadedAttachments.filter((item) =>
        item.mimeType.startsWith("image/"),
      );
      const fileAttachments = uploadedAttachments.filter(
        (item) => !item.mimeType.startsWith("image/"),
      );

      const res = await chatPost(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages`,
        {
          content:
            trimmedInput ||
            (imageAttachments.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
          media: imageAttachments.map((item) => ({
            name: item.name,
            fileName: item.name,
            mimeType: item.mimeType,
            fileType: item.mimeType,
            size: item.size,
            fileUrl: item.fileUrl || item.dataUrl,
            dataUrl: item.fileUrl || item.dataUrl,
          })),
          files: fileAttachments.map((item) => ({
            name: item.name,
            fileName: item.name,
            mimeType: item.mimeType,
            fileType: item.mimeType,
            size: item.size,
            fileUrl: item.fileUrl || item.dataUrl,
            dataUrl: item.fileUrl || item.dataUrl,
          })),
          replyTo: replyTarget || undefined,
        },
      );

      const createdMessage = {
        ...(res.data || {}),
        content:
          res.data?.content ||
          trimmedInput ||
          (imageAttachments.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
        media: res.data?.media || imageAttachments,
        files: res.data?.files || fileAttachments,
        replyTo: replyTarget || undefined,
      };
      if (createdMessage?.id) {
        // Update immediately, then socket event will be deduplicated by id.
        setMessages((prev) => {
          const existed = prev.some((item) => item.id === createdMessage.id);
          return existed ? prev : [...prev, createdMessage];
        });

        if (socket) {
          socket.emit("sendMessage", {
            convId: selectedChat.id,
            message: {
              ...createdMessage,
              conversationId: createdMessage.conversationId || selectedChat.id,
            },
          });
        }
      }

      upsertConversationLastMessage(
        selectedChat.id,
        createdMessage?.content || trimmedInput,
      );
      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: createdMessage?.content || trimmedInput,
      }));

      setInputText("");
      attachments.forEach((item) => {
        if (item.dataUrl && item.dataUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.dataUrl);
        }
      });
      setAttachments([]);
      setReplyTarget(null);
    } catch (err) {
      console.error("Failed to send message", err);
      alert(
        "Không gửi được tin nhắn kèm tệp. Vui lòng kiểm tra dung lượng tệp hoặc cấu hình upload S3.",
      );
    }
  };

  // Render Sidebar
  const renderNavButton = (
    id: typeof activeTab,
    icon: string,
    hasBadge: boolean = false,
  ) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => setActiveTab(id)}
        className={`rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative ${
          isActive
            ? "bg-white/20 backdrop-blur-md text-white active:scale-90"
            : "text-white/60 hover:text-white hover:bg-white/10 active:scale-90"
        }`}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
        >
          {icon}
        </span>
        {hasBadge && (
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full ring-2 ring-[#00418f]"></span>
        )}
      </button>
    );
  };

  const acceptedFriends = useMemo(() => {
    const seen = new Set<string>();

    return friendships
      .filter((item) => item.status === "accepted")
      .map((item) => {
        const email =
          item.sender_id === user?.email ? item.receiver_id : item.sender_id;
        return {
          email,
          nickname: item.nickname || "",
          displayName: getFriendDisplayName(email, item.nickname),
          avatarUrl: getFriendAvatar(email),
          status: item.status,
        };
      })
      .filter((item) => {
        if (seen.has(item.email)) return false;
        seen.add(item.email);
        const haystack =
          `${item.email} ${item.displayName} ${item.nickname}`.toLowerCase();
        return haystack.includes(friendSearchQuery.trim().toLowerCase());
      })
      .sort((left, right) => {
        const leftName = left.displayName.toLowerCase();
        const rightName = right.displayName.toLowerCase();
        return friendSortOrder === "asc"
          ? leftName.localeCompare(rightName, "vi")
          : rightName.localeCompare(leftName, "vi");
      });
  }, [
    friendships,
    user?.email,
    friendSearchQuery,
    friendSortOrder,
    getFriendAvatar,
    getFriendDisplayName,
  ]);

  const pendingRequestCount = friendships.filter(
    (item) => item.status === "pending" && item.receiver_id === user?.email,
  ).length;

  const handleAcceptFriendRequest = async (senderEmail: string) => {
    try {
      await chatPost("/friends/accept", { senderEmail });
      await fetchFriendships();
      setFriendNotifications((prev) =>
        prev.filter((item) => item.senderEmail !== senderEmail),
      );
    } catch (error) {
      console.error("Failed to accept friend request", error);
    }
  };

  const handleRejectFriendRequest = async (senderEmail: string) => {
    try {
      await chatPost("/friends/reject", { senderEmail });
      await fetchFriendships();
      setFriendNotifications((prev) =>
        prev.filter((item) => item.senderEmail !== senderEmail),
      );
    } catch (error) {
      console.error("Failed to reject friend request", error);
    }
  };

  const handleViewProfile = async (email: string) => {
    try {
      const res = await chatGet("/friends/search", { email });
      const profile = res.data?.user;

      await Swal.fire({
        title: profile?.fullName || profile?.fullname || email,
        html: `
          <div style="text-align:left; display:grid; gap:8px;">
            <img src="${profile?.avatarUrl || "/logo_blue.png"}" alt="${escapeHtml(email)}" style="width:96px;height:96px;border-radius:9999px;object-fit:cover;margin:0 auto 8px;" />
            <div><strong>Email:</strong> ${escapeHtml(email)}</div>
            <div><strong>Tiểu sử:</strong> ${escapeHtml(String(profile?.bio || "Chưa cập nhật"))}</div>
          </div>
        `,
        confirmButtonText: "Đóng",
      });
    } catch (error) {
      console.error("Failed to load profile", error);
    }
  };

  const handleSetNickname = async (email: string, currentNickname?: string) => {
    const result = await Swal.fire({
      title: "Đặt biệt danh",
      input: "text",
      inputValue: currentNickname || "",
      inputPlaceholder: "Nhập biệt danh mới",
      showCancelButton: true,
      confirmButtonText: "Lưu",
    });

    if (!result.isConfirmed) return;

    try {
      await chatPatch("/friends/nickname", {
        friendEmail: email,
        nickname: String(result.value || "").trim(),
      });
      await fetchFriendships();
    } catch (error) {
      console.error("Failed to update nickname", error);
    }
  };

  const handleBlockUser = async (email: string) => {
    const result = await Swal.fire({
      title: "Chặn người dùng này?",
      text: "Người này sẽ không thể gửi lời mời hoặc nhắn tin cho bạn.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Chặn",
    });

    if (!result.isConfirmed) return;

    try {
      await chatPost("/friends/block", { targetEmail: email });
      await fetchFriendships();
    } catch (error) {
      console.error("Failed to block user", error);
    }
  };

  const handleUnfriend = async (email: string) => {
    const result = await Swal.fire({
      title: "Xóa bạn bè?",
      text: "Quan hệ bạn bè sẽ bị xóa ở cả hai phía.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Xóa",
    });

    if (!result.isConfirmed) return;

    try {
      await chatPost("/friends/unfriend", { friendEmail: email });
      await fetchFriendships();
    } catch (error) {
      console.error("Failed to unfriend user", error);
    }
  };

  const activePinnedMessages = messages
    .filter((message) => message.pinned)
    .sort((a, b) =>
      String(b.pinnedAt || "").localeCompare(String(a.pinnedAt || "")),
    )
    .slice(0, 3);

  const conversationFiles = messages
    .flatMap((message) => {
      const media = Array.isArray(message.media)
        ? message.media.map((item: any) => ({
            ...normalizeAttachment(item),
            createdAt: message.createdAt,
          }))
        : [];
      const files = Array.isArray(message.files)
        ? message.files.map((item: any) => ({
            ...normalizeAttachment(item),
            createdAt: message.createdAt,
          }))
        : [];
      return [...media, ...files];
    })
    .filter((item) => !!item.dataUrl)
    .slice()
    .reverse();

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-surface text-on-surface antialiased font-['Plus_Jakarta_Sans'] border border-outline-variant/20"
      onClick={closeOverlays}
    >
      {/* COLUMN 1: SideNavBar (80px wide) */}
      <aside className="fixed left-0 top-0 h-full z-50 w-20 flex flex-col items-center py-6 bg-gradient-to-br from-[#0058bc] to-[#00418f] shadow-[0px_20px_40px_rgba(0,65,143,0.06)] shrink-0">
        {/* Top Avatar Area */}
        <div className="mb-8">
          <img
            alt="User Avatar"
            onClick={() => setIsProfileModalOpen(true)}
            className="w-12 h-12 rounded-full border-2 border-white/20 p-0.5 object-cover bg-white/10 cursor-pointer hover:border-white transition-colors"
            src={
              user?.avatarUrl ||
              "https://lh3.googleusercontent.com/aida-public/AB6AXuCFw8hQBOq4JKJazc3GAIcVjmlrrfkICsk9jcBPauM53xp43QRLa6DqnEMow0-o1mRGziDfptfm02FgIlDbYltgzrSJtsP-_9ZmmuU5a1HL7JGFMujo8aASzX0ctHu6vqLGHtPPfgD52k6jx6G96Ll7O72OmXDkjh4_ow9-Pm7zokfO_INwwFExRPgQJIjpqmh5hidvLzAXnfEYTg61gAUYlTRiSMH5ZUorMbj1-J4SuqKTeDZetL9hIls8Yq8wumlUwCODZQaS6A"
            }
          />
        </div>

        {/* Middle Navigation area */}
        <nav className="flex flex-col gap-4 flex-1">
          {renderNavButton("chat", "chat")}
          <button
            onClick={() => navigate("/contacts")}
            className="rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative text-white/60 hover:text-white hover:bg-white/10 active:scale-90"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 0" }}
            >
              group
            </span>
          </button>
          {renderNavButton(
            "notifications",
            "notifications",
            pendingRequestCount > 0,
          )}
          {renderNavButton("cloud", "cloud")}
        </nav>

        {/* Bottom Settings & Logout area */}
        <div className="mt-auto space-y-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative ${
                isDropdownOpen
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10 active:scale-90"
              }`}
              title="Cài đặt"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>

            {/* Dropdown Menu - ĐỒNG BỘ ZALO UI (Phía trên Bánh răng) */}
            {isDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-3 w-64 bg-white rounded-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.15)] z-[100] border border-outline-variant/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* Account Name Header */}
                <div className="px-5 py-4 border-b border-outline-variant/5 bg-surface-container-lowest/50">
                  <p className="font-extrabold text-[16px] text-on-surface truncate">
                    {user?.fullName || user?.fullname || "Người dùng"}
                  </p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsProfileModalOpen(true);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm text-left group"
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                      account_circle
                    </span>
                    Thông tin tài khoản
                  </button>
                  <Link
                    to="/settings"
                    onClick={() => setIsDropdownOpen(false)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm text-left group"
                  >
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                      settings
                    </span>
                    Cài đặt
                  </Link>
                </div>

                <div className="border-t border-outline-variant/5 py-1">
                  <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm group">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                        database
                      </span>
                      Dữ liệu
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                      chevron_right
                    </span>
                  </button>
                  <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm group">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                        language
                      </span>
                      Ngôn ngữ
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                      chevron_right
                    </span>
                  </button>
                  <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm group">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                        support_agent
                      </span>
                      Hỗ trợ
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                      chevron_right
                    </span>
                  </button>
                </div>

                <div className="border-t border-outline-variant/5 py-1 mb-1">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors text-error font-bold text-sm text-left"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      logout
                    </span>
                    Đăng xuất
                  </button>
                  <button
                    onClick={() => setIsDropdownOpen(false)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-bold text-sm text-left"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      power_settings_new
                    </span>
                    Thoát
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="text-white/80 hover:text-error hover:bg-white/10 rounded-2xl transition-all duration-300 p-3 scale-95 active:scale-90 flex items-center justify-center"
            title="Đăng xuất"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </aside>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* COLUMN 2: List Panel (320px) */}
      <section className="ml-20 w-[320px] bg-white bg-surface-container-lowest h-full flex flex-col z-10 border-r border-outline-variant/30 shrink-0">
        {/* Search Header */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                className="w-full bg-surface-container-highest border-none rounded-[16px] py-2 pl-[34px] pr-4 text-[13px] focus:ring-2 focus:ring-primary/40 transition-all outline-none text-on-surface placeholder:text-outline"
                placeholder="Tìm kiếm"
                type="text"
              />
            </div>
            <Link
              to="/contacts"
              className="p-2 hover:bg-surface-container rounded-xl transition-colors"
            >
              <span className="material-symbols-outlined text-on-surface-variant focus-within:text-primary text-[20px]">
                person_add
              </span>
            </Link>
            <button className="p-2 hover:bg-surface-container rounded-xl transition-colors">
              <span className="material-symbols-outlined text-on-surface-variant focus-within:text-primary text-[20px]">
                group_add
              </span>
            </button>
          </div>

          {/* Sub Navigation */}
          {activeTab === "chat" && (
            <div className="flex items-center gap-4 text-sm font-semibold px-1">
              <button className="text-primary border-b-2 border-primary pb-1">
                Tất cả
              </button>
              <button className="text-on-surface-variant hover:text-primary transition-colors pb-1">
                Chưa đọc
              </button>
            </div>
          )}
          {activeTab === "contacts" && (
            <div className="flex items-center gap-4 text-sm font-semibold px-1">
              <button className="text-primary border-b-2 border-primary pb-1">
                Bạn bè
              </button>
              <button className="text-on-surface-variant hover:text-primary transition-colors pb-1">
                Nhóm
              </button>
            </div>
          )}
        </div>

        {/* Dynamic List Content */}
        <div className="flex-1 overflow-y-auto hide-scrollbar pb-4 px-2 space-y-1">
          {activeTab === "chat" ? (
            conversations.length === 0 ? (
              <div className="text-center p-8 opacity-50 mt-10">
                <p className="font-medium text-[13px] text-on-surface">
                  Chưa có cuộc trò chuyện nào
                </p>
              </div>
            ) : (
              conversations.map((chat) => {
                const isSelected = selectedChat?.id === chat.id;
                // Nếu là direct chat thì avatar/name sẽ lôi từ partner mapping (tạm dùng tên mặc định nếu thiếu)
                const partnerEmail =
                  chat.type === "direct"
                    ? chat.partner ||
                      (Array.isArray(chat.members)
                        ? chat.members.find(
                            (member: string) => member !== user?.email,
                          )
                        : undefined)
                    : undefined;
                const chatName =
                  chat.type === "direct"
                    ? getDisplayName(partnerEmail)
                    : chat.name || chat.id.substring(0, 6);
                const chatAvatar =
                  chat.type === "direct"
                    ? getDisplayAvatar(partnerEmail)
                    : chat.avatar || "/logo_blue.png";
                return (
                  <div
                    key={chat.id}
                    onClick={() => handleSelectChat(chat)}
                    className={`flex items-center gap-3 p-3 rounded-[16px] cursor-pointer transition-all ${
                      isSelected
                        ? "bg-secondary-container/50 shadow-[0_4px_12px_rgba(0,0,0,0.02)]"
                        : "hover:bg-surface-container/70"
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        className="w-12 h-12 rounded-full object-cover shadow-sm bg-surface-container"
                        alt={chatName}
                        src={chatAvatar}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-0.5">
                        <h3
                          className={`font-bold text-[14px] truncate ${isSelected ? "text-on-secondary-container" : "text-on-surface"}`}
                        >
                          {chatName}
                        </h3>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1 overflow-hidden">
                          <p
                            className={`text-[13px] truncate text-on-surface-variant`}
                          >
                            {getConversationPreview(chat)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : loadingFriends ? (
            <div className="text-center p-8 opacity-60 mt-10">
              <p className="font-medium text-[13px] text-on-surface">
                Đang tải danh sách bạn bè...
              </p>
            </div>
          ) : acceptedFriends.length === 0 ? (
            <div className="text-center p-8 opacity-50 mt-10">
              <p className="font-medium text-[13px] text-on-surface">
                Bạn chưa có bạn bè nào
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {friendNotifications.length > 0 && (
                <div className="space-y-2 px-2">
                  {friendNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="rounded-[18px] border border-primary/20 bg-primary/5 p-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={notification.senderAvatar || "/logo_blue.png"}
                          alt={notification.senderName}
                          className="w-11 h-11 rounded-full object-cover bg-surface-container"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[13px] text-on-surface truncate">
                            {notification.senderName}
                          </p>
                          <p className="text-[12px] text-on-surface-variant truncate">
                            Đã gửi cho bạn một lời mời kết bạn
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() =>
                            handleAcceptFriendRequest(notification.senderEmail)
                          }
                          className="flex-1 rounded-xl bg-primary text-white py-2 text-[12px] font-bold"
                        >
                          Chấp nhận
                        </button>
                        <button
                          onClick={() =>
                            handleRejectFriendRequest(notification.senderEmail)
                          }
                          className="flex-1 rounded-xl bg-surface-container py-2 text-[12px] font-bold text-on-surface"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-2 flex items-center gap-2">
                <div className="flex-1 relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                    search
                  </span>
                  <input
                    value={friendSearchQuery}
                    onChange={(event) =>
                      setFriendSearchQuery(event.target.value)
                    }
                    placeholder="Search friends"
                    className="w-full rounded-[16px] bg-surface-container-highest border border-outline-variant/10 py-2.5 pl-10 pr-4 text-[13px] outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <button
                  onClick={() =>
                    setFriendSortOrder(
                      friendSortOrder === "asc" ? "desc" : "asc",
                    )
                  }
                  className="rounded-[16px] border border-primary/20 bg-surface-container-highest px-4 py-2.5 text-[12px] font-bold text-primary whitespace-nowrap"
                >
                  {friendSortOrder === "asc" ? "Name (A-Z)" : "Name (Z-A)"}
                </button>
              </div>

              <div className="px-2 flex items-center justify-between text-[12px] font-semibold text-on-surface-variant">
                <span>Contacts ({acceptedFriends.length})</span>
                <span>{pendingRequestCount} pending</span>
              </div>

              {acceptedFriends.map((friend) => (
                <div
                  key={friend.email}
                  onClick={() => handleOpenDirectChat(friend.email)}
                  className="group flex items-center gap-3 p-3 rounded-[16px] transition-all hover:bg-surface-container/70 cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <img
                      className="w-12 h-12 rounded-full object-cover shadow-sm bg-surface-container"
                      alt={friend.displayName}
                      src={friend.avatarUrl}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[14px] text-on-surface truncate">
                      {friend.displayName}
                    </p>
                    <p className="text-[12px] text-on-surface-variant truncate">
                      {friend.nickname || friend.email}
                    </p>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setFriendActionMenu({
                        email: friend.email,
                        x: rect.right - 180,
                        y: rect.bottom + 8,
                      });
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-full hover:bg-surface-container-highest text-on-surface-variant"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      more_horiz
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Main Content Area (Column 3 & 4 OR Welcome Screen) */}
      {!selectedChat ? (
        // WELCOME SCREEN (Empty State)
        <main className="flex-1 bg-[#f7f9fb] flex flex-col items-center justify-center relative shadow-[inset_1px_0_0_rgba(0,0,0,0.05)]">
          <img
            src="/logo_blue.png"
            alt="Welcome"
            className="w-48 h-auto mb-8 animate-float opacity-80 mix-blend-multiply"
            onError={(e) => {
              // Fallback to huge icon if logo fails to load
              e.currentTarget.style.display = "none";
              e.currentTarget.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <span
            className="material-symbols-outlined text-primary text-[120px] mb-8 hidden"
            style={{ fontVariationSettings: "'wght' 200" }}
          >
            forum
          </span>
          <h2 className="text-2xl font-extrabold text-on-surface mb-3 tracking-tight">
            Chào mừng đến với Zalo Education
          </h2>
          <p className="text-on-surface-variant font-medium max-w-md text-center leading-relaxed">
            Khám phá tiện ích hỗ trợ làm việc và học tập, kết nối với giảng viên
            và sinh viên một cách dễ dàng.
          </p>
          {user?.fullname && (
            <div className="mt-8 px-6 py-3 bg-white rounded-full shadow-sm border border-outline-variant/20 inline-flex items-center gap-3">
              <span className="text-sm font-semibold text-on-surface">
                Đang đăng nhập dưới tên:
              </span>
              <span className="text-primary font-extrabold">
                {user.fullname}
              </span>
            </div>
          )}
        </main>
      ) : (
        // ACTIVE CHAT SCREEN
        <>
          {/* COLUMN 3: Main Chat Window */}
          <main className="flex-1 flex flex-col bg-[#f7f9fb] overflow-hidden relative shadow-[inset_1px_0_0_rgba(0,0,0,0.05)] border-r border-outline-variant/20">
            {/* Chat Header */}
            <header className="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur-xl border-b border-outline-variant/15 z-20 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  className="w-10 h-10 rounded-full object-cover bg-surface-container"
                  alt="Avatar"
                  src={
                    selectedChat.type === "direct"
                      ? getDisplayAvatar(selectedChat.partner)
                      : selectedChat.avatar
                  }
                />
                <div>
                  <h2 className="font-bold text-on-surface leading-tight text-[15px]">
                    {selectedChat.type === "direct"
                      ? getDisplayName(selectedChat.partner)
                      : selectedChat.name}
                  </h2>
                  <div className="flex items-center gap-1 text-[12px] text-on-surface-variant font-medium">
                    {selectedChat.type === "group" ? (
                      <>
                        <span className="material-symbols-outlined text-[13px]">
                          group
                        </span>
                        <span>
                          11 thành viên •{" "}
                          <span className="text-green-600">
                            3 đang hoạt động
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className={`w-2 h-2 rounded-full ${selectedChat.online ? "bg-green-500" : "bg-outline-variant"}`}
                        ></span>
                        <span>
                          {selectedChat.online
                            ? "Đang hoạt động"
                            : "Truy cập 2 giờ trước"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-surface-container rounded-full transition-all text-on-surface-variant">
                  <span className="material-symbols-outlined">search</span>
                </button>
                <button className="p-2 hover:bg-surface-container rounded-full transition-all text-on-surface-variant">
                  <span className="material-symbols-outlined">videocam</span>
                </button>
                <button className="p-2 hover:bg-surface-container rounded-full transition-all text-on-surface-variant">
                  <span className="material-symbols-outlined">call</span>
                </button>
                <button className="p-2 hover:bg-surface-container rounded-full transition-all text-on-surface-variant">
                  <span className="material-symbols-outlined">
                    dock_to_left
                  </span>
                </button>
              </div>
            </header>

            {activePinnedMessages.length > 0 && (
              <div className="px-6 py-2.5 bg-white/70 backdrop-blur-md border-b border-outline-variant/20 shrink-0 space-y-2">
                {activePinnedMessages.map((message) => (
                  <div
                    key={`pin-${message.id}`}
                    className="flex items-center gap-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 px-3 py-2"
                  >
                    <span className="material-symbols-outlined text-primary text-[18px]">
                      push_pin
                    </span>
                    <div className="flex-1 text-[13px] truncate">
                      <span className="font-bold text-primary mr-2">
                        Đã ghim:
                      </span>
                      {getMessagePreview(message)}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unpinMessage(message.id);
                      }}
                      className="text-[11px] px-2 py-1 rounded-lg border border-outline-variant/30 hover:bg-surface-container"
                    >
                      Bỏ ghim
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar flex flex-col">
              <div className="flex justify-center my-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant/80 bg-surface-container-high/50 px-4 py-1.5 rounded-full">
                  Lịch sử trò chuyện
                </span>
              </div>

              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-on-surface-variant">
                    Trò chuyện này chưa có tin nhắn nào. Bắt đầu ngay!
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isMe = message.senderId === user?.email;
                  const reactionSummary = getReactionSummary(message);
                  const isRecalled = !!message.recalled;

                  if (isMe) {
                    return (
                      <div
                        key={message.id}
                        className="flex items-end justify-end gap-3 mt-auto group"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openContextMenuForMessage(
                            message,
                            e.clientX,
                            e.clientY,
                          );
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            openContextMenuForMessage(
                              message,
                              rect.left,
                              rect.top - 8,
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-container rounded-full transition-all text-on-surface-variant mb-4"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            more_vert
                          </span>
                        </button>
                        <div className="max-w-[75%]">
                          <div className="bg-primary-container text-on-primary-container rounded-[20px] rounded-tr-none p-4 shadow-sm shadow-primary/10 border border-primary/20">
                            {message.replyTo && (
                              <div className="mb-2 rounded-lg bg-white/60 text-on-surface p-2 text-[12px] border border-white/80">
                                <p className="font-semibold">
                                  Trả lời{" "}
                                  {message.replyTo.senderId || "tin nhắn"}
                                </p>
                                <p className="truncate">
                                  {message.replyTo.content}
                                </p>
                              </div>
                            )}
                            <p
                              className={`text-[15px] leading-relaxed ${isRecalled ? "italic opacity-70" : ""}`}
                            >
                              {message.content}
                            </p>
                            {(Array.isArray(message.media) ||
                              Array.isArray(message.files)) && (
                              <div className="mt-2 space-y-2">
                                {(Array.isArray(message.media)
                                  ? message.media
                                  : []
                                ).map((item: any, index: number) => {
                                  const file = normalizeAttachment(item);
                                  return (
                                    <img
                                      key={`me-media-${message.id}-${index}`}
                                      src={file.dataUrl}
                                      alt={file.name}
                                      className="max-h-56 rounded-lg border border-primary/20"
                                    />
                                  );
                                })}
                                {(Array.isArray(message.files)
                                  ? message.files
                                  : []
                                ).map((item: any, index: number) => {
                                  const file = normalizeAttachment(item);
                                  return (
                                    <a
                                      key={`me-file-${message.id}-${index}`}
                                      href={file.dataUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg bg-white/70 text-on-surface p-2 border border-primary/20"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        {getFileIcon(file.mimeType, file.name)}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-[12px] font-semibold truncate">
                                          {file.name}
                                        </p>
                                        <p className="text-[11px] text-on-surface-variant">
                                          {formatFileSize(file.size)}
                                        </p>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {reactionSummary.length > 0 && (
                            <div className="mt-1 flex justify-end gap-1">
                              {reactionSummary.map(([emoji, users]) => (
                                <button
                                  key={`${message.id}-${emoji}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleReaction(message, emoji);
                                  }}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-outline-variant/30"
                                >
                                  {emoji} {users.length}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={message.id}
                        className="flex items-start gap-3 max-w-[80%] group"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openContextMenuForMessage(
                            message,
                            e.clientX,
                            e.clientY,
                          );
                        }}
                      >
                        <img
                          className="w-9 h-9 rounded-full mt-1 object-cover bg-surface-container"
                          alt="Avatar"
                          src={getDisplayAvatar(message.senderId)}
                        />
                        <div>
                          {selectedChat.type === "group" && (
                            <span className="text-[12px] font-bold ml-1 mb-1 block text-on-surface-variant">
                              {getDisplayName(message.senderId)}
                            </span>
                          )}
                          <div className="bg-white rounded-[20px] rounded-tl-none p-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] border border-outline-variant/25">
                            {message.replyTo && (
                              <div className="mb-2 rounded-lg bg-surface-container-low p-2 text-[12px] border border-outline-variant/20">
                                <p className="font-semibold">
                                  Trả lời{" "}
                                  {message.replyTo.senderId || "tin nhắn"}
                                </p>
                                <p className="truncate">
                                  {message.replyTo.content}
                                </p>
                              </div>
                            )}
                            <p
                              className={`text-[15px] leading-relaxed text-on-surface ${isRecalled ? "italic opacity-70" : ""}`}
                            >
                              {message.content}
                            </p>
                            {(Array.isArray(message.media) ||
                              Array.isArray(message.files)) && (
                              <div className="mt-2 space-y-2">
                                {(Array.isArray(message.media)
                                  ? message.media
                                  : []
                                ).map((item: any, index: number) => {
                                  const file = normalizeAttachment(item);
                                  return (
                                    <img
                                      key={`other-media-${message.id}-${index}`}
                                      src={file.dataUrl}
                                      alt={file.name}
                                      className="max-h-56 rounded-lg border border-outline-variant/25"
                                    />
                                  );
                                })}
                                {(Array.isArray(message.files)
                                  ? message.files
                                  : []
                                ).map((item: any, index: number) => {
                                  const file = normalizeAttachment(item);
                                  return (
                                    <a
                                      key={`other-file-${message.id}-${index}`}
                                      href={file.dataUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-lg bg-surface-container-lowest p-2 border border-outline-variant/25"
                                    >
                                      <span className="material-symbols-outlined text-[18px]">
                                        {getFileIcon(file.mimeType, file.name)}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-[12px] font-semibold truncate">
                                          {file.name}
                                        </p>
                                        <p className="text-[11px] text-on-surface-variant">
                                          {formatFileSize(file.size)}
                                        </p>
                                      </div>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          {reactionSummary.length > 0 && (
                            <div className="mt-1 flex gap-1">
                              {reactionSummary.map(([emoji, users]) => (
                                <button
                                  key={`${message.id}-${emoji}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleReaction(message, emoji);
                                  }}
                                  className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-outline-variant/30"
                                >
                                  {emoji} {users.length}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            openContextMenuForMessage(
                              message,
                              rect.left,
                              rect.top - 8,
                            );
                          }}
                          className="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-container rounded-full transition-all self-center text-on-surface-variant"
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            more_vert
                          </span>
                        </button>
                      </div>
                    );
                  }
                })
              )}
              {/* Invisible element to force scroll to bottom */}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <footer className="bg-white/80 backdrop-blur-xl border-t border-outline-variant/20 px-6 py-4 shrink-0">
              <div className="flex items-center gap-1.5 mb-3 px-1">
                <button className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant hover:text-primary">
                  <span className="material-symbols-outlined text-[22px]">
                    mood
                  </span>
                </button>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    image
                  </span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[22px]">
                    attach_file
                  </span>
                </button>
                <button className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant hover:text-primary">
                  <span className="material-symbols-outlined text-[22px]">
                    alternate_email
                  </span>
                </button>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handlePickFiles(e, "image")}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handlePickFiles(e, "file")}
              />
              {attachments.length > 0 && (
                <div className="mb-3 rounded-xl border border-outline-variant/25 bg-surface-container-lowest p-2 flex flex-wrap gap-2">
                  {attachments.map((item, index) => (
                    <div
                      key={`attach-${index}`}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white border border-outline-variant/20"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {getFileIcon(item.mimeType, item.name)}
                      </span>
                      <span className="text-[12px] max-w-[220px] truncate">
                        {item.name}
                      </span>
                      <button
                        onClick={() =>
                          setAttachments((prev) => {
                            const target = prev[index];
                            if (
                              target?.dataUrl &&
                              target.dataUrl.startsWith("blob:")
                            ) {
                              URL.revokeObjectURL(target.dataUrl);
                            }
                            return prev.filter((_, idx) => idx !== index);
                          })
                        }
                        className="text-[11px] px-1.5 rounded hover:bg-surface-container"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {replyTarget && (
                <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-primary">
                      Đang trả lời {replyTarget.senderId || "tin nhắn"}
                    </p>
                    <p className="text-[12px] text-on-surface-variant truncate">
                      {replyTarget.content}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTarget(null)}
                    className="text-[11px] px-2 py-1 rounded-lg border border-outline-variant/30 hover:bg-surface-container"
                  >
                    Hủy
                  </button>
                </div>
              )}
              <div className="flex items-end gap-3 bg-surface-container-lowest border border-outline-variant/30 rounded-[24px] p-2 pr-2.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all shadow-sm">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-[15px] resize-none py-3 px-4 hide-scrollbar pt-3.5 outline-none text-on-surface placeholder:text-outline"
                  placeholder={`Nhập tin nhắn tới ${selectedChat.name || "bạn"}...`}
                  rows={1}
                ></textarea>
                <button
                  onClick={handleSendMessage}
                  className="bg-primary text-white w-12 h-12 rounded-full shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0 mb-[2px]"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    send
                  </span>
                </button>
              </div>
            </footer>
          </main>

          {/* COLUMN 4: Group Info Sidebar (320px) */}
          <aside className="w-[320px] bg-surface border-l border-outline-variant/20 flex flex-col h-full z-40 hidden lg:flex font-['Plus_Jakarta_Sans'] text-sm shrink-0">
            <div className="p-8 text-center border-b border-outline-variant/10 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.02)] z-10 shrink-0">
              <h2 className="text-on-surface font-extrabold text-[16px] mb-6 tracking-tight">
                Thông tin hội thoại
              </h2>
              <img
                className="w-24 h-24 rounded-full mx-auto shadow-xl shadow-primary/10 mb-5 object-cover ring-4 ring-white"
                alt="Avatar"
                src={
                  selectedChat.type === "direct"
                    ? getDisplayAvatar(selectedChat.partner)
                    : selectedChat.avatar
                }
              />
              <h3 className="font-extrabold text-primary text-[18px] px-2">
                {selectedChat.type === "direct"
                  ? getDisplayName(selectedChat.partner)
                  : selectedChat.name}
              </h3>
              {selectedChat.type === "group" && (
                <p className="text-on-surface-variant mt-1 font-medium text-sm tracking-wide">
                  Khoa Công nghệ thông tin
                </p>
              )}

              <div className="flex justify-center gap-6 mt-8">
                <div className="flex flex-col items-center gap-2 cursor-pointer text-on-surface-variant hover:text-primary transition-all group">
                  <div className="w-11 h-11 rounded-full bg-surface-container-highest group-hover:bg-primary/10 flex items-center justify-center shadow-sm transition-colors text-on-surface group-hover:text-primary">
                    <span className="material-symbols-outlined text-[20px]">
                      notifications_off
                    </span>
                  </div>
                  <span className="text-[11px] font-bold">Tắt Tbáo</span>
                </div>
                <div
                  onClick={() => {
                    /* logic ghim */
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer text-on-surface-variant hover:text-primary transition-all group"
                >
                  <div className="w-11 h-11 rounded-full bg-surface-container-highest group-hover:bg-primary/10 flex items-center justify-center shadow-sm transition-colors text-on-surface group-hover:text-primary">
                    <span className="material-symbols-outlined text-[20px]">
                      push_pin
                    </span>
                  </div>
                  <span className="text-[11px] font-bold">Ghim hội thoại</span>
                </div>
                <div
                  onClick={() => {
                    /* logic thêm TV */
                  }}
                  className="flex flex-col items-center gap-2 cursor-pointer text-on-surface-variant hover:text-primary transition-all group"
                >
                  <div className="w-11 h-11 rounded-full bg-surface-container-highest group-hover:bg-primary/10 flex items-center justify-center shadow-sm transition-colors text-on-surface group-hover:text-primary">
                    <span className="material-symbols-outlined text-[20px]">
                      person_add
                    </span>
                  </div>
                  <span className="text-[11px] font-bold">Thêm TV</span>
                </div>
              </div>
            </div>

            <div className="flex-1 p-5 space-y-5 overflow-y-auto hide-scrollbar bg-[#f7f9fb]">
              {selectedChat.type === "group" && (
                <section className="bg-white rounded-[24px] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-extrabold text-on-surface text-[15px]">
                      Thành viên (11)
                    </span>
                    <button className="material-symbols-outlined text-outline hover:text-primary transition-colors cursor-pointer text-[20px] bg-surface-container hover:bg-primary/10 p-1 rounded-full">
                      expand_more
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 hover:bg-surface-container p-2 -mx-2 rounded-xl transition-all cursor-pointer group">
                      <div className="w-10 h-10 rounded-full bg-primary-container text-primary font-bold flex flex-col items-center justify-center">
                        {user?.fullname?.charAt(0) || "B"}
                      </div>
                      <div className="flex-1">
                        <span className="font-bold text-on-surface text-[14px] group-hover:text-primary block leading-tight">
                          {user?.fullname || "Bạn"}{" "}
                          <span className="text-on-surface-variant font-medium">
                            (Trưởng nhóm)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section className="bg-white rounded-[24px] p-5 shadow-[0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-extrabold text-on-surface text-[15px]">
                    Tài liệu & Files
                  </span>
                  <button className="material-symbols-outlined text-outline hover:text-primary transition-colors cursor-pointer text-[20px] bg-surface-container hover:bg-primary/10 p-1 rounded-full">
                    expand_more
                  </button>
                </div>
                <div className="space-y-3">
                  {conversationFiles.length === 0 ? (
                    <p className="text-[12px] text-on-surface-variant">
                      Chưa có tệp nào trong cuộc hội thoại này.
                    </p>
                  ) : (
                    conversationFiles.slice(0, 10).map((item, index) => (
                      <a
                        key={`history-file-${index}`}
                        href={item.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 hover:bg-surface-container p-2 -mx-2 rounded-xl transition-all cursor-pointer group"
                      >
                        <div className="w-11 h-11 rounded-[14px] bg-surface-container-highest flex items-center justify-center text-on-surface-variant shadow-sm">
                          <span className="material-symbols-outlined text-[20px]">
                            {getFileIcon(item.mimeType, item.name)}
                          </span>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-on-surface text-[13px] truncate group-hover:text-primary">
                            {item.name}
                          </p>
                          <span className="text-[11px] font-medium text-on-surface-variant tracking-wide block mt-0.5">
                            {formatFileSize(item.size)} •{" "}
                            {item.createdAt
                              ? new Date(item.createdAt).toLocaleString("vi-VN")
                              : "--"}
                          </span>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </section>
            </div>
          </aside>
        </>
      )}

      {reactionPicker && (
        <div
          className="fixed bg-white rounded-full shadow-lg px-2 py-1 flex gap-1 z-[1000] border border-outline-variant/30"
          style={{ left: reactionPicker.x, top: reactionPicker.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {REACTION_OPTIONS.map((emoji) => (
            <button
              key={`floating-${reactionPicker.messageId}-${emoji}`}
              onClick={() => {
                const targetMessage = messages.find(
                  (item) => item.id === reactionPicker.messageId,
                );
                if (targetMessage) toggleReaction(targetMessage, emoji);
              }}
              className="text-[18px] hover:scale-110 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {friendActionMenu && (
        <div
          className="fixed z-[1002] min-w-[210px] rounded-2xl border border-outline-variant/20 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
          style={{ left: friendActionMenu.x, top: friendActionMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              handleViewProfile(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            View profile
          </button>
          <button
            onClick={() => {
              const currentFriendship = friendships.find((item) => {
                const friendEmail =
                  item.sender_id === user?.email
                    ? item.receiver_id
                    : item.sender_id;
                return friendEmail === friendActionMenu.email;
              });
              handleSetNickname(
                friendActionMenu.email,
                currentFriendship?.nickname || "",
              );
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Set nickname
          </button>
          <button
            onClick={() => {
              handleBlockUser(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Block user
          </button>
          <button
            onClick={() => {
              handleUnfriend(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-error hover:bg-red-50"
          >
            Unfriend
          </button>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed bg-white border border-outline-variant/30 rounded-xl shadow-lg p-2 z-[1001] min-w-[180px] text-[12px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => pinMessage(contextMenu.message)}
            className="block w-full text-left px-2 py-1 hover:bg-surface-container rounded"
          >
            Ghim tin nhắn
          </button>
          <button
            onClick={() => startReply(contextMenu.message)}
            className="block w-full text-left px-2 py-1 hover:bg-surface-container rounded"
          >
            Trả lời
          </button>
          {contextMenu.message?.senderId === user?.email &&
            !contextMenu.message?.recalled && (
              <button
                onClick={() => recallMessage(contextMenu.message.id)}
                className="block w-full text-left px-2 py-1 hover:bg-surface-container rounded"
              >
                Thu hồi
              </button>
            )}
        </div>
      )}
    </div>
  );
};

export default HomePage;
