import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Platform, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Alert from '../../utils/Alert';
import { Colors, Typography, Shadows } from '../../constants/Theme';
import Storage from '../../utils/storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

import SocketService from '../../utils/socket';
import { apiRequest } from '../../utils/api';

export default function SessionsScreen({ onNavigate, goBack }) {
  const [activeSessions, setActiveSessions] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [currentDeviceId, setCurrentDeviceId] = useState('');

  useEffect(() => {
    let userEmail = '';
    
    // Hàm callback cho socket update
    const onSessionUpdate = () => {
      console.log('Realtime sessions update received on Mobile');
      if (userEmail) fetchSessions(userEmail);
    };

    const loadData = async (retryCount = 0) => {
      try {
        const userJson = await Storage.getItem('user');
        const devId = await Storage.getItem('deviceId');
        
        console.log(`[Sessions] Load attempt ${retryCount + 1}: devId =`, devId);

        if (!devId && retryCount < 3) {
          // Retry factor if devId is missing (extreme strictness)
          setTimeout(() => loadData(retryCount + 1), 500);
          return;
        }

        if (userJson) {
          const user = JSON.parse(userJson);
          userEmail = user.email;
          setEmail(userEmail);
          
          if (devId) {
            setCurrentDeviceId(devId);
          }
          
          fetchSessions(userEmail);

          // Đăng ký lắng nghe cập nhật realtime mà không làm disconnect socket hiện tại
          SocketService.on('sessions_update', onSessionUpdate);
          
          // Lắng nghe cả force_logout để cập nhật UI ngay lập tức nêú cần (Gắt!)
          SocketService.on('force_logout', (data) => {
             console.log('[Sessions] Received force_logout event in screen context', data);
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadData();

    return () => {
      SocketService.off('sessions_update', onSessionUpdate);
    };
  }, []);

  const fetchSessions = async (userEmail) => {
    try {
      const data = await apiRequest('/auth/sessions');
      
      console.log('[Sessions] Received data:', data);
      
      // data from apiRequest is { ok, status, ...actualData }
      if (data.ok && data.activeDevices) {
        setActiveSessions(data.activeDevices);
        setLoginHistory(data.loginHistory || []);
      } else if (data.ok && data.sessions) {
        setActiveSessions(data.sessions);
      } else if (data.ok && Array.isArray(data)) {
        setActiveSessions(data);
      } else if (!data.ok || data.message) {
        const errorMsg = data.message || 'Không thể lấy dữ liệu';
        console.error('[Sessions] Error:', errorMsg);
        if (errorMsg !== 'SESSION_INVALIDATED') {
          Alert.alert('Lỗi', errorMsg);
        }
      }
    } catch (error) {
      if (error.message !== 'SESSION_INVALIDATED') {
        console.error('Fetch sessions error', error);
        Alert.alert('Lỗi', 'Không thể lấy danh sách thiết bị. Vui lòng thử lại sau.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutTarget = async (targetDeviceId, name) => {
    Alert.alert(
      'Đăng xuất thiết bị?',
      `Bạn có chắc chắn muốn đăng xuất khỏi "${name || targetDeviceId}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Đăng xuất', 
          onPress: async () => {
            try {
              const token = await Storage.getItem('token');

              const response = await fetch(`${API_URL}/auth/sessions/${targetDeviceId}`, {
                method: 'DELETE',
                headers: { 
                  'Authorization': `Bearer ${token}`
                },
              });
              
              if (response.ok) {
                Alert.alert('Thành công', 'Thiết bị đã được đăng xuất.');
                fetchSessions(email); // Refresh list
              }
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể đăng xuất thiết bị.');
            }
          }
        }
      ]
    );
  };

  const handleLogoutAll = async () => {
    Alert.alert(
      'Đăng xuất tất cả?',
      'Tất cả các phiên đăng nhập khác sẽ bị hủy bỏ.',
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Đăng xuất hết', 
          onPress: async () => {
            try {
              const token = await Storage.getItem('token');

              await fetch(`${API_URL}/auth/logout-all`, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
              });
              
              await Storage.removeItem('token');
              await Storage.removeItem('user');
              onNavigate('login');
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể thực hiện');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack ? goBack() : onNavigate('home')} style={styles.backBtn}>
          <Text style={styles.icon}>arrow_back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thiết bị đăng nhập</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Phiên đăng nhập</Text>
          <Text style={styles.infoSubtitle}>
            Quản lý các thiết bị hiện đang truy cập vào tài khoản Zalo Education của bạn.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.sessionList}>
            <Text style={styles.sectionLabel}>Đang hoạt động</Text>
            {activeSessions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Chưa có thiết bị nào đang hoạt động</Text>
              </View>
            ) : activeSessions.map((item, index) => {
              const isCurrent = item.deviceId === currentDeviceId;
              return (
                <View key={index} style={[styles.sessionCard, isCurrent && styles.sessionCardActive]}>
                  <View style={styles.sessionIconBox}>
                    <Text style={styles.sessionIcon}>
                      {(item.deviceType === 'mobile' || item.deviceId.includes('android') || item.deviceId.includes('ios')) 
                        ? (Platform.OS === 'ios' ? 'iphone' : 'smartphone') 
                        : 'laptop'}
                    </Text>
                  </View>
                  <View style={styles.sessionInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.deviceName}>{item.deviceName || item.deviceId}</Text>
                      {isCurrent && <View style={styles.currentBadge}><Text style={styles.currentText}>Thiết bị này</Text></View>}
                    </View>
                    <Text style={styles.lastActive}>
                      Đăng nhập: {new Date(item.loginAt || item.lastActiveAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </Text>
                  </View>
                  {!isCurrent && (
                    <TouchableOpacity 
                      style={styles.revokeBtn} 
                      onPress={() => handleLogoutTarget(item.deviceId, item.deviceName)}
                    >
                      <Text style={styles.revokeText}>Đăng xuất</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {loginHistory.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Lịch sử đăng xuất (30 ngày gần đây)</Text>
                {loginHistory.map((item, index) => (
                  <View key={`history-${index}`} style={styles.historyCard}>
                    <View style={styles.historyIconBox}>
                      <Text style={styles.historyIcon}>
                        {(item.deviceType === 'mobile' || (item.deviceId && (item.deviceId.includes('android') || item.deviceId.includes('ios')))) 
                          ? (Platform.OS === 'ios' ? 'iphone' : 'smartphone') 
                          : 'laptop'}
                      </Text>
                    </View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.historyName}>{item.deviceName || item.deviceId}</Text>
                      <Text style={styles.historyTime}>
                        Đã đăng xuất: {new Date(item.logoutAt || item.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                      </Text>
                    </View>
                    <View style={styles.historyBadge}>
                      <Text style={styles.historyBadgeText}>ĐÃ THOÁT</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Lịch sử đăng xuất</Text>
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Chưa ghi nhận lịch sử đăng xuất</Text>
                </View>
              </>
            )}
          </View>
        )}

        <View style={styles.warningBox}>
          <Text style={styles.iconWarning}>security</Text>
          <Text style={styles.warningText}>
            Nếu bạn thấy bất kỳ thiết bị lạ nào, hãy đăng xuất ngay lập tức và đổi mật khẩu.
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutAllBtn} onPress={handleLogoutAll}>
          <Text style={styles.logoutAllText}>Đăng xuất khỏi tất cả thiết bị</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fb' },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: Colors.onSurface },
  headerTitle: { ...Typography.heading, fontSize: 18, color: Colors.primary, marginLeft: 8 },
  
  scrollContent: { padding: 20 },
  infoBox: { marginBottom: 24 },
  infoTitle: { ...Typography.heading, fontSize: 24, color: Colors.onSurface, marginBottom: 8 },
  infoSubtitle: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 20 },
  
  sessionList: { marginBottom: 24 },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    ...Shadows.soft,
  },
  sessionCardActive: { borderColor: Colors.primaryContainer, backgroundColor: 'rgba(0, 65, 143, 0.02)' },
  sessionIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  sessionIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: Colors.primary },
  sessionInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  deviceName: { ...Typography.heading, fontSize: 15, color: Colors.onSurface },
  currentBadge: { backgroundColor: Colors.primaryContainer, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 },
  currentText: { color: Colors.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  lastActive: { ...Typography.body, fontSize: 12, color: Colors.outline },
  
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(186, 26, 26, 0.05)',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.1)',
  },
  iconWarning: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: Colors.error, marginRight: 12 },
  warningText: { flex: 1, ...Typography.body, fontSize: 13, color: Colors.error, lineHeight: 18 },
  
  logoutAllBtn: {
    height: 56,
    backgroundColor: Colors.error,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.medium,
  },
  logoutAllText: { ...Typography.heading, color: '#fff', fontSize: 16 },
  revokeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(186, 26, 26, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.1)',
  },
  revokeText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionLabel: { ...Typography.heading, fontSize: 16, color: Colors.primary, marginBottom: 12, marginLeft: 4 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    opacity: 0.8,
  },
  historyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: Colors.outline },
  historyName: { ...Typography.heading, fontSize: 14, color: Colors.onSurfaceVariant },
  historyTime: { ...Typography.body, fontSize: 11, color: Colors.outline },
  historyBadge: { 
    backgroundColor: Colors.surfaceContainerHighest, 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4 
  },
  historyBadgeText: { color: Colors.outline, fontSize: 9, fontWeight: '800' },
  emptyCard: {
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: { ...Typography.body, fontSize: 13, color: Colors.outline, fontStyle: 'italic' },
});
