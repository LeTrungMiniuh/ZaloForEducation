import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Alert from '../../utils/Alert';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { Colors, Typography, Shadows } from '../../constants/Theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function ResetPasswordScreen({ onNavigate }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      if (tokenParam) {
        setToken(tokenParam);
      } else {
        Alert.alert('Lỗi', 'Liên kết không hợp lệ: Thiếu mã xác thực (Token)');
      }
    }
  }, []);

  const handleReset = async () => {
    if (!token) {
      Alert.alert('Lỗi', 'Không tìm thấy Token. Vui lòng nhấn lại vào link trong Gmail.');
      return;
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      Alert.alert('Lỗi', 'Mật khẩu phải tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp!');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        setSuccess(true);
      } else {
        Alert.alert('Lỗi', data.message);
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Lỗi kết nối server: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.blob, styles.blobTopRight]} />
      <View style={[styles.blob, styles.blobBottomLeft]} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.headerContainer}>
            <LinearGradient
              colors={['#0058bc', '#00418f']}
              style={styles.logoBox}
            >
              <Text style={styles.logoIcon}>edu</Text>
            </LinearGradient>
            <Text style={styles.brandTitle}>Zalo Education</Text>
          </View>

          <View style={styles.cardContainer}>
            <BlurView intensity={80} tint="light" style={styles.glassCard}>
              {success ? (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <Text style={{ fontFamily: 'Material Symbols Outlined', fontSize: 64, color: Colors.primaryContainer, marginBottom: 24 }}>check_circle</Text>
                  <Text style={styles.cardTitle}>Giao dịch thành công</Text>
                  <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 32 }]}>Mật khẩu của bạn đã được đặt lại thành công. Vui lòng đăng nhập hệ thống.</Text>
                  <View style={{ width: '100%' }}>
                    <Button title="Đăng nhập ngay" onPress={() => onNavigate && onNavigate('login')} icon="login" />
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.cardTitle}>Tạo mật khẩu mới</Text>
                  <Text style={styles.subtitle}>Thiết lập mật khẩu vững vàng để bảo vệ dữ liệu học tập.</Text>

                  <View style={styles.form}>
                    <Input
                      label="Mật khẩu mới"
                      placeholder="Tối thiểu 8 ký tự"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      icon="key"
                    />
                    <Input
                      label="Xác nhận mật khẩu"
                      placeholder="Nhập lại chính xác"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      icon="lock_reset"
                    />
                    <Button 
                      title={loading ? 'Đang cập nhật...' : 'Xác nhận đổi mật khẩu'} 
                      onPress={handleReset} 
                      disabled={loading} 
                      icon="done_all" 
                    />
                  </View>

                  <TouchableOpacity onPress={() => onNavigate && onNavigate('login')} style={styles.footer}>
                    <Text style={styles.footerLink}>← Về trang đăng nhập</Text>
                  </TouchableOpacity>
                </>
              )}
            </BlurView>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.surface },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  blob: { position: 'absolute', borderRadius: 200, opacity: 0.5 },
  blobTopRight: { top: -100, right: -100, width: 300, height: 300, backgroundColor: 'rgba(0, 65, 143, 0.08)' },
  blobBottomLeft: { bottom: -100, left: -100, width: 250, height: 250, backgroundColor: 'rgba(75, 94, 134, 0.1)' },
  
  headerContainer: { alignItems: 'center', marginBottom: 32 },
  logoBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...Shadows.glow },
  logoIcon: { color: '#ffffff', ...Typography.heading, fontSize: 16 },
  brandTitle: { ...Typography.heading, fontSize: 20, color: Colors.primary },
  
  cardContainer: { borderRadius: 32, overflow: 'hidden', ...Shadows.medium },
  glassCard: { padding: 24, backgroundColor: 'rgba(255, 255, 255, 0.8)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', borderRadius: 32 },
  cardTitle: { ...Typography.heading, fontSize: 24, color: Colors.onSurface, marginBottom: 8, textAlign: 'center' },
  subtitle: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  
  form: { width: '100%', marginTop: 8 },
  footer: { alignItems: 'center', marginTop: 16 },
  footerLink: { ...Typography.label, fontSize: 14, color: Colors.primary },
});
