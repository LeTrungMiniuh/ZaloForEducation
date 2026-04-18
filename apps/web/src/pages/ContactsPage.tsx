import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import type {
  Conversation,
  FriendSuggestion,
  Friendship,
} from "@zalo-edu/shared";

type ContactsFilter = "all" | "with-nickname" | "without-nickname" | "blocked";
type SidebarSection = "friends" | "groups" | "requests" | "invitations";

type ChatUserProfile = {
  email: string;
  fullName?: string;
  fullname?: string;
  avatarUrl?: string;
  bio?: string;
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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const ContactsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileLoadingRef = useRef<Set<string>>(new Set());

  const [sidebarSection, setSidebarSection] =
    useState<SidebarSection>("friends");
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [requests, setRequests] = useState<
    Array<Friendship & { senderProfile?: ChatUserProfile }>
  >([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userProfiles, setUserProfiles] = useState<
    Record<string, ChatUserProfile>
  >({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<ContactsFilter>("all");
  const [hiddenSuggestionEmails, setHiddenSuggestionEmails] = useState<
    string[]
  >([]);
  const [pendingSuggestionEmails, setPendingSuggestionEmails] = useState<
    string[]
  >([]);
  const [suggestionCache, setSuggestionCache] = useState<
    Record<string, FriendSuggestion>
  >({});
  const [sendingSuggestionEmails, setSendingSuggestionEmails] = useState<
    string[]
  >([]);
  const [isGmailSearchOpen, setIsGmailSearchOpen] = useState(false);
  const [gmailSearchEmail, setGmailSearchEmail] = useState("");
  const [gmailSearchResult, setGmailSearchResult] = useState<{
    found: boolean;
    isSelf?: boolean;
    user?: ChatUserProfile & { email: string };
    friendship?: {
      senderEmail: string;
      receiverEmail: string;
      status: string;
    } | null;
  } | null>(null);
  const [gmailSearchMessage, setGmailSearchMessage] = useState("");
  const [gmailSearchLoading, setGmailSearchLoading] = useState(false);
  const [actionMenu, setActionMenu] = useState<{
    email: string;
    x: number;
    y: number;
  } | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const myEmail = user?.email || "";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadUserProfile = useCallback(
    async (email?: string) => {
      if (!email || email === myEmail || userProfiles[email]) return;
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
      } catch (error) {
        console.error("Failed to load user profile", error);
      } finally {
        profileLoadingRef.current.delete(email);
      }
    },
    [myEmail, userProfiles],
  );

  const refreshContacts = useCallback(async () => {
    if (!myEmail) return;

    setLoading(true);
    try {
      const [friendRes, requestRes, suggestionRes, conversationRes] =
        await Promise.all([
          chatGet("/friends"),
          chatGet("/friends/requests"),
          chatGet("/friends/suggestions"),
          chatGet("/conversations"),
        ]);

      const nextFriendships = Array.isArray(friendRes.data)
        ? friendRes.data
        : [];
      const nextRequests = Array.isArray(requestRes.data)
        ? requestRes.data
        : [];
      const nextSuggestions = Array.isArray(suggestionRes.data)
        ? suggestionRes.data
        : [];
      const nextConversations = Array.isArray(conversationRes.data)
        ? conversationRes.data
        : [];

      setFriendships(nextFriendships);
      setRequests(nextRequests);
      setSuggestions(nextSuggestions);
      setConversations(nextConversations);

      nextFriendships
        .filter((item: Friendship) => item.status === "accepted")
        .forEach((item: Friendship) => {
          const friendEmail =
            item.sender_id === myEmail ? item.receiver_id : item.sender_id;
          loadUserProfile(friendEmail);
        });

      nextRequests.forEach((request) => {
        loadUserProfile(request.sender_id);
      });
    } catch (error) {
      console.error("Failed to load contacts", error);
      setFriendships([]);
      setRequests([]);
      setSuggestions([]);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [myEmail, loadUserProfile]);

  useEffect(() => {
    refreshContacts().catch(() => null);
  }, [refreshContacts]);

  useEffect(() => {
    const handleFriendRequestReceived = () => {
      refreshContacts().catch(() => null);
    };

    const handleFriendshipUpdated = () => {
      refreshContacts().catch(() => null);
    };

    window.addEventListener(
      "friend-request-received",
      handleFriendRequestReceived,
    );
    window.addEventListener("friendship-updated", handleFriendshipUpdated);

    return () => {
      window.removeEventListener(
        "friend-request-received",
        handleFriendRequestReceived,
      );
      window.removeEventListener("friendship-updated", handleFriendshipUpdated);
    };
  }, [refreshContacts]);

  const getDisplayName = useCallback(
    (email?: string, nickname?: string) => {
      if (!email) return "Người dùng";
      if (email === myEmail) return user?.fullName || user?.fullname || "Bạn";
      return (
        nickname ||
        userProfiles[email]?.fullName ||
        userProfiles[email]?.fullname ||
        email
      );
    },
    [myEmail, user?.fullName, user?.fullname, userProfiles],
  );

  const getDisplayAvatar = useCallback(
    (email?: string) => {
      if (!email) return "/logo_blue.png";
      if (email === myEmail) return user?.avatarUrl || "/logo_blue.png";
      return userProfiles[email]?.avatarUrl || "/logo_blue.png";
    },
    [myEmail, user?.avatarUrl, userProfiles],
  );

  const incomingRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.status === "pending" && request.receiver_id === myEmail,
      ),
    [requests, myEmail],
  );

  const pendingRequestCount = incomingRequests.length;

  const visibleSuggestions = useMemo(
    () => {
      const nextSuggestions = new Map<string, FriendSuggestion>();

      suggestions.forEach((suggestion) => {
        nextSuggestions.set(suggestion.email, suggestion);
      });

      pendingSuggestionEmails.forEach((email) => {
        const cachedSuggestion = suggestionCache[email];
        if (cachedSuggestion) {
          nextSuggestions.set(email, cachedSuggestion);
        }
      });

      return Array.from(nextSuggestions.values())
        .filter((suggestion) => !hiddenSuggestionEmails.includes(suggestion.email))
        .sort((left, right) =>
          left.fullName.localeCompare(right.fullName, "vi"),
        );
    },
    [
      suggestions,
      hiddenSuggestionEmails,
      pendingSuggestionEmails,
      suggestionCache,
    ],
  );

  useEffect(() => {
    setPendingSuggestionEmails((prev) =>
      prev.filter((email) =>
        friendships.some(
          (item) =>
            item.status === "pending" &&
            item.sender_id === myEmail &&
            item.receiver_id === email,
        ),
      ),
    );
  }, [friendships, myEmail]);

  const outgoingPendingSuggestionEmails = useMemo(
    () =>
      friendships
        .filter(
          (item) =>
            item.status === "pending" && item.sender_id === myEmail,
        )
        .map((item) => item.receiver_id),
    [friendships, myEmail],
  );

  const acceptedContacts = useMemo(() => {
    const seen = new Set<string>();

    return friendships
      .filter((item) => item.status === "accepted")
      .map((item) => {
        const email =
          item.sender_id === myEmail ? item.receiver_id : item.sender_id;
        const profile = userProfiles[email];
        return {
          email,
          displayName: getDisplayName(email, item.nickname),
          avatarUrl: getDisplayAvatar(email),
          nickname: item.nickname || "",
          blocked: item.status === "blocked",
          status: item.status,
          profile,
        };
      })
      .filter((item) => {
        if (seen.has(item.email)) return false;
        seen.add(item.email);
        const query = search.trim().toLowerCase();
        const haystack =
          `${item.email} ${item.displayName} ${item.nickname}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .filter((item) => {
        if (filter === "with-nickname") return Boolean(item.nickname);
        if (filter === "without-nickname") return !item.nickname;
        return true;
      })
      .sort((left, right) => {
        const leftName = left.displayName.toLowerCase();
        const rightName = right.displayName.toLowerCase();
        return sortOrder === "asc"
          ? leftName.localeCompare(rightName, "vi")
          : rightName.localeCompare(leftName, "vi");
      });
  }, [
    friendships,
    myEmail,
    search,
    sortOrder,
    filter,
    userProfiles,
    getDisplayName,
    getDisplayAvatar,
  ]);

  const blockedContacts = useMemo(() => {
    const blocked = friendships.filter((item) => item.status === "blocked");
    return blocked
      .map((item) => {
        const email =
          item.sender_id === myEmail ? item.receiver_id : item.sender_id;
        return {
          email,
          displayName: getDisplayName(email, item.nickname),
          avatarUrl: getDisplayAvatar(email),
          nickname: item.nickname || "",
          blocked: true,
          status: item.status,
        };
      })
      .filter((item) => {
        const query = search.trim().toLowerCase();
        const haystack =
          `${item.email} ${item.displayName} ${item.nickname}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .sort((left, right) => {
        const leftName = left.displayName.toLowerCase();
        const rightName = right.displayName.toLowerCase();
        return sortOrder === "asc"
          ? leftName.localeCompare(rightName, "vi")
          : rightName.localeCompare(leftName, "vi");
      });
  }, [
    friendships,
    myEmail,
    search,
    sortOrder,
    getDisplayName,
    getDisplayAvatar,
  ]);

  const groupedContacts = useMemo(() => {
    const visible = filter === "blocked" ? blockedContacts : acceptedContacts;
    const groups = new Map<string, typeof visible>();

    for (const contact of visible) {
      const firstLetter = (
        contact.displayName?.trim()?.charAt(0) || "#"
      ).toUpperCase();
      const bucket = groups.get(firstLetter) || [];
      bucket.push(contact);
      groups.set(firstLetter, bucket);
    }

    return Array.from(groups.entries())
      .sort((left, right) =>
        sortOrder === "asc"
          ? left[0].localeCompare(right[0], "vi")
          : right[0].localeCompare(left[0], "vi"),
      )
      .map(([letter, contacts]) => ({
        letter,
        contacts: contacts.sort((left, right) =>
          sortOrder === "asc"
            ? left.displayName.localeCompare(right.displayName, "vi")
            : right.displayName.localeCompare(left.displayName, "vi"),
        ),
      }));
  }, [acceptedContacts, blockedContacts, filter, sortOrder]);

  const groupConversations = useMemo(
    () => conversations.filter((conversation) => conversation.type === "group"),
    [conversations],
  );

  const handleAcceptRequest = async (senderEmail: string) => {
    try {
      await chatPost("/friends/accept", { senderEmail });
      await refreshContacts();
    } catch (error) {
      console.error("Failed to accept request", error);
    }
  };

  const handleRejectRequest = async (senderEmail: string) => {
    try {
      await chatPost("/friends/reject", { senderEmail });
      await refreshContacts();
    } catch (error) {
      console.error("Failed to reject request", error);
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
      console.error("Failed to view profile", error);
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
      await refreshContacts();
    } catch (error) {
      console.error("Failed to set nickname", error);
    }
  };

  const handleBlockUser = async (email: string) => {
    const result = await Swal.fire({
      title: "Chặn người dùng?",
      text: "Người này sẽ không thể kết bạn hoặc nhắn tin với bạn.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Chặn",
    });

    if (!result.isConfirmed) return;

    try {
      await chatPost("/friends/block", { targetEmail: email });
      await refreshContacts();
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
      await refreshContacts();
    } catch (error) {
      console.error("Failed to unfriend user", error);
    }
  };

  const openActionMenu = (email: string, x: number, y: number) => {
    setActionMenu({ email, x, y });
  };

  const renderMainNavButton = (
    icon: string,
    isActive: boolean,
    onClick: () => void,
    hasBadge: boolean = false,
  ) => {
    return (
      <button
        onClick={onClick}
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

  const renderSidebarItem = (
    label: string,
    section: SidebarSection,
    icon: string,
    count?: number,
  ) => {
    const active = sidebarSection === section;
    return (
      <button
        onClick={() => setSidebarSection(section)}
        className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left transition-all ${
          active
            ? "bg-primary/12 text-primary"
            : "text-on-surface hover:bg-surface-container-high"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
          <span className="font-semibold truncate">{label}</span>
        </div>
        {typeof count === "number" && count > 0 && (
          <span className="ml-2 rounded-full bg-error px-2 py-0.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </button>
    );
  };

  const activeRequestCount = incomingRequests.length;
  const activeFriendCount = acceptedContacts.length;
  const activeGroupCount = groupConversations.length;

  const handleSkipSuggestion = (email: string) => {
    setHiddenSuggestionEmails((prev) =>
      prev.includes(email) ? prev : [...prev, email],
    );
    setSuggestions((prev) =>
      prev.filter((suggestion) => suggestion.email !== email),
    );
  };

  const handleOpenFriendChat = (email: string) => {
    navigate("/chat", {
      state: {
        openDirectChatEmail: email,
      },
    });
  };

  const handleOpenGmailSearch = () => {
    setIsGmailSearchOpen(true);
    setGmailSearchMessage("");
    setGmailSearchResult(null);
  };

  const handleCloseGmailSearch = () => {
    setIsGmailSearchOpen(false);
    setGmailSearchMessage("");
    setGmailSearchResult(null);
    setGmailSearchEmail("");
  };

  const handleSearchGmail = async () => {
    const normalizedEmail = gmailSearchEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setGmailSearchMessage("Vui lòng nhập Gmail cần tìm.");
      setGmailSearchResult(null);
      return;
    }

    setGmailSearchLoading(true);
    setGmailSearchMessage("");
    try {
      const res = await chatGet("/friends/search", { email: normalizedEmail });
      setGmailSearchResult(res.data || null);

      if (!res.data?.found) {
        setGmailSearchMessage("Không tìm thấy tài khoản phù hợp.");
      }
    } catch (error: unknown) {
      setGmailSearchResult(null);
      const responseMessage =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message === "string"
          ? (error as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : null;
      setGmailSearchMessage(
        responseMessage || "Tìm kiếm thất bại.",
      );
    } finally {
      setGmailSearchLoading(false);
    }
  };

  const handleSendGmailRequest = async (targetEmail: string) => {
    if (!targetEmail) return;

    setGmailSearchLoading(true);
    setGmailSearchMessage("");
    try {
      await chatPost("/friends/request", { targetEmail });
      setGmailSearchMessage("Đã gửi lời mời kết bạn.");
      await refreshContacts();
      await handleSearchGmail();
    } catch (error: unknown) {
      const responseMessage =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message === "string"
          ? (error as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : null;
      setGmailSearchMessage(
        responseMessage || "Gửi lời mời thất bại.",
      );
    } finally {
      setGmailSearchLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f7f9fb] pl-20 text-on-surface antialiased font-['Plus_Jakarta_Sans']">
      <aside className="fixed left-0 top-0 h-full z-50 w-20 flex flex-col items-center py-6 bg-linear-to-br from-[#0058bc] to-[#00418f] shadow-[0px_20px_40px_rgba(0,65,143,0.06)] shrink-0">
        <div className="mb-8">
          <img
            alt="User Avatar"
            onClick={() => navigate("/profile")}
            className="w-12 h-12 rounded-full border-2 border-white/20 p-0.5 object-cover bg-white/10 cursor-pointer hover:border-white transition-colors"
            src={user?.avatarUrl || "/logo_blue.png"}
          />
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          {renderMainNavButton("chat", false, () => navigate("/chat"))}
          {renderMainNavButton("group", true, () => navigate("/contacts"))}
          {renderMainNavButton(
            "notifications",
            false,
            () => setSidebarSection("requests"),
            pendingRequestCount > 0,
          )}
          {renderMainNavButton("person", false, () => navigate("/profile"))}
        </nav>

        <div className="mt-auto space-y-4">
          <button
            onClick={() => navigate("/settings")}
            className="text-white/80 hover:text-white hover:bg-white/10 rounded-2xl transition-all duration-300 p-3 scale-95 active:scale-90 flex items-center justify-center"
            title="Cài đặt"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <button
            onClick={() => {
              void logout();
            }}
            className="text-white/80 hover:text-error hover:bg-white/10 rounded-2xl transition-all duration-300 p-3 scale-95 active:scale-90 flex items-center justify-center"
            title="Đăng xuất"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </aside>

      <aside className="w-75 shrink-0 border-r border-outline-variant/25 bg-white">
        <div className="border-b border-outline-variant/20 p-4">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-surface-container-highest px-3 py-2">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                search
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-outline"
              />
            </div>
            <button
              onClick={handleOpenGmailSearch}
              className="rounded-2xl p-2.5 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              title="Add friend"
            >
              <span className="material-symbols-outlined text-[20px]">
                person_add
              </span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <div className="space-y-2">
            {renderSidebarItem("Friends list", "friends", "group")}
            {renderSidebarItem(
              "Joined groups and communities",
              "groups",
              "groups",
              activeGroupCount,
            )}
            {renderSidebarItem(
              "Friend requests",
              "requests",
              "person_add",
              activeRequestCount,
            )}
            {renderSidebarItem(
              "Group/community invitations",
              "invitations",
              "mail",
              0,
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden bg-[#f7f9fb]">
        <div className="flex h-full flex-col bg-[#f7f9fb]">
          <header className="flex h-16 items-center justify-between border-b border-outline-variant/20 bg-white px-6">
            <div className="flex items-center gap-3 text-on-surface">
              <span className="material-symbols-outlined">group</span>
              <h1 className="text-[18px] font-bold">Friends list</h1>
            </div>
            <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
              <span className="rounded-full bg-surface-container-high px-3 py-1 font-semibold">
                Contacts ({activeFriendCount})
              </span>
              <span className="rounded-full bg-surface-container-high px-3 py-1 font-semibold">
                Requests ({activeRequestCount})
              </span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6">
            {sidebarSection === "friends" && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[22px] font-black text-on-surface">
                      Contacts ({activeFriendCount})
                    </h2>
                    <p className="mt-1 text-[13px] text-on-surface-variant">
                      Search, sort, filter, and manage your friend list.
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-outline-variant/20 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  <div className="flex flex-col gap-3 xl:flex-row">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                        search
                      </span>
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search friends"
                        className="w-full rounded-2xl border border-outline-variant/20 bg-surface-container-lowest py-2.5 pl-10 pr-4 text-[13px] text-on-surface outline-none placeholder:text-outline focus:border-primary/30"
                      />
                    </div>

                    <button
                      onClick={() =>
                        setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                      }
                      className="rounded-2xl border border-outline-variant/25 bg-white px-4 py-2.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/30"
                    >
                      Name ({sortOrder === "asc" ? "A-Z" : "Z-A"})
                    </button>

                    <div className="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setFilterMenuOpen((prev) => !prev)}
                        className="flex min-w-45 items-center justify-between rounded-2xl border border-outline-variant/25 bg-white px-4 py-2.5 text-[12px] font-bold text-on-surface transition-colors hover:border-primary/30"
                      >
                        <span>Filter: {filter.replace("-", " ")}</span>
                        <span className="material-symbols-outlined text-[18px]">
                          expand_more
                        </span>
                      </button>
                      {filterMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-2xl border border-outline-variant/20 bg-white shadow-xl">
                          {[
                            ["all", "All"],
                            ["with-nickname", "With nickname"],
                            ["without-nickname", "Without nickname"],
                            ["blocked", "Blocked"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              onClick={() => {
                                setFilter(value as ContactsFilter);
                                setFilterMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] transition-colors hover:bg-surface-container ${filter === value ? "text-primary" : "text-on-surface"}`}
                            >
                              <span>{label}</span>
                              {filter === value && (
                                <span className="material-symbols-outlined text-[18px]">
                                  check
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="rounded-[24px] border border-outline-variant/20 bg-white p-8 text-center text-on-surface-variant">
                    Loading contacts...
                  </div>
                ) : groupedContacts.length === 0 ? (
                  <div className="rounded-[24px] border border-outline-variant/20 bg-white p-8 text-center text-on-surface-variant">
                    No contacts match your search.
                  </div>
                ) : (
                  <div className="space-y-8">
                    {groupedContacts.map((group) => (
                      <section key={group.letter} className="space-y-4">
                        <h3 className="px-2 text-[15px] font-black text-on-surface-variant">
                          {group.letter}
                        </h3>
                        <div className="space-y-2">
                          {group.contacts.map((contact) => (
                            <div
                              key={contact.email}
                              onClick={() => handleOpenFriendChat(contact.email)}
                              className="group flex items-center justify-between rounded-2xl border border-outline-variant/20 bg-white px-4 py-3 transition-colors hover:bg-surface-container cursor-pointer"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <img
                                  src={contact.avatarUrl}
                                  alt={contact.displayName}
                                  className="h-12 w-12 rounded-full object-cover bg-surface-container"
                                />
                                <div className="min-w-0 text-left">
                                  <p className="truncate text-[14px] font-bold text-on-surface">
                                    {contact.displayName}
                                  </p>
                                  <p className="truncate text-[12px] text-on-surface-variant">
                                    {contact.nickname || contact.email}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const rect =
                                    event.currentTarget.getBoundingClientRect();
                                  openActionMenu(
                                    contact.email,
                                    rect.right - 180,
                                    rect.bottom + 8,
                                  );
                                }}
                                className="rounded-full p-2 text-on-surface-variant opacity-100 transition-colors hover:bg-surface-container-high hover:text-on-surface"
                              >
                                <span className="material-symbols-outlined text-[18px]">
                                  more_horiz
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            )}

            {sidebarSection === "requests" && (
              <section className="space-y-6">
                <div>
                  <h2 className="text-[22px] font-black text-on-surface">
                    Friend requests
                  </h2>
                  <p className="mt-1 text-[13px] text-on-surface-variant">
                    Incoming requests and suggested friends.
                  </p>
                </div>

                <div className="rounded-[24px] border border-outline-variant/20 bg-white p-4">
                  <h3 className="mb-4 text-[14px] font-black text-on-surface">
                    Incoming requests ({incomingRequests.length})
                  </h3>
                  <div className="space-y-3">
                    {incomingRequests.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-outline-variant/30 p-6 text-center text-on-surface-variant">
                        Your incoming request list is empty.
                      </div>
                    ) : (
                      incomingRequests.map((request) => (
                        <div
                          key={request.sender_id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <img
                              src={
                                request.senderProfile?.avatarUrl ||
                                "/logo_blue.png"
                              }
                              alt={
                                request.senderProfile?.fullName ||
                                request.sender_id
                              }
                              className="h-12 w-12 rounded-full object-cover bg-surface-container"
                            />
                            <div className="min-w-0">
                              <p className="truncate font-bold text-on-surface">
                                {request.senderProfile?.fullName ||
                                  request.senderProfile?.fullname ||
                                  request.sender_id}
                              </p>
                              <p className="truncate text-[12px] text-on-surface-variant">
                                {request.sender_id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleAcceptRequest(request.sender_id)
                              }
                              className="rounded-2xl bg-primary px-4 py-2 text-[12px] font-bold text-white"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() =>
                                handleRejectRequest(request.sender_id)
                              }
                              className="rounded-2xl bg-surface-container-high px-4 py-2 text-[12px] font-bold text-on-surface"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-outline-variant/20 bg-white p-4">
                  <h3 className="mb-4 text-[14px] font-black text-on-surface">
                    Suggested Friends
                  </h3>
                  <div className="space-y-3">
                    {visibleSuggestions.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-outline-variant/30 p-6 text-center text-on-surface-variant">
                        No suggestions available.
                      </div>
                    ) : (
                      visibleSuggestions.map((suggestion) => {
                        const isPending =
                          sendingSuggestionEmails.includes(suggestion.email) ||
                          pendingSuggestionEmails.includes(suggestion.email) ||
                          outgoingPendingSuggestionEmails.includes(
                            suggestion.email,
                          );

                        return (
                          <div
                            key={suggestion.email}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <img
                                src={suggestion.avatarUrl || "/logo_blue.png"}
                                alt={suggestion.fullName}
                                className="h-12 w-12 rounded-full object-cover bg-surface-container"
                              />
                              <div className="min-w-0">
                                <p className="truncate font-bold text-on-surface">
                                  {suggestion.fullName}
                                </p>
                                <p className="truncate text-[12px] text-on-surface-variant">
                                  {suggestion.reasons.join(" • ") ||
                                    "Suggested from your network"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSkipSuggestion(suggestion.email)}
                                className="rounded-2xl bg-surface-container-high px-4 py-2 text-[12px] font-bold text-on-surface transition-colors hover:bg-surface-container"
                              >
                                Skip
                              </button>
                              <button
                                onClick={() =>
                                  handleSendSuggestionRequest(suggestion)
                                }
                                disabled={isPending}
                                className="rounded-2xl bg-primary px-4 py-2 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {sendingSuggestionEmails.includes(suggestion.email)
                                  ? "Sending..."
                                  : isPending
                                    ? "Request Sent"
                                    : "Add friend"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            )}

            {sidebarSection === "groups" && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-black text-on-surface">
                    Joined groups and communities
                  </h2>
                  <p className="mt-1 text-[13px] text-on-surface-variant">
                    Groups you are already part of.
                  </p>
                </div>
                <div className="space-y-3">
                  {groupConversations.length === 0 ? (
                    <div className="rounded-[24px] border border-outline-variant/20 bg-white p-6 text-center text-on-surface-variant">
                      No joined groups yet.
                    </div>
                  ) : (
                    groupConversations.map((conversation) => (
                      <div
                        key={conversation.id}
                        className="flex items-center gap-3 rounded-2xl border border-outline-variant/20 bg-white px-4 py-3"
                      >
                        <img
                          src={conversation.avatar || "/logo_blue.png"}
                          alt={conversation.name || conversation.id}
                          className="h-12 w-12 rounded-full object-cover bg-surface-container"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-on-surface">
                            {conversation.name || conversation.id}
                          </p>
                          <p className="truncate text-[12px] text-on-surface-variant">
                            {Array.isArray(conversation.members)
                              ? `${conversation.members.length} members`
                              : "Group conversation"}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            )}

            {sidebarSection === "invitations" && (
              <section className="space-y-4">
                <div>
                  <h2 className="text-[22px] font-black text-on-surface">
                    Group/community invitations
                  </h2>
                  <p className="mt-1 text-[13px] text-on-surface-variant">
                    This section is ready for future invitation data.
                  </p>
                </div>
                <div className="rounded-[24px] border border-outline-variant/20 bg-white p-8 text-center text-on-surface-variant">
                  No invitations available.
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {isGmailSearchOpen && (
        <div className="fixed inset-0 z-100 flex items-start justify-center bg-black/35 px-4 pt-16">
          <div className="w-full max-w-md overflow-hidden rounded-[18px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h3 className="text-[16px] font-semibold text-slate-900">
                Add friend
              </h3>
              <button
                onClick={handleCloseGmailSearch}
                className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[22px]">
                  close
                </span>
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-2.5">
                <span className="text-[13px] font-medium text-slate-700">
                  Gmail
                </span>
                <input
                  value={gmailSearchEmail}
                  onChange={(event) => setGmailSearchEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSearchGmail();
                    }
                  }}
                  placeholder="Enter Gmail address"
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                />
              </div>

              <div className="min-h-44 space-y-3">
                {!gmailSearchResult && !gmailSearchMessage && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[13px] text-slate-500">
                    Nhập Gmail rồi bấm Tìm để xem tài khoản và gửi lời mời.
                  </div>
                )}

                {gmailSearchMessage && (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
                    {gmailSearchMessage}
                  </div>
                )}

                {gmailSearchResult?.found && gmailSearchResult.user && (
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={gmailSearchResult.user.avatarUrl || "/logo_blue.png"}
                          alt={gmailSearchResult.user.fullName || gmailSearchResult.user.email}
                          className="h-12 w-12 rounded-full object-cover bg-slate-100"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-slate-900">
                            {gmailSearchResult.user.fullName ||
                              gmailSearchResult.user.fullname ||
                              gmailSearchResult.user.email}
                          </p>
                          <p className="truncate text-[12px] text-slate-500">
                            {gmailSearchResult.user.email}
                          </p>
                        </div>
                      </div>

                      {gmailSearchResult.isSelf ? (
                        <span className="text-[12px] font-medium text-slate-500">
                          Đây là tài khoản của bạn
                        </span>
                      ) : gmailSearchResult.friendship?.status ===
                        "accepted" ? (
                        <span className="text-[12px] font-medium text-emerald-600">
                          Đã là bạn bè
                        </span>
                      ) : gmailSearchResult.friendship?.status === "pending" ? (
                        <span className="text-[12px] font-medium text-amber-600">
                          Đã gửi lời mời
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            handleSendGmailRequest(gmailSearchResult.user!.email)
                          }
                          disabled={gmailSearchLoading}
                          className="rounded-xl border border-blue-500 px-4 py-2 text-[13px] font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {gmailSearchLoading ? "Sending..." : "Add friend"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  onClick={handleCloseGmailSearch}
                  className="rounded-xl bg-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSearchGmail()}
                  disabled={gmailSearchLoading}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {gmailSearchLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionMenu && (
        <div
          className="fixed z-100 min-w-52.5 rounded-2xl border border-outline-variant/20 bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
          style={{ left: actionMenu.x, top: actionMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              handleViewProfile(actionMenu.email);
              setActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            View profile
          </button>
          <button
            onClick={() => {
              const currentFriendship = friendships.find((item) => {
                const friendEmail =
                  item.sender_id === myEmail
                    ? item.receiver_id
                    : item.sender_id;
                return friendEmail === actionMenu.email;
              });
              handleSetNickname(
                actionMenu.email,
                currentFriendship?.nickname || "",
              );
              setActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Set nickname
          </button>
          <button
            onClick={() => {
              handleBlockUser(actionMenu.email);
              setActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
          >
            Block user
          </button>
          <button
            onClick={() => {
              handleUnfriend(actionMenu.email);
              setActionMenu(null);
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-error hover:bg-red-50"
          >
            Unfriend
          </button>
        </div>
      )}
    </div>
  );

  async function handleSendSuggestionRequest(suggestion: FriendSuggestion) {
    const targetEmail = suggestion.email;

    if (
      sendingSuggestionEmails.includes(targetEmail) ||
      pendingSuggestionEmails.includes(targetEmail) ||
      outgoingPendingSuggestionEmails.includes(targetEmail)
    ) {
      return;
    }

    setSendingSuggestionEmails((prev) => [...prev, targetEmail]);
    setSuggestionCache((prev) => ({
      ...prev,
      [targetEmail]: suggestion,
    }));
    try {
      await chatPost("/friends/request", { targetEmail });
      setPendingSuggestionEmails((prev) =>
        prev.includes(targetEmail) ? prev : [...prev, targetEmail],
      );
      await refreshContacts();
    } catch (error) {
      console.error("Failed to send request from suggestion", error);
    } finally {
      setSendingSuggestionEmails((prev) =>
        prev.filter((email) => email !== targetEmail),
      );
    }
  }
};

export default ContactsPage;
