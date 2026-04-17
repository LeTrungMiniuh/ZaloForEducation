import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const SETTINGS_KEY = 'mobile_settings';

type WebSettings = {
  notifications: boolean;
  messageSound: boolean;
  showOnlineStatus: boolean;
  allowSearchByPhone: boolean;
  syncContacts: boolean;
  autoDownloadMedia: boolean;
  themeMode: 'system' | 'light' | 'dark';
  language: 'vi' | 'en';
};

const DEFAULT_SETTINGS: WebSettings = {
  notifications: true,
  messageSound: true,
  showOnlineStatus: true,
  allowSearchByPhone: true,
  syncContacts: true,
  autoDownloadMedia: true,
  themeMode: 'system',
  language: 'vi',
};

const SettingsToggle: React.FC<{
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  icon: string;
  mode?: 'switch' | 'action';
  actionLabel?: string;
}> = ({ label, description, enabled, onToggle, icon, mode = 'switch', actionLabel = 'Thực hiện' }) => {
  return (
    <div className="group rounded-2xl sm:rounded-3xl border border-outline-variant/15 bg-white dark:bg-surface-container p-4 sm:p-5 flex items-center justify-between gap-3 sm:gap-6 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:border-primary/20 dark:hover:border-primary/40">
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary/5 dark:bg-primary/15 flex items-center justify-center transition-colors group-hover:bg-primary/10 dark:group-hover:bg-primary/20 shrink-0">
          <span className="material-symbols-outlined text-primary text-[24px]">{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[14px] sm:text-[15px] font-extrabold text-on-surface leading-tight">{label}</p>
          <p className="text-[12px] sm:text-[13px] text-on-surface-variant mt-1 sm:mt-1.5 leading-relaxed">{description}</p>
        </div>
      </div>
      {mode === 'action' ? (
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-xl sm:rounded-2xl bg-primary/85 dark:bg-[#4b5d7a] dark:border dark:border-[#6c7fa1] text-white dark:text-[#eef3fb] px-4 sm:px-5 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-extrabold hover:bg-primary/80 dark:hover:bg-[#55698a] transition-colors"
        >
          {actionLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className={`relative h-8 sm:h-9 w-14 sm:w-16 shrink-0 rounded-full border overflow-hidden transition-all duration-300 focus:outline-none ${enabled ? 'border-primary bg-primary' : 'border-[#d0d0d4] dark:border-[#464d5f] bg-[#d9d9dc] dark:bg-[#3a3f52]'}`}
        >
          <span className={`absolute top-0.5 h-7 w-7 rounded-full bg-white dark:bg-surface-container shadow-lg transition-all duration-300 ${enabled ? 'left-[26px] sm:left-[34px]' : 'left-[2px]'}`}></span>
        </button>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <section className="mt-10 sm:mt-12 first:mt-0">
    <div className="mb-5 sm:mb-6 px-1">
      <h3 className="text-lg sm:text-xl font-extrabold tracking-tight text-on-surface">{title}</h3>
      <p className="text-[13px] text-on-surface-variant mt-1.5 font-medium">{subtitle}</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {children}
    </div>
  </section>
);

const ChipSelector: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl text-[13px] sm:text-sm font-bold transition-all ${
      active 
        ? 'bg-white text-primary shadow-lg shadow-white/20 scale-105 dark:bg-[#4b5d7a] dark:text-[#eef3fb] dark:border dark:border-[#6c7fa1] dark:shadow-none' 
        : 'bg-surface-container-highest/50 dark:bg-surface-container-highest/20 text-on-surface-variant hover:bg-surface-container-highest dark:hover:bg-surface-container-highest/40'
    }`}
  >
    {label}
  </button>
);

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, requestChangePassword, confirmChangePassword, requestLockAccount, confirmLockAccount, requestDeleteAccount, confirmDeleteAccount } = useAuth();
  const { themeMode, setThemeMode, isDark, language, setLanguage, t } = useTheme();
  const [settings, setSettings] = useState<WebSettings>(DEFAULT_SETTINGS);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isLockAccountOpen, setIsLockAccountOpen] = useState(false);
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);

  const displayName = useMemo(() => user?.fullName || user?.fullname || 'Bạn', [user]);
  const displayAvatar = useMemo(
    () => user?.avatarUrl || user?.urlAvatar || '/logo_blue.png',
    [user],
  );

  useEffect(() => {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      setSettings((prev) => ({ ...prev, ...parsed }));
    } catch (error) {
      console.error('Failed to parse settings', error);
    }
  }, []);

  const patchSettings = (patch: Partial<WebSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto bg-surface-container-lowest dark:bg-surface-container-lowest text-on-surface dark:text-on-surface selection:bg-primary/10 dark:selection:bg-primary/30">
      <nav className="sticky top-0 w-full z-20 bg-white/80 dark:bg-surface-container/80 backdrop-blur-2xl border-b border-outline-variant/10 dark:border-outline-variant/20 px-4 sm:px-8 py-3 sm:py-5 flex justify-between items-center gap-3 shadow-sm dark:shadow-lg">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <button 
            onClick={() => navigate(-1)} 
            className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl sm:rounded-2xl bg-surface-container-highest/50 dark:bg-surface-container-highest/20 hover:bg-surface-container-highest dark:hover:bg-surface-container-highest/40 transition-all hover:scale-105 active:scale-95 text-on-surface dark:text-on-surface shrink-0"
          >
            <span className="material-symbols-outlined text-[22px] sm:text-[24px]">arrow_back</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-primary leading-none">{t('nav.settings')}</h1>
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mt-1.5">{t('nav.experience')}</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 bg-white/80 dark:bg-surface-container/80 p-1.5 pr-3 rounded-xl sm:rounded-2xl border border-outline-variant/10 dark:border-outline-variant/20 shadow-sm dark:shadow-lg">
          <img src={displayAvatar} alt={displayName} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover ring-2 ring-primary/5 shadow-inner" />
          <div className="text-left min-w-0">
            <p className="text-[13px] font-extrabold text-on-surface leading-tight">{displayName}</p>
            <p className="text-[10px] text-on-surface-variant font-bold truncate max-w-[150px]">{user?.email}</p>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-12 sm:pb-20">
        <header className="mb-10 sm:mb-14 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-[24px] sm:rounded-[32px] bg-primary/5 dark:bg-primary/10 text-primary mb-4 sm:mb-6 shadow-xl shadow-primary/5 dark:shadow-primary/10">
            <span className="material-symbols-outlined text-[34px] sm:text-[40px]" style={{ fontVariationSettings: "'wght' 300" }}>settings</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-on-surface mb-3 sm:mb-4">{t('header.title')}</h2>
          <p className="text-sm sm:text-base text-on-surface-variant font-medium leading-relaxed">
            {t('header.description')}
          </p>
        </header>

        <div className="space-y-10 sm:space-y-12">
          <Section title={t('section.account')} subtitle={t('section.account_subtitle')}>
            <div className="md:col-span-2 group rounded-[32px] border border-outline-variant/20 dark:border-outline-variant/30 bg-surface-container-lowest dark:bg-surface-container p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 shadow-2xl shadow-primary/10 dark:shadow-primary/5 transition-all hover:scale-[1.01]">
              <div className="text-on-surface">
                <h3 className="text-xl font-black mb-1.5 flex items-center gap-2">
                  <span className="material-symbols-outlined">devices</span>
                  {t('account.devices')}
                </h3>
                <p className="text-on-surface-variant text-sm font-medium">{t('account.devices_desc', { count: user?.activeSessions || 1 })}</p>
              </div>
              <Link
                to="/sessions"
                className={`inline-flex items-center justify-center rounded-2xl px-8 py-4 font-extrabold text-sm hover:shadow-xl hover:-translate-y-1 active:translate-y-0 transition-all ${isDark ? 'bg-[#4b5d7a] text-[#eef3fb] border border-[#6c7fa1] shadow-none hover:bg-[#55698a]' : 'bg-white text-primary'}`}
              >
                {t('account.manage_sessions')}
              </Link>
            </div>
            <SettingsToggle
              icon="lock"
              label={t('account.change_password')}
              description={t('account.change_password_desc')}
              enabled={false}
              mode="action"
              actionLabel={t('account.change_password')}
              onToggle={() => setIsChangePasswordOpen(true)}
            />
          </Section>

          <Section title={t('section.privacy')} subtitle={t('section.privacy_subtitle')}>
            <SettingsToggle
              icon="visibility"
              label={t('privacy.online_status')}
              description={t('privacy.online_status_desc')}
              enabled={settings.showOnlineStatus}
              onToggle={() => patchSettings({ showOnlineStatus: !settings.showOnlineStatus })}
            />
            <SettingsToggle
              icon="contact_phone"
              label={t('privacy.phone_search')}
              description={t('privacy.phone_search_desc')}
              enabled={settings.allowSearchByPhone}
              onToggle={() => patchSettings({ allowSearchByPhone: !settings.allowSearchByPhone })}
            />
            <SettingsToggle
              icon="sync"
              label={t('privacy.sync_contacts')}
              description={t('privacy.sync_contacts_desc')}
              enabled={settings.syncContacts}
              onToggle={() => patchSettings({ syncContacts: !settings.syncContacts })}
            />
          </Section>

          <Section title={t('section.notifications')} subtitle={t('section.notifications_subtitle')}>
            <SettingsToggle
              icon="notifications"
              label={t('notif.push')}
              description={t('notif.push_desc')}
              enabled={settings.notifications}
              onToggle={() => patchSettings({ notifications: !settings.notifications })}
            />
            <SettingsToggle
              icon="volume_up"
              label={t('notif.sound')}
              description={t('notif.sound_desc')}
              enabled={settings.messageSound}
              onToggle={() => patchSettings({ messageSound: !settings.messageSound })}
            />
          </Section>

          <Section title={t('section.media')} subtitle={t('section.media_subtitle')}>
            <SettingsToggle
              icon="cloud_download"
              label={t('media.auto_download')}
              description={t('media.auto_download_desc')}
              enabled={settings.autoDownloadMedia}
              onToggle={() => patchSettings({ autoDownloadMedia: !settings.autoDownloadMedia })}
            />
          </Section>

          <Section title={t('section.theme')} subtitle={t('section.theme_subtitle')}>
            <div className="rounded-3xl border border-outline-variant/15 dark:border-outline-variant/30 bg-white dark:bg-surface-container p-6 md:col-span-2">
              <div className="flex flex-col md:flex-row gap-12">
                <div className="flex-1">
                  <p className="text-sm font-extrabold text-on-surface mb-5 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">palette</span>
                    {t('theme.label')}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <ChipSelector label={t('theme.system')} active={themeMode === 'system'} onClick={() => setThemeMode('system')} />
                    <ChipSelector label={t('theme.light')} active={themeMode === 'light'} onClick={() => setThemeMode('light')} />
                    <ChipSelector label={t('theme.dark')} active={themeMode === 'dark'} onClick={() => setThemeMode('dark')} />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-extrabold text-on-surface mb-5 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">language</span>
                    {t('language.label')}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <ChipSelector label={t('language.vi')} active={language === 'vi'} onClick={() => setLanguage('vi')} />
                    <ChipSelector label={t('language.en')} active={language === 'en'} onClick={() => setLanguage('en')} />
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Section: Quản lý tài khoản */}
          <section className="mt-12">
            <div className="mb-6 px-1">
              <h3 className="text-xl font-extrabold tracking-tight text-on-surface">{t('section.account_management')}</h3>
              <p className="text-[13px] text-on-surface-variant mt-1.5 font-medium">{t('section.account_management_subtitle')}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                id="btn-lock-account"
                onClick={() => setIsLockAccountOpen(true)}
                className="group rounded-3xl border border-outline-variant/15 dark:border-outline-variant/30 bg-white dark:bg-surface-container p-5 flex items-center gap-5 transition-all hover:shadow-[0_8px_30px_rgb(0,65,143,0.08)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.25)] hover:border-primary/30 dark:hover:border-primary/40 text-left"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:bg-primary/15 dark:group-hover:bg-primary/25 transition-colors">
                  <span className="material-symbols-outlined text-primary text-[24px]">lock_person</span>
                </div>
                <div>
                  <p className="text-[15px] font-extrabold text-on-surface leading-tight">{t('account_mgmt.lock')}</p>
                  <p className="text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">{t('account_mgmt.lock_desc')}</p>
                </div>
              </button>

              <button
                id="btn-delete-account"
                onClick={() => setIsDeleteAccountOpen(true)}
                className="group rounded-3xl border border-outline-variant/15 dark:border-outline-variant/30 bg-white dark:bg-surface-container p-5 flex items-center gap-5 transition-all hover:shadow-[0_8px_30px_rgb(0,65,143,0.08)] dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.25)] hover:border-primary/30 dark:hover:border-primary/40 text-left"
              >
                <div className="w-12 h-12 rounded-2xl bg-primary/10 dark:bg-primary/20 flex items-center justify-center group-hover:bg-primary/15 dark:group-hover:bg-primary/25 transition-colors">
                  <span className="material-symbols-outlined text-primary text-[24px]">delete_forever</span>
                </div>
                <div>
                  <p className="text-[15px] font-extrabold text-on-surface leading-tight">{t('account_mgmt.delete')}</p>
                  <p className="text-[13px] text-on-surface-variant mt-1.5 leading-relaxed">{t('account_mgmt.delete_desc')}</p>
                </div>
              </button>
            </div>
          </section>
        </div>

        <footer className="mt-20 pt-10 border-t border-outline-variant/10 dark:border-outline-variant/20 text-center">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{t('footer.version')}</p>
          <p className="text-[11px] text-outline mt-2 tracking-wide font-medium max-w-md mx-auto leading-relaxed">
            {t('footer.note')}
          </p>
        </footer>
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        requestChangePassword={requestChangePassword}
        confirmChangePassword={confirmChangePassword}
        email={user?.email || ''}
      />

      {/* Lock Account Modal */}
      <AccountActionModal
        isOpen={isLockAccountOpen}
        onClose={() => setIsLockAccountOpen(false)}
        email={user?.email || ''}
        mode="lock"
        onRequestOtp={requestLockAccount}
        onConfirmOtp={confirmLockAccount}
      />

      {/* Delete Account Modal */}
      <AccountActionModal
        isOpen={isDeleteAccountOpen}
        onClose={() => setIsDeleteAccountOpen(false)}
        email={user?.email || ''}
        mode="delete"
        onRequestOtp={requestDeleteAccount}
        onConfirmOtp={confirmDeleteAccount}
      />
    </div>
  );
};

const ChangePasswordModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  requestChangePassword: (data: any) => Promise<void>;
  confirmChangePassword: (otp: string) => Promise<void>;
  email: string;
}> = ({ isOpen, onClose, requestChangePassword, confirmChangePassword, email }) => {
  const { t } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  if (!isOpen) return null;

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError(t('modal.password_mismatch'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestChangePassword({ currentPassword, newPassword });
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || t('modal.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await confirmChangePassword(otp);
    } catch (err: any) {
      setError(err.response?.data?.message || t('modal.invalid_otp'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
      <div 
        className="absolute inset-0 bg-on-surface/40 dark:bg-black/60 animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[500px] bg-white dark:bg-surface-container rounded-[40px] shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="absolute top-6 right-6 z-10">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface-container-highest/30 dark:bg-surface-container-highest/20 flex items-center justify-center hover:bg-surface-container-highest dark:hover:bg-surface-container-highest/40 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="p-8 sm:p-12">
          <div className="mb-10 text-center">
            <div className="inline-flex w-16 h-16 rounded-[24px] bg-primary/5 text-primary items-center justify-center mb-6">
              <span className="material-symbols-outlined text-[32px]">{step === 1 ? 'lock_reset' : 'mark_email_unread'}</span>
            </div>
            <h3 className="text-2xl font-black text-on-surface">
              {step === 1 ? t('modal.change_password') : t('modal.verify_otp')}
            </h3>
            <p className="text-sm text-on-surface-variant font-medium mt-2 leading-relaxed">
              {step === 1 
                ? t('modal.verify_password')
                : t('modal.otp_sent', { email })}
            </p>
          </div>

          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-error/5 border border-error/10 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <span className="material-symbols-outlined text-error text-[20px]">error</span>
              <p className="text-[13px] font-bold text-error leading-tight">{error}</p>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleRequest} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[13px] font-extrabold text-on-surface ml-1">{t('modal.current_password')}</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">lock</span>
                  <input 
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full h-14 bg-surface-container-highest/20 dark:bg-surface-container-highest/30 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-2xl pl-12 pr-4 text-sm font-bold focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all text-on-surface dark:text-on-surface placeholder:text-on-surface-variant/60"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-extrabold text-on-surface ml-1">{t('modal.new_password')}</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">password</span>
                  <input 
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-14 bg-surface-container-highest/20 dark:bg-surface-container-highest/30 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-2xl pl-12 pr-4 text-sm font-bold focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all text-on-surface dark:text-on-surface placeholder:text-on-surface-variant/60"
                    placeholder="Minimum 8 characters"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-extrabold text-on-surface ml-1">{t('modal.confirm_password')}</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">verified</span>
                  <input 
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-14 bg-surface-container-highest/20 dark:bg-surface-container-highest/30 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-2xl pl-12 pr-4 text-sm font-bold focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all text-on-surface dark:text-on-surface placeholder:text-on-surface-variant/60"
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-primary hover:bg-primary/90 dark:bg-[#4b5d7a] dark:border dark:border-[#6c7fa1] dark:hover:bg-[#55698a] text-white dark:text-[#eef3fb] rounded-2xl font-black text-sm shadow-xl shadow-primary/20 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:scale-100"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('modal.send_otp')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-8">
              <div className="flex justify-center">
                <input 
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full max-w-[280px] h-20 bg-surface-container-highest/30 dark:bg-surface-container-highest/40 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-[28px] text-center text-4xl font-black tracking-[12px] text-primary focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all placeholder:text-outline/30 dark:placeholder:text-outline/50"
                  placeholder="000000"
                />
              </div>

              <div className="space-y-4">
                <button 
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full h-14 bg-primary hover:bg-primary/90 dark:bg-[#4b5d7a] dark:border dark:border-[#6c7fa1] dark:hover:bg-[#55698a] text-white dark:text-[#eef3fb] rounded-2xl font-black text-sm shadow-xl shadow-primary/20 dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:scale-100"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('modal.change_password')}
                </button>
                <button 
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full h-12 bg-transparent text-primary hover:bg-primary/5 dark:hover:bg-primary/10 rounded-2xl font-extrabold text-[13px] transition-all"
                >
                  {t('modal.back')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

// ─── AccountActionModal ────────────────────────────────────────────────────────
const AccountActionModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  email: string;
  mode: 'lock' | 'delete';
  onRequestOtp: (currentPassword: string) => Promise<void>;
  onConfirmOtp: (otp: string) => Promise<void>;
}> = ({ isOpen, onClose, email, mode, onRequestOtp, onConfirmOtp }) => {
  const { t } = useTheme();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');

  if (!isOpen) return null;

  const isLock = mode === 'lock';
  const accentClass = 'text-primary';
  const bgClass = 'bg-primary/5 dark:bg-primary/20 border-primary/20 dark:border-primary/40';
  const btnClass = 'bg-primary hover:bg-primary/90 dark:bg-[#4b5d7a] dark:border dark:border-[#6c7fa1] dark:hover:bg-[#55698a] shadow-primary/20 dark:shadow-none';

  const title = isLock ? t('account_mgmt.lock') : t('account_mgmt.delete');
  const icon = isLock ? 'lock_person' : 'delete_forever';
  const confirmLabel = isLock ? t('modal.lock_account') : t('modal.delete_account');
  const warningMsg = isLock
    ? 'Account will be temporarily locked. All login sessions will be disabled immediately.'
    : 'This action CANNOT be undone. All account data will be permanently deleted.';

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) return;
    setLoading(true);
    setError(null);
    try {
      await onRequestOtp(currentPassword);
      setStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || t('modal.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirmOtp(otp);
    } catch (err: any) {
      setError(err.response?.data?.message || t('modal.invalid_otp'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setCurrentPassword('');
    setOtp('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-0">
      <div className="absolute inset-0 bg-on-surface/40 dark:bg-black/60 animate-in fade-in duration-300" onClick={handleClose} />
      <div className="relative w-full max-w-[500px] bg-white dark:bg-surface-container rounded-[40px] shadow-2xl dark:shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        <div className="absolute top-6 right-6 z-10">
          <button onClick={handleClose} className="w-10 h-10 rounded-full bg-surface-container-highest/30 dark:bg-surface-container-highest/20 flex items-center justify-center hover:bg-surface-container-highest dark:hover:bg-surface-container-highest/40 transition-colors active:scale-95">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">close</span>
          </button>
        </div>

        <div className="p-8 sm:p-12">
          <div className="mb-8 text-center">
            <div className={`inline-flex w-16 h-16 rounded-[24px] items-center justify-center mb-6 border ${bgClass}`}>
              <span className={`material-symbols-outlined text-[32px] ${accentClass}`}>{icon}</span>
            </div>
            <h3 className="text-2xl font-black text-on-surface">{title}</h3>
            <p className="text-sm text-on-surface-variant font-medium mt-2 leading-relaxed">
              {step === 1 ? warningMsg : t('modal.otp_sent', { email })}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-error/5 border border-error/10 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
              <span className="material-symbols-outlined text-error text-[20px]">error</span>
              <p className="text-[13px] font-bold text-error leading-tight">{error}</p>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleRequestOtp} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[13px] font-extrabold text-on-surface ml-1">{t('modal.current_password')}</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">lock</span>
                  <input
                    type="password"
                    required
                    autoFocus
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full h-14 bg-surface-container-highest/20 dark:bg-surface-container-highest/30 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-2xl pl-12 pr-4 text-sm font-bold focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all text-on-surface dark:text-on-surface placeholder:text-on-surface-variant/60"
                    placeholder={t('modal.verify_password')}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !currentPassword}
                className={`w-full h-14 text-white dark:text-[#eef3fb] rounded-2xl font-black text-sm shadow-xl dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:scale-100 ${btnClass}`}
              >
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : t('modal.send_otp')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmOtp} className="space-y-8">
              <div className="flex justify-center">
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full max-w-[280px] h-20 bg-surface-container-highest/30 dark:bg-surface-container-highest/40 border-2 border-outline-variant/10 dark:border-outline-variant/20 rounded-[28px] text-center text-4xl font-black tracking-[12px] text-primary focus:border-primary focus:bg-white dark:focus:bg-surface-container outline-none transition-all placeholder:text-outline/30 dark:placeholder:text-outline/50"
                  placeholder="000000"
                />
              </div>
              <div className="space-y-4">
                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className={`w-full h-14 text-white dark:text-[#eef3fb] rounded-2xl font-black text-sm shadow-xl dark:shadow-none hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 disabled:scale-100 ${btnClass}`}
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : confirmLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full h-12 bg-transparent text-primary hover:bg-primary/5 dark:hover:bg-primary/10 rounded-2xl font-extrabold text-[13px] transition-all"
                >
                  {t('modal.back')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
