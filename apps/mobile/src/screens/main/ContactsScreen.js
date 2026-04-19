import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Typography } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { apiRequest } from '../../utils/api';
import SocketService from '../../utils/socket';

const DEFAULT_AVATAR =
  "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

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
        .filter(
          ([, value]) =>
            value !== undefined && value !== null && String(value) !== "",
        )
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
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

const friendEmailOf = (friendship, myEmail) => {
  if (!friendship) return "";
  const sender = String(friendship.sender_id || "").toLowerCase();
  const receiver = String(friendship.receiver_id || "").toLowerCase();
  return sender === String(myEmail || "").toLowerCase() ? receiver : sender;
};

const firstLetter = (label) => {
  const c = String(label || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (!c) return "#";
  return /[A-Z]/.test(c) ? c : "#";
};

const pickBirthDateRaw = (profile) => {
  if (!profile || typeof profile !== "object") return "";
  return String(
    profile.date_of_birth ||
      profile.dataOfBirth ||
      profile.dateOfBirth ||
      profile.birthday ||
      profile.dob ||
      "",
  ).trim();
};

const formatBirthDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return raw;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const d = String(parsed.getDate()).padStart(2, "0");
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const y = String(parsed.getFullYear());
  return `${d}/${m}/${y}`;
};

const getBirthDateParts = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month };
    }
    return null;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const day = Number(ymd[3]);
    const month = Number(ymd[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month };
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { day: parsed.getDate(), month: parsed.getMonth() + 1 };
};

const daysUntilNextBirthday = (value, now = new Date()) => {
  const parts = getBirthDateParts(value);
  if (!parts) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(nowStart.getFullYear(), parts.month - 1, parts.day);

  if (Number.isNaN(target.getTime())) return null;
  if (target < nowStart) {
    target = new Date(nowStart.getFullYear() + 1, parts.month - 1, parts.day);
  }

  const diffMs = target.getTime() - nowStart.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
};

const birthdayReminderLabel = (days) => {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
};

const birthdayHint = (friends) => {
  const withBirthday = (friends || []).filter((item) =>
    Boolean(formatBirthDate(pickBirthDateRaw(item?.profile))),
  );

  if (withBirthday.length === 0) {
    return "Chua co du lieu ngay sinh";
  }

  const first = withBirthday[0];
  const firstName = first?.displayName || "Ban be";
  const firstBirthday = formatBirthDate(pickBirthDateRaw(first?.profile));
  if (withBirthday.length === 1) return `${firstName}: ${firstBirthday}`;
  return `${firstName}: ${firstBirthday} va ${withBirthday.length - 1} nguoi khac`;
};

