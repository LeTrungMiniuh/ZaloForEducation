import React, { useState } from 'react';
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
import { useOtpCountdown } from '../../hooks/useOtpCountdown';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function ForgotPasswordScreen({ onNavigate }) {
  const [step, setStep] = useState(1); // 1: email, 2: otp, 3: new password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { countdown, startCountdown, syncWithServer } = useOtpCountdown(email);
  const [touchedFields, setTouchedFields] = useState({});

  const getPasswordStrength = (pass) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[@$!%*?&]/.test(pass)) score++;
    return score;
  };
  
  const handleBlur = (field) => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
  };

  const handleSendOtp = async () => {
    if (!email) { Alert.alert('Lỗi', 'Vui lòng nhập email!'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        startCountdown();
        setStep(2);
      } else {
        if (res.status === 429 && data.retryAfter) {
          syncWithServer(data.retryAfter);
        }
        Alert.alert('Lỗi', data.message);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể kết nối server');
    } finally {
      setLoading(false);
    }
  };
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'forgot_password' }),
      });

      const data = await res.json();
      if (res.ok) {
        startCountdown();
        Alert.alert('Thông báo', 'Đã gửi lại mã OTP mới.');
      } else {
        if (res.status === 429 && data.retryAfter) {
          syncWithServer(data.retryAfter);
        }
        Alert.alert('Lỗi', data.message || 'Không thể gửi lại mã OTP');
      }
    } catch {
      Alert.alert('Lỗi', 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { Alert.alert('Lỗi', 'Mã OTP phải có 6 chữ số'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep(3);
      } else {
        Alert.alert('Lỗi', data.message);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      Alert.alert('Lỗi', 'Mật khẩu phải tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp!'); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep(4);
      } else {
        Alert.alert('Lỗi', data.message);
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể kết nối server');
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
              {step === 4 ? (
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
                  <Text style={styles.cardTitle}>
                    {step === 1 ? 'Khôi phục tài khoản' : (step === 2 ? 'Xác thực mã OTP' : 'Tạo mật khẩu mới')}
                  </Text>
                  <Text style={styles.subtitle}>
                    {step === 1 && 'Nhập Email để lấy lại mật khẩu. Chúng tôi sẽ gửi mã xác thực gồm 6 chữ số.'}
                    {step === 2 && `Mã xác thực đã được gửi về hộp thư \n${email}`}
                    {step === 3 && 'Thiết lập mật khẩu vững vàng để bảo vệ dữ liệu học tập.'}
                  </Text>

                  {/* Bước 1: Email */}
                  {step === 1 && (
                    <View style={styles.form}>
                      <Input
                        label="Email Gmail"
                        placeholder="example@gmail.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        icon="alternate_email"
                      />
                      <Button title={loading ? 'Đang gửi...' : 'Gửi mã xác thực'} onPress={handleSendOtp} disabled={loading} icon="send" />
                    </View>
                  )}

                  {/* Bước 2: OTP */}
                  {step === 2 && (
                    <View style={styles.form}>
                      <Input
                        label="Mã OTP"
                        placeholder="000000"
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        icon="pin"
                      />
                      <Button title={loading ? 'Đang xác thực...' : 'Xác thực OTP'} onPress={handleVerifyOtp} disabled={loading} icon="verified" />
                      
                      <TouchableOpacity 
                        onPress={handleResendOtp} 
                        disabled={countdown > 0 || loading}
                        style={{ marginVertical: 12, alignItems: 'center' }}
                      >
                        <Text style={{ 
                          color: countdown === 0 ? Colors.primary : Colors.outline, 
                          fontWeight: '700',
                          textDecorationLine: countdown === 0 ? 'underline' : 'none'
                        }}>
                          {countdown > 0 ? `Gửi lại mã (${countdown}s)` : 'Gửi lại mã OTP'}
                        </Text>
                      </TouchableOpacity>

                      <Button title="Đổi email lấy mã" variant="secondary" onPress={() => setStep(1)} icon="replay" />
                    </View>
                  )}

                  {/* Bước 3: Mật khẩu mới */}
                  {step === 3 && (
                    <View style={styles.form}>
                      <Input
                        label="Mật khẩu mới"
                        placeholder="Tối thiểu 8 ký tự"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        icon="key"
                        hasError={touchedFields.newPassword && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(newPassword)}
                        onBlur={() => handleBlur('newPassword')}
                      />

                      {newPassword.length > 0 && (
                        <View style={styles.strengthContainer}>
                          <View style={styles.strengthHeader}>
                            <Text style={styles.strengthLabel}>Độ mạnh: <Text style={[
                              styles.strengthValue,
                              getPasswordStrength(newPassword) <= 2 ? { color: Colors.error } : 
                              getPasswordStrength(newPassword) === 3 ? { color: '#EAB308' } : { color: '#10B981' }
                            ]}>
                              {['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][getPasswordStrength(newPassword)]}
                            </Text></Text>
                            <Text style={styles.strengthPercent}>{getPasswordStrength(newPassword) * 25}%</Text>
                          </View>
                          <View style={styles.strengthBarOuter}>
                            <LinearGradient
                              colors={
                                getPasswordStrength(newPassword) <= 1 ? ['#EF4444', '#F87171'] :
                                getPasswordStrength(newPassword) === 2 ? ['#F59E0B', '#FBBF24'] :
                                ['#10B981', '#34D399']
                              }
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={[styles.strengthBarInner, { width: `${getPasswordStrength(newPassword) * 25}%` }]}
                            />
                          </View>
                        </View>
                      )}

                      <Input
                        label="Xác nhận mật khẩu"
                        placeholder="Nhập lại chính xác"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        icon="lock_reset"
                        hasError={touchedFields.confirmPassword && (newPassword !== confirmPassword)}
                        onBlur={() => handleBlur('confirmPassword')}
                      />
                      <Button title={loading ? 'Đang thiết lập...' : 'Xác nhận đổi mật khẩu'} onPress={handleResetPassword} disabled={loading} icon="done_all" />
                    </View>
                  )}

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
  
  strengthContainer: { marginBottom: 20, paddingHorizontal: 4 },
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  strengthLabel: { fontSize: 12, color: Colors.onSurfaceVariant, ...Typography.body },
  strengthValue: { fontWeight: '800' },
  strengthPercent: { fontSize: 12, fontWeight: '700', color: Colors.outline },
  strengthBarOuter: { height: 6, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 3, overflow: 'hidden' },
  strengthBarInner: { height: '100%', borderRadius: 3 },
});
