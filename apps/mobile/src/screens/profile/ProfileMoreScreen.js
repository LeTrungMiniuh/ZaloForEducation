import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Typography } from '../../constants/Theme';
import Alert from '../../utils/Alert';

const INFORMATION_ITEMS = [
  'Information',
  'Change your avatar',
  'Change your cover',
  'Update Bio',
  'My ZaloPay',
];

const SETTINGS_ITEMS = [
  'My QR code',
  'Privacy',
  'My account',
  'General settings',
];

export default function ProfileMoreScreen({ onNavigate }) {
  const storage = useMemo(() => AsyncStorage.default || AsyncStorage, []);
  const [displayName, setDisplayName] = useState('Người dùng');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const data = await storage.getItem('user');
        if (!data) {
          return;
        }

        const user = JSON.parse(data);
        const fullName = user.fullName || user.fullname || 'Người dùng';
        setDisplayName(fullName);
      } catch (error) {
        console.error('Load user for profile menu failed', error);
      }
    };

    loadUser();
  }, [storage]);

  const handleItemPress = (label) => {
    if (label === 'Change your avatar' || label === 'Change your cover' || label === 'Update Bio') {
      onNavigate('profile');
      return;
    }

    if (label === 'Privacy' || label === 'General settings' || label === 'My account') {
      onNavigate('settings');
      return;
    }

    Alert.alert('Thông báo', `Mục ${label} sẽ được cập nhật sau.`);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <LinearGradient colors={['#0058bc', '#00b5ff']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => onNavigate('profile')}>
          <Text style={styles.headerIcon}>arrow_back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
      </LinearGradient>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.group}>
          {INFORMATION_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item}
              style={[styles.row, index !== INFORMATION_ITEMS.length - 1 && styles.rowBorder]}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.85}
            >
              <Text style={styles.rowText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionTitleWrap}>
          <Text style={styles.sectionTitle}>Settings</Text>
        </View>

        <View style={styles.group}>
          {SETTINGS_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item}
              style={[styles.row, index !== SETTINGS_ITEMS.length - 1 && styles.rowBorder]}
              onPress={() => handleItemPress(item)}
              activeOpacity={0.85}
            >
              <Text style={styles.rowText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f1f1f4',
  },
  header: {
    height: 74,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    ...Typography.heading,
    color: '#d8f2ff',
    fontSize: 18,
    flex: 1,
  },
  body: {
    flex: 1,
    backgroundColor: '#f1f1f4',
  },
  bodyContent: {
    paddingBottom: 24,
  },
  group: {
    backgroundColor: '#f2f2f2',
  },
  row: {
    minHeight: 66,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#d9d9dc',
  },
  rowText: {
    ...Typography.body,
    color: '#1f2329',
    fontSize: 15,
    lineHeight: 22,
  },
  sectionTitleWrap: {
    height: 54,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sectionTitle: {
    ...Typography.heading,
    color: '#1c7dad',
    fontSize: 16,
  },
});
