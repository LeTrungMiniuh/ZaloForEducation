import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Input from '../../components/Input';
import { Colors, Shadows, Typography } from '../../constants/Theme';
import Alert from '../../utils/Alert';

import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../utils/api';
import { getDeviceInfo } from '../../utils/device';
import { getDeviceId } from '../../utils/deviceId';

export default function LoginScreen({ onNavigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  useEffect(() => {
    async function initDeviceId() {
      try {
        const id = await getDeviceId();
        setDeviceId(id);
      } catch (err) {
        console.error('[DEBUG] Failed to init Device ID:', err);
      }
    }
    initDeviceId();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ email và mật khẩu!');
      return;
    }

    setLoading(true);

    try {
      const { deviceName, deviceType } = getDeviceInfo();

      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          deviceId,
          deviceName,
          deviceType,
          platform: 'mobile',
        }),
      });

      if (data.accessToken) {
        await login(data.user, data.accessToken, deviceId);
        if (onNavigate) onNavigate('home');
        return;
      }

      const isOtpRequired =
        data.requireOtp === true ||
        data.type === 'REQUIRE_OTP' ||
        (data.message && data.message.includes('Xác thực bảo mật'));

      if (isOtpRequired) {
        if (onNavigate) {
          onNavigate('login-otp', 'messages', {
            email,
            deviceId,
            deviceName,
            deviceType
          });
        }
        return;
      }

      Alert.alert('Đăng nhập thất bại', data.message || 'Sai tài khoản hoặc mật khẩu');
    } catch (error) {
      if (error.message !== 'SESSION_INVALIDATED') {
        Alert.alert('Lỗi', 'Lỗi kết nối server: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const ForgotLink = () => (
    <TouchableOpacity onPress={() => onNavigate && onNavigate('forgot')}>
      <Text style={styles.forgotText}>Quên mật khẩu?</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.blob, styles.blobTopRight]} />
      <View style={[styles.blob, styles.blobBottomLeft]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerContainer}>
            <View style={styles.logoBox}>
              <Image
                source={require('../../../assets/logo_blue.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
            <Text style={styles.brandTitle}>Zalo Education</Text>
            <Text style={styles.brandSubtitle}>Khai phóng tiềm năng tri thức</Text>
          </View>

          <View style={styles.cardContainer}>
            <BlurView intensity={80} tint="light" style={styles.glassCard}>
              <Text style={styles.cardTitle}>Đăng nhập</Text>

              <View style={styles.form}>
                <Input
                  label="Email "
                  placeholder="user@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  icon="person"
                />
                <Input
                  label="Mật khẩu"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  icon="lock"
                  rightElement={<ForgotLink />}
                />

                <Button
                  title={loading ? "Đang xử lý..." : "Đăng nhập"}
                  onPress={handleLogin}
                  variant="primary"
                  disabled={loading}
                  icon={!loading ? "arrow_forward" : null}
                />
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Bạn mới sử dụng Zalo Education? </Text>
                <TouchableOpacity onPress={() => onNavigate && onNavigate('register')}>
                  <Text style={styles.footerLink}>Đăng ký ngay</Text>
                </TouchableOpacity>
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  blob: { position: 'absolute', borderRadius: 200, opacity: 0.5 },
  blobTopRight: { top: -100, right: -100, width: 300, height: 300, backgroundColor: 'rgba(0, 65, 143, 0.08)' },
  blobBottomLeft: { bottom: -100, left: -100, width: 250, height: 250, backgroundColor: 'rgba(75, 94, 134, 0.1)' },
  headerContainer: { alignItems: 'center', marginBottom: 40 },
  logoBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden', ...Shadows.medium },
  logoImage: { width: '100%', height: '100%' },
  brandTitle: { ...Typography.heading, fontSize: 32, color: Colors.primary, marginBottom: 4 },
  brandSubtitle: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant },
  cardContainer: { borderRadius: 32, overflow: 'hidden', ...Shadows.medium },
  glassCard: { padding: 32, backgroundColor: 'rgba(255, 255, 255, 0.8)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', borderRadius: 32 },
  cardTitle: { ...Typography.heading, fontSize: 24, color: Colors.onSurface, marginBottom: 24 },
  form: { marginBottom: 16 },
  forgotText: { ...Typography.label, fontSize: 13, color: Colors.primary },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant },
  footerLink: { ...Typography.label, fontSize: 14, color: Colors.primary },
});
