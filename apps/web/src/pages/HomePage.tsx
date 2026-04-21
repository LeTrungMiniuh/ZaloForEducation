import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProfileModal from "../components/ProfileModal";
import Swal from "sweetalert2";
import { useChatStore } from "../store/chatStore";

type Friendship = {
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted";
  nickname?: string;
};

type ReactionMap = Record<string, Record<string, string[]>>;
type UserProfile = {
  email: string;
  fullName?: string;
  fullname?: string;
  avatarUrl?: string;
  status?: "online" | "offline";
};
type Attachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  fileUrl?: string;
  file?: File;
};

type AttachmentInput = {
  name?: string;
  fileName?: string;
  mimeType?: string;
  fileType?: string;
  size?: number | string;
  dataUrl?: string;
  fileUrl?: string;
  url?: string;
};

type ReplyTarget = {
  id: string;
  senderId: string;
  content: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  content?: string;
  createdAt?: string;
  conversationId?: string;
  convId?: string;
  recalled?: boolean;
  media?: AttachmentInput[];
  files?: AttachmentInput[];
  reactions?: ReactionMap;
  pinned?: boolean;
  pinnedAt?: string;
  replyTo?: {
    senderId?: string;
    content?: string;
  };
};

type ChatConversation = {
  id: string;
  type?: "direct" | "group" | string;
  partner?: string;
  members?: string[];
  name?: string;
  avatar?: string;
  online?: boolean;
  lastMessage?: string;
  lastMessageContent?: string;
  lastMessageSenderId?: string;
  lastMessageTimestamp?: number;
  updatedAt?: string;
  senderId?: string;
  lastReadAt?: number;
};

