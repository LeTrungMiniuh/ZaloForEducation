import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface GroupsListProps {
  joinedGroups: any[];
  onOpenGroup: (group: any) => void;
  searchText: string;
}

export const GroupsList: React.FC<GroupsListProps> = ({
  joinedGroups,
  onOpenGroup,
  searchText,
}) => {
  const filtered = joinedGroups.filter(g => 
    !searchText || g.name?.toLowerCase().includes(searchText.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          {searchText ? "Không tìm thấy nhóm" : "Chưa tham gia nhóm nào"}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>DANH SÁCH NHÓM ({filtered.length})</Text>
      </View>
      {filtered.map((item, idx) => (
        <TouchableOpacity
          key={`group-${idx}`}
          style={styles.groupRow}
          onPress={() => onOpenGroup(item)}
        >
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: item.avatarUrl || "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png" }}
              style={styles.avatar}
            />
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{item.name || "Nhóm không tên"}</Text>
            <Text style={styles.contactSub}>{item.members?.length || 0} thành viên</Text>
          </View>
          <Text style={styles.groupOpenIcon}>chevron_right</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
