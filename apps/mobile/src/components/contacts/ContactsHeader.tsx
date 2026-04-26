import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface ContactsHeaderProps {
  insets: { top: number };
  searchText: string;
  setSearchText: (text: string) => void;
  onAddPress: () => void;
}

export const ContactsHeader: React.FC<ContactsHeaderProps> = ({
  insets,
  searchText,
  setSearchText,
  onAddPress,
}) => {
  return (
    <LinearGradient
      colors={["#0058bc", "#00418f"]}
      style={[styles.header, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.searchBarWrap}>
        <Text style={styles.headerIcon}>search</Text>
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Tìm kiếm"
          placeholderTextColor="rgba(255,255,255,0.8)"
          style={styles.headerSearchInput}
        />
      </View>
      <TouchableOpacity
        style={styles.headerAction}
        onPress={onAddPress}
      >
        <Text style={styles.headerActionIcon}>person_add</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
};
