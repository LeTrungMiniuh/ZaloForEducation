import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Linking } from 'react-native';
import styles from '../../screens/main/style/HomeScreen.styles';

interface ProfileTabProps {
  user: any;
  profileVersion: number;
  onNavigate: (screen: string, params?: any) => void;
  onLogoutPress: () => void;
  conversationFiles: any[];
  getFileIcon: (mimeType: string, fileName: string) => string;
  formatFileSize: (size: number) => string;
  DEFAULT_AVATAR: any;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  user,
  profileVersion,
  onNavigate,
  onLogoutPress,
  conversationFiles,
  getFileIcon,
  formatFileSize,
  DEFAULT_AVATAR,
}) => {
  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.profileHeader}>
        <View style={styles.largeAvatarBox}>
          <Image
            key={`profile-tab-avatar-${profileVersion}`}
            source={user?.avatarUrl ? { uri: `${user.avatarUrl}?v=${profileVersion}` } : DEFAULT_AVATAR}
            style={styles.largeAvatarImage}
          />
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

        <TouchableOpacity style={styles.menuItem} onPress={onLogoutPress}>
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
};
