import React, { useState, useMemo, useEffect } from 'react';
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
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { chatGet, apiPost, chatUpload } from '../../utils/api';
import { friendEmailOf } from '../../utils/contactUtils';

const DEFAULT_AVATAR = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

const CreateGroupScreen = ({ navigation }: any) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { fetchConversations, userProfiles } = useChatStore();

  const [groupName, setGroupName] = useState('');
  const [searchText, setSearchText] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [groupAvatar, setGroupAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      setGroupAvatar(result.assets[0].uri);
    }
  };

  useEffect(() => {
    const loadFriends = async () => {
      setLoading(true);
      try {
        const res = await chatGet("/friends");
        if (res.ok && res.data?.friendships) {
          const myEmail = user?.email?.toLowerCase();
          const accepted = res.data.friendships
            .filter((f: any) => f.status === 'accepted')
            .map((f: any) => {
              const email = friendEmailOf(f, myEmail);
              const p = userProfiles[email] || {};
              return {
                email,
                displayName: p.nickname || p.fullName || p.fullname || email,
                avatarUrl: p.avatarUrl || DEFAULT_AVATAR
              };
            });
          setFriends(accepted);
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
    return friends.filter(f => 
      f.displayName.toLowerCase().includes(q) || f.email.toLowerCase().includes(q)
    );
  }, [friends, searchText]);

  const toggleSelect = (email: string) => {
    setSelectedEmails(prev => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return Alert.alert("Lỗi", "Vui lòng nhập tên nhóm");
    if (selectedEmails.size < 2) return Alert.alert("Lỗi", "Chọn ít nhất 2 thành viên");

    setCreating(true);
    try {
      let avatarUrl = '';
      if (groupAvatar) {
        const uploadRes = await chatUpload({
          uri: groupAvatar,
          name: 'group_avatar.jpg',
          type: 'image/jpeg'
        });
        if (uploadRes.ok) {
          avatarUrl = uploadRes.data?.fileUrl || uploadRes.data?.dataUrl || '';
        }
      }

      const res = await apiPost("/chat/conversations/group", {
        name: groupName.trim(),
        memberEmails: Array.from(selectedEmails),
        avatar: avatarUrl
      });
      if (res.ok && res.data?.id) {
        await fetchConversations();
        navigation.replace('Chat', { conversationId: res.data.id });
      } else {
        Alert.alert("Lỗi", res.message || "Không thể tạo nhóm");
      }
    } catch (err: any) {
      Alert.alert("Lỗi", "Đã có lỗi xảy ra");
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerIcon}>close</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nhóm mới</Text>
        <TouchableOpacity 
          onPress={handleCreateGroup} 
          disabled={creating || selectedEmails.size < 2 || !groupName.trim()}
          style={[styles.headerBtn, (selectedEmails.size < 2 || !groupName.trim()) && { opacity: 0.5 }]}
        >
          {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.headerText}>Tạo</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.avatarPlaceholder} onPress={pickImage}>
          {groupAvatar ? (
            <Image source={{ uri: groupAvatar }} style={styles.groupAvatarImage} />
          ) : (
            <Text style={styles.avatarIcon}>photo_camera</Text>
          )}
        </TouchableOpacity>
        <TextInput
          style={styles.nameInput}
          placeholder="Tên nhóm"
          value={groupName}
          onChangeText={setGroupName}
          placeholderTextColor="#94a3b8"
        />
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

      {selectedEmails.size > 0 && (
        <View style={styles.selectedContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectedList}>
            {Array.from(selectedEmails).map(email => {
              const f = friends.find(item => item.email === email);
              return (
                <TouchableOpacity key={email} style={styles.selectedItem} onPress={() => toggleSelect(email)}>
                  <View>
                    <Image source={{ uri: f?.avatarUrl || DEFAULT_AVATAR }} style={styles.selectedAvatar} />
                    <View style={styles.removeBadge}><Text style={styles.removeIcon}>close</Text></View>
                  </View>
                  <Text style={styles.selectedName} numberOfLines={1}>{f?.displayName.split(' ')[0]}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filteredFriends}
        keyExtractor={item => item.email}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.friendItem} onPress={() => toggleSelect(item.email)}>
            <Image source={{ uri: item.avatarUrl }} style={styles.friendAvatar} />
            <Text style={styles.friendName}>{item.displayName}</Text>
            <View style={[styles.checkbox, selectedEmails.has(item.email) && styles.checkboxSelected]}>
              {selectedEmails.has(item.email) && <Text style={styles.checkIcon}>check</Text>}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={loading ? <ActivityIndicator style={{ marginTop: 20 }} color={Colors.primary} /> : <Text style={styles.emptyText}>Không tìm thấy bạn bè</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primary, paddingHorizontal: 16, paddingBottom: 12 },
  headerBtn: { padding: 8, minWidth: 44, alignItems: 'center' },
  headerIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: '#fff' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 16, overflow: 'hidden' },
  groupAvatarImage: { width: 50, height: 50, borderRadius: 25 },
  avatarIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: '#94a3b8' },
  nameInput: { flex: 1, fontSize: 18, fontWeight: '500', color: '#1e293b' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', margin: 16, borderRadius: 12, paddingHorizontal: 12 },
  searchIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: '#94a3b8', marginRight: 8 },
  searchInput: { flex: 1, height: 40, fontSize: 15 },
  selectedContainer: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 8 },
  selectedList: { paddingHorizontal: 16, paddingBottom: 8 },
  selectedItem: { alignItems: 'center', marginRight: 16, width: 60 },
  selectedAvatar: { width: 50, height: 50, borderRadius: 25 },
  removeBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: '#94a3b8', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  removeIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 12, color: '#fff' },
  selectedName: { fontSize: 12, color: '#64748b', marginTop: 4 },
  listContent: { paddingBottom: 40 },
  friendItem: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  friendAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 16 },
  friendName: { flex: 1, fontSize: 16, fontWeight: '500', color: '#1e293b' },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 16, color: '#fff' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#94a3b8' }
});

export default CreateGroupScreen;
