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
import { apiRequest } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useOtpCountdown } from '../../hooks/useOtpCountdown';

export default function LoginOtpScreen({ onNavigate, goBack, params }) {
  const { login } = useAuth();
  const { email, deviceId, deviceName, deviceType } = params || {};
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const { countdown, startCountdown, syncWithServer } = useOtpCountdown(email);

  useEffect(() => {
    if (!email) {
      Alert.alert('Lỗi', 'Thiếu thông tin xác thực. Vui lòng đăng nhập lại.');
      if (onNavigate) onNavigate('login');
    }
  }, [email]);

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Lỗi', 'Mã OTP phải có 6 chữ số');
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest('/auth/verify-login-otp', {
        method: 'POST',
        body: JSON.stringify({
          email,
          otp,
          deviceId,
          deviceName,
          deviceType,
        }),
      });

      if (data.accessToken) {
        console.log('[DEBUG] Login OTP verification successful');
        // Use context login (handles state, storage and socket)
        await login(data.user, data.accessToken, deviceId);
        if (onNavigate) onNavigate('home');
      } else {
        if (data.retryAfter) {
          syncWithServer(data.retryAfter);
        }
        Alert.alert('Lỗi', data.message || 'Mã OTP không chính xác');
      }
    } catch (error) {
      console.error('[DEBUG] Verify OTP error:', error);
      Alert.alert('Lỗi', 'Lỗi kết nối server: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const data = await apiRequest('/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email, type: 'login' }),
      });

      startCountdown();
      Alert.alert('Thông báo', 'Đã gửi lại mã OTP mới về email của bạn.');
    } catch (error) {
      if (error.retryAfter) {
        syncWithServer(error.retryAfter);
      }
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
              <Text style={styles.cardTitle}>Xác thực đăng nhập</Text>
              <Text style={styles.subtitle}>
                Vì lý do bảo mật, vui lòng nhập mã OTP đã được gửi về hộp thư:{"\n"}
                <Text style={{ fontWeight: 'bold', color: Colors.primary }}>{email}</Text>
              </Text>

              <View style={styles.form}>
                <Input
                  label="Mã xác thực"
                  placeholder="000000"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  icon="pin"
                  maxLength={6}
                />
                
                <Button 
                  title={loading ? 'Đang xác thực...' : 'Xác nhận đăng nhập'} 
                  onPress={handleVerifyOtp} 
                  disabled={loading} 
                  icon="verified" 
                />
                
                <TouchableOpacity 
                  onPress={handleResendOtp} 
                  disabled={countdown > 0 || loading}
                  style={{ marginVertical: 16, alignItems: 'center' }}
                >
                  <Text style={{ 
                    color: countdown === 0 ? Colors.primary : Colors.outline, 
                    fontWeight: '700',
                    textDecorationLine: countdown === 0 ? 'underline' : 'none'
                  }}>
                    {countdown > 0 ? `Gửi lại mã (${countdown}s)` : 'Gửi lại mã OTP'}
                  </Text>
                </TouchableOpacity>

                <Button 
                  title="Quay lại đăng nhập" 
                  variant="secondary" 
                  onPress={goBack} 
                  icon="arrow_back" 
                />
              </View>
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
});
