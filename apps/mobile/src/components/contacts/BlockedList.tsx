import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface BlockedListProps {
  blockedUsers: any[];
  profileMap: Record<string, any>;
  onUnblock: (email: string) => void;
  searchText: string;
}

export const BlockedList: React.FC<BlockedListProps> = ({
  blockedUsers,
  profileMap,
  onUnblock,
  searchText,
}) => {
  const DEFAULT_AVATAR = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";
  
  const filtered = blockedUsers.filter(item => {
    const email = String(item.friend_email || item.blockedEmail || item.email || "").toLowerCase();
    const profile = profileMap[email] || {};
    const name = (profile.fullName || profile.fullname || email).toLowerCase();
    const q = searchText.toLowerCase();
    return !q || name.includes(q) || email.includes(q);
  });

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          {searchText ? "Không tìm thấy người dùng bị chặn" : "Danh sách chặn trống"}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>DANH SÁCH CHẶN ({filtered.length})</Text>
      </View>
      {filtered.map((item, idx) => {
        const email = String(item.friend_email || item.blockedEmail || item.email || "").toLowerCase();
        const profile = profileMap[email] || {};
        const name = profile.fullName || profile.fullname || email;
        const avatar = profile.avatarUrl || DEFAULT_AVATAR;

        return (
          <View key={`blocked-${idx}`} style={styles.contactRow}>
            <Image source={{ uri: avatar }} style={styles.avatar} />
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{name}</Text>
              <Text style={styles.contactSub}>{email}</Text>
            </View>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => onUnblock(email)}
            >
              <Text style={styles.rejectText}>Bỏ chặn</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
};
