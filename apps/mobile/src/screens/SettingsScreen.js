import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    useWindowDimensions,
    View
} from 'react-native';
import { Colors, Shadows, Typography } from '../constants/Theme';
import { useAuth } from '../context/AuthContext';
import Alert from '../utils/Alert';

const SETTINGS_KEY = 'mobile_settings';

const DEFAULT_SETTINGS = {
  notifications: true,
  messageSound: true,
  callVibrate: true,
  lockApp: false,
  showOnlineStatus: true,
  allowSearchByPhone: true,
  syncContacts: true,
  saveMediaToDevice: false,
  themeMode: 'system',
  language: 'vi',
};

const SECTION_SPACING = 14;

function SettingRow({ icon, title, subtitle, rightElement, onPress, divider = false, compact = false }) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.8 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.row,
        compact && styles.rowCompact,
        divider && styles.rowDivider,
      ]}
    >
      <View style={[styles.rowIconBox, compact && styles.rowIconBoxCompact]}>
        <Text style={[styles.rowIcon, compact && styles.rowIconCompact]}>{icon}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, compact && styles.rowTitleCompact]}>{title}</Text>
        {!!subtitle && <Text style={[styles.rowSubtitle, compact && styles.rowSubtitleCompact]}>{subtitle}</Text>}
      </View>
      <View style={styles.rowRight}>{rightElement}</View>
    </TouchableOpacity>
  );
}

