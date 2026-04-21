import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
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

const EXPIRE_IN_MS = 24 * 60 * 60 * 1000;

const STATUS_GROUPS = [
  {
    title: 'Feelings',
    items: [
      { icon: 'wb_sunny', label: 'Hopeful' },
      { icon: 'local_fire_department', label: 'Fighting' },
      { icon: 'sentiment_very_satisfied', label: 'Happy' },
      { icon: 'local_florist', label: 'Lucky' },
      { icon: 'favorite', label: 'In Love' },
      { icon: 'sentiment_surprised', label: 'Surprised' },
      { icon: 'sentiment_dissatisfied', label: 'Sad' },
      { icon: 'mood_bad', label: 'Low mood' },
      { icon: 'mood', label: 'Angry' },
      { icon: 'bedtime', label: 'Sleepy' },
      { icon: 'battery_1_bar', label: 'Low battery' },
      { icon: 'sync_problem', label: 'Lag...lag' },
    ],
  },
  {
    title: 'Study & Work',
    items: [
      { icon: 'laptop_chromebook', label: 'Hardworking' },
      { icon: 'menu_book', label: 'Reading' },
      { icon: 'do_not_disturb_on', label: 'Do not disturb!' },
      { icon: 'psychology', label: 'Thinking' },
      { icon: 'sick', label: 'Stuck' },
      { icon: 'event_busy', label: 'Day off' },
      { icon: 'mood', label: 'Exhausted' },
    ],
  },
  {
    title: 'Activities',
    items: [
      { icon: 'directions_run', label: 'Runnnn!' },
      { icon: 'medication', label: 'Sick' },
      { icon: 'self_improvement', label: 'Pray' },
      { icon: 'restaurant', label: 'Eating' },
      { icon: 'coffee', label: 'Coffee time' },
      { icon: 'sports_esports', label: 'Gaming' },
      { icon: 'music_note', label: 'Listening to music' },
      { icon: 'movie', label: 'Watching movie' },
    ],
  },
];

export default function StatusPickerScreen({ onNavigate }) {
  const applyStatus = async (label) => {
    const storage = AsyncStorage.default || AsyncStorage;
    const raw = await storage.getItem('user');
    const current = raw ? JSON.parse(raw) : {};

    const nextUser = {
      ...current,
      currentStatus: label,
      statusMessage: label,
      statusExpiresAt: Date.now() + EXPIRE_IN_MS,
    };

    await storage.setItem('user', JSON.stringify(nextUser));
    onNavigate('home-me');
  };

  const clearStatus = async () => {
    const storage = AsyncStorage.default || AsyncStorage;
    const raw = await storage.getItem('user');
    const current = raw ? JSON.parse(raw) : {};

    const nextUser = {
      ...current,
      currentStatus: '',
      statusMessage: '',
      statusExpiresAt: null,
    };

    await storage.setItem('user', JSON.stringify(nextUser));
    onNavigate('home-me');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#496e9a', '#9f7480']} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => onNavigate('home-me')}>
            <Text style={styles.closeIcon}>close</Text>
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Add status</Text>
            <Text style={styles.headerSubtitle}>Visible for 24 hours</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {STATUS_GROUPS.map((group) => (
            <View key={group.title} style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>{group.title}</Text>
              <View style={styles.gridCard}>
                {group.items.map((item) => (
                  <TouchableOpacity
                    key={`${group.title}-${item.label}`}
                    style={styles.statusItem}
                    onPress={() => applyStatus(item.label)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.statusIcon}>{item.icon}</Text>
                    <Text style={styles.statusLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.clearButton} onPress={clearStatus}>
            <Text style={styles.clearButtonText}>Clear current status</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#496e9a',
  },
  gradient: {
    flex: 1,
  },
  header: {
    paddingTop: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 28,
    color: '#fff',
  },
  headerTitle: {
    ...Typography.heading,
    fontSize: 34,
    color: '#fff',
  },
  headerSubtitle: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 20,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  sectionWrap: {
    marginTop: 16,
  },
  sectionTitle: {
    ...Typography.heading,
    color: '#fff',
    fontSize: 23,
    marginBottom: 10,
  },
  gridCard: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(40, 54, 85, 0.28)',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusItem: {
    width: '25%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  statusIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 36,
    color: '#fff',
    marginBottom: 6,
  },
  statusLabel: {
    ...Typography.body,
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  clearButtonText: {
    ...Typography.label,
    color: '#fff',
    fontSize: 14,
  },
});
