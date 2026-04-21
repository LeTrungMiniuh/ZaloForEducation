import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Image
} from 'react-native';
import { useOtpCountdown } from '../../hooks/useOtpCountdown';
import { SafeAreaView } from 'react-native-safe-area-context';
import Alert from '../../utils/Alert';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { Colors, Typography, Shadows } from '../../constants/Theme';

export default function RegisterScreen({ onNavigate }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState(true); // true = Nam, false = Nữ
  const [dataOfBirth, setDataOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [touchedFields, setTouchedFields] = useState({});
  const { countdown, startCountdown, syncWithServer } = useOtpCountdown(email);

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

  const handleRequestOtp = async () => {
    if (!email.endsWith('@gmail.com')) {
      Alert.alert('Lỗi', 'Chỉ chấp nhận tài khoản Gmail (@gmail.com)');
      return;
    }

    setLoading(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/auth/register/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        startCountdown();
        setStep(2);
      } else {
        if (response.status === 429 && data.retryAfter) {
          syncWithServer(data.retryAfter);
        }
        Alert.alert('Lỗi', data.message);
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: 'register' }),
      });

      const data = await response.json();
      if (response.ok) {
        startCountdown();
        Alert.alert('Thông báo', 'Đã gửi lại mã OTP mới.');
      } else {
        if (response.status === 429 && data.retryAfter) {
          syncWithServer(data.retryAfter);
        }
        Alert.alert('Lỗi', data.message || 'Không thể gửi lại mã OTP');
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = () => {
    if (otp.length === 6) {
      setStep(3);
    } else {
      Alert.alert('Lỗi', 'Mã OTP phải có 6 chữ số');
    }
  };

  const handleRegister = async () => {
    // 1. Validate Full Name
    const nameParts = fullName.trim().split(/\s+/);
    if (!fullName || nameParts.length < 2) {
      Alert.alert('Lỗi', 'Họ tên phải bao gồm ít nhất 2 từ');
      return;
    }
    if (/[0-9!@#$%^&*(),.?":{}|<>]/.test(fullName)) {
      Alert.alert('Lỗi', 'Họ tên không được chứa số hoặc ký tự đặc biệt');
      return;
    }

    // 2. Validate Phone
    const phoneRegex = /^(0|84)(3|5|7|8|9)[0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      Alert.alert('Lỗi', 'Số điện thoại Việt Nam không hợp lệ');
      return;
    }

    // 3. Validate Date of Birth (DD-MM-YYYY)
    const dobRegex = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[012])-(19|20)\d\d$/;
    if (!dobRegex.test(dataOfBirth)) {
      Alert.alert('Lỗi', 'Ngày sinh phải đúng định dạng DD-MM-YYYY');
      return;
    }

    // 4. Validate Password Strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      Alert.alert('Lỗi', 'Mật khẩu phải tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp!');
      return;
    }

    setLoading(true);
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
    try {
      const response = await fetch(`${apiUrl}/auth/register/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          otp, 
          fullName, 
          gender, 
          dataOfBirth, 
          phone, 
          password 
        }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Thành công', 'Đăng ký tài khoản thành công!');
        onNavigate && onNavigate('login');
      } else {
        Alert.alert('Lỗi', data.message);
      }
    } catch (error) {
      Alert.alert('Lỗi', 'Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  };

  const StepIndicator = () => (
    <View style={styles.stepContainer}>
      {[1, 2, 3].map((s) => (
        <React.Fragment key={s}>
          <View style={[styles.stepCircle, step === s ? styles.stepCircleActive : (step > s ? styles.stepCircleCompleted : styles.stepCircleInactive)]}>
             {step > s ? (
                <Text style={styles.stepTextCompleted}>check</Text>
             ) : (
                <Text style={[styles.stepText, step === s ? styles.stepTextActive : styles.stepTextInactive]}>{s}</Text>
             )}
          </View>
          {s < 3 && <View style={[styles.stepLine, step > s ? styles.stepLineActive : styles.stepLineInactive]} />}
        </React.Fragment>
      ))}
    </View>
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
          </View>

          <StepIndicator />

          <View style={styles.cardContainer}>
            <BlurView intensity={80} tint="light" style={styles.glassCard}>
              <Text style={styles.cardTitle}>
                {step === 1 && "Tạo tài khoản"}
                {step === 2 && "Xác thực OTP"}
                {step === 3 && "Thông tin cá nhân"}
              </Text>

              {step === 1 && (
                <View style={styles.form}>
                  <Text style={styles.subtitle}>Gia nhập cộng đồng học tập thông minh.</Text>
                  
                  <Input
                    label="Email của bạn"
                    placeholder="example@gmail.com"
                    value={email}
                    onChangeText={(val) => {
                      setEmail(val);
                      if (val && !val.endsWith('@gmail.com')) {
                        setEmailError('Chỉ chấp nhận tài khoản (@gmail.com)');
                      } else {
                        setEmailError('');
                      }
                    }}
                    keyboardType="email-address"
                    icon="alternate_email"
                  />
                  {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  
                  <Button 
                    title={loading ? "Đang gửi..." : (countdown > 0 ? `Nhận mã sau (${countdown}s)` : "Nhận mã xác thực")} 
                    onPress={handleRequestOtp} 
                    icon="arrow_forward"
                    disabled={loading || !!emailError || !email || countdown > 0}
                    style={countdown > 0 ? { opacity: 0.5 } : null}
                  />
                </View>
              )}

              {step === 2 && (
                <View style={styles.form}>
                  <Text style={styles.otpLabel}>Nhập mã OTP 6 chữ số gửi đến {'\n'}<Text style={{fontWeight: '700'}}>{email}</Text></Text>
                  <Input
                    label="Mã OTP"
                    placeholder="000000"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    icon="pin"
                  />
                  <Button 
                    title="Xác thực OTP" 
                    onPress={handleVerifyOtp} 
                    icon="arrow_forward"
                  />
                  <TouchableOpacity 
                    onPress={handleResendOtp} 
                    disabled={countdown > 0 || loading}
                    style={{ marginVertical: 12, alignItems: 'center', opacity: countdown > 0 ? 0.5 : 1 }}
                  >
                    <Text style={{ 
                      color: countdown > 0 ? Colors.outline : Colors.primary, 
                      fontWeight: '700',
                      textDecorationLine: countdown > 0 ? 'none' : 'underline'
                    }}>
                      {countdown > 0 ? `Gửi lại mã (${countdown}s)` : 'Gửi lại mã OTP'}
                    </Text>
                  </TouchableOpacity>
                  <Button 
                    title="Quay lại" 
                    onPress={() => setStep(1)} 
                    variant="secondary" 
                  />
                </View>
              )}

              {step === 3 && (
                <View style={styles.form}>
                  <Input 
                    label="Họ và tên" 
                    placeholder="Nguyễn Văn A" 
                    value={fullName} 
                    onChangeText={setFullName} 
                    icon="badge" 
                    hasError={touchedFields.fullName && (fullName.trim().split(/\s+/).length < 2 || /[0-9!@#$%^&*(),.?":{}|<>]/.test(fullName))}
                    onBlur={() => handleBlur('fullName')}
                  />
                  <Input 
                    label="Số điện thoại" 
                    placeholder="0901 234 567" 
                    value={phone} 
                    onChangeText={setPhone} 
                    keyboardType="phone-pad" 
                    icon="phone" 
                    hasError={touchedFields.phone && !/^(0|84)(3|5|7|8|9)[0-9]{8}$/.test(phone)}
                    onBlur={() => handleBlur('phone')}
                  />
                  <Input 
                    label="Ngày sinh" 
                    placeholder="DD-MM-YYYY" 
                    value={dataOfBirth} 
                    onChangeText={setDataOfBirth} 
                    icon="calendar_today" 
                    hasError={touchedFields.dataOfBirth && !/^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[012])-(19|20)\d\d$/.test(dataOfBirth)}
                    onBlur={() => handleBlur('dataOfBirth')}
                  />

                  <View style={{ marginBottom: 24 }}>
                    <Text style={styles.genderLabel}>Giới tính</Text>
                    <View style={styles.genderContainer}>
                      <TouchableOpacity 
                        style={[styles.genderBox, gender ? styles.genderBoxActive : styles.genderBoxInactive]} 
                        onPress={() => setGender(true)}
                      >
                        <Text style={[styles.genderBoxText, gender ? styles.genderBoxTextActive : styles.genderBoxTextInactive]}>Nam</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.genderBox, !gender ? styles.genderBoxActive : styles.genderBoxInactive]} 
                        onPress={() => setGender(false)}
                      >
                        <Text style={[styles.genderBoxText, !gender ? styles.genderBoxTextActive : styles.genderBoxTextInactive]}>Nữ</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Input 
                    label="Mật khẩu" 
                    placeholder="••••••••" 
                    value={password} 
                    onChangeText={setPassword} 
                    secureTextEntry 
                    icon="lock" 
                    hasError={touchedFields.password && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/.test(password)}
                    onBlur={() => handleBlur('password')}
                  />
                  
                  {password.length > 0 && (
                    <View style={styles.strengthContainer}>
                      <View style={styles.strengthHeader}>
                        <Text style={styles.strengthLabel}>Độ mạnh: <Text style={[
                          styles.strengthValue,
                          getPasswordStrength(password) <= 2 ? { color: Colors.error } : 
                          getPasswordStrength(password) === 3 ? { color: '#EAB308' } : { color: '#10B981' }
                        ]}>
                          {['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'][getPasswordStrength(password)]}
                        </Text></Text>
                        <Text style={styles.strengthPercent}>{getPasswordStrength(password) * 25}%</Text>
                      </View>
                      <View style={styles.strengthBarOuter}>
                        <LinearGradient
                          colors={
                            getPasswordStrength(password) <= 1 ? ['#EF4444', '#F87171'] :
                            getPasswordStrength(password) === 2 ? ['#F59E0B', '#FBBF24'] :
                            ['#10B981', '#34D399']
                          }
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.strengthBarInner, { width: `${getPasswordStrength(password) * 25}%` }]}
                        />
                      </View>
                    </View>
                  )}

                  <Input 
                    label="Xác nhận mật khẩu" 
                    placeholder="••••••••" 
                    value={confirmPassword} 
                    onChangeText={setConfirmPassword} 
                    secureTextEntry 
                    icon="lock_reset" 
                    hasError={touchedFields.confirmPassword && (password !== confirmPassword)}
                    onBlur={() => handleBlur('confirmPassword')}
                  />
                  
                  <Button 
                    title={loading ? "Đang xử lý..." : "Hoàn tất đăng ký"} 
                    onPress={handleRegister} 
                    icon="check_circle"
                    disabled={loading}
                  />
                </View>
              )}

              <View style={styles.footer}>
                <Text style={styles.footerText}>Đã có tài khoản? </Text>
                <TouchableOpacity onPress={() => onNavigate && onNavigate('login')}>
                  <Text style={styles.footerLink}>Đăng nhập ngay</Text>
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
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 40 },
  blob: { position: 'absolute', borderRadius: 200, opacity: 0.5 },
  blobTopRight: { top: -100, left: -100, width: 300, height: 300, backgroundColor: 'rgba(0, 65, 143, 0.08)' },
  blobBottomLeft: { bottom: -100, right: -100, width: 250, height: 250, backgroundColor: 'rgba(75, 94, 134, 0.1)' },
  
  headerContainer: { alignItems: 'center', marginBottom: 24 },
  logoBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#eef4ff', alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden', ...Shadows.medium },
  logoImage: { width: '100%', height: '100%' },
  brandTitle: { ...Typography.heading, fontSize: 24, color: Colors.primary },
  
  stepContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  stepCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...Shadows.medium },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepCircleCompleted: { backgroundColor: Colors.secondaryContainer },
  stepCircleInactive: { backgroundColor: Colors.surfaceContainerHighest, elevation: 0, shadowOpacity: 0 },
  stepText: { ...Typography.heading, fontSize: 14 },
  stepTextCompleted: { fontFamily: 'Material Symbols Outlined', fontSize: 18, color: Colors.onSecondaryContainer },
  stepTextActive: { color: '#fff' },
  stepTextInactive: { color: Colors.outline },
  stepLine: { flex: 1, height: 2, marginHorizontal: 8, maxWidth: 40, borderRadius: 2 },
  stepLineActive: { backgroundColor: Colors.outlineVariant },
  stepLineInactive: { backgroundColor: Colors.surfaceContainerHighest },
  
  cardContainer: { borderRadius: 32, overflow: 'hidden', ...Shadows.medium },
  glassCard: { padding: 24, backgroundColor: 'rgba(255, 255, 255, 0.8)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', borderRadius: 32 },
  cardTitle: { ...Typography.heading, fontSize: 24, color: Colors.onSurface, marginBottom: 8, textAlign: 'center' },
  subtitle: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 },
  
  form: { width: '100%', marginTop: 10 },
  otpLabel: { textAlign: 'center', fontSize: 14, color: Colors.onSurfaceVariant, marginBottom: 24, ...Typography.body },
  
  genderLabel: { ...Typography.label, fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: 8, paddingHorizontal: 4 },
  genderContainer: { flexDirection: 'row', backgroundColor: Colors.surfaceContainerHighest, padding: 4, borderRadius: 16 },
  genderBox: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  genderBoxActive: { backgroundColor: Colors.surfaceContainerLowest, ...Shadows.soft },
  genderBoxInactive: { backgroundColor: 'transparent' },
  genderBoxText: { ...Typography.heading, fontSize: 14 },
  genderBoxTextActive: { color: Colors.primary },
  genderBoxTextInactive: { color: Colors.onSurfaceVariant },
  
  errorText: { ...Typography.label, color: Colors.error, fontSize: 12, marginTop: -16, marginBottom: 16, paddingLeft: 12 },
  
  strengthContainer: { marginBottom: 20, paddingHorizontal: 4 },
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  strengthLabel: { fontSize: 12, color: Colors.onSurfaceVariant, ...Typography.body },
  strengthValue: { fontWeight: '800' },
  strengthPercent: { fontSize: 12, fontWeight: '700', color: Colors.outline },
  strengthBarOuter: { height: 6, backgroundColor: Colors.surfaceContainerHighest, borderRadius: 3, overflow: 'hidden' },
  strengthBarInner: { height: '100%', borderRadius: 3 },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { ...Typography.body, fontSize: 14, color: Colors.onSurfaceVariant },
  footerLink: { ...Typography.label, fontSize: 14, color: Colors.primary },
});
