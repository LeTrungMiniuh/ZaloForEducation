import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Shadows } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { useSecurityAlerts } from '../../hooks/useSecurityAlerts';
import Storage from '../../utils/storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function SecurityAlertsScreen({ navigation }: any) {
  const { alerts, markAllRead, clearAll } = useSecurityAlerts();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const handleRevokeDevice = async (deviceId: string) => {
    Alert.alert(
      'Đăng xuất thiết bị',
      'Bạn có chắc chắn muốn đăng xuất thiết bị này không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đăng xuất',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoadingAction(deviceId);
              const token = await Storage.getItem('token');
              const response = await fetch(`${API_URL}/auth/sessions/${deviceId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`
                },
              });

              if (response.ok) {
                Alert.alert('Thành công', 'Thiết bị đã bị đăng xuất.');
                clearAll();
              } else {
                Alert.alert('Lỗi', 'Không thể đăng xuất thiết bị.');
              }
            } catch (err) {
              Alert.alert('Lỗi', 'Không thể kết nối đến máy chủ.');
            } finally {
              setLoadingAction(null);
            }
          }
        }
      ]
    );
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword');
  };

  const renderActionButtons = (alert: any) => {
    if (alert.type === "NEW_DEVICE_LOGIN") {
      const deviceId = alert.metadata?.deviceId;
      const isRevoking = loadingAction === deviceId;

      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btnDestructive, isRevoking && { opacity: 0.5 }]}
            onPress={() => handleRevokeDevice(deviceId)}
            disabled={isRevoking}
          >
            {isRevoking ? (
              <ActivityIndicator color={Colors.error} size="small" />
            ) : (
              <Text style={styles.btnDestructiveText}>Đăng xuất thiết bị đó</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={clearAll}>
            <Text style={styles.btnPrimaryText}>Đây là tôi</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (alert.type === "PASSWORD_CHANGED") {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.btnDestructive} onPress={handleChangePassword}>
            <Text style={styles.btnDestructiveText}>Đổi mật khẩu ngay</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnNeutral} onPress={clearAll}>
            <Text style={styles.btnNeutralText}>Đã hiểu</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.icon}>arrow_back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <View style={styles.headerIconBox}>
            <Text style={styles.headerIcon}>security</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>Cảnh báo bảo mật</Text>
            <Text style={styles.headerSubtitle}>Hệ thống Zalo Education</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {alerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.icon, { fontSize: 64, color: Colors.outlineVariant, marginBottom: 16 }]}>shield</Text>
            <Text style={styles.emptyText}>Bạn không có cảnh báo bảo mật nào.</Text>
          </View>
        ) : (
          <>
            <View style={styles.infoBanner}>
              <View style={styles.infoBadge}>
                <Text style={[styles.icon, { fontSize: 16, color: Colors.error }]}>warning</Text>
                <Text style={styles.infoBadgeText}>TIN NHẮN HỆ THỐNG</Text>
              </View>
              <Text style={styles.infoText}>
                Zalo Education không bao giờ yêu cầu mật khẩu hoặc mã OTP của bạn qua tin nhắn.
              </Text>
            </View>

            {alerts.map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardIconBox}>
                    <Text style={[styles.icon, { color: Colors.error }]}>security</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle}>{alert.title}</Text>
                    </View>
                    <Text style={styles.cardTime}>
                      {new Date(alert.at).toLocaleString('vi-VN')}
                    </Text>
                  </View>
                </View>

                <Text style={styles.cardMessage}>{alert.message}</Text>

                {alert.metadata && alert.type === 'NEW_DEVICE_LOGIN' && (
                  <View style={styles.metadataBox}>
                    <Text style={styles.metadataTitle}>Thông tin thiết bị</Text>
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Tên thiết bị:</Text>
                      <Text style={styles.metadataValue}>{alert.metadata.deviceName || 'Không xác định'}</Text>
                    </View>
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Loại thiết bị:</Text>
                      <Text style={styles.metadataValue}>{alert.metadata.deviceType || alert.metadata.platform || 'Khác'}</Text>
                    </View>
                  </View>
                )}

                {renderActionButtons(alert)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { fontFamily: 'Material Symbols Outlined', fontSize: 24, color: Colors.onSurface },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  headerIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(186, 26, 26, 0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: Colors.error },
  headerTitle: { ...Typography.heading, fontSize: 18, color: Colors.onSurface },
  headerSubtitle: { ...Typography.body, fontSize: 12, color: Colors.onSurfaceVariant },
  scrollContent: { padding: 16 },
  emptyContainer: { alignItems: 'center', marginTop: 100, opacity: 0.5 },
  emptyText: { ...Typography.heading, fontSize: 16, color: Colors.onSurface },
  infoBanner: { alignItems: 'center', marginBottom: 24 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.outlineVariant, marginBottom: 12, ...Shadows.soft },
  infoBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.onSurface, marginLeft: 6 },
  infoText: { textAlign: 'center', fontSize: 13, color: Colors.onSurfaceVariant, paddingHorizontal: 16 },
  alertCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', ...Shadows.soft },
  cardHeader: { flexDirection: 'row', marginBottom: 12 },
  cardIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(186, 26, 26, 0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardTitle: { ...Typography.heading, fontSize: 16, color: Colors.onSurface, flex: 1 },
  cardTime: { fontSize: 12, color: Colors.outline, fontWeight: '500' },
  cardMessage: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 20, marginBottom: 16 },
  metadataBox: { backgroundColor: '#f8fafe', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,65,143,0.1)' },
  metadataTitle: { fontSize: 11, fontWeight: '800', color: Colors.primary, marginBottom: 12, letterSpacing: 0.5 },
  metadataRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metadataLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  metadataValue: { fontSize: 13, fontWeight: '600', color: Colors.onSurface, textTransform: 'capitalize' },
  actionRow: { flexDirection: 'row', gap: 12 },
  btnDestructive: { flex: 1, backgroundColor: 'rgba(186, 26, 26, 0.1)', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnDestructiveText: { color: Colors.error, fontSize: 14, fontWeight: '600' },
  btnPrimary: { flex: 1, backgroundColor: 'rgba(0, 65, 143, 0.1)', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  btnNeutral: { flex: 1, backgroundColor: Colors.surfaceContainerHigh, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnNeutralText: { color: Colors.onSurface, fontSize: 14, fontWeight: '600' },
});
