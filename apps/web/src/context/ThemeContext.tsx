import React, { createContext, useContext, useEffect, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';
type Language = 'vi' | 'en';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, defaultValue?: string) => string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = 'app_theme_mode';
const LANGUAGE_KEY = 'app_language';

// Translations
const translations: Record<Language, Record<string, string>> = {
  vi: {
    // Navigation
    'nav.back': 'Quay lại',
    'nav.settings': 'Cài đặt',
    'nav.experience': 'Zalo Education Experience',

    // Headers
    'header.title': 'Tuỳ chỉnh ứng dụng',
    'header.description': 'Mọi thay đổi sẽ được lưu cục bộ trên trình duyệt này và đồng bộ hoá khi bạn đăng nhập trên các thiết bị Zalo Education khác.',

    // Sections
    'section.account': 'Tài khoản & Bảo mật',
    'section.account_subtitle': 'Quản lý các thiết bị và phương thức bảo vệ tài khoản',
    'section.privacy': 'Quyền riêng tư',
    'section.privacy_subtitle': 'Kiểm soát những gì người khác thấy về bạn',
    'section.notifications': 'Thông báo',
    'section.notifications_subtitle': 'Cài đặt âm thanh và cách nhận tin nhắn',
    'section.media': 'Dữ liệu & Media',
    'section.media_subtitle': 'Quản lý cách ứng dụng xử lý file và bộ nhớ',
    'section.theme': 'Giao diện & Ngôn ngữ',
    'section.theme_subtitle': 'Tùy chỉnh phong cách hiển thị ứng dụng',
    'section.account_management': 'Quản lý tài khoản',
    'section.account_management_subtitle': 'Các thao tác không thể hoàn tác. Vui lòng cân nhắc kỹ trước khi thực hiện.',

    // Account & Security Section
    'account.devices': 'Thiết bị đăng nhập',
    'account.devices_desc': 'Hiện tại bạn đang đăng nhập trên {count} thiết bị.',
    'account.manage_sessions': 'Quản lý phiên ngay',
    'account.change_password': 'Đổi mật khẩu',
    'account.change_password_desc': 'Cập nhật mật khẩu thường xuyên để đảm bảo an toàn tối đa.',

    // Privacy Section
    'privacy.online_status': 'Trạng thái hoạt động',
    'privacy.online_status_desc': 'Cho phép bạn bè thấy khi nào bạn đang online.',
    'privacy.phone_search': 'Tìm kiếm qua số điện thoại',
    'privacy.phone_search_desc': 'Cho phép người lạ tìm thấy bạn thông qua số điện thoại.',
    'privacy.sync_contacts': 'Đồng bộ danh bạ',
    'privacy.sync_contacts_desc': 'Tự động đồng bộ các liên hệ mới từ danh bạ của bạn.',

    // Notifications Section
    'notif.push': 'Thông báo đẩy',
    'notif.push_desc': 'Nhận thông báo ngay lập tức trên màn hình desktop.',
    'notif.sound': 'Âm thanh thông báo',
    'notif.sound_desc': 'Phát âm báo khi có tin nhắn mới hoặc cuộc gọi.',

    // Media Section
    'media.auto_download': 'Tự động tải media',
    'media.auto_download_desc': 'Tự động lưu ảnh và video về bộ nhớ tạm của trình duyệt.',

    // Theme & Language Section
    'theme.label': 'Chủ đề giao diện',
    'theme.system': 'Hệ thống',
    'theme.light': 'Sáng',
    'theme.dark': 'Tối',
    'language.label': 'Ngôn ngữ ứng dụng',
    'language.vi': 'Tiếng Việt',
    'language.en': 'English',

    // Account Management Section
    'account_mgmt.lock': 'Khóa tài khoản',
    'account_mgmt.lock_desc': 'Tạm dừng truy cập. Tài khoản có thể được mở khóa sau.',
    'account_mgmt.delete': 'Xóa tài khoản',
    'account_mgmt.delete_desc': 'Xóa vĩnh viễn tài khoản và toàn bộ dữ liệu liên quan.',

    // Footer
    'footer.version': 'Zalo Education v1.0.0 Alpha',
    'footer.note': 'Hệ thống giáo dục nội bộ. Các thiết lập giao diện chỉ có hiệu lực trên trình duyệt này.',

    // Modals
    'modal.change_password': 'Đổi mật khẩu',
    'modal.verify_otp': 'Xác thực OTP',
    'modal.current_password': 'Mật khẩu hiện tại',
    'modal.new_password': 'Mật khẩu mới',
    'modal.confirm_password': 'Xác nhận mật khẩu mới',
    'modal.send_otp': 'Gửi mã xác thực',
    'modal.confirm': 'Xác nhận',
    'modal.back': 'Quay lại bước trước',
    'modal.lock_account': 'Khóa tài khoản',
    'modal.delete_account': 'Xóa tài khoản',
    'modal.verify_password': 'Vui lòng xác thực mật khẩu hiện tại để tiếp tục.',
    'modal.otp_sent': 'Mã xác thực đã được gửi tới email: {email}',
    'modal.password_mismatch': 'Mật khẩu xác nhận không khớp.',
    'modal.error': 'Có lỗi xảy ra, vui lòng thử lại.',
    'modal.invalid_otp': 'Mã OTP không chính xác.',
  },
  en: {
    // Navigation
    'nav.back': 'Back',
    'nav.settings': 'Settings',
    'nav.experience': 'Zalo Education Experience',

    // Headers
    'header.title': 'Customize Application',
    'header.description': 'All changes will be saved locally on this browser and synced when you log in on other Zalo Education devices.',

    // Sections
    'section.account': 'Account & Security',
    'section.account_subtitle': 'Manage your devices and protection methods',
    'section.privacy': 'Privacy',
    'section.privacy_subtitle': 'Control what others see about you',
    'section.notifications': 'Notifications',
    'section.notifications_subtitle': 'Sound settings and message delivery',
    'section.media': 'Data & Media',
    'section.media_subtitle': 'Manage how the app handles files and storage',
    'section.theme': 'Appearance & Language',
    'section.theme_subtitle': 'Customize the appearance of the application',
    'section.account_management': 'Account Management',
    'section.account_management_subtitle': 'These actions cannot be undone. Please consider carefully before proceeding.',

    // Account & Security Section
    'account.devices': 'Login Devices',
    'account.devices_desc': 'You are currently logged in on {count} device(s).',
    'account.manage_sessions': 'Manage Sessions',
    'account.change_password': 'Change Password',
    'account.change_password_desc': 'Update your password regularly for maximum security.',

    // Privacy Section
    'privacy.online_status': 'Online Status',
    'privacy.online_status_desc': 'Allow friends to see when you are online.',
    'privacy.phone_search': 'Phone Number Search',
    'privacy.phone_search_desc': 'Allow strangers to find you through phone number.',
    'privacy.sync_contacts': 'Sync Contacts',
    'privacy.sync_contacts_desc': 'Automatically sync new contacts from your address book.',

    // Notifications Section
    'notif.push': 'Push Notifications',
    'notif.push_desc': 'Receive notifications immediately on your desktop screen.',
    'notif.sound': 'Notification Sound',
    'notif.sound_desc': 'Play a sound when you receive new messages or calls.',

    // Media Section
    'media.auto_download': 'Auto-Download Media',
    'media.auto_download_desc': 'Automatically save photos and videos to your browser cache.',

    // Theme & Language Section
    'theme.label': 'Theme',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'language.label': 'Application Language',
    'language.vi': 'Tiếng Việt',
    'language.en': 'English',

    // Account Management Section
    'account_mgmt.lock': 'Lock Account',
    'account_mgmt.lock_desc': 'Temporarily pause access. Account can be unlocked later.',
    'account_mgmt.delete': 'Delete Account',
    'account_mgmt.delete_desc': 'Permanently delete your account and all associated data.',

    // Footer
    'footer.version': 'Zalo Education v1.0.0 Alpha',
    'footer.note': 'Internal education system. Display settings only apply on this browser.',

    // Modals
    'modal.change_password': 'Change Password',
    'modal.verify_otp': 'Verify OTP',
    'modal.current_password': 'Current Password',
    'modal.new_password': 'New Password',
    'modal.confirm_password': 'Confirm New Password',
    'modal.send_otp': 'Send Verification Code',
    'modal.confirm': 'Confirm',
    'modal.back': 'Go Back',
    'modal.lock_account': 'Lock Account',
    'modal.delete_account': 'Delete Account',
    'modal.verify_password': 'Please verify your current password to continue.',
    'modal.otp_sent': 'Verification code has been sent to email: {email}',
    'modal.password_mismatch': 'Password confirmation does not match.',
    'modal.error': 'An error occurred, please try again.',
    'modal.invalid_otp': 'Verification code is incorrect.',
  },
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as ThemeMode) || 'light';
    } catch {
      return 'light';
    }
  });

  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return (localStorage.getItem(LANGUAGE_KEY) as Language) || 'vi';
    } catch {
      return 'vi';
    }
  });

  const [isDark, setIsDark] = useState(false);

  // Determine if dark mode should be applied
  useEffect(() => {
    const updateTheme = () => {
      let shouldBeDark = false;

      if (themeMode === 'dark') {
        shouldBeDark = true;
      } else if (themeMode === 'light') {
        shouldBeDark = false;
      } else {
        // system mode: check system preference
        shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      setIsDark(shouldBeDark);

      // Apply theme to document
      if (shouldBeDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.colorScheme = 'light';
      }
    };

    updateTheme();

    // Listen for system theme changes in system mode
    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [themeMode]);

  // Apply language to document
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {
      console.error('Failed to save theme preference');
    }
  };

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_KEY, lang);
    } catch {
      console.error('Failed to save language preference');
    }
  };

  const t = (key: string, params?: Record<string, any>): string => {
    let text = translations[language][key] || key;
    
    // Replace parameters like {count}, {email}, etc.
    if (params) {
      Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, String(params[param]));
      });
    }
    
    return text;
  };

  return (
    <ThemeContext.Provider value={{ themeMode, setThemeMode, isDark, language, setLanguage, t }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