type UploadedAttachment = {
  fileType?: string;
  mimeType?: string;
  [key: string]: unknown;
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

const chatGet = async (path: string, params?: Record<string, unknown>) => {
  try {
    return await api.get(`/chat${path}`, { params });
  } catch {
    return await api.get(`/api/chat${path}`, { params });
  }
};

const chatPost = async (path: string, body: Record<string, unknown>) => {
  try {
    return await api.post(`/chat${path}`, body);
  } catch {
    return await api.post(`/api/chat${path}`, body);
  }
};

const chatPatch = async (path: string, body: Record<string, unknown>) => {
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

  // ─── ZUSTAND STORE ───────────────────────────────────────────────────────────
  const {
    conversations,
    activeConvId,
    messages,
    fetchConversations,
    setActiveConversation,
    sendMessageOptimistic,
    addMessage,
    updateMessage,
    setConversations,
    clearHistory,
    localClearHistory,
    markAsRead,
    setLocalRead,
    deleteMessageOptimistic,
    // Search
    isSearching,
    setIsSearching,
    searchQuery,
    setSearchQuery,
    searchResults,
    searchHistory,
    performGlobalSearch,
    addToSearchHistory,
    clearSearchHistory,
  } = useChatStore();

  // ─── UI STATE ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<
    "chat" | "contacts" | "notifications" | "cloud"
  >("chat");
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [chatFilter, setChatFilter] = useState<"all" | "unread">("all");
  const [messageReactions, setMessageReactions] = useState<ReactionMap>({});
  const [conversationPreviewMap, setConversationPreviewMap] = useState<
    Record<string, string>
  >({});
  const [userProfiles, setUserProfiles] = useState<Record<string, UserProfile>>(
    {},
  );
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    message: ChatMessage;
    x: number;
    y: number;
  } | null>(null);
  const [reactionPicker, setReactionPicker] = useState<{
    messageId: string;
    x: number;
    y: number;
  } | null>(null);
  const [searchTab, setSearchTab] = useState<
    "all" | "contacts" | "messages" | "files"
  >("all");
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
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
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Sidebar accordion sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    media: true,
    file: true,
    link: true,
    security: true,
  });

  // ─── REFS ─────────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileLoadingRef = useRef<Set<string>>(new Set());
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── DERIVED STATE ────────────────────────────────────────────────────────────
  const selectedChat = conversations.find((c) => c.id === activeConvId) ?? null;

  const activePartnerEmail = useMemo(() => {
    if (!selectedChat || selectedChat.type !== "direct") return undefined;
    return (
      selectedChat.partner ||
      (Array.isArray(selectedChat.members)
        ? selectedChat.members.find((m: string) => m !== user?.email)
        : undefined)
    );
  }, [selectedChat, user?.email]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const mediaFiles = useMemo(() => {
    return messages
      .flatMap((m) => {
        const media = Array.isArray(m.media) ? m.media : [];
        return media.map((item: AttachmentInput) => ({
          ...normalizeAttachment(item),
          createdAt: m.createdAt,
        }));
      })
      .filter(
        (item) =>
          item.mimeType?.startsWith("image/") ||
          item.mimeType?.startsWith("video/"),
      )
      .reverse();
  }, [messages]);

  const docFiles = useMemo(() => {
    return messages
      .flatMap((m) => {
        const files = Array.isArray(m.files) ? m.files : [];
        const media = Array.isArray(m.media) ? m.media : [];
        return [...files, ...media].map((item: AttachmentInput) => ({
          ...normalizeAttachment(item),
          createdAt: m.createdAt,
        }));
      })
      .filter((item) => {
        const mime = item.mimeType || "";
        return (
          !mime.startsWith("image/") &&
          !mime.startsWith("video/") &&
          !!item.dataUrl
        );
      })
      .reverse();
  }, [messages]);

  const linkItems = useMemo(() => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return messages
      .filter((m) => !m.recalled)
      .flatMap((m) => {
        const matches = m.content?.match(urlRegex);
        if (!matches) return [];
        return matches.map((url: string) => ({
          url,
          senderId: m.senderId,
          createdAt: m.createdAt,
        }));
      })
      .reverse();
  }, [messages]);

  // ─── HELPERS ──────────────────────────────────────────────────────────────────
  const getMessagePreview = (message?: ChatMessage | null) => {
    if (!message) return "Tin nhắn";
    if (message.recalled) return "Tin nhắn đã được thu hồi";
    if (Array.isArray(message.media) && message.media.length > 0)
      return "[Hình ảnh]";
    if (Array.isArray(message.files) && message.files.length > 0)
      return "[Tệp đính kèm]";
    return String(message.content || "Tin nhắn");
  };

  const normalizeAttachment = (item: AttachmentInput) => {
    const name = item?.name || item?.fileName || "Tệp";
    const mimeType =
      item?.mimeType || item?.fileType || "application/octet-stream";
    const size = Number(item?.size || 0);
    const dataUrl = item?.dataUrl || item?.fileUrl || item?.url || "";
    return { name, mimeType, size, dataUrl };
  };

  const isUnread = (conv: ChatConversation) => {
    if (!conv || !user?.email) return false;
    const normalize = (email: string) =>
      (email || "").replace(/^USER#/, "").trim().toLowerCase();
    const myEmail = normalize(user.email);
    const lastSender = normalize(
      conv.lastMessageSenderId || conv.senderId || "",
    );
    if (lastSender === myEmail) return false;
    if (!conv.lastMessageTimestamp && !conv.updatedAt) return false;
    const lastReadTs = conv.lastReadAt || 0;
    const lastMsgTs =
      conv.lastMessageTimestamp ||
      (conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0);
    return lastReadTs < lastMsgTs;
  };

  const highlightText = (text: string, query: string) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span
              key={i}
              className="text-primary font-bold bg-primary/10 px-0.5 rounded"
            >
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </>
    );
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

  const normalizeConversation = (conv: ChatConversation) => {
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

  const upsertConversationLastMessage = (convId: string, msg: ChatMessage) => {
    setConversations((prev: ChatConversation[]) => {
      const index = prev.findIndex((conv) => conv.id === convId);
      if (index === -1) return prev;
      const next = [...prev];
      const target = next[index];
      const updated = {
        ...target,
        lastMessage: getMessagePreview(msg),
        lastMessageContent: getMessagePreview(msg),
        lastMessageSenderId: msg.senderId,
        lastMessageTimestamp: msg.createdAt
          ? new Date(msg.createdAt).getTime()
          : Date.now(),
        updatedAt: msg.createdAt || new Date().toISOString(),
      };
      next.splice(index, 1);
      next.unshift(updated);
      return next;
    });
  };

  const loadUserProfile = useCallback(async (email?: string) => {
    if (!email || email === user?.email || userProfiles[email]) return;
    if (profileLoadingRef.current.has(email)) return;
    profileLoadingRef.current.add(email);
    try {
      const res = await chatGet("/friends/search", { email });
      if (res.data?.found && res.data?.user) {
        setUserProfiles((prev) => ({ ...prev, [email]: res.data.user }));
      }
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      profileLoadingRef.current.delete(email);
    }
  }, [user?.email, userProfiles]);

  const openContextMenuForMessage = (message: ChatMessage, x: number, y: number) => {
    setContextMenu({ message, x, y });
    setReactionPicker({ messageId: message.id, x, y: y - 42 });
  };

  const closeOverlays = () => {
    setContextMenu(null);
    setReactionPicker(null);
    setFriendActionMenu(null);
  };

  const getReactionData = (message: ChatMessage) => messageReactions[message.id] || {};

  const getCurrentUserReaction = (message: ChatMessage) => {
    if (!user?.email) return undefined;
    const reactions = getReactionData(message);
    return Object.entries(reactions).find(([, users]) =>
      (users as string[]).includes(user.email),
    )?.[0];
  };

  const getReactionSummary = (message: ChatMessage) => {
    const reactions = getReactionData(message);
    return Object.entries(reactions)
      .filter(([, users]) => (users as string[]).length > 0)
      .slice(0, 3) as [string, string[]][];
  };

  // ─── EFFECTS ──────────────────────────────────────────────────────────────────

  // Close dropdown on outside click
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

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim() && isSearching) {
        performGlobalSearch(searchQuery);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, isSearching, performGlobalSearch]);

  // Scroll to highlighted message
  useEffect(() => {
    if (scrollTargetId && messages.length > 0) {
      const targetExists = messages.some((m) => m.id === scrollTargetId);
      if (targetExists) {
        const timer = setTimeout(() => {
          const element = document.getElementById(`msg-${scrollTargetId}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            element.classList.add(
              "ring-2",
              "ring-primary",
              "ring-offset-2",
              "rounded-lg",
              "transition-all",
              "duration-1000",
              "bg-primary/5",
            );
            setTimeout(() => {
              element.classList.remove(
                "ring-2",
                "ring-primary",
                "ring-offset-2",
                "bg-primary/5",
              );
              setScrollTargetId(null);
            }, 2000);
          }
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [scrollTargetId, messages]);

  // ESC closes search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isSearching) {
        setIsSearching(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSearching, setIsSearching, setSearchQuery]);

  // Fetch conversations on load
  useEffect(() => {
    if (!user?.email) return;
    fetchConversations();
  }, [user?.email, fetchConversations]);

  // Load profiles from conversation list
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
  }, [conversations, user?.email, loadUserProfile]);

  // Load profiles from messages
  useEffect(() => {
    messages.forEach((message) => {
      if (message.senderId && message.senderId !== user?.email) {
        loadUserProfile(message.senderId);
      }
    });
  }, [messages, user?.email, loadUserProfile]);

  // Load profiles from friends
  useEffect(() => {
    friendships
      .filter((item) => item.status === "accepted")
      .forEach((item) => {
        const friendEmail =
          item.sender_id === user?.email ? item.receiver_id : item.sender_id;
        loadUserProfile(friendEmail);
      });
  }, [friendships, user?.email, loadUserProfile]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Open direct chat from route state
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
  }, [location.state, navigate, user?.email, handleOpenDirectChat]);

  // Fetch friends when contacts tab is active
  useEffect(() => {
    if (!user?.email || activeTab !== "contacts") return;
    fetchFriendships();
  }, [user?.email, activeTab]);

  // Friend request events
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

      if (activeTab === "contacts") fetchFriendships();

      window.setTimeout(() => {
        setFriendNotifications((prev) =>
          prev.filter((item) => item.senderEmail !== senderEmail),
        );
      }, 6000);
    };

    const handleFriendshipUpdated = () => fetchFriendships();

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
  }, [activeTab, fetchFriendships]);

  // Socket: receive messages real-time
  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (msg: ChatMessage) => {
      if (!msg?.id) return;

      addMessage(msg);

      if (msg.reactions && typeof msg.reactions === "object") {
        setMessageReactions((prev) => ({
          ...prev,
          [msg.id]: msg.reactions,
        }));
      }

      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId) {
        setConversationPreviewMap((prev) => ({
          ...prev,
          [incomingConvId]: getMessagePreview(msg),
        }));
        upsertConversationLastMessage(incomingConvId, msg);

        if (incomingConvId === activeConvId) {
          markAsRead(incomingConvId);
        }
      }
    };

    const handleConversationRead = (data: { convId: string }) => {
      setLocalRead(data.convId);
    };

    const handlePresenceUpdate = (data: { email: string; status: string }) => {
      setUserProfiles((prev) => {
        if (data.status !== "online" && data.status !== "offline") {
          return prev;
        }
        const existing = prev[data.email] || {};
        return {
          ...prev,
          [data.email]: { ...existing, email: data.email, status: data.status },
        };
      });
    };

    const handleHistoryCleared = (data: { convId: string }) => {
      localClearHistory(data.convId);
      setConversationPreviewMap((prev) => {
        const next = { ...prev };
        delete next[data.convId];
        return next;
      });
    };

    socket.on("receiveMessage", handleReceiveMessage);
    socket.on("presence_update", handlePresenceUpdate);
    socket.on("history_cleared", handleHistoryCleared);
    socket.on("conversation_marked_read", handleConversationRead);

    return () => {
      socket.off("receiveMessage", handleReceiveMessage);
      socket.off("presence_update", handlePresenceUpdate);
      socket.off("history_cleared", handleHistoryCleared);
      socket.off("conversation_marked_read", handleConversationRead);
    };
  }, [socket, addMessage, activeConvId, markAsRead, localClearHistory, setLocalRead, upsertConversationLastMessage]);

  // ─── HANDLERS ─────────────────────────────────────────────────────────────────

  const handleScroll = () => {
    if (!scrollRef.current || !activeConvId) return;
    if (scrollRef.current.scrollTop === 0) {
      const { loadMoreMessages } = useChatStore.getState();
      loadMoreMessages(activeConvId);
    }
  };

  async function fetchFriendships() {
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
  }

  async function handleSelectChat(chat: ChatConversation) {
    const normalizedChat = normalizeConversation(chat);
    if (!normalizedChat) return;

    setActiveConversation(normalizedChat.id);
    setReplyTarget(null);
    closeOverlays();

    if (normalizedChat.type === "direct" && normalizedChat.partner) {
      loadUserProfile(normalizedChat.partner);
    }

    if (socket) {
      socket.emit("join_room", { convId: normalizedChat.id });
    }

    markAsRead(normalizedChat.id);
  }

  async function handleOpenDirectChat(friendEmail: string) {
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
        setConversations((prev: ChatConversation[]) => [directChat, ...prev]);
      }

      setActiveTab("chat");
      await handleSelectChat(directChat);
    } catch (err) {
      console.error("Failed to open direct chat", err);
    }
  }

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

  const handleSendMessage = async () => {
    if (
      (!inputText.trim() && attachments.length === 0) ||
      !selectedChat?.id ||
      !user?.email
    )
      return;

    const trimmedInput = inputText.trim();
    const currentAttachments = [...attachments];

    setInputText("");
    setAttachments([]);
    setReplyTarget(null);

    try {
      if (currentAttachments.length > 0) {
        const { compressImage } = await import("../utils/imageUtils");

        const uploadedAttachments = (await Promise.all(
          currentAttachments.map(async (item) => {
            let fileToUpload = item.file as File;
            if (fileToUpload.type.startsWith("image/")) {
              try {
                fileToUpload = await compressImage(fileToUpload);
              } catch (e) {
                console.warn("Compression failed, using original file", e);
              }
            }
            const uploadRes = await chatUpload(fileToUpload);
            return uploadRes.data;
          }),
        )) as UploadedAttachment[];

        const imageAttachments = uploadedAttachments.filter(
          (f) =>
            f.fileType?.startsWith("image/") ||
            f.mimeType?.startsWith("image/"),
        );
        const fileAttachments = uploadedAttachments.filter(
          (f) => !imageAttachments.includes(f),
        );

        const res = await api.post(
          `/chat/conversations/${encodeURIComponent(selectedChat.id)}/messages`,
          {
            content:
              trimmedInput ||
              (imageAttachments.length > 0 ? "[Hình ảnh]" : "[Tệp đính kèm]"),
            media: imageAttachments,
            files: fileAttachments,
            replyTo: replyTarget || undefined,
          },
        );

        addMessage(res.data);
      } else {
        await sendMessageOptimistic(
          selectedChat.id,
          user.email,
          trimmedInput,
          replyTarget || undefined,
        );
      }

      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: trimmedInput || "[Đa phương tiện]",
      }));
      upsertConversationLastMessage(selectedChat.id, {
        content: trimmedInput || "[Đa phương tiện]",
        senderId: user.email,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to send message", err);
      alert("Không gửi được tin nhắn. Vui lòng thử lại.");
    }
  };

  const handleClearHistory = async () => {
    if (!selectedChat?.id) return;
    const ok = window.confirm(
      "Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện này? Hành động này không thể hoàn tác.",
    );
    if (!ok) return;
    try {
      await clearHistory(selectedChat.id);
      alert("Đã xóa toàn bộ lịch sử trò chuyện.");
    } catch (err) {
      console.error("Failed to clear history", err);
      alert("Có lỗi xảy ra khi xóa lịch sử.");
    }
  };

  const toggleReaction = async (message: ChatMessage, emoji: string) => {
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
      updateMessage(messageId, updatedMessage);
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

  const pinMessage = async (message: ChatMessage) => {
    if (!selectedChat?.id) return;
    try {
      const res = await chatPatch(
        `/conversations/${encodeURIComponent(selectedChat.id)}/messages/${encodeURIComponent(message.id)}`,
        { action: "pin" },
      );
      const updatedMessage = res.data;
      updateMessage(message.id, updatedMessage);
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
      updateMessage(messageId, updatedMessage);
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
      updateMessage(messageId, updatedMessage);

      setConversationPreviewMap((prev) => ({
        ...prev,
        [selectedChat.id]: "Tin nhắn đã được thu hồi",
      }));

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

  const startReply = (message: ChatMessage) => {
    setReplyTarget({
      id: message.id,
      senderId: message.senderId,
      content: getMessagePreview(message),
    });
    closeOverlays();
  };

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

  const handleSetNickname = async (
    email: string,
    currentNickname?: string,
  ) => {
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

  // ─── DERIVED ──────────────────────────────────────────────────────────────────

  const activePinnedMessages = messages
    .filter((message) => message.pinned)
    .sort((a, b) =>
      String(b.pinnedAt || "").localeCompare(String(a.pinnedAt || "")),
    )
    .slice(0, 3);

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
    userProfiles,
  ]);

  const pendingRequestCount = friendships.filter(
    (item) => item.status === "pending" && item.receiver_id === user?.email,
  ).length;

  // ─── RENDER HELPERS ───────────────────────────────────────────────────────────

  const renderNavButton = (
    id: typeof activeTab,
    icon: string,
    hasBadge: boolean = false,
  ) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => {
          setActiveTab(id);
          setIsSearching(false);
          setSearchQuery("");
        }}
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

  // ─── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-screen w-full overflow-hidden bg-surface text-on-surface antialiased font-['Plus_Jakarta_Sans'] border border-outline-variant/20"
      onClick={closeOverlays}
    >
      {/* COLUMN 1: SideNavBar */}
      <aside className="fixed left-0 top-0 h-full z-50 w-20 flex flex-col items-center py-6 bg-gradient-to-br from-[#0058bc] to-[#00418f] shadow-[0px_20px_40px_rgba(0,65,143,0.06)] shrink-0">
        <div className="mb-8">
          <img
            alt="User Avatar"
            onClick={() => {
              setIsProfileModalOpen(true);
              setIsSearching(false);
              setSearchQuery("");
            }}
            className="w-12 h-12 rounded-full border-2 border-white/20 p-0.5 object-cover bg-white/10 cursor-pointer hover:border-white transition-colors"
            src={user?.avatarUrl || "/logo_blue.png"}
          />
        </div>

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

        <div className="mt-auto space-y-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => {
                setIsDropdownOpen(!isDropdownOpen);
                setIsSearching(false);
                setSearchQuery("");
              }}
              className={`rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative ${
                isDropdownOpen
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10 active:scale-90"
              }`}
              title="Cài đặt"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>

            {isDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-3 w-64 bg-white rounded-2xl shadow-[0_-12px_40px_rgba(0,0,0,0.15)] z-[100] border border-outline-variant/10 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
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
                  {[
                    { icon: "database", label: "Dữ liệu" },
                    { icon: "language", label: "Ngôn ngữ" },
                    { icon: "support_agent", label: "Hỗ trợ" },
                  ].map(({ icon, label }) => (
                    <button
                      key={icon}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-surface-container transition-colors text-on-surface font-semibold text-sm group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">
                          {icon}
                        </span>
                        {label}
                      </div>
                      <span className="material-symbols-outlined text-[18px] text-outline opacity-0 group-hover:opacity-100 transition-opacity">
                        chevron_right
                      </span>
                    </button>
                  ))}
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

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* COLUMN 2: List Panel */}
      <section className="ml-20 w-[320px] bg-white h-full flex flex-col z-10 border-r border-outline-variant/30 shrink-0">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                className="w-full bg-surface-container-highest border-none rounded-[16px] py-2 pl-[34px] pr-4 text-[13px] focus:ring-2 focus:ring-primary/40 transition-all outline-none text-on-surface placeholder:text-outline"
                placeholder="Tìm kiếm liên hệ, tin nhắn..."
                value={searchQuery}
                onFocus={() => setIsSearching(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowAllContacts(false);
                  setShowAllFiles(false);
                  setShowAllMessages(false);
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface-variant transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    cancel
                  </span>
                </button>
              )}
            </div>
            {isSearching ? (
              <button
                onClick={() => {
                  setIsSearching(false);
                  setSearchQuery("");
                }}
                className="text-primary font-bold text-[13px] whitespace-nowrap px-2 hover:bg-primary/5 rounded-lg py-1 transition-colors"
              >
                Đóng
              </button>
            ) : (
              <div className="flex gap-1">
                <Link
                  to="/friends"
                  className="p-2 hover:bg-surface-container rounded-xl transition-colors"
                >
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                    person_add
                  </span>
                </Link>
                <button className="p-2 hover:bg-surface-container rounded-xl transition-colors">
                  <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                    group_add
                  </span>
                </button>
              </div>
            )}
          </div>

          {!isSearching && (
            <>
              {activeTab === "chat" && (
                <div className="flex items-center gap-4 text-sm font-semibold px-1">
                  <button
                    onClick={() => setChatFilter("all")}
                    className={`${chatFilter === "all" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"} transition-colors pb-1`}
                  >
                    Tất cả
                  </button>
                  <button
                    onClick={() => setChatFilter("unread")}
                    className={`${chatFilter === "unread" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"} transition-colors pb-1`}
                  >
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
            </>
          )}
        </div>

        {/* Search overlay + list */}
        <div className="flex-1 relative overflow-hidden">
          {isSearching && (
            <div
              className="fixed inset-0 bg-black/0 z-10 cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                setIsSearching(false);
                setSearchQuery("");
              }}
            />
          )}

          {/* Search overlay */}
          <div
            className={`flex flex-col overflow-hidden transition-all duration-300 absolute inset-0 ${
              isSearching
                ? "z-20 opacity-100"
                : "-z-10 pointer-events-none opacity-0"
            }`}
          >
            <div className="bg-white absolute inset-0 flex flex-col shadow-2xl">
              <div className="flex border-b border-outline-variant/10 px-2 shrink-0">
                {(["all", "contacts", "messages", "files"] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setSearchTab(tab)}
                      className={`flex-1 py-3 text-[13px] font-bold transition-all relative ${
                        searchTab === tab
                          ? "text-primary"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {tab === "all"
                        ? "Tất cả"
                        : tab === "contacts"
                          ? "Liên hệ"
                          : tab === "messages"
                            ? "Tin nhắn"
                            : "File"}
                      {searchTab === tab && (
                        <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-primary rounded-t-full" />
                      )}
                    </button>
                  ),
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-[#f4f7fa] p-2 space-y-4">
                {/* Search history */}
                {!searchQuery && searchHistory.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm border border-outline-variant/5">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Tìm kiếm gần đây
                      </h4>
                      <button
                        onClick={clearSearchHistory}
                        className="text-[11px] text-primary font-bold hover:underline"
                      >
                        Xóa tất cả
                      </button>
                    </div>
                    <div className="space-y-1">
                      {searchHistory.map((h, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSearchQuery(h);
                            setShowAllContacts(false);
                            setShowAllFiles(false);
                            setShowAllMessages(false);
                            performGlobalSearch(h);
                          }}
                          className="w-full flex items-center gap-3 py-2 px-3 hover:bg-surface-container rounded-xl transition-colors group"
                        >
                          <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary">
                            history
                          </span>
                          <span className="text-[13px] text-on-surface">
                            {h}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchQuery && (
                  <>
                    {/* Contacts */}
                    {(searchTab === "all" || searchTab === "contacts") &&
                      searchResults.contacts.length > 0 && (
                        <div className="bg-white rounded-2xl p-2 shadow-sm border border-outline-variant/5">
                          <div className="flex justify-between items-center px-3 py-2">
                            <h4 className="text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                              Liên hệ ({searchResults.contacts.length})
                            </h4>
                          </div>
                          <div className="space-y-0.5">
                            {(() => {
                              const sorted = [...searchResults.contacts].sort(
                                (a, b) => {
                                  const convA = conversations.find(
                                    (c) =>
                                      c.type === "direct" &&
                                      (c.members?.includes(a.email) ||
                                        c.partner === a.email),
                                  );
                                  const convB = conversations.find(
                                    (c) =>
                                      c.type === "direct" &&
                                      (c.members?.includes(b.email) ||
                                        c.partner === b.email),
                                  );
                                  const timeA =
                                    convA?.lastMessageTimestamp || 0;
                                  const timeB =
                                    convB?.lastMessageTimestamp || 0;
                                  if (timeB !== timeA) return timeB - timeA;
                                  return a.fullName.localeCompare(b.fullName);
                                },
                              );
                              const displayed = showAllContacts
                                ? sorted
                                : sorted.slice(0, 5);
                              return (
                                <>
                                  {displayed.map((c, i) => (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        handleOpenDirectChat(c.email);
                                        addToSearchHistory(searchQuery);
                                        setIsSearching(false);
                                      }}
                                      className="flex items-center gap-3 p-3 hover:bg-surface-container rounded-xl cursor-pointer transition-all"
                                    >
                                      <img
                                        src={getDisplayAvatar(c.email)}
                                        className="w-10 h-10 rounded-full object-cover ring-1 ring-outline-variant/10"
                                        alt=""
                                      />
                                      <div className="min-w-0">
                                        <p className="text-[14px] font-bold text-on-surface truncate">
                                          {highlightText(
                                            c.fullName,
                                            searchQuery,
                                          )}
                                        </p>
                                        <p className="text-[12px] text-on-surface-variant truncate">
                                          {highlightText(c.email, searchQuery)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                  {!showAllContacts && sorted.length > 5 && (
                                    <button
                                      onClick={() => setShowAllContacts(true)}
                                      className="w-full flex items-center justify-center gap-2 py-2 mt-1 text-[13px] font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors"
                                    >
                                      Xem thêm ({sorted.length - 5})
                                      <span className="material-symbols-outlined text-[18px]">
                                        expand_more
                                      </span>
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                    {/* Messages */}
                    {(searchTab === "all" || searchTab === "messages") &&
                      searchResults.messages.length > 0 && (
                        <div className="bg-white rounded-2xl p-2 shadow-sm border border-outline-variant/5">
                          <h4 className="px-3 py-2 text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                            Tin nhắn ({searchResults.messages.length})
                          </h4>
                          <div className="space-y-0.5">
                            {(() => {
                              const displayed = showAllMessages
                                ? searchResults.messages
                                : searchResults.messages.slice(0, 5);
                              return (
                                <>
                                  {displayed.map((m, i) => (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        const conv = conversations.find(
                                          (c) => c.id === m.convId,
                                        );
                                        if (conv) handleSelectChat(conv);
                                        else handleSelectChat({ id: m.convId });
                                        setScrollTargetId(m.id);
                                        addToSearchHistory(searchQuery);
                                        setIsSearching(false);
                                        setSearchQuery("");
                                      }}
                                      className="flex items-center gap-3 p-3 hover:bg-surface-container rounded-xl cursor-pointer transition-all group"
                                    >
                                      <img
                                        src={getDisplayAvatar(m.senderId)}
                                        className="w-9 h-9 rounded-full object-cover border border-outline-variant/10 shadow-sm"
                                        alt=""
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex justify-between items-center mb-0.5">
                                          <p className="text-[13px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                                            {getDisplayName(m.senderId)}
                                          </p>
                                          <span className="text-[10px] text-on-surface-variant">
                                            {new Date(
                                              m.createdAt,
                                            ).toLocaleDateString()}
                                          </span>
                                        </div>
                                        <p className="text-[13px] text-on-surface-variant line-clamp-2 leading-relaxed">
                                          {highlightText(m.content, searchQuery)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                  {!showAllMessages &&
                                    searchResults.messages.length > 5 && (
                                      <button
                                        onClick={() => setShowAllMessages(true)}
                                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 text-[13px] font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors"
                                      >
                                        Xem thêm (
                                        {searchResults.messages.length - 5} tin
                                        nhắn)
                                        <span className="material-symbols-outlined text-[18px]">
                                          expand_more
                                        </span>
                                      </button>
                                    )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                    {/* Files */}
                    {(searchTab === "all" || searchTab === "files") &&
                      searchResults.files.length > 0 && (
                        <div className="bg-white rounded-2xl p-2 shadow-sm border border-outline-variant/5">
                          <h4 className="px-3 py-2 text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">
                            File ({searchResults.files.length})
                          </h4>
                          <div className="space-y-0.5">
                            {(() => {
                              const sorted = [...searchResults.files].sort(
                                (a, b) =>
                                  new Date(b.createdAt).getTime() -
                                  new Date(a.createdAt).getTime(),
                              );
                              const displayed = showAllFiles
                                ? sorted
                                : sorted.slice(0, 5);
                              return (
                                <>
                                  {displayed.map((f, i) => (
                                    <div
                                      key={i}
                                      onClick={() => {
                                        const conv = conversations.find(
                                          (c) => c.id === f.convId,
                                        );
                                        if (conv) handleSelectChat(conv);
                                        else handleSelectChat({ id: f.convId });
                                        setScrollTargetId(f.messageId);
                                        addToSearchHistory(searchQuery);
                                        setIsSearching(false);
                                        setSearchQuery("");
                                      }}
                                      className="flex items-center gap-3 p-3 hover:bg-surface-container rounded-xl cursor-pointer transition-all group"
                                    >
                                      <div className="w-10 h-10 bg-surface-container-highest/50 rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                        <span className="material-symbols-outlined text-primary text-[24px]">
                                          {getFileIcon(f.mimeType, f.name)}
                                        </span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                                          {highlightText(f.name, searchQuery)}
                                        </p>
                                        <p className="text-[11px] text-on-surface-variant truncate">
                                          {(f.size / 1024 / 1024).toFixed(1)}{" "}
                                          MB • {getDisplayName(f.senderId)} •{" "}
                                          {new Date(
                                            f.createdAt,
                                          ).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                  {!showAllFiles && sorted.length > 5 && (
                                    <button
                                      onClick={() => setShowAllFiles(true)}
                                      className="w-full flex items-center justify-center gap-2 py-2 mt-1 text-[13px] font-bold text-primary hover:bg-primary/5 rounded-xl transition-colors"
                                    >
                                      Xem thêm ({sorted.length - 5} file)
                                      <span className="material-symbols-outlined text-[18px]">
                                        expand_more
                                      </span>
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                    {searchResults.contacts.length === 0 &&
                      searchResults.messages.length === 0 &&
                      searchResults.files.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-12 text-center opacity-60">
                          <span className="material-symbols-outlined text-[48px] mb-2">
                            search_off
                          </span>
                          <p className="text-[14px]">
                            Không tìm thấy kết quả nào cho "{searchQuery}"
                          </p>
                        </div>
                      )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Conversation / Contacts list */}
          <div
            className={`h-full flex flex-col overflow-hidden transition-all duration-300 ${
              isSearching
                ? "opacity-30 blur-sm pointer-events-none"
                : "opacity-100 blur-0"
            }`}
          >
            <div className="flex-1 overflow-y-auto hide-scrollbar pb-4 px-2 space-y-1">
              {activeTab === "chat" ? (
                conversations.length === 0 ? (
                  <div className="text-center p-8 opacity-50 mt-10">
                    <p className="font-medium text-[13px] text-on-surface">
                      Chưa có cuộc trò chuyện nào
                    </p>
                  </div>
                ) : (
                  conversations
                    .filter((conv) => chatFilter === "all" || isUnread(conv))
                    .map((chat) => {
                      const isSelected = selectedChat?.id === chat.id;
                      const partnerEmail =
                        chat.type === "direct"
                          ? chat.partner ||
                            (Array.isArray(chat.members)
                              ? chat.members.find(
                                  (m: string) => m !== user?.email,
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
                      const partnerStatus = partnerEmail
                        ? userProfiles[partnerEmail]?.status
                        : undefined;
                      const isOnline =
                        chat.online || partnerStatus === "online";
                      const unread = isUnread(chat);
                      const previewText =
                        conversationPreviewMap[chat.id] ||
                        chat.lastMessageContent ||
                        chat.lastMessage ||
                        "Chưa có tin nhắn";

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
                            {isOnline && (
                              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <h3
                                className={`text-[14px] truncate ${unread ? "font-bold" : "font-semibold"} ${
                                  isSelected
                                    ? "text-on-secondary-container"
                                    : "text-on-surface"
                                }`}
                              >
                                {chatName}
                              </h3>
                              {chat.updatedAt && (
                                <span className="text-[10px] text-on-surface-variant font-medium shrink-0 ml-2">
                                  {new Date(chat.updatedAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <p
                                className={`text-[13px] truncate flex-1 ${
                                  unread
                                    ? "font-bold text-on-surface"
                                    : "text-on-surface-variant"
                                }`}
                              >
                                {previewText}
                              </p>
                              {unread && (
                                <div className="w-2.5 h-2.5 bg-error rounded-full shrink-0 ml-2 shadow-sm shadow-error/20" />
                              )}
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
                                handleAcceptFriendRequest(
                                  notification.senderEmail,
                                )
                              }
                              className="flex-1 rounded-xl bg-primary text-white py-2 text-[12px] font-bold"
                            >
                              Chấp nhận
                            </button>
                            <button
                              onClick={() =>
                                handleRejectFriendRequest(
                                  notification.senderEmail,
                                )
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
                        onChange={(e) => setFriendSearchQuery(e.target.value)}
                        placeholder="Tìm bạn bè..."
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
                      {friendSortOrder === "asc" ? "A-Z" : "Z-A"}
                    </button>
                  </div>

                  <div className="px-2 flex items-center justify-between text-[12px] font-semibold text-on-surface-variant">
                    <span>Bạn bè ({acceptedFriends.length})</span>
                    {pendingRequestCount > 0 && (
                      <span>{pendingRequestCount} lời mời</span>
                    )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = e.currentTarget.getBoundingClientRect();
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
          </div>
        </div>
      </section>

      {/* Main content: welcome or chat */}
      {!selectedChat ? (
        <main className="flex-1 bg-[#f7f9fb] flex flex-col items-center justify-center relative shadow-[inset_1px_0_0_rgba(0,0,0,0.05)]">
          <img
            src="/logo_blue.png"
            alt="Welcome"
            className="w-48 h-auto mb-8 animate-float opacity-80 mix-blend-multiply"
            onError={(e) => {
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
            Khám phá tiện ích hỗ trợ làm việc và học tập, kết nối với giảng
            viên và sinh viên một cách dễ dàng.
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
        <>
          {/* COLUMN 3: Chat window */}
          <main
            onClick={() => {
              if (selectedChat?.id) markAsRead(selectedChat.id);
            }}
            className="flex-1 flex flex-col bg-[#f7f9fb] overflow-hidden relative shadow-[inset_1px_0_0_rgba(0,0,0,0.05)] border-r border-outline-variant/20"
          >
            {/* Chat header */}
            <header className="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur-xl border-b border-outline-variant/15 z-20 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  className="w-10 h-10 rounded-full object-cover bg-surface-container"
                  alt="Avatar"
                  src={
                    selectedChat.type === "direct"
                      ? getDisplayAvatar(activePartnerEmail)
                      : selectedChat.avatar
                  }
                />
                <div>
                  <h2 className="font-bold text-on-surface leading-tight text-[15px]">
                    {selectedChat.type === "direct"
                      ? getDisplayName(activePartnerEmail)
                      : selectedChat.name}
                  </h2>
                  <div className="flex items-center gap-1 text-[12px] text-on-surface-variant font-medium">
                    {selectedChat.type === "group" ? (
                      <>
                        <span className="material-symbols-outlined text-[13px]">
                          group
                        </span>
                        <span>
                          {selectedChat.members?.length || 0} thành viên
                        </span>
                      </>
                    ) : (
                      <>
                        {(() => {
                          const isOnline = activePartnerEmail
                            ? userProfiles[activePartnerEmail]?.status ===
                              "online"
                            : false;
                          return (
                            <>
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isOnline ? "bg-green-500" : "bg-outline-variant"
                                }`}
                              />
                              <span>
                                {isOnline
                                  ? "Đang hoạt động"
                                  : "Đang ngoại tuyến"}
                              </span>
                            </>
                          );
                        })()}
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
                <button
                  onClick={() => setIsInfoOpen(!isInfoOpen)}
                  className={`p-2 rounded-full transition-all ${
                    isInfoOpen
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <span className="material-symbols-outlined">
                    dock_to_left
                  </span>
                </button>
              </div>
            </header>

            {/* Pinned messages */}
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

            {/* Messages */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-6 space-y-6 hide-scrollbar flex flex-col"
            >
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
                        id={`msg-${message.id}`}
                        className="flex items-end justify-end gap-3 mt-auto group transition-all duration-300"
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
                                ).map((item: AttachmentInput, index: number) => {
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
                                ).map((item: AttachmentInput, index: number) => {
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
                        id={`msg-${message.id}`}
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
                                ).map((item: AttachmentInput, index: number) => {
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
                                ).map((item: AttachmentInput, index: number) => {
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
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
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
                        ✕
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
                  onFocus={() => {
                    if (selectedChat?.id) markAsRead(selectedChat.id);
                  }}
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
                />
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

          {/* COLUMN 4: Info sidebar */}
          <aside
            className={`w-[320px] bg-[#f4f7fa] border-l border-outline-variant/20 flex flex-col h-full z-40 font-['Plus_Jakarta_Sans'] text-sm shrink-0 transition-all duration-300 ${
              isInfoOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0 pointer-events-none !w-0 !p-0 !border-0"
            }`}
          >
            <div className="h-[68px] flex items-center justify-center bg-white border-b border-outline-variant/10 shrink-0">
              <h2 className="text-[#001a33] font-bold text-[16px]">
                Thông tin hội thoại
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar">
              {/* Profile card */}
              <div className="bg-white p-6 text-center border-b border-outline-variant/10">
                <img
                  className="w-20 h-20 rounded-full mx-auto object-cover ring-1 ring-outline-variant/20 mb-4"
                  alt="Avatar"
                  src={
                    selectedChat.type === "direct"
                      ? getDisplayAvatar(activePartnerEmail)
                      : selectedChat.avatar
                  }
                />
                <div className="flex items-center justify-center gap-2">
                  <h3 className="font-bold text-[#001a33] text-[18px]">
                    {selectedChat.type === "direct"
                      ? getDisplayName(activePartnerEmail)
                      : selectedChat.name}
                  </h3>
                </div>
              </div>

              {/* Quick actions */}
              <div className="bg-white mb-2">
                <button className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-[#001a33]">
                  <span className="material-symbols-outlined text-gray-500">
                    alarm
                  </span>
                  <span className="text-[14px]">Danh sách nhắc hẹn</span>
                </button>
                <button className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-[#001a33]">
                  <span className="material-symbols-outlined text-gray-500">
                    groups
                  </span>
                  <span className="text-[14px]">
                    {selectedChat.type === "direct"
                      ? "Nhóm chung"
                      : "Thành viên"}
                  </span>
                </button>
              </div>

              {/* Accordion: Media */}
              <div className="bg-white mb-2 overflow-hidden border-y border-outline-variant/10">
                <button
                  onClick={() => toggleSection("media")}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-bold text-[#001a33]">Ảnh/Video</span>
                  <span
                    className={`material-symbols-outlined text-gray-400 transition-transform ${
                      openSections.media ? "" : "-rotate-90"
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                {openSections.media && (
                  <div className="p-4 pt-0">
                    {mediaFiles.length === 0 ? (
                      <p className="px-2 py-4 text-center text-gray-400 text-xs italic">
                        Chưa có Ảnh/Video được chia sẻ
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-1 mb-4 rounded-lg overflow-hidden">
                          {mediaFiles.slice(0, 6).map((file, idx) => (
                            <div
                              key={`side-media-${idx}`}
                              className="aspect-square bg-gray-100"
                            >
                              <img
                                src={file.dataUrl}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                alt="Media"
                              />
                            </div>
                          ))}
                        </div>
                        <button className="w-full py-2.5 bg-[#eaedf0] text-[#001a33] font-bold text-sm rounded-lg hover:bg-gray-300 transition-colors">
                          Xem tất cả
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Accordion: File */}
              <div className="bg-white mb-2 overflow-hidden border-y border-outline-variant/10">
                <button
                  onClick={() => toggleSection("file")}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-bold text-[#001a33]">File</span>
                  <span
                    className={`material-symbols-outlined text-gray-400 transition-transform ${
                      openSections.file ? "" : "-rotate-90"
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                {openSections.file && (
                  <div className="px-6 py-4 pt-0">
                    {docFiles.length === 0 ? (
                      <p className="py-4 text-center text-gray-400 text-xs italic">
                        Chưa có File được chia sẻ
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {docFiles.slice(0, 3).map((file, idx) => (
                          <div
                            key={`side-file-${idx}`}
                            className="flex items-center gap-3"
                          >
                            <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center">
                              <span className="material-symbols-outlined text-gray-500">
                                {getFileIcon(file.mimeType, file.name)}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#001a33] truncate">
                                {file.name}
                              </p>
                              <p className="text-[11px] text-gray-400 uppercase">
                                {formatFileSize(file.size)} •{" "}
                                {file.createdAt
                                  ? new Date(
                                      file.createdAt,
                                    ).toLocaleDateString()
                                  : "--"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Accordion: Link */}
              <div className="bg-white mb-2 overflow-hidden border-y border-outline-variant/10">
                <button
                  onClick={() => toggleSection("link")}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-bold text-[#001a33]">Link</span>
                  <span
                    className={`material-symbols-outlined text-gray-400 transition-transform ${
                      openSections.link ? "" : "-rotate-90"
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                {openSections.link && (
                  <div className="px-6 py-4 pt-0">
                    {linkItems.length === 0 ? (
                      <p className="py-4 text-center text-gray-400 text-xs italic">
                        Chưa có Link được chia sẻ
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {linkItems.slice(0, 3).map((item, idx) => (
                          <a
                            key={`side-link-${idx}`}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 group"
                          >
                            <div className="w-10 h-10 rounded bg-[#e8f2ff] flex items-center justify-center">
                              <span className="material-symbols-outlined text-primary text-[20px]">
                                link
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#001a33] truncate group-hover:text-primary transition-colors">
                                {item.url}
                              </p>
                              <p className="text-[11px] text-gray-400 truncate">
                                Từ: {item.senderId}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Accordion: Security */}
              <div className="bg-white mb-2 overflow-hidden border-y border-outline-variant/10">
                <button
                  onClick={() => toggleSection("security")}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-bold text-[#001a33]">
                    Thiết lập bảo mật
                  </span>
                  <span
                    className={`material-symbols-outlined text-gray-400 transition-transform ${
                      openSections.security ? "" : "-rotate-90"
                    }`}
                  >
                    expand_more
                  </span>
                </button>
                {openSections.security && (
                  <div className="px-6 py-2">
                    <div className="flex items-start gap-4 py-3">
                      <span className="material-symbols-outlined text-gray-500 mt-1">
                        timer
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium">
                            Tin nhắn tự xóa
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Không bao giờ
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-4">
                        <span className="material-symbols-outlined text-gray-500">
                          visibility_off
                        </span>
                        <span className="text-sm font-medium">
                          Ẩn trò chuyện
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Danger actions */}
              <div className="bg-white mt-1 border-t border-outline-variant/10">
                <button className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-[#001a33]">
                  <span className="material-symbols-outlined text-gray-500">
                    report
                  </span>
                  <span className="text-sm font-medium">Báo xấu</span>
                </button>
                <button
                  onClick={handleClearHistory}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors text-error"
                >
                  <span className="material-symbols-outlined text-error">
                    delete
                  </span>
                  <span className="text-sm font-medium">
                    Xoá lịch sử trò chuyện
                  </span>
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Reaction picker */}
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

      {/* Friend action menu */}
      {friendActionMenu && (
        <div
          className="fixed z-[1002] min-w-[210px] rounded-2xl border border-outline-variant/20 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
          style={{ left: friendActionMenu.x, top: friendActionMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              handleViewProfile(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Xem hồ sơ
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
            Đặt biệt danh
          </button>
          <button
            onClick={() => {
              handleBlockUser(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Chặn
          </button>
          <button
            onClick={() => {
              handleUnfriend(friendActionMenu.email);
              setFriendActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-error hover:bg-red-50"
          >
            Xóa bạn bè
          </button>
        </div>
      )}

      {/* Context menu */}
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
          <button
            onClick={() => {
              if (selectedChat?.id) {
                deleteMessageOptimistic(
                  selectedChat.id,
                  contextMenu.message.id,
                );
                closeOverlays();
              }
            }}
            className="block w-full text-left px-2 py-1 hover:bg-error/5 text-error rounded"
          >
            Xóa (Phía tôi)
          </button>
          {contextMenu.message?.senderId === user?.email &&
            !contextMenu.message?.recalled && (
              <button
                onClick={() => recallMessage(contextMenu.message.id)}
                className="block w-full text-left px-2 py-1 hover:bg-error/5 text-error rounded font-bold"
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
