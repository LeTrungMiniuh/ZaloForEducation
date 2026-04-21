import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    ActivityIndicator,
    Modal,
    KeyboardAvoidingView,
    Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Shadows, Typography } from '../../constants/Theme';
import { apiRequest } from '../../utils/api';
import Alert from '../../utils/Alert';
import { useAuth } from '../../context/AuthContext';
import { useOtpCountdown } from '../../hooks/useOtpCountdown';

export default function ChangePasswordScreen({ onNavigate, goBack }) {
    const { logout, user } = useAuth();
    const [step, setStep] = useState(1); // 1: Passwords, 2: OTP
    const [loading, setLoading] = useState(false);
    const { countdown, startCountdown, syncWithServer } = useOtpCountdown(user?.email);

    // Form data
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [otp, setOtp] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    const handleRequest = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('Lỗi', 'Vui lòng điền đầy đủ các trường.');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp.');
            return;
        }

        if (newPassword === currentPassword) {
            Alert.alert('Lỗi', 'Mật khẩu mới không được trùng với mật khẩu hiện tại.');
            return;
        }

        setLoading(true);
        try {
            const res = await apiRequest('/auth/change-password/request', {
                method: 'POST',
                body: JSON.stringify({ currentPassword, newPassword })
            });
            startCountdown();
            Alert.alert('Thành công', res.message || 'Mã OTP đã được gửi về email của bạn.');
            setStep(2);
        } catch (err) {
            if (err.retryAfter) {
              syncWithServer(err.retryAfter);
            }
            Alert.alert('Lỗi', err.message || 'Không thể yêu cầu đổi mật khẩu.');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (otp.length < 6) {
            Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ mã OTP.');
            return;
        }

        setLoading(true);
        try {
            const res = await apiRequest('/auth/change-password/confirm', {
                method: 'POST',
                body: JSON.stringify({ otp })
            });
            
            Alert.alert(
                'Thành công', 
                'Mật khẩu đã được thay đổi. Tất cả thiết bị đã được đăng xuất để bảo mật. Vui lòng đăng nhập lại.',
                [{ text: 'OK', onPress: () => logout() }]
            );
        } catch (err) {
            if (err.retryAfter) {
                syncWithServer(err.retryAfter);
            }
            Alert.alert('Lỗi', err.message || 'Xác thực OTP thất bại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <LinearGradient colors={['#0058bc', '#00418f']} style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity style={styles.backButton} onPress={goBack}>
                        <Text style={styles.headerIcon}>arrow_back</Text>
                    </TouchableOpacity>
                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle}>Đổi mật khẩu</Text>
                        <Text style={styles.headerSubtitle}>Xác thực 2 lớp qua Email</Text>
                    </View>
                </View>
            </LinearGradient>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {step === 1 ? (
                        <View style={styles.formCard}>
                            <Text style={styles.instructions}>
                                Nhập mật khẩu hiện tại và mật khẩu mới để tiếp tục. Mã xác thực sẽ được gửi về email: <Text style={{fontWeight:'700'}}>{user?.email}</Text>
                            </Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Mật khẩu hiện tại</Text>
                                <View style={styles.inputWrapper}>
                                    <Text style={styles.fieldIcon}>lock</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Nhập mật khẩu cũ"
                                        secureTextEntry={!showCurrentPassword}
                                        value={currentPassword}
                                        onChangeText={setCurrentPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                                        <Text style={styles.eyeIcon}>{showCurrentPassword ? 'visibility_off' : 'visibility'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Mật khẩu mới</Text>
                                <View style={styles.inputWrapper}>
                                    <Text style={styles.fieldIcon}>password</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Nhập mật khẩu mới"
                                        secureTextEntry={!showNewPassword}
                                        value={newPassword}
                                        onChangeText={setNewPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowNewPassword(!showNewPassword)}>
                                        <Text style={styles.eyeIcon}>{showNewPassword ? 'visibility_off' : 'visibility'}</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.hint}>Tối thiểu 8 ký tự, gồm chữ hoa, thường, số và ký tự đặc biệt.</Text>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Xác nhận mật khẩu mới</Text>
                                <View style={styles.inputWrapper}>
                                    <Text style={styles.fieldIcon}>check_circle</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Nhập lại mật khẩu mới"
                                        secureTextEntry={!showNewPassword}
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                    />
                                </View>
                            </View>

                            <TouchableOpacity 
                                style={[styles.submitButton, loading && styles.disabledButton]} 
                                onPress={handleRequest}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.submitText}>Tiếp tục</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.formCard}>
                            <View style={styles.otpHeader}>
                                <View style={styles.otpIconBadge}>
                                    <Text style={styles.otpIcon}>mark_email_unread</Text>
                                </View>
                                <Text style={styles.otpTitle}>Nhập mã xác thực</Text>
                                <Text style={styles.otpSubtitle}>Mã OTP 6 số đã được gửi tới Gmail của bạn.</Text>
                            </View>

                            <View style={styles.otpInputWrapper}>
                                <TextInput
                                    style={styles.otpInput}
                                    placeholder="000000"
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    value={otp}
                                    onChangeText={setOtp}
                                    autoFocus
                                />
                            </View>

                            <TouchableOpacity 
                                style={[styles.submitButton, (loading || (step === 1 && countdown > 0)) && styles.disabledButton]} 
                                onPress={step === 1 ? handleRequest : handleConfirm}
                                disabled={loading || (step === 1 && countdown > 0)}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.submitText}>
                                        {step === 1 ? (countdown > 0 ? `Tiếp tục (${countdown}s)` : 'Tiếp tục') : 'Xác nhận & Đổi mật khẩu'}
                                    </Text>
                                )}
                            </TouchableOpacity>

                            {step === 2 && (
                                <TouchableOpacity 
                                    style={styles.resendBtn} 
                                    onPress={handleRequest}
                                    disabled={countdown > 0 || loading}
                                >
                                    <Text style={[styles.resendText, (countdown > 0 || loading) && { color: Colors.outline, textDecorationLine: 'none' }]}>
                                        {countdown > 0 ? `Gửi lại mã (${countdown}s)` : 'Gửi lại mã OTP'}
                                    </Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity style={styles.resendBtn} onPress={() => setStep(1)}>
                                <Text style={styles.resendText}>Quay lại nhập mật khẩu</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        paddingTop: Platform.OS === 'android' ? 40 : 10,
        paddingBottom: 20,
        paddingHorizontal: 16,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerIcon: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 24,
        color: '#fff',
    },
    headerTitleWrap: {
        flex: 1,
    },
    headerTitle: {
        ...Typography.heading,
        color: '#fff',
        fontSize: 20,
    },
    headerSubtitle: {
        ...Typography.body,
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2,
    },
    scrollContent: {
        padding: 20,
    },
    formCard: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 24,
        ...Shadows.soft,
    },
    instructions: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.onSurfaceVariant,
        lineHeight: 20,
        marginBottom: 24,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        ...Typography.body,
        fontWeight: '700',
        fontSize: 14,
        color: Colors.onSurface,
        marginBottom: 8,
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f7fa',
        borderRadius: 16,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#edf0f5',
    },
    fieldIcon: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 20,
        color: Colors.primary,
        marginRight: 10,
    },
    input: {
        flex: 1,
        height: 52,
        ...Typography.body,
        fontSize: 15,
        color: Colors.onSurface,
    },
    eyeIcon: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 20,
        color: Colors.onSurfaceVariant,
        padding: 8,
    },
    hint: {
        fontSize: 11,
        color: Colors.onSurfaceVariant,
        marginTop: 6,
        marginLeft: 4,
        fontStyle: 'italic',
    },
    submitButton: {
        backgroundColor: Colors.primary,
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
    },
    submitText: {
        ...Typography.heading,
        color: '#fff',
        fontSize: 16,
    },
    disabledButton: {
        opacity: 0.6,
    },
    otpHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    otpIconBadge: {
        width: 64,
        height: 64,
        borderRadius: 22,
        backgroundColor: '#eef4ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    otpIcon: {
        fontFamily: 'Material Symbols Outlined',
        fontSize: 32,
        color: Colors.primary,
    },
    otpTitle: {
        ...Typography.heading,
        fontSize: 18,
        color: Colors.onSurface,
    },
    otpSubtitle: {
        ...Typography.body,
        fontSize: 14,
        color: Colors.onSurfaceVariant,
        textAlign: 'center',
        marginTop: 8,
    },
    otpInputWrapper: {
        alignItems: 'center',
        marginBottom: 32,
    },
    otpInput: {
        fontSize: 36,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 10,
        textAlign: 'center',
        width: '100%',
        backgroundColor: '#f5f7fa',
        paddingVertical: 12,
        borderRadius: 16,
    },
    resendBtn: {
        alignItems: 'center',
        marginTop: 20,
    },
    resendText: {
        ...Typography.body,
        color: Colors.primary,
        fontWeight: '700',
        fontSize: 14,
    }
});
