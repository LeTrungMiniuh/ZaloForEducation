import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import styles from '../../screens/main/style/HomeScreen.styles';

interface HomeHeaderProps {
  onSearchPress: () => void;
  onQRScannerPress: () => void;
  onAddPress: () => void;
  searchEmail: string;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({ 
  onSearchPress, 
  onQRScannerPress, 
  onAddPress, 
  searchEmail 
}) => {
  const insets = useSafeAreaInsets();
  
  return (
    <LinearGradient
      colors={["#0058bc", "#00418f"]}
      style={[styles.header, { paddingTop: insets.top }]}
    >
      <View style={styles.headerContent}>
        <TouchableOpacity
          style={styles.searchContainer}
          onPress={onSearchPress}
          activeOpacity={0.7}
        >
          <Text style={styles.searchIcon}>search</Text>
          <Text style={styles.searchInput} numberOfLines={1}>
            {searchEmail || 'Tìm kiếm tin nhắn, bạn bè, tệp tin...'}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onQRScannerPress}
          >
            <Text style={styles.headerIconText}>qr_code_scanner</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onAddPress}
          >
            <Text style={styles.headerIconText}>add</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};
