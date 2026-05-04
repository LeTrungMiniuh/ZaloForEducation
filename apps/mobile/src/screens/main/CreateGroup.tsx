import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/Theme";
import { useChatStore } from "../../store/chatStore";
import { useAuth } from "../../context/AuthContext";
import { chatGet, apiPost, chatUpload } from "../../utils/api";
import { friendEmailOf } from "../../utils/contactUtils";

const DEFAULT_AVATAR =
  "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

interface Friend {
  email: string;
  displayName: string;
  avatarUrl: string;
  fullName?: string;
}

const CreateGroupScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { fetchConversations, userProfiles, conversations } = useChatStore();
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 768;

  const [groupName, setGroupName] = useState("");
  const [groupNameLength, setGroupNameLength] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scaleAnim] = useState(new Animated.Value(1));
  const [selectedCategory, setSelectedCategory] = useState<"recent" | "all">(
    "recent",
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setGroupAvatar(result.assets[0].uri);
      // Trigger scale animation
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  useEffect(() => {
    const loadFriends = async () => {
      setLoading(true);
      try {
        const res = await chatGet("/friends");
        // Handle both array response and object with friendships property
        const friendshipsData = Array.isArray(res.data)
          ? res.data
          : res.data?.friendships || res.friendships || [];

        if (res.ok && friendshipsData.length > 0) {
          const myEmail = user?.email?.toLowerCase();
          const accepted = friendshipsData
            .filter((f: any) => f.status === "accepted")
            .map((f: any) => {
              // ✅ FIX 1: Normalize email sang lowercase
              let email = friendEmailOf(f, myEmail);
              email = email.toLowerCase();

              // ✅ Tìm userProfile bằng lowercase email
              const p =
                userProfiles[email] || userProfiles[email.toLowerCase()] || {};

              console.log("[CreateGroup] Friend loaded:", {
                email,
                displayName: p.nickname || p.fullName || p.fullname || email,
              });

              return {
                email, // ✅ Always lowercase
                displayName: p.nickname || p.fullName || p.fullname || email,
                avatarUrl: p.avatarUrl || DEFAULT_AVATAR,
                fullName: p.fullName || p.fullname,
              };
            });
          console.log("[CreateGroup] Loaded friends count:", accepted.length);
          setFriends(accepted);
        } else {
          console.warn("[CreateGroup] No friendships data:", {
            ok: res.ok,
            statusCode: res.status,
            dataLength: friendshipsData.length,
            fullResponse: res,
          });
        }
      } catch (err) {
        console.error("Load friends error", err);
      } finally {
        setLoading(false);
      }
    };
    loadFriends();
  }, [user?.email, userProfiles]);

  const filteredFriends = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    // Get recent contacts from conversations
    const recentEmails = new Set<string>();
    conversations.forEach((conv: any) => {
      if (conv.type === "direct" && conv.members) {
        const partner = conv.members.find((m: string) => m !== user?.email);
        if (partner) recentEmails.add(partner.toLowerCase());
      }
    });

    // Filter by category
    let filtered = friends;
    if (selectedCategory === "recent") {
      // Show only recently contacted friends
      filtered = friends.filter((f) => recentEmails.has(f.email.toLowerCase()));
    } else if (selectedCategory === "all") {
      // Show all friends (no additional filtering by recent)
      filtered = friends;
    }

    // Filter by search query
    if (!q) return filtered;
    return filtered.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.email.toLowerCase().includes(q),
    );
  }, [friends, searchText, selectedCategory, conversations, user?.email]);

  // ✅ FIX 4: Normalize comparison
  const selectedMembersList = useMemo(() => {
    return friends.filter((f) => selectedEmails.has(f.email.toLowerCase()));
  }, [friends, selectedEmails]);

  // ✅ FIX 2: Normalize email khi toggle
  const toggleSelect = (email: string) => {
    const normalizedEmail = email.toLowerCase();
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(normalizedEmail)) next.delete(normalizedEmail);
      else next.add(normalizedEmail);
      return next;
    });
  };

  // ✅ FIX 3: Normalize email removal
  const removeSelected = (email: string) => {
    const normalizedEmail = email.toLowerCase();
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.delete(normalizedEmail);
      return next;
    });
  };

  const handleGroupNameChange = (text: string) => {
    const limited = text.slice(0, 50);
    setGroupName(limited);
    setGroupNameLength(limited.length);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return Alert.alert("Lỗi", "Vui lòng nhập tên nhóm");
    if (selectedEmails.size < 2)
      return Alert.alert("Lỗi", "Chọn ít nhất 2 thành viên");

    setCreating(true);
    try {
      let avatarUrl = "";
      if (groupAvatar) {
        const uploadRes = await chatUpload({
          uri: groupAvatar,
          name: "group_avatar.jpg",
          type: "image/jpeg",
        });
        if (uploadRes.ok) {
          avatarUrl = uploadRes.data?.fileUrl || uploadRes.data?.dataUrl || "";
        }
      }

      // ✅ FIX 5: Ensure all emails are lowercase before sending
      const res = await apiPost("/chat/conversations/group", {
        name: groupName.trim(),
        memberEmails: Array.from(selectedEmails).map((e) => e.toLowerCase()),
        avatar: avatarUrl,
      });
      if (res.ok && res.data?.id) {
        await fetchConversations();
        navigation.replace("Chat", { conversationId: res.data.id });
      } else {
        Alert.alert("Lỗi", res.message || "Không thể tạo nhóm");
      }
    } catch (err: any) {
      Alert.alert("Lỗi", "Đã có lỗi xảy ra");
    } finally {
      setCreating(false);
    }
  };

  const canCreateGroup =
    selectedEmails.size >= 2 && groupName.trim().length > 0;

  if (isLargeScreen) {
    // Tablet/Large screen layout
    return (
      <View style={styles.containerLarge}>
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
          >
            <Text style={styles.headerIcon}>arrow_back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tạo nhóm</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.contentLarge}>
          {/* Left Panel: Group Setup */}
          <View style={styles.leftPanel}>
            <Text style={styles.sectionTitle}>Thông tin nhóm</Text>

            <View style={styles.avatarSection}>
              <TouchableOpacity
                style={styles.avatarLargePlaceholder}
                onPress={pickImage}
              >
                <Animated.Image
                  source={groupAvatar ? { uri: groupAvatar } : undefined}
                  style={[
                    styles.avatarLargeImage,
                    groupAvatar && { transform: [{ scale: scaleAnim }] },
                  ]}
                />
                {!groupAvatar && (
                  <Text style={styles.avatarLargeIcon}>photo_camera</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tên nhóm</Text>
              <View style={styles.nameInputWrapper}>
                <TextInput
                  style={styles.nameInputLarge}
                  placeholder="Nhập tên nhóm..."
                  value={groupName}
                  onChangeText={handleGroupNameChange}
                  maxLength={50}
                  placeholderTextColor="#94a3b8"
                />
                <Text style={styles.charCount}>{groupNameLength}/50</Text>
              </View>
            </View>
          </View>

          {/* Right Panel: Member Selection */}
          <View style={styles.rightPanel}>
            <View style={styles.searchWrapper}>
              <Text style={styles.sectionTitle}>Chọn thành viên</Text>
              <View style={styles.searchContainer}>
                <Text style={styles.searchIcon}>search</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Tìm tên hoặc email"
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholderTextColor="#94a3b8"
                />
              </View>
              {/* Category Tabs for Tablet */}
              <View style={styles.categoryTabsLarge}>
                <TouchableOpacity
                  style={[
                    styles.categoryTabLarge,
                    selectedCategory === "recent" &&
                      styles.categoryTabLargeActive,
                  ]}
                  onPress={() => setSelectedCategory("recent")}
                >
                  <Text
                    style={[
                      styles.categoryTabTextLarge,
                      selectedCategory === "recent" &&
                        styles.categoryTabTextLargeActive,
                    ]}
                  >
                    GẦN ĐÂY
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.categoryTabLarge,
                    selectedCategory === "all" && styles.categoryTabLargeActive,
                  ]}
                  onPress={() => setSelectedCategory("all")}
                >
                  <Text
                    style={[
                      styles.categoryTabTextLarge,
                      selectedCategory === "all" &&
                        styles.categoryTabTextLargeActive,
                    ]}
                  >
                    DANH BẠ
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {filteredFriends.length > 0 ? (
              <FlatList
                data={filteredFriends}
                keyExtractor={(item) => item.email}
                style={styles.friendsListLarge}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.friendItemLarge,
                      selectedEmails.has(item.email.toLowerCase()) &&
                        styles.friendItemSelected,
                    ]}
                    onPress={() => toggleSelect(item.email)}
                  >
                    <Image
                      source={{ uri: item.avatarUrl }}
                      style={styles.friendAvatarLarge}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.friendNameLarge}>
                        {item.displayName}
                      </Text>
                      <Text style={styles.friendEmail}>{item.email}</Text>
                    </View>
                    <View
                      style={[
                        styles.checkboxLarge,
                        selectedEmails.has(item.email.toLowerCase()) &&
                          styles.checkboxSelectedLarge,
                      ]}
                    >
                      {selectedEmails.has(item.email.toLowerCase()) && (
                        <Text style={styles.checkIconLarge}>check</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {loading ? "Đang tải..." : "Không tìm thấy bạn bè"}
                </Text>
              </View>
            )}

            {/* Selected Members Preview */}
            {selectedMembersList.length > 0 && (
              <View style={styles.selectedPreviewLarge}>
                <Text style={styles.selectedCountLarge}>
                  Đã chọn: {selectedMembersList.length}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedMembersList.map((member) => (
                    <View key={member.email} style={styles.selectedTagLarge}>
                      <Text style={styles.selectedTagText}>
                        {member.displayName}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeSelected(member.email)}
                      >
                        <Text style={styles.removeTagIcon}>close</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerLarge}>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.buttonSecondaryText}>Hủy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.buttonPrimary,
              !canCreateGroup && styles.buttonDisabled,
            ]}
            onPress={handleCreateGroup}
            disabled={!canCreateGroup || creating}
          >
            {creating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonPrimaryIcon}>group_add</Text>
                <Text style={styles.buttonPrimaryText}>Tạo nhóm</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Phone layout
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBtn}
        >
          <Text style={styles.headerIcon}>close</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nhóm mới</Text>
        <TouchableOpacity
          onPress={handleCreateGroup}
          disabled={creating || !canCreateGroup}
          style={[styles.headerBtn, !canCreateGroup && { opacity: 0.5 }]}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.headerText}>Tạo</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Animated.View
          style={groupAvatar ? { transform: [{ scale: scaleAnim }] } : {}}
        >
          <TouchableOpacity
            style={styles.avatarPlaceholder}
            onPress={pickImage}
          >
            {groupAvatar ? (
              <Image
                source={{ uri: groupAvatar }}
                style={styles.groupAvatarImage}
              />
            ) : (
              <Text style={styles.avatarIcon}>photo_camera</Text>
            )}
          </TouchableOpacity>
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Tên nhóm</Text>
          <View style={styles.nameInputWrapper}>
            <TextInput
              style={styles.nameInput}
              placeholder="Nhập tên nhóm..."
              value={groupName}
              onChangeText={handleGroupNameChange}
              maxLength={50}
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.charCountSmall}>{groupNameLength}/50</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>search</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm tên hoặc email"
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        <TouchableOpacity
          style={[
            styles.categoryTab,
            selectedCategory === "recent" && styles.categoryTabActive,
          ]}
          onPress={() => setSelectedCategory("recent")}
        >
          <Text
            style={[
              styles.categoryTabText,
              selectedCategory === "recent" && styles.categoryTabTextActive,
            ]}
          >
            GẦN ĐÂY
          </Text>
          {selectedCategory === "recent" && (
            <View style={styles.categoryTabUnderline} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.categoryTab,
            selectedCategory === "all" && styles.categoryTabActive,
          ]}
          onPress={() => setSelectedCategory("all")}
        >
          <Text
            style={[
              styles.categoryTabText,
              selectedCategory === "all" && styles.categoryTabTextActive,
            ]}
          >
            DANH BẠ
          </Text>
          {selectedCategory === "all" && (
            <View style={styles.categoryTabUnderline} />
          )}
        </TouchableOpacity>
      </View>

      {selectedEmails.size > 0 && (
        <View style={styles.selectedContainer}>
          <Text style={styles.selectedLabel}>
            Đã chọn {selectedEmails.size}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
          >
            {selectedMembersList.map((member) => (
              <TouchableOpacity
                key={member.email}
                style={styles.selectedItem}
                onPress={() => removeSelected(member.email)}
              >
                <View style={styles.selectedItemContainer}>
                  <Image
                    source={{ uri: member.avatarUrl }}
                    style={styles.selectedAvatar}
                  />
                  <View style={styles.removeBadge}>
                    <Text style={styles.removeIcon}>close</Text>
                  </View>
                </View>
                <Text style={styles.selectedName} numberOfLines={1}>
                  {member.displayName.split(" ").slice(-1)[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredFriends}
        keyExtractor={(item) => item.email}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.friendItem,
              selectedEmails.has(item.email.toLowerCase()) &&
                styles.friendItemActive,
            ]}
            onPress={() => toggleSelect(item.email)}
          >
            <Image
              source={{ uri: item.avatarUrl }}
              style={styles.friendAvatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.friendName}>{item.displayName}</Text>
              <Text style={styles.friendEmail}>{item.email}</Text>
            </View>
            <View
              style={[
                styles.checkbox,
                selectedEmails.has(item.email.toLowerCase()) &&
                  styles.checkboxSelected,
              ]}
            >
              {selectedEmails.has(item.email.toLowerCase()) && (
                <Text style={styles.checkIcon}>check</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              style={{ marginTop: 20 }}
              color={Colors.primary}
            />
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {searchText ? "Không tìm thấy bạn bè" : "Bạn chưa có bạn bè"}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // Phone styles
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: "#fff",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  headerText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  groupAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 24,
    color: Colors.primary,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  nameInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#1e293b",
    paddingVertical: 10,
  },
  charCountSmall: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    margin: 12,
    marginVertical: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#94a3b8",
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: "#1e293b",
  },
  categoryTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 16,
    backgroundColor: "#fff",
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  categoryTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  categoryTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  categoryTabTextActive: {
    color: Colors.primary,
    fontWeight: "700",
  },
  categoryTabUnderline: {
    position: "absolute",
    bottom: -1,
    height: 2,
    backgroundColor: Colors.primary,
    width: "100%",
  },
  selectedContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 12,
    backgroundColor: "#f9fafb",
  },
  selectedLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  selectedList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  selectedItem: {
    alignItems: "center",
    width: 60,
  },
  selectedItemContainer: {
    position: "relative",
    marginBottom: 4,
  },
  selectedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  removeBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: Colors.primary,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
    elevation: 2,
  },
  removeIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 12,
    color: "#fff",
  },
  selectedName: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "500",
  },
  listContent: {
    paddingBottom: 60,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
    gap: 12,
  },
  friendItemActive: {
    backgroundColor: Colors.primary + "10",
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1e293b",
  },
  friendEmail: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 14,
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    textAlign: "center",
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },

  // Tablet/Large screen styles
  containerLarge: {
    flex: 1,
    backgroundColor: "#fff",
    flexDirection: "column",
  },
  contentLarge: {
    flex: 1,
    flexDirection: "row",
    padding: 20,
    gap: 20,
    overflow: "hidden",
  },
  leftPanel: {
    width: 280,
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0",
    paddingRight: 20,
    paddingVertical: 20,
  },
  rightPanel: {
    flex: 1,
    flexDirection: "column",
    overflow: "hidden",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 16,
    textTransform: "uppercase",
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarLargePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  avatarLargeImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarLargeIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 40,
    color: Colors.primary,
  },
  inputGroup: {
    marginBottom: 20,
  },
  nameInputLarge: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1e293b",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
  },
  charCount: {
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "500",
    marginTop: 8,
  },
  searchWrapper: {
    marginBottom: 16,
  },
  categoryTabsLarge: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  categoryTabLarge: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  categoryTabLargeActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryTabTextLarge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    textTransform: "uppercase",
  },
  categoryTabTextLargeActive: {
    color: "#fff",
  },
  friendsListLarge: {
    flex: 1,
    marginBottom: 16,
  },
  friendItemLarge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  friendItemSelected: {
    backgroundColor: Colors.primary + "10",
  },
  friendAvatarLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  friendNameLarge: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
  },
  checkboxLarge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelectedLarge: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkIconLarge: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 14,
    color: "#fff",
  },
  selectedPreviewLarge: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 12,
  },
  selectedCountLarge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 8,
  },
  selectedTagLarge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    gap: 8,
  },
  selectedTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  removeTagIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 14,
    color: "#fff",
  },
  footerLarge: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  buttonSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonSecondaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.primary,
  },
  buttonPrimary: {
    flex: 1.5,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    elevation: 2,
  },
  buttonDisabled: {
    backgroundColor: "#cbd5e1",
    opacity: 0.6,
  },
  buttonPrimaryIcon: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 20,
    color: "#fff",
  },
  buttonPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});

export default CreateGroupScreen;
