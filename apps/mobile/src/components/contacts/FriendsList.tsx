import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface FriendsListProps {
  friendGroups: [string, any[]][];
  recentlyOnlineCount: number;
  onOpenProfile: (friend: any) => void;
  onOpenActionSheet: (friend: any) => void;
  searchText: string;
}

export const FriendsList: React.FC<FriendsListProps> = ({
  friendGroups,
  recentlyOnlineCount,
  onOpenProfile,
  onOpenActionSheet,
  searchText,
}) => {
  if (friendGroups.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          {searchText ? "Không tìm thấy bạn bè" : "Chưa có bạn bè nào"}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {!searchText && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>TẤT CẢ BẠN BÈ ({friendGroups.reduce((acc, [, list]) => acc + list.length, 0)})</Text>
          <Text style={styles.summaryText}>{recentlyOnlineCount} vừa mới truy cập</Text>
        </View>
      )}

      {friendGroups.map(([letter, list]) => (
        <View key={letter}>
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>{letter}</Text>
          </View>
          {list.map((item, idx) => (
            <TouchableOpacity
              key={`${letter}-${idx}`}
              style={styles.contactRow}
              onPress={() => onOpenProfile(item)}
            >
              <View style={styles.avatarWrap}>
                <Image source={{ uri: item.avatarUrl }} style={styles.avatar} />
                <View
                  style={[
                    styles.statusDot,
                    item.status === "online" && styles.onlineDot,
                  ]}
                />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.displayName}</Text>
                {item.nickname && (
                  <Text style={styles.contactSub}>@{item.email}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.contactAction}
                onPress={() => onOpenActionSheet(item)}
              >
                <Text style={styles.contactActionIcon}>more_horiz</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
};
