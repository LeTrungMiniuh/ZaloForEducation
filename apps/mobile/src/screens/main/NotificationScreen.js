import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  SafeAreaView
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { getSecurityAlerts, markAllSecurityAlertsRead } from '../../utils/securityAlerts';

export default function NotificationScreen({ onNavigate }) {
  const { notifications, markNotificationsRead } = useChatStore();
  const [securityAlerts, setSecurityAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const alerts = await getSecurityAlerts();
    setSecurityAlerts(alerts);
  }, []);

  useEffect(() => {
    loadData();
    markNotificationsRead(); // Mark message notifications read when viewing screen
    markAllSecurityAlertsRead(); // Mark security alerts read
  }, [loadData, markNotificationsRead]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Merge message notifications and security alerts, sorted by time
  const allNotifications = [
    ...notifications.map(n => ({ ...n, category: 'message' })),
    ...securityAlerts.map(a => ({ ...a, category: 'security' }))
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const handlePress = (item) => {
    if (item.category === 'message' && item.metadata?.conversationId) {
      // Use Deep-link logic: Navigate to chat and scroll to messageId
      onNavigate('chat', { 
        conversationId: item.metadata.conversationId,
        targetMessageId: item.metadata.messageId 
      });
    }
    // Security alerts might just show detail or do nothing for now
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.card, !item.read && styles.unreadCard]} 
      onPress={() => handlePress(item)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardType}>
          {item.category === 'security' ? '🔐 BẢO MẬT' : '💬 TIN NHẮN'}
        </Text>
        {!item.read && <View style={styles.unreadDot} />}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>
      <Text style={styles.cardTime}>{new Date(item.at).toLocaleString('vi-VN')}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Thông báo</Text>
      </View>
      
      <FlatList
        data={allNotifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>notifications_off</Text>
            <Text style={styles.emptyText}>Chưa có thông báo nào</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  unreadCard: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardType: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  cardMessage: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  cardTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 48,
    color: '#cbd5e1',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#94a3b8',
  },
});