function Section({ title, subtitle, children, compact = false, cardRadius = 22 }) {
  return (
    <View style={[styles.sectionCard, { borderRadius: cardRadius }]}> 
      <View style={[styles.sectionHeader, compact && styles.sectionHeaderCompact]}>
        <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{title}</Text>
        {!!subtitle && <Text style={[styles.sectionSubtitle, compact && styles.sectionSubtitleCompact]}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, compact = false }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}>
      <Text style={[styles.chipText, compact && styles.chipTextCompact, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PillToggle({ value, onValueChange, compact = false }) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onValueChange}
      style={[
        styles.pillToggle,
        compact && styles.pillToggleCompact,
        value ? styles.pillToggleOn : styles.pillToggleOff,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View
        style={[
          styles.pillToggleKnob,
          compact && styles.pillToggleKnobCompact,
          value ? (compact ? styles.pillToggleKnobOnCompact : styles.pillToggleKnobOn) : styles.pillToggleKnobOff,
        ]}
      />
    </TouchableOpacity>
  );
}

export default function SettingsScreen({ onNavigate, returnTo = 'home', onLogout }) {
  const { width } = useWindowDimensions();
  const storage = useMemo(() => AsyncStorage.default || AsyncStorage, []);
  const { requestLockAccount, confirmLockAccount, requestDeleteAccount, confirmDeleteAccount } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [lockModalVisible, setLockModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const isCompact = width < 380;
  const horizontalPadding = width < 360 ? 12 : 16;
  const cardRadius = isCompact ? 18 : 22;

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const saved = await storage.getItem(SETTINGS_KEY);
        if (saved) {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        }
      } catch (error) {
        console.error('Load settings error', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [storage]);

  const persistSettings = async (nextSettings) => {
    setSettings(nextSettings);
    await storage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
  };

  const updateSetting = async (key, value) => {
    const next = { ...settings, [key]: value };
    await persistSettings(next);
  };

  const handleClearLocalData = () => {
    Alert.alert('Xóa dữ liệu cục bộ', 'Xóa dữ liệu thiết bị đã lưu trong app?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          await storage.removeItem(SETTINGS_KEY);
          setSettings(DEFAULT_SETTINGS);
          Alert.alert('Thành công', 'Đã khôi phục cài đặt mặc định.');
        },
      },
    ]);
  };

  const handleSupport = () => {
    Alert.alert('Contact support', 'Tính năng hỗ trợ sẽ được kết nối với trung tâm trợ giúp trong bản tiếp theo.');
  };

  const handleAbout = () => {
    Alert.alert('About Zalo', 'Zalo Education Mobile\nPhiên bản giáo dục nội bộ cho hồ sơ, thiết bị và cài đặt.');
  };

  const handleRestore = () => {
    Alert.alert('Backup and restore', 'Tính năng sao lưu và khôi phục dữ liệu sẽ được mở rộng ở bản cập nhật tiếp theo.');
  };

  const handleThemeChange = async (value) => {
    await updateSetting('themeMode', value);
  };

  const handleLanguageChange = async (value) => {
    await updateSetting('language', value);
  };

  const toggleSwitch = async (key) => {
    await updateSetting(key, !settings[key]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0058bc', '#00418f']} style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerButton} onPress={() => onNavigate(returnTo)}>
            <Text style={styles.headerIcon}>arrow_back</Text>
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Settings</Text>
            <Text style={styles.headerSubtitle}>Quản lý quyền riêng tư, thông báo và giao diện</Text>
          </View>
          <TouchableOpacity style={styles.headerButton} onPress={handleSupport}>
            <Text style={styles.headerIcon}>search</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
      >
        <View style={[styles.profileSummary, { borderRadius: cardRadius, padding: isCompact ? 12 : 16 }]}>
          <View
            style={[
              styles.summaryBadge,
              {
                width: isCompact ? 48 : 56,
                height: isCompact ? 48 : 56,
                borderRadius: isCompact ? 14 : 18,
                marginRight: isCompact ? 10 : 12,
              },
            ]}
          >
            <Text style={styles.summaryIcon}>settings</Text>
          </View>
          <View style={styles.summaryTextWrap}>
            <Text style={[styles.summaryTitle, { fontSize: isCompact ? 15 : 17 }]}>Tùy chỉnh trải nghiệm mobile</Text>
            <Text style={[styles.summaryText, { fontSize: isCompact ? 12 : 13, lineHeight: isCompact ? 17 : 19 }]}>
              Các thay đổi ở đây được lưu trên thiết bị và đồng bộ theo tài khoản khi có hỗ trợ backend.
            </Text>
          </View>
        </View>

        <Section title="Account and security" subtitle="Thiết bị, mật khẩu và bảo mật" compact={isCompact} cardRadius={cardRadius}>
          <SettingRow
            icon="security"
            title="Quản lý thiết bị đăng nhập"
            subtitle="Xem và đăng xuất phiên đang hoạt động"
            rightElement={<Text style={styles.chevron}>chevron_right</Text>}
            onPress={() => onNavigate('sessions')}
            compact={isCompact}
          />
          <SettingRow
            icon="lock"
            title="Đổi mật khẩu"
            subtitle="Cập nhật mật khẩu để tăng an toàn"
            rightElement={<Text style={styles.chevron}>chevron_right</Text>}
            onPress={() => onNavigate('change-password')} 
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="verified_user"
            title="Khóa ứng dụng"
            subtitle="Bật xác thực khi mở app"
            rightElement={
              <PillToggle
                value={settings.lockApp}
                onValueChange={() => toggleSwitch('lockApp')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
          <SettingRow
            icon="lock_person"
            title="Khóa tài khoản"
            subtitle="Tạm dừng truy cập, có thể mở khóa sau"
            rightElement={<Text style={styles.chevronDanger}>chevron_right</Text>}
            onPress={() => setLockModalVisible(true)}
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="delete_forever"
            title="Xóa tài khoản"
            subtitle="Xóa vĩnh viễn toàn bộ dữ liệu"
            rightElement={<Text style={styles.chevronDanger}>chevron_right</Text>}
            onPress={() => setDeleteModalVisible(true)}
            compact={isCompact}
          />
        </Section>

        <Section title="Privacy" subtitle="Ai nhìn thấy dữ liệu cá nhân của bạn" compact={isCompact} cardRadius={cardRadius}>
          <SettingRow
            icon="visibility"
            title="Trạng thái hoạt động"
            subtitle="Hiển thị khi bạn đang online"
            rightElement={
              <PillToggle
                value={settings.showOnlineStatus}
                onValueChange={() => toggleSwitch('showOnlineStatus')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
          <SettingRow
            icon="contact_phone"
            title="Tìm bằng số điện thoại"
            subtitle="Cho phép người khác tìm bạn qua số điện thoại"
            rightElement={
              <PillToggle
                value={settings.allowSearchByPhone}
                onValueChange={() => toggleSwitch('allowSearchByPhone')}
                compact={isCompact}
              />
            }
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="badge"
            title="Đồng bộ danh bạ"
            subtitle="Kết nối danh bạ để gợi ý liên hệ"
            rightElement={
              <PillToggle
                value={settings.syncContacts}
                onValueChange={() => toggleSwitch('syncContacts')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
        </Section>

        <Section title="Notifications" subtitle="Âm thanh, rung và nhắc nhở" compact={isCompact} cardRadius={cardRadius}>
          <SettingRow
            icon="notifications"
            title="Thông báo"
            subtitle="Nhận thông báo từ ứng dụng"
            rightElement={
              <PillToggle
                value={settings.notifications}
                onValueChange={() => toggleSwitch('notifications')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
          <SettingRow
            icon="message"
            title="Âm thanh tin nhắn"
            subtitle="Phát âm thanh khi có tin mới"
            rightElement={
              <PillToggle
                value={settings.messageSound}
                onValueChange={() => toggleSwitch('messageSound')}
                compact={isCompact}
              />
            }
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="phone_in_talk"
            title="Rung cuộc gọi"
            subtitle="Rung khi có cuộc gọi đến"
            rightElement={
              <PillToggle
                value={settings.callVibrate}
                onValueChange={() => toggleSwitch('callVibrate')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
        </Section>

        <Section title="Messages" subtitle="Tin nhắn, media và lưu trữ" compact={isCompact} cardRadius={cardRadius}>
          <SettingRow
            icon="forum"
            title="Lưu media về máy"
            subtitle="Tự động lưu ảnh và video nhận được"
            rightElement={
              <PillToggle
                value={settings.saveMediaToDevice}
                onValueChange={() => toggleSwitch('saveMediaToDevice')}
                compact={isCompact}
              />
            }
            compact={isCompact}
          />
          <SettingRow
            icon="backup"
            title="Backup and restore"
            subtitle="Sao lưu và khôi phục dữ liệu"
            rightElement={<Text style={styles.chevron}>chevron_right</Text>}
            onPress={handleRestore}
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="delete_forever"
            title="Xóa dữ liệu cục bộ"
            subtitle="Xóa cài đặt lưu trên thiết bị"
            rightElement={<Text style={styles.chevronDanger}>chevron_right</Text>}
            onPress={handleClearLocalData}
            compact={isCompact}
          />
        </Section>

        <Section title="Theme and language" subtitle="Giao diện hiển thị" compact={isCompact} cardRadius={cardRadius}>
          <Text style={[styles.optionLabel, { fontSize: isCompact ? 13 : 14 }]}>Theme</Text>
          <View style={styles.choiceRow}>
            <Chip label="System" active={settings.themeMode === 'system'} onPress={() => handleThemeChange('system')} compact={isCompact} />
            <Chip label="Light" active={settings.themeMode === 'light'} onPress={() => handleThemeChange('light')} compact={isCompact} />
            <Chip label="Dark" active={settings.themeMode === 'dark'} onPress={() => handleThemeChange('dark')} compact={isCompact} />
          </View>

          <Text style={[styles.optionLabel, { marginTop: SECTION_SPACING, fontSize: isCompact ? 13 : 14 }]}>Language</Text>
          <View style={styles.choiceRow}>
            <Chip label="Tiếng Việt" active={settings.language === 'vi'} onPress={() => handleLanguageChange('vi')} compact={isCompact} />
            <Chip label="English" active={settings.language === 'en'} onPress={() => handleLanguageChange('en')} compact={isCompact} />
          </View>
        </Section>

        <Section title="About Zalo" subtitle="Thông tin ứng dụng và hỗ trợ" compact={isCompact} cardRadius={cardRadius}>
          <SettingRow
            icon="info"
            title="About Zalo"
            subtitle="Phiên bản, điều khoản và cập nhật"
            rightElement={<Text style={styles.chevron}>chevron_right</Text>}
            onPress={handleAbout}
            compact={isCompact}
          />
          <SettingRow
            icon="support_agent"
            title="Contact support"
            subtitle="Liên hệ khi cần trợ giúp"
            rightElement={<Text style={styles.chevron}>chevron_right</Text>}
            onPress={handleSupport}
            divider
            compact={isCompact}
          />
          <SettingRow
            icon="logout"
            title="Đăng xuất"
            subtitle="Thoát khỏi tài khoản hiện tại"
            rightElement={<Text style={styles.chevronDanger}>chevron_right</Text>}
            onPress={onLogout}
            compact={isCompact}
          />
        </Section>

        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>
            Settings được lưu cục bộ trên thiết bị để phù hợp với luồng mobile hiện tại.
          </Text>
        </View>
      </ScrollView>

      {/* Lock Account Modal */}
      <AccountActionModal
        visible={lockModalVisible}
        onClose={() => setLockModalVisible(false)}
        mode="lock"
        onRequestOtp={requestLockAccount}
        onConfirmOtp={(otp) => {
          return confirmLockAccount(otp).then(() => {
            setLockModalVisible(false);
            if (onLogout) onLogout();
          });
        }}
      />

      {/* Delete Account Modal */}
      <AccountActionModal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        mode="delete"
        onRequestOtp={requestDeleteAccount}
        onConfirmOtp={(otp) => {
          return confirmDeleteAccount(otp).then(() => {
            setDeleteModalVisible(false);
            if (onLogout) onLogout();
          });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.heading,
    fontSize: 22,
    color: '#fff',
  },
  headerSubtitle: {
    ...Typography.body,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 3,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 28,
  },
  scrollView: {
    flex: 1,
  },
  profileSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 16,
    ...Shadows.soft,
  },
  summaryBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e7f1ff',
    marginRight: 12,
  },
  summaryIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 26,
    color: Colors.primary,
  },
  summaryTextWrap: {
    flex: 1,
  },
  summaryTitle: {
    ...Typography.heading,
    color: Colors.onSurface,
    fontSize: 17,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 6,
    marginBottom: 14,
    ...Shadows.soft,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionHeaderCompact: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionTitle: {
    ...Typography.heading,
    fontSize: 17,
    color: Colors.onSurface,
  },
  sectionTitleCompact: {
    fontSize: 15,
  },
  sectionSubtitle: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  sectionSubtitleCompact: {
    fontSize: 12,
  },
  row: {
    minHeight: 68,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowCompact: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f4',
  },
  rowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#edf5ff',
    marginRight: 12,
  },
  rowIconBoxCompact: {
    width: 34,
    height: 34,
    borderRadius: 12,
    marginRight: 10,
  },
  rowIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: Colors.primary,
  },
  rowIconCompact: {
    fontSize: 20,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    ...Typography.body,
    color: Colors.onSurface,
    fontSize: 15,
  },
  rowTitleCompact: {
    fontSize: 14,
  },
  rowSubtitle: {
    ...Typography.body,
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    marginTop: 3,
    lineHeight: 17,
  },
  rowSubtitleCompact: {
    fontSize: 11,
    lineHeight: 15,
  },
  rowRight: {
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: Colors.onSurfaceVariant,
  },
  chevronDanger: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: Colors.error,
  },
  optionLabel: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.onSurface,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f2f5fa',
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#dcecff',
  },
  chipText: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.onSurfaceVariant,
  },
  chipTextCompact: {
    fontSize: 12,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  pillToggle: {
    width: 74,
    height: 42,
    borderRadius: 999,
    position: 'relative',
    overflow: 'hidden',
  },
  pillToggleCompact: {
    width: 62,
    height: 36,
  },
  pillToggleOn: {
    backgroundColor: '#16ef67',
    borderWidth: 1,
    borderColor: '#18d95f',
  },
  pillToggleOff: {
    backgroundColor: '#d9d9dc',
    borderWidth: 1,
    borderColor: '#d0d0d4',
  },
  pillToggleKnob: {
    position: 'absolute',
    top: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  pillToggleKnobCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  pillToggleKnobOn: {
    left: 36,
  },
  pillToggleKnobOnCompact: {
    left: 30,
  },
  pillToggleKnobOff: {
    left: 2,
  },
  footerNote: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  footerNoteText: {
    ...Typography.body,
    color: Colors.onSurfaceVariant,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

// ─── AccountActionModal ────────────────────────────────────────────────────────
function AccountActionModal({ visible, onClose, mode, onRequestOtp, onConfirmOtp }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');

  const isLock = mode === 'lock';
  const accentColor = isLock ? '#ea580c' : '#dc2626';
  const title = isLock ? 'Khóa tài khoản' : 'Xóa tài khoản';
  const icon = isLock ? 'lock_person' : 'delete_forever';
  const confirmLabel = isLock ? 'Xác nhận khóa tài khoản' : 'Xác nhận xóa tài khoản';
  const warningMsg = isLock
    ? 'Tài khoản sẽ bị tạm khóa. Tất cả phiên đăng nhập sẽ bị vô hiệu hóa ngay lập tức.'
    : 'Hành động này KHÔNG THỂ hoàn tác. Toàn bộ dữ liệu tài khoản sẽ bị xóa vĩnh viễn.';

  const handleClose = () => {
    setStep(1);
    setCurrentPassword('');
    setOtp('');
    setError(null);
    onClose();
  };

  const handleRequestOtp = async () => {
    if (!currentPassword) return;
    setLoading(true);
    setError(null);
    try {
      await onRequestOtp(currentPassword);
      setStep(2);
    } catch (err) {
      setError(err?.message || 'Có lỗi xảy ra, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirmOtp(otp);
    } catch (err) {
      setError(err?.message || 'Mã OTP không chính xác.');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={modalStyles.overlay}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={modalStyles.backdrop} />
        </TouchableWithoutFeedback>
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={modalStyles.keyboardView}
        >
          <View style={modalStyles.sheet}>
            {/* Header */}
            <View style={[modalStyles.iconBox, { backgroundColor: isLock ? '#fff7ed' : '#fef2f2', borderColor: isLock ? '#fed7aa' : '#fecaca' }]}>
              <Text style={[modalStyles.icon, { color: accentColor }]}>{icon}</Text>
            </View>
            <Text style={modalStyles.title}>{title}</Text>
            <Text style={modalStyles.subtitle}>{step === 1 ? warningMsg : 'Nhập mã OTP đã được gửi về email của bạn.'}</Text>

            {!!error && (
              <View style={modalStyles.errorBox}>
                <Text style={modalStyles.errorText}>{error}</Text>
              </View>
            )}

            {step === 1 ? (
              <View style={modalStyles.form}>
                <Text style={modalStyles.label}>Mật khẩu hiện tại</Text>
                <TextInput
                  style={modalStyles.input}
                  secureTextEntry
                  placeholder="Xác nhận danh tính"
                  placeholderTextColor="#9ca3af"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  autoFocus
                />
                <TouchableOpacity
                  style={[modalStyles.btn, { backgroundColor: accentColor, opacity: loading || !currentPassword ? 0.5 : 1 }]}
                  onPress={handleRequestOtp}
                  disabled={loading || !currentPassword}
                  activeOpacity={0.85}
                >
                  <Text style={modalStyles.btnText}>{loading ? 'Đang gửi...' : 'Tiếp tục'}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={modalStyles.form}>
                <TextInput
                  style={modalStyles.otpInput}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="000000"
                  placeholderTextColor="#d1d5db"
                  value={otp}
                  onChangeText={setOtp}
                  autoFocus
                />
                <TouchableOpacity
                  style={[modalStyles.btn, { backgroundColor: accentColor, opacity: loading || otp.length < 6 ? 0.5 : 1 }]}
                  onPress={handleConfirmOtp}
                  disabled={loading || otp.length < 6}
                  activeOpacity={0.85}
                >
                  <Text style={modalStyles.btnText}>{loading ? 'Đang xử lý...' : confirmLabel}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.backBtn} onPress={() => setStep(1)}>
                  <Text style={modalStyles.backBtnText}>Quay lại</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose}>
              <Text style={modalStyles.cancelText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: '88%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    ...Shadows.strong,
    elevation: 10,
  },
  form: {
    width: '100%',
    alignItems: 'center',
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Shadows.soft,
  },
  icon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 34,
  },
  title: {
    ...Typography.heading,
    fontSize: 22,
    color: Colors.onSurface,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  errorText: {
    ...Typography.body,
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
    fontWeight: '600',
  },
  label: {
    ...Typography.heading,
    fontSize: 13,
    color: Colors.onSurfaceVariant,
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    width: '100%',
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 18,
    paddingHorizontal: 18,
    fontSize: 16,
    color: Colors.onSurface,
    marginBottom: 20,
    backgroundColor: '#fff',
  },
  otpInput: {
    width: '100%',
    height: 80,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 24,
    textAlign: 'center',
    fontSize: 36,
    letterSpacing: 12,
    color: Colors.primary,
    marginBottom: 24,
    backgroundColor: '#f8fbff',
    fontWeight: 'bold',
  },
  btn: {
    width: '100%',
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...Shadows.soft,
  },
  btnText: {
    ...Typography.heading,
    color: '#fff',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  backBtn: {
    paddingVertical: 10,
    marginTop: 4,
  },
  backBtnText: {
    ...Typography.body,
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 12,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  cancelText: {
    ...Typography.body,
    color: Colors.onSurfaceVariant,
    fontSize: 15,
  },
});
