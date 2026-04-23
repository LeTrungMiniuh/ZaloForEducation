import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Alert from "../../utils/Alert";
import SocketService from "../../utils/socket";
import styles from "./style/ContactsScreen.styles";
import { chatGet, chatPost, chatPatch } from "../../utils/api";
import { 
  friendEmailOf, 
  firstLetter, 
  pickBirthDateRaw, 
  formatBirthDate, 
  daysUntilNextBirthday 
} from "../../utils/contactUtils";
import { useContacts } from "../../hooks/queries/useContacts";

// Components
import { ContactsHeader } from "../../components/contacts/ContactsHeader";
import { SectionTabs } from "../../components/contacts/SectionTabs";
import { FriendsList } from "../../components/contacts/FriendsList";
import { GroupsList } from "../../components/contacts/GroupsList";
import { BlockedList } from "../../components/contacts/BlockedList";
import { ContactRequests } from "../../components/contacts/ContactRequests";
import { ContactModals } from "../../components/contacts/ContactModals";

const DEFAULT_AVATAR = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

export default function ContactsScreen({
  user,
  conversations,
  onOpenDirectChat,
  onOpenGroupConversation,
  onNavigate,
}: {
  user: any;
  conversations: any[];
  onOpenDirectChat: (email: string) => void;
  onOpenGroupConversation: (conv: any) => void;
  onNavigate?: (screen: string, params?: any) => void;
}) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("friends");

  const [friendships, setFriendships] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, any>>({});
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);

  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("asc");
  const [filterMode, setFilterMode] = useState("all");

  const [skippedSuggestions, setSkippedSuggestions] = useState<Record<string, boolean>>({});
  const [sendingRequestMap, setSendingRequestMap] = useState<Record<string, boolean>>({});
  const [busyAction, setBusyAction] = useState(false);

  const [actionFriend, setActionFriend] = useState<any>(null);
  const [nicknameFriend, setNicknameFriend] = useState<any>(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [profileFriend, setProfileFriend] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileMapRef = useRef<Record<string, any>>({});
  const nicknameSavingRef = useRef(false);

  useEffect(() => {
    profileMapRef.current = profileMap;
  }, [profileMap]);

  const ensureProfiles = useCallback(async (emails: string[]) => {
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

      const patch: Record<string, any> = {};
      results.forEach((entry) => {
        if (entry) patch[entry[0] as string] = entry[1];
      });

      if (Object.keys(patch).length > 0) {
        setProfileMap((prev) => ({ ...prev, ...patch }));
      }
    } catch (error) {
      console.warn("Cannot load contact profiles", error);
    }
  }, []);

  const { data: contactsData, isLoading: contactsLoading, refetch: refetchContacts } = useContacts();

  useEffect(() => {
    if (contactsData) {
      setFriendships(contactsData.friendships);
      setIncomingRequests(contactsData.incomingRequests);
      setSuggestions(contactsData.suggestions);
      setBlockedUsers(contactsData.friendships.filter((item: any) => item?.status === "blocked"));
      
      const friendEmails = contactsData.friendships.map((item: any) => friendEmailOf(item, user.email));
      const requestEmails = contactsData.incomingRequests.map((item: any) => item?.sender_id || item?.senderEmail);
      ensureProfiles([...friendEmails, ...requestEmails]);
    }
  }, [contactsData, user?.email, ensureProfiles]);

  const loadContactsData = useCallback(async () => {
    refetchContacts();
  }, [refetchContacts]);

  useEffect(() => {
    loadContactsData();
  }, [loadContactsData]);

  useEffect(() => {
    const reload = () => loadContactsData();
    SocketService.on("friend_request_received", reload);
    SocketService.on("friendship_updated", reload);
    return () => {
      SocketService.off("friend_request_received", reload);
      SocketService.off("friendship_updated", reload);
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
        const displayName = nickname || profile.fullName || profile.fullname || email;
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

  const filteredFriends = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const rows = acceptedFriends.filter((friend) => {
      const matchesSearch = !q || friend.displayName.toLowerCase().includes(q) || friend.email.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (filterMode === "nickname") return !!friend.nickname;
      if (filterMode === "close") return !!friend.isCloseFriend;
      if (filterMode === "online") return String(friend.status || "").toLowerCase() === "online";
      return true;
    });
    rows.sort((a, b) => {
      const cmp = a.displayName.localeCompare(b.displayName, "vi", { sensitivity: "base" });
      return sortMode === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [acceptedFriends, filterMode, searchText, sortMode]);

  const friendGroups = useMemo(() => {
    const grouped = filteredFriends.reduce((acc: Record<string, any[]>, item) => {
      const key = firstLetter(item.displayName);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredFriends]);

  const joinedGroups = useMemo(() => {
    return (conversations || []).filter((item) => item?.type === "group");
  }, [conversations]);

  const visibleSuggestions = useMemo(() => {
    return (suggestions || []).filter((item) => !skippedSuggestions[item.email]);
  }, [skippedSuggestions, suggestions]);

  const recentlyOnlineCount = useMemo(() => {
    return acceptedFriends.filter((item: any) => String(item.status || "").toLowerCase() === "online").length;
  }, [acceptedFriends]);

  const handleAccept = async (senderEmail: string) => {
    if (!senderEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/accept", { senderEmail });
      if (!res?.ok) throw new Error("ACCEPT_FAILED");
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể chấp nhận lời mời.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleReject = async (senderEmail: string) => {
    if (!senderEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/reject", { senderEmail });
      if (!res?.ok) throw new Error("REJECT_FAILED");
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể từ chối lời mời.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnfriend = async (friendEmail: string) => {
    if (!friendEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/unfriend", { friendEmail });
      if (!res?.ok) throw new Error("UNFRIEND_FAILED");
      setActionFriend(null);
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể xóa bạn.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleBlock = async (targetEmail: string) => {
    if (!targetEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/block", { targetEmail });
      if (!res?.ok) throw new Error("BLOCK_FAILED");
      setActionFriend(null);
      Alert.alert("Thành công", "Đã chặn người dùng.");
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể chặn người dùng.");
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnblock = async (targetEmail: string) => {
    if (!targetEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPost("/friends/unblock", { targetEmail });
      if (!res?.ok) throw new Error("UNBLOCK_FAILED");
      await loadContactsData();
      Alert.alert("Thành công", "Đã bỏ chặn.");
    } catch (error) {
      Alert.alert("Lỗi", "Không thể bỏ chặn.");
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
      const res = await chatPatch("/friends/nickname", { friendEmail, nickname: nextNickname });
      if (!res?.ok) throw new Error("NICKNAME_FAILED");
      setNicknameFriend(null);
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể đặt biệt danh.");
    } finally {
      setBusyAction(false);
      setNicknameSaving(false);
      nicknameSavingRef.current = false;
    }
  };

  const setCloseFriendStatus = async (friendEmail: string, isCloseFriend: boolean) => {
    if (!friendEmail || busyAction) return;
    setBusyAction(true);
    try {
      const res = await chatPatch("/friends/close-friend", { friendEmail, isCloseFriend });
      if (!res?.ok) throw new Error("CLOSE_FRIEND_FAILED");
      setActionFriend(null);
      await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể cập nhật trạng thái bạn thân.");
    } finally {
      setBusyAction(false);
    }
  };

  const openProfile = async (friend: any) => {
    const email = String(friend?.email || "").toLowerCase();
    if (!email) return;
    setProfileFriend({ ...friend, email, profile: profileMap[email] || {} });
    setProfileLoading(true);
    try {
      const res = await chatGet("/friends/search", { email });
      if (res?.ok && res.data?.user) {
        setProfileMap((prev: any) => ({ ...prev, [email]: res.data.user }));
        setProfileFriend((prev: any) => prev?.email === email ? { ...prev, profile: res.data.user } : prev);
      }
    } catch (error) {
      console.warn("Load profile failed", error);
    } finally {
      setProfileLoading(false);
    }
  };

  const sendSuggestionRequest = async (email: string) => {
    if (!email || busyAction || sendingRequestMap[email]) return;
    setSendingRequestMap(prev => ({ ...prev, [email]: true }));
    try {
      const res = await chatPost("/friends/request", { targetEmail: email });
      if (res?.ok) await loadContactsData();
    } catch (error) {
      Alert.alert("Lỗi", "Không thể gửi lời mời.");
    } finally {
      setSendingRequestMap(prev => ({ ...prev, [email]: false }));
    }
  };

  return (
    <View style={styles.safeArea}>
      <ContactsHeader 
        insets={insets} 
        searchText={searchText} 
        setSearchText={setSearchText} 
        onAddPress={() => setActiveSection("friends")}
      />
      
      <SectionTabs activeSection={activeSection} setActiveSection={setActiveSection} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeSection === "friends" && (
          <>
            <ContactRequests 
              incomingRequests={incomingRequests}
              visibleSuggestions={visibleSuggestions}
              profileMap={profileMap}
              onAccept={handleAccept}
              onReject={handleReject}
              onSkipSuggestion={(email) => setSkippedSuggestions(prev => ({ ...prev, [email]: true }))}
              onSendSuggestionRequest={sendSuggestionRequest}
              sendingRequestMap={sendingRequestMap}
            />
            <FriendsList 
              friendGroups={friendGroups as [string, any[]][]}
              recentlyOnlineCount={recentlyOnlineCount}
              onOpenProfile={openProfile}
              onOpenActionSheet={setActionFriend}
              searchText={searchText}
            />
          </>
        )}

        {activeSection === "groups" && (
          <GroupsList 
            joinedGroups={joinedGroups}
            onOpenGroup={onOpenGroupConversation}
            searchText={searchText}
          />
        )}

        {activeSection === "blocked" && (
          <BlockedList 
            blockedUsers={blockedUsers}
            profileMap={profileMap}
            onUnblock={handleUnblock}
            searchText={searchText}
          />
        )}
      </ScrollView>

      <ContactModals 
        actionFriend={actionFriend}
        setActionFriend={setActionFriend}
        nicknameFriend={nicknameFriend}
        setNicknameFriend={setNicknameFriend}
        nicknameDraft={nicknameDraft}
        setNicknameDraft={setNicknameDraft}
        nicknameSaving={nicknameSaving}
        onSaveNickname={saveNickname}
        profileFriend={profileFriend}
        setProfileFriend={setProfileFriend}
        profileLoading={profileLoading}
        onUnfriend={handleUnfriend}
        onBlock={handleBlock}
        onToggleCloseFriend={setCloseFriendStatus}
        onOpenDirectChat={onOpenDirectChat}
        formatBirthDate={formatBirthDate}
      />
    </View>
  );
}