export default function ContactsScreen({
  user,
  conversations,
  onOpenDirectChat,
  onOpenGroupConversation,
}) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("friends");

  const [friendships, setFriendships] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [profileMap, setProfileMap] = useState({});

  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("asc");
  const [filterMode, setFilterMode] = useState("all");

  const [skippedSuggestions, setSkippedSuggestions] = useState({});
  const [sendingRequestMap, setSendingRequestMap] = useState({});
  const [busyAction, setBusyAction] = useState(false);

  const [actionFriend, setActionFriend] = useState(null);
  const [nicknameFriend, setNicknameFriend] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [profileFriend, setProfileFriend] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileMapRef = useRef({});
  const nicknameSavingRef = useRef(false);

  useEffect(() => {
    profileMapRef.current = profileMap;
  }, [profileMap]);

  const ensureProfiles = useCallback(async (emails) => {
    const targets = Array.from(
      new Set(
        (emails || [])
          .filter(Boolean)
          .map((email) => String(email).toLowerCase()),
      ),
    );
    if (targets.length === 0) return;

    const missing = targets.filter((email) => !profileMapRef.current[email]);
    if (missing.length === 0) return;

    try {
      const results = await Promise.all(
        missing.map(async (email) => {
          const res = await chatGet("/friends/search", { email });
          const payload = res?.data || {};
          if (res?.ok && payload?.found && payload?.user) {
            return [email, payload.user];
          }
          return null;
        }),
      );

      const patch = {};
      results.forEach((entry) => {
        if (entry) patch[entry[0]] = entry[1];
      });

      if (Object.keys(patch).length > 0) {
        setProfileMap((prev) => ({ ...prev, ...patch }));
      }
    } catch (error) {
      console.warn("Cannot load contact profiles", error);
    }
  }, []);

  const loadContactsData = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [friendRes, requestRes, suggestionRes] = await Promise.all([
        chatGet("/friends"),
        chatGet("/friends/requests"),
        chatGet("/friends/suggestions"),
      ]);

      const nextFriendships = Array.isArray(friendRes?.data)
        ? friendRes.data
        : [];
      const nextRequests = Array.isArray(requestRes?.data)
        ? requestRes.data
        : [];
      const nextSuggestions = Array.isArray(suggestionRes?.data)
        ? suggestionRes.data
        : [];

      setFriendships(nextFriendships);
      setIncomingRequests(nextRequests);
      setSuggestions(nextSuggestions);

      const friendEmails = nextFriendships.map((item) =>
        friendEmailOf(item, user.email),
      );
      const requestEmails = nextRequests.map(
        (item) => item?.sender_id || item?.senderEmail,
      );
      await ensureProfiles([...friendEmails, ...requestEmails]);
    } catch (error) {
      console.error("Load contacts failed", error);
      Alert.alert("Loi", "Khong the tai danh ba. Vui long thu lai.");
    } finally {
      setLoading(false);
    }
  }, [ensureProfiles, user?.email]);

  useEffect(() => {
    loadContactsData();
  }, [loadContactsData]);

  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket) return;

    const reload = () => loadContactsData();
    socket.on("friend_request_received", reload);
    socket.on("friendship_updated", reload);

    return () => {
      socket.off("friend_request_received", reload);
      socket.off("friendship_updated", reload);
    };
  }, [loadContactsData]);

  const acceptedFriends = useMemo(() => {
    const myEmail = String(user?.email || "").toLowerCase();
    return friendships
      .filter((item) => item?.status === "accepted")
      .map((item) => {
        const email = friendEmailOf(item, myEmail);
        const profile = profileMap[email] || {};
        const nickname = String(item?.nickname || "").trim();
        const displayName =
          nickname || profile.fullName || profile.fullname || email;
        return {
          email,
          nickname,
          isCloseFriend: Boolean(item?.closeFriend),
          displayName,
          avatarUrl: profile.avatarUrl || DEFAULT_AVATAR,
          status: profile.status,
          profile,
        };
      })
      .filter((item) => !!item.email);
  }, [friendships, profileMap, user?.email]);

  const relationshipMap = useMemo(() => {
    const map = {};
    friendships.forEach((item) => {
      const email = friendEmailOf(item, user?.email);
      if (email) map[email] = item;
    });
    return map;
  }, [friendships, user?.email]);

  const pendingOutgoingSet = useMemo(() => {
    const set = new Set();
    friendships
      .filter(
        (item) => item?.status === "pending" && item?.sender_id === user?.email,
      )
      .forEach((item) => {
        const target = friendEmailOf(item, user?.email);
        if (target) set.add(target);
      });
    return set;
  }, [friendships, user?.email]);

  const filteredFriends = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    const rows = acceptedFriends.filter((friend) => {
      const matchesSearch =
        !q ||
        friend.displayName.toLowerCase().includes(q) ||
        friend.email.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (filterMode === "nickname") return !!friend.nickname;
      if (filterMode === "close") return !!friend.isCloseFriend;
      if (filterMode === "online")
        return String(friend.status || "").toLowerCase() === "online";
      return true;
    });

    rows.sort((a, b) => {
      const cmp = a.displayName.localeCompare(b.displayName, "vi", {
        sensitivity: "base",
      });
      return sortMode === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [acceptedFriends, filterMode, searchText, sortMode]);

  const groupedFriends = useMemo(() => {
    return filteredFriends.reduce((acc, item) => {
      const key = firstLetter(item.displayName);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [filteredFriends]);

  const friendGroups = useMemo(() => {
    return Object.entries(groupedFriends).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [groupedFriends]);

  const joinedGroups = useMemo(() => {
    return (conversations || []).filter((item) => item?.type === "group");
  }, [conversations]);

  const visibleSuggestions = useMemo(() => {
    return (suggestions || []).filter(
      (item) => !skippedSuggestions[item.email],
    );
  }, [skippedSuggestions, suggestions]);

  const recentlyOnlineCount = useMemo(() => {
    return acceptedFriends.filter(
      (item) => String(item.status || "").toLowerCase() === "online",
    ).length;
  }, [acceptedFriends]);

  const closeFriends = useMemo(
    () => acceptedFriends.filter((item) => item.isCloseFriend),
    [acceptedFriends],
  );

  const upcomingBirthdays = useMemo(() => {
    return acceptedFriends
      .map((friend) => {
        const birthRaw = pickBirthDateRaw(friend.profile);
        const daysLeft = daysUntilNextBirthday(birthRaw);
        const birthFormatted = formatBirthDate(birthRaw);
        if (daysLeft === null || !birthFormatted) return null;
        return {
          ...friend,
          birthFormatted,
          daysLeft,
        };
      })
      .filter((item) => item && item.daysLeft >= 0 && item.daysLeft <= 7)
      .sort((left, right) => {
        if (left.daysLeft !== right.daysLeft) {
          return left.daysLeft - right.daysLeft;
        }
        return String(left.displayName || "").localeCompare(
          String(right.displayName || ""),
          "vi",
          { sensitivity: "base" },
        );
      });
  }, [acceptedFriends]);

  const closeFriendEmailSet = useMemo(
    () => new Set(closeFriends.map((item) => item.email)),
    [closeFriends],
  );

  const friendGroupsWithoutClose = useMemo(() => {
    return friendGroups
      .map(([letter, list]) => [
        letter,
        list.filter((friend) => !closeFriendEmailSet.has(friend.email)),
      ])
      .filter(([, list]) => list.length > 0);
  }, [closeFriendEmailSet, friendGroups]);

  const handleAccept = async (senderEmail) => {
    if (!senderEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/accept", { senderEmail });
      if (!res?.ok) throw new Error("ACCEPT_FAILED");
      await loadContactsData();
    } catch (error) {
      console.error("Accept friend request failed", error);
      Alert.alert("Loi", "Khong the chap nhan loi moi ket ban.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleReject = async (senderEmail) => {
    if (!senderEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/reject", { senderEmail });
      if (!res?.ok) throw new Error("REJECT_FAILED");
      await loadContactsData();
    } catch (error) {
      console.error("Reject friend request failed", error);
      Alert.alert("Loi", "Khong the tu choi loi moi ket ban.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnfriend = async (friendEmail) => {
    if (!friendEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/unfriend", { friendEmail });
      if (!res?.ok) throw new Error("UNFRIEND_FAILED");
      setActionFriend(null);
      await loadContactsData();
    } catch (error) {
      console.error("Unfriend failed", error);
      Alert.alert("Loi", "Khong the xoa ban.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleBlock = async (targetEmail) => {
    if (!targetEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/block", { targetEmail });
      if (!res?.ok) throw new Error("BLOCK_FAILED");
      setActionFriend(null);
      await loadContactsData();
    } catch (error) {
      console.error("Block failed", error);
      Alert.alert("Loi", "Khong the chan nguoi dung nay.");
    } finally {
      setBusyAction(false);
    }
  };

  const saveNickname = async () => {
    const friendEmail = nicknameFriend?.email;
    if (!friendEmail || busyAction || nicknameSavingRef.current) return;
    nicknameSavingRef.current = true;
    setBusyAction(true);
    setNicknameSaving(true);
    const nextNickname = nicknameDraft.trim();
    try {
      const res = await chatPatch("/friends/nickname", {
        friendEmail,
        nickname: nextNickname,
      });
      if (!res?.ok) throw new Error("NICKNAME_FAILED");

      // Update local list immediately to avoid UI jumping while waiting for reload events.
      setFriendships((prev) =>
        (prev || []).map((item) => {
          const email = friendEmailOf(item, user?.email);
          if (String(email || "").toLowerCase() !== friendEmail.toLowerCase()) {
            return item;
          }
          return { ...item, nickname: nextNickname };
        }),
      );

      setNicknameFriend(null);
      setNicknameDraft("");
    } catch (error) {
      console.error("Set nickname failed", error);
      Alert.alert("Loi", "Khong the dat biet danh.");
    } finally {
      setBusyAction(false);
      setNicknameSaving(false);
      nicknameSavingRef.current = false;
    }
  };

  const setCloseFriendStatus = async (friendEmail, isCloseFriend) => {
    const normalizedFriendEmail = String(friendEmail || "").trim().toLowerCase();
    if (!normalizedFriendEmail || busyAction) return;
    setBusyAction(true);
    try {
      let res = await chatPatch("/friends/close-friend", {
        friendEmail: normalizedFriendEmail,
        isCloseFriend,
      });

      // Compatibility fallback for older/newer route variants.
      if (!res?.ok && (res?.status === 404 || res?.status === 400)) {
        res = await chatPatch("/friends/closeFriend", {
          friendEmail: normalizedFriendEmail,
          isCloseFriend,
          closeFriend: isCloseFriend,
        });
      }

      if (!res?.ok) throw new Error("CLOSE_FRIEND_UPDATE_FAILED");

      setFriendships((prev) =>
        (prev || []).map((item) => {
          const email = friendEmailOf(item, user?.email);
          if (String(email || "").toLowerCase() !== normalizedFriendEmail) {
            return item;
          }
          return { ...item, closeFriend: Boolean(isCloseFriend) };
        }),
      );

      setActionFriend(null);
    } catch (error) {
      console.error("Set close friend failed", error);
      Alert.alert(
        "Loi",
        "Khong the cap nhat ban than thiet. Vui long thu lai sau khi khoi dong lai backend.",
      );
    } finally {
      setBusyAction(false);
    }
  };

  const openNicknameEditor = (friend) => {
    if (!friend?.email) return;
    if (nicknameFriend?.email === friend.email) {
      setActionFriend(null);
      return;
    }
    setNicknameDraft(friend.nickname || "");
    setNicknameFriend(friend);
    setActionFriend(null);
  };

  const openProfile = async (friend) => {
    const email = String(friend?.email || "").toLowerCase();
    if (!email) return;

    if (profileFriend?.email === email) {
      setActionFriend(null);
      return;
    }

    const cachedProfile = profileMapRef.current[email] || friend?.profile || {};
    setProfileFriend({ ...friend, email, profile: cachedProfile });
    setActionFriend(null);

    setProfileLoading(true);
    try {
      const res = await chatGet("/friends/search", { email });
      const payload = res?.data || res;
      const userProfile = payload?.user || {};
      if (res?.ok && userProfile && typeof userProfile === "object") {
        setProfileMap((prev) => ({ ...prev, [email]: userProfile }));
        setProfileFriend((prev) =>
          prev?.email === email
            ? {
                ...prev,
                profile: userProfile,
                avatarUrl: userProfile.avatarUrl || prev.avatarUrl,
                displayName:
                  prev.nickname ||
                  userProfile.fullName ||
                  userProfile.fullname ||
                  prev.displayName,
              }
            : prev,
        );
      }
    } catch (error) {
      console.warn("Load friend profile failed", error);
    } finally {
      setProfileLoading(false);
    }
  };

  const skipSuggestion = (email) => {
    if (!email) return;
    setSkippedSuggestions((prev) => ({ ...prev, [email]: true }));
  };

  const sendSuggestionRequest = async (email) => {
    if (!email || busyAction || sendingRequestMap[email]) return;

    setSendingRequestMap((prev) => ({ ...prev, [email]: true }));
    try {
      const res = await chatPost("/friends/request", { targetEmail: email });
      if (!res?.ok) throw new Error("SEND_FRIEND_REQUEST_FAILED");
      await loadContactsData();
    } catch (error) {
      console.error("Send suggestion request failed", error);
      Alert.alert("Loi", "Khong the gui loi moi ket ban.");
    } finally {
      setSendingRequestMap((prev) => ({ ...prev, [email]: false }));
    }
  };

  const renderTopHeader = () => (
    <LinearGradient
      colors={["#0058bc", "#00418f"]}
      style={[styles.header, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.searchBarWrap}>
        <Text style={styles.headerIcon}>search</Text>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search"
          placeholderTextColor="rgba(255,255,255,0.8)"
          style={styles.headerSearchInput}
        />
      </View>
      <TouchableOpacity
        style={styles.headerAction}
        onPress={() => setActiveSection("friends")}
      >
        <Text style={styles.headerActionIcon}>person_add</Text>
      </TouchableOpacity>
    </LinearGradient>
  );

  const renderSectionTabs = () => (
    <View style={styles.sectionTabs}>
      {[
        { key: "friends", label: "Friends" },
        { key: "groups", label: "Groups" },
        { key: "oa", label: "OA" },
      ].map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.sectionTabItem}
          onPress={() => setActiveSection(item.key)}
        >
          <Text
            style={[
              styles.sectionTabLabel,
              activeSection === item.key && styles.sectionTabLabelActive,
            ]}
          >
            {item.label}
          </Text>
          {activeSection === item.key && (
            <View style={styles.sectionTabUnderline} />
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderFriendRequestRow = () => (
    <TouchableOpacity
      style={styles.quickRow}
      onPress={() => setFilterMode("all")}
    >
      <View style={styles.quickIconWrap}>
        <Text style={styles.quickIcon}>group</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickTitle}>
          Friend request ({incomingRequests.length})
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderBirthdayRow = () => (
    <View
      style={[
        styles.quickRow,
        { borderTopWidth: 1, borderTopColor: "#eef2f8" },
      ]}
    >
      <View style={styles.quickIconWrap}>
        <Text style={styles.quickIcon}>cake</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.quickTitle}>Birthdays</Text>
        <Text style={styles.quickSubtitle}>
          {upcomingBirthdays.length > 0
            ? `${upcomingBirthdays.length} upcoming birthday reminders`
            : birthdayHint(acceptedFriends)}
        </Text>
      </View>
    </View>
  );

  const renderBirthdayRemindersPanel = () => (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Birthday reminders</Text>
      {upcomingBirthdays.length === 0 ? (
        <Text style={styles.emptyLabel}>No upcoming birthdays in the next 7 days</Text>
      ) : (
        upcomingBirthdays.map((item) => (
          <View key={`birthday-${item.email}`} style={styles.requestItem}>
            <Image
              source={{ uri: item.avatarUrl || DEFAULT_AVATAR }}
              style={styles.requestAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.requestName}>
                {`${item.displayName}'s birthday is coming soon`}
              </Text>
              <Text style={styles.requestEmail}>
                {`${item.birthFormatted} • ${birthdayReminderLabel(item.daysLeft)}`}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderFilterChips = () => (
    <View style={styles.chipRow}>
      <TouchableOpacity
        style={[styles.chip, filterMode === "all" && styles.chipActive]}
        onPress={() => setFilterMode("all")}
      >
        <Text
          style={[
            styles.chipText,
            filterMode === "all" && styles.chipTextActive,
          ]}
        >
          All {acceptedFriends.length}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chip, filterMode === "online" && styles.chipActive]}
        onPress={() => setFilterMode("online")}
      >
        <Text
          style={[
            styles.chipText,
            filterMode === "online" && styles.chipTextActive,
          ]}
        >
          Recently online {recentlyOnlineCount}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chip, filterMode === "nickname" && styles.chipActive]}
        onPress={() => setFilterMode("nickname")}
      >
        <Text
          style={[
            styles.chipText,
            filterMode === "nickname" && styles.chipTextActive,
          ]}
        >
          Nickname
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.chip, filterMode === "close" && styles.chipActive]}
        onPress={() => setFilterMode("close")}
      >
        <Text
          style={[
            styles.chipText,
            filterMode === "close" && styles.chipTextActive,
          ]}
        >
          Close friends {closeFriends.length}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.sortButton}
        onPress={() => setSortMode((prev) => (prev === "asc" ? "desc" : "asc"))}
      >
        <Text style={styles.sortButtonText}>
          {sortMode === "asc" ? "A-Z" : "Z-A"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderFriendRow = (friend) => (
    <View key={`friend-${friend.email}`} style={styles.friendRow}>
      <TouchableOpacity
        style={styles.friendMainTap}
        onPress={() => onOpenDirectChat(friend.email)}
      >
        <Image
          source={{ uri: friend.avatarUrl || DEFAULT_AVATAR }}
          style={styles.friendAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.friendName} numberOfLines={1}>
            {friend.displayName}
          </Text>
          {friend.isCloseFriend && (
            <View style={styles.closeBadge}>
              <Text style={styles.closeBadgeIcon}>star</Text>
              <Text style={styles.closeBadgeText}>Close Friend</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.iconAction}
        onPress={() => Alert.alert("Call", `Goi ${friend.displayName}`)}
      >
        <Text style={styles.iconActionText}>call</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.iconAction}
        onPress={() => Alert.alert("Video", `Video voi ${friend.displayName}`)}
      >
        <Text style={styles.iconActionText}>videocam</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.iconAction}
        onPress={() => setActionFriend(friend)}
      >
        <Text style={styles.iconActionText}>more_horiz</Text>
      </TouchableOpacity>
    </View>
  );

  const renderRequestItem = (item) => {
    const senderEmail = item?.sender_id || item?.senderEmail;
    const senderProfile = item?.senderProfile || profileMap[senderEmail] || {};
    const name =
      senderProfile.fullName || senderProfile.fullname || senderEmail;

    return (
      <View key={`request-${senderEmail}`} style={styles.requestItem}>
        <Image
          source={{ uri: senderProfile.avatarUrl || DEFAULT_AVATAR }}
          style={styles.requestAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.requestName}>{name}</Text>
          <Text style={styles.requestEmail}>{senderEmail}</Text>
        </View>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleReject(senderEmail)}
          disabled={busyAction}
        >
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAccept(senderEmail)}
          disabled={busyAction}
        >
          <Text style={styles.acceptText}>Accept</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSuggestionItem = (item) => {
    const email = String(item?.email || "").toLowerCase();
    const relation = relationshipMap[email];
    const isPending =
      pendingOutgoingSet.has(email) || relation?.status === "pending";
    const isAccepted = relation?.status === "accepted";

    let actionLabel = "Add Friend";
    if (isAccepted) actionLabel = "Friends";
    else if (isPending) actionLabel = "Request Sent";

    return (
      <View key={`suggest-${email}`} style={styles.suggestItem}>
        <Image
          source={{
            uri:
              item?.avatarUrl || profileMap[email]?.avatarUrl || DEFAULT_AVATAR,
          }}
          style={styles.requestAvatar}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.requestName}>{item?.fullName || email}</Text>
          <Text style={styles.requestEmail} numberOfLines={1}>
            {(item?.reasons || []).join(" • ") || email}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => skipSuggestion(email)}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.addBtn,
            (isPending || isAccepted || sendingRequestMap[email]) && {
              opacity: 0.55,
            },
          ]}
          onPress={() => sendSuggestionRequest(email)}
          disabled={isPending || isAccepted || sendingRequestMap[email]}
        >
          <Text style={styles.addText}>
            {sendingRequestMap[email] ? "Sending..." : actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFriendsContent = () => (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View style={styles.quickCard}>
        {renderFriendRequestRow()}
        {renderBirthdayRow()}
      </View>

      {renderBirthdayRemindersPanel()}

      {renderFilterChips()}

      <View style={styles.closeFriendHeader}>
        <Text style={styles.closeFriendStar}>star</Text>
        <Text style={styles.closeFriendTitle}>Close friends</Text>
        <Text style={styles.closeFriendAdd}>{closeFriends.length}</Text>
      </View>

      {closeFriends.length === 0 ? (
        <Text style={styles.closeFriendEmpty}>No close friends yet</Text>
      ) : (
        closeFriends.map((friend) => renderFriendRow(friend))
      )}

      <View style={styles.alphaListWrap}>
        {friendGroupsWithoutClose.map(([letter, list]) => (
          <View key={`letter-${letter}`}>
            <Text style={styles.alphaLabel}>{letter}</Text>
            {list.map((friend) => renderFriendRow(friend))}
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Friend requests</Text>
        {incomingRequests.length === 0 ? (
          <Text style={styles.emptyLabel}>No incoming requests</Text>
        ) : (
          incomingRequests.map(renderRequestItem)
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Group/community invitations</Text>
        <Text style={styles.emptyLabel}>No invitations yet</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Suggested friends</Text>
        {visibleSuggestions.length === 0 ? (
          <Text style={styles.emptyLabel}>No suggestions right now</Text>
        ) : (
          visibleSuggestions.map(renderSuggestionItem)
        )}
      </View>
    </ScrollView>
  );

  const renderGroupsContent = () => (
    <ScrollView
      style={styles.content}
      contentContainerStyle={{ paddingBottom: 120 }}
    >
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Joined groups and communities</Text>
        {joinedGroups.length === 0 ? (
          <Text style={styles.emptyLabel}>You have not joined any groups</Text>
        ) : (
          joinedGroups.map((group) => (
            <TouchableOpacity
              key={`group-${group.id}`}
              style={styles.groupRow}
              onPress={() => onOpenGroupConversation(group)}
            >
              <Image
                source={{ uri: group.avatar || DEFAULT_AVATAR }}
                style={styles.requestAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.requestName}>
                  {group.name || "Group chat"}
                </Text>
                <Text style={styles.requestEmail}>
                  {(group.members || []).length} members
                </Text>
              </View>
              <Text style={styles.groupOpenIcon}>chat</Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderOaContent = () => (
    <View style={styles.centeredWrap}>
      <Text style={styles.emptyLabel}>OA contacts will appear here</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {renderTopHeader()}
      {renderSectionTabs()}

      {loading ? (
        <View style={styles.centeredWrap}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={[styles.emptyLabel, { marginTop: 10 }]}>
            Loading contacts...
          </Text>
        </View>
      ) : (
        <>
          {activeSection === "friends" && renderFriendsContent()}
          {activeSection === "groups" && renderGroupsContent()}
          {activeSection === "oa" && renderOaContent()}
        </>
      )}

      {actionFriend && (
        <Pressable style={styles.overlay} onPress={() => setActionFriend(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => openProfile(actionFriend)}
            >
              <Text style={styles.sheetText}>View profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => openNicknameEditor(actionFriend)}
            >
              <Text style={styles.sheetText}>Set nickname</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() =>
                setCloseFriendStatus(
                  actionFriend.email,
                  !Boolean(actionFriend.isCloseFriend),
                )
              }
            >
              <Text style={styles.sheetText}>
                {actionFriend.isCloseFriend
                  ? "Unmark Close Friend"
                  : "Mark as Close Friend"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => handleUnfriend(actionFriend.email)}
            >
              <Text style={styles.sheetText}>Unfriend</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetItem}
              onPress={() => handleBlock(actionFriend.email)}
            >
              <Text style={[styles.sheetText, { color: "#e53935" }]}>
                Block user
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {nicknameFriend && (
        <Pressable
          style={styles.overlay}
          onPress={() => {
            if (nicknameSaving) return;
            setNicknameFriend(null);
          }}
        >
          <Pressable
            style={styles.nicknameModal}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.nickTitle}>Set nickname</Text>
            <Text style={styles.nickHint}>{nicknameFriend.email}</Text>
            <TextInput
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              style={styles.nickInput}
              placeholder="Enter nickname"
              placeholderTextColor="#8b96a8"
            />
            <View style={styles.nickActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  if (nicknameSaving) return;
                  setNicknameFriend(null);
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, nicknameSaving && styles.disabledBtn]}
                onPress={saveNickname}
                disabled={nicknameSaving}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      )}

      {profileFriend && (
        <Pressable
          style={styles.overlay}
          onPress={() => setProfileFriend(null)}
        >
          <Pressable
            style={styles.profileModal}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.profileHead}>
              <Image
                source={{
                  uri:
                    profileFriend?.profile?.avatarUrl ||
                    profileFriend?.avatarUrl ||
                    DEFAULT_AVATAR,
                }}
                style={styles.profileAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profileFriend?.displayName || profileFriend?.email}
                </Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {profileFriend?.email}
                </Text>
              </View>
            </View>

            {profileLoading && (
              <View style={styles.profileLoadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.profileLoadingText}>
                  Loading profile...
                </Text>
              </View>
            )}

            <View style={styles.profileInfoWrap}>
              <Text style={styles.profileInfoRow}>
                Full name:{" "}
                {profileFriend?.profile?.fullName ||
                  profileFriend?.profile?.fullname ||
                  "--"}
              </Text>
              <Text style={styles.profileInfoRow}>
                Birthday:{" "}
                {formatBirthDate(pickBirthDateRaw(profileFriend?.profile)) ||
                  "--"}
              </Text>
              <Text style={styles.profileInfoRow}>
                Phone: {profileFriend?.profile?.phone || "--"}
              </Text>
              <Text style={styles.profileInfoRow}>
                Gender:{" "}
                {typeof profileFriend?.profile?.gender === "boolean"
                  ? profileFriend.profile.gender
                    ? "Male"
                    : "Female"
                  : "--"}
              </Text>
              <Text style={styles.profileInfoRow}>
                Address: {profileFriend?.profile?.address || "--"}
              </Text>
              <Text style={styles.profileInfoRow}>
                Bio: {profileFriend?.profile?.bio || "--"}
              </Text>
            </View>

            <View style={styles.profileActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setProfileFriend(null)}
              >
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => {
                  const targetEmail = profileFriend?.email;
                  setProfileFriend(null);
                  if (targetEmail) onOpenDirectChat(targetEmail);
                }}
              >
                <Text style={styles.saveText}>Message</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  searchBarWrap: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  headerIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 22,
    color: "#fff",
  },
  headerSearchInput: {
    flex: 1,
    color: "#fff",
    ...Typography.body,
    fontSize: 16,
  },
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerActionIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 22,
    color: "#fff",
  },

  sectionTabs: {
    height: 56,
    backgroundColor: "#fff",
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5eaf2",
  },
  sectionTabItem: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionTabLabel: { ...Typography.body, color: "#8a9099", fontSize: 16 },
  sectionTabLabelActive: {
    ...Typography.heading,
    color: "#212a36",
    fontSize: 16,
  },
  sectionTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 18,
    right: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#2492ff",
  },

  content: { flex: 1 },
  centeredWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  quickCard: {
    backgroundColor: "#fff",
    marginTop: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9edf4",
  },
  quickRow: {
    height: 74,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  quickIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#1f8fff",
    alignItems: "center",
    justifyContent: "center",
  },
  quickIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 23,
    color: "#fff",
  },
  quickTitle: { ...Typography.body, color: "#202733", fontSize: 16 },
  quickSubtitle: {
    ...Typography.heading,
    color: "#202733",
    fontSize: 14,
    marginTop: 2,
  },

  chipRow: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9edf4",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6dce8",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#e9edf2", borderColor: "#c8cfdd" },
  chipText: { ...Typography.body, color: "#646f81", fontSize: 15 },
  chipTextActive: { ...Typography.heading, color: "#1e2631", fontSize: 15 },
  sortButton: {
    marginLeft: "auto",
    borderRadius: 8,
    backgroundColor: "#f0f4fb",
    borderWidth: 1,
    borderColor: "#dce4f2",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sortButtonText: { ...Typography.label, fontSize: 12, color: "#45618a" },

  closeFriendHeader: {
    marginTop: 8,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9edf4",
    gap: 8,
  },
  closeFriendStar: {
    fontFamily: "Material Symbols Outlined",
    color: "#f2c744",
    fontSize: 20,
  },
  closeFriendTitle: {
    ...Typography.heading,
    fontSize: 16,
    color: "#242d3a",
    flex: 1,
  },
  closeFriendAdd: { ...Typography.heading, color: "#1e86f5", fontSize: 16 },
  closeFriendEmpty: {
    ...Typography.body,
    color: "#6f7e94",
    fontSize: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },

  alphaListWrap: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9edf4",
    paddingBottom: 8,
  },
  alphaLabel: {
    ...Typography.heading,
    fontSize: 15,
    color: "#2a3340",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  friendRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  friendMainTap: {
    flex: 1,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  friendAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#e7edf7",
  },
  friendName: { ...Typography.body, fontSize: 17, color: "#1f2733" },
  closeBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#fff2cc",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  closeBadgeIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 14,
    color: "#d9a300",
  },
  closeBadgeText: {
    ...Typography.label,
    color: "#8a6400",
    fontSize: 10,
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionText: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#3b4757",
  },

  panel: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9edf4",
    paddingBottom: 4,
  },
  panelTitle: {
    ...Typography.heading,
    fontSize: 15,
    color: "#242d3a",
    padding: 14,
  },
  emptyLabel: {
    ...Typography.body,
    fontSize: 13,
    color: "#738098",
    paddingHorizontal: 14,
    paddingBottom: 14,
  },

  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf1f7",
  },
  requestAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#e7edf7",
  },
  requestName: { ...Typography.heading, fontSize: 14, color: "#1f2733" },
  requestEmail: { ...Typography.body, fontSize: 12, color: "#6f7e94" },

  rejectButton: {
    borderWidth: 1,
    borderColor: "#d7dfec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rejectText: { ...Typography.label, fontSize: 11, color: "#5f6f86" },
  acceptButton: {
    borderRadius: 8,
    backgroundColor: "#1f8fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  acceptText: { ...Typography.label, fontSize: 11, color: "#fff" },

  suggestItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf1f7",
  },
  skipBtn: {
    borderWidth: 1,
    borderColor: "#d7dfec",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  skipText: { ...Typography.label, fontSize: 11, color: "#5f6f86" },
  addBtn: {
    borderRadius: 8,
    backgroundColor: "#1f8fff",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addText: { ...Typography.label, fontSize: 11, color: "#fff" },

  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#edf1f7",
  },
  groupOpenIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 21,
    color: "#1f8fff",
  },

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
    paddingHorizontal: 12,
  },
  sheetItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#edf1f7",
    paddingVertical: 13,
  },
  sheetText: { ...Typography.body, fontSize: 15, color: "#1f2733" },

  nicknameModal: {
    marginHorizontal: 20,
    marginBottom: 90,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
  },
  nickTitle: { ...Typography.heading, fontSize: 15, color: "#1f2733" },
  nickHint: {
    ...Typography.body,
    fontSize: 12,
    color: "#738098",
    marginTop: 2,
  },
  nickInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d7dfec",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...Typography.body,
    color: "#1f2733",
  },
  nickActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: "#d7dfec",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelText: { ...Typography.label, fontSize: 12, color: "#5f6f86" },
  saveBtn: {
    borderRadius: 8,
    backgroundColor: "#1f8fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  disabledBtn: { opacity: 0.55 },
  saveText: { ...Typography.label, fontSize: 12, color: "#fff" },

  profileModal: {
    marginHorizontal: 20,
    marginBottom: 90,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  profileHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#e7edf7",
  },
  profileName: { ...Typography.heading, fontSize: 16, color: "#1f2733" },
  profileEmail: { ...Typography.body, fontSize: 12, color: "#738098" },
  profileLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileLoadingText: { ...Typography.body, fontSize: 12, color: "#6d7a90" },
  profileInfoWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e3e9f4",
    padding: 10,
    gap: 6,
    backgroundColor: "#fafcff",
  },
  profileInfoRow: {
    ...Typography.body,
    fontSize: 13,
    color: "#2a3340",
  },
  profileActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
});
