import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Link, useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const SessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { getSessions, logout, logoutAll, revokeSession, socket, deviceId, user } = useAuth();
  const { isDark } = useTheme();
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const data = await getSessions();
      if (data.activeDevices) {
        setActiveSessions(data.activeDevices);
        setLoginHistory(data.loginHistory || []);
      } else {
        setActiveSessions(data);
        setLoginHistory([]);
      }
    } catch (err) {
      console.error('Fetch sessions error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    if (socket) {
      socket.on('sessions_update', () => {
        console.log('Realtime sessions update received on Web');
        fetchSessions();
      });
    }

    return () => {
      if (socket) {
        socket.off('sessions_update');
      }
    };
  }, [socket]);

  const handleRevoke = async (targetDeviceId: string, name: string) => {
    const result = await Swal.fire({
      title: 'Đăng xuất thiết bị?',
      text: `Bạn có chắc chắn muốn đăng xuất khỏi "${name || targetDeviceId}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Đăng xuất',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      try {
        await revokeSession(targetDeviceId);
        Swal.fire('Đã đăng xuất', 'Thiết bị đã bị đăng xuất thành công.', 'success');
        fetchSessions(); // Refresh list
      } catch (err) {
        Swal.fire('Lỗi', 'Không thể đăng xuất thiết bị lúc này.', 'error');
      }
    }
  };

  const handleLogoutAll = async () => {
    const result = await Swal.fire({
      title: 'Đăng xuất tất cả?',
      text: 'Tất cả các phiên đăng nhập khác sẽ bị hủy bỏ.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Đăng xuất hết',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      await logoutAll();
    }
  };

  const handleLogoutCurrent = async () => {
    const result = await Swal.fire({
      title: 'Đăng xuất?',
      text: 'Bạn có chắc chắn muốn đăng xuất khỏi thiết bị này?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#00418f',
      confirmButtonText: 'Đăng xuất',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      logout();
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col w-full animate-fade-in">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-surface-container/80 backdrop-blur-md border-b border-outline-variant px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)} 
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-surface-container-low transition-colors text-on-surface-variant hov-scale"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h1 className="text-xl font-bold tracking-tight text-primary dark:text-on-surface">Quản lý phiên đăng nhập</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-on-surface">{user?.fullName}</p>
            <p className="text-[11px] text-on-surface-variant font-medium">{user?.email}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary-container text-primary flex items-center justify-center font-bold overflow-hidden border border-primary/20 shadow-sm">
            {user?.avatarUrl ? (
              <img 
                src={user.avatarUrl} 
                alt="Avatar" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              user?.fullName?.charAt(0) || 'U'
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto w-full px-6 pt-24 pb-12">
        <header className="mb-10 text-center sm:text-left">
          <h2 className="text-3xl font-extrabold tracking-tight text-on-surface mb-3">Thiết bị đang hoạt động</h2>
          <p className="text-on-surface-variant max-w-2xl leading-relaxed">
            Danh sách các thiết bị hiện đang đăng nhập vào tài khoản của bạn. 
            Bạn có thể đăng xuất từ bất kỳ thiết bị nào hoặc đăng xuất khỏi tất cả.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            <div className="py-20 flex justify-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {activeSessions.map((session, index) => {
                const isCurrent = session.deviceId === deviceId;
                return (
                  <div 
                    key={index} 
                    className={`academic-glass p-6 rounded-2xl flex items-center justify-between border ${isCurrent ? 'border-primary/30 ring-1 ring-primary/10' : 'border-white/40'}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isCurrent ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                        <span className="material-symbols-outlined text-3xl">
                          {session.deviceType === 'desktop' ? 'desktop_windows' : 
                           session.deviceType === 'mobile' ? 'smartphone' : 
                           session.deviceId.startsWith('web-') ? 'laptop' : 'devices'}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-on-surface">{session.deviceName || session.deviceId}</h3>
                          {isCurrent && (
                            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-wider">
                              Thiết bị này
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-on-surface-variant flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-green-500' : 'bg-on-surface-variant/30'}`}></span>
                          {isCurrent ? 'Đang hoạt động' : 'Đã đăng nhập'} • {new Date(session.loginAt || session.lastActiveAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    {!isCurrent && (
                      <button 
                        className="px-4 py-2 text-sm font-bold text-error dark:text-[#eef3fb] hover:bg-error/10 dark:hover:bg-[#4b5d7a] dark:border dark:border-[#6c7fa1] rounded-xl transition-colors"
                        onClick={() => handleRevoke(session.deviceId, session.deviceName)}
                      >
                        Đăng xuất
                      </button>
                    )}
                  </div>
                );
              })}

              {loginHistory.length > 0 && (
                <div className="mt-12">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="material-symbols-outlined text-primary">history</span>
                    <h3 className="text-xl font-bold text-on-surface">Lịch sử thiết bị (30 ngày gần đây)</h3>
                  </div>
                  <div className="space-y-4">
                    {loginHistory.map((item, index) => (
                      <div key={`history-${index}`} className="flex items-center justify-between p-4 bg-surface-container-low/50 rounded-xl border border-outline-variant opacity-70">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-on-surface-variant">
                            <span className="material-symbols-outlined">
                              {(item.deviceType === 'mobile' || (item.deviceId && (item.deviceId.includes('android') || item.deviceId.includes('ios')))) 
                                ? 'smartphone' : 'laptop'}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-sm text-on-surface">{item.deviceName || item.deviceId}</p>
                            <p className="text-[11px] text-on-surface-variant">
                              Đã đăng xuất: {new Date(item.logoutAt || item.updatedAt).toLocaleString('vi-VN')}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-surface-container-highest text-on-surface-variant text-[9px] font-bold rounded uppercase tracking-tighter">
                          Đã thoát
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-6 p-8 bg-error/5 dark:bg-surface-container rounded-3xl border border-error/10 dark:border-outline-variant/30 border-dashed dark:border-solid">
                <div className="text-center sm:text-left">
                  <h4 className="font-bold text-error dark:text-on-surface text-lg mb-1">Bảo mật tài khoản</h4>
                  <p className="text-sm text-on-error-container dark:text-on-surface-variant opacity-80 leading-relaxed">
                    Nếu bạn thấy thiết bị lạ, hãy đăng xuất khỏi tất cả và đổi lại mật khẩu ngay lập tức.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                  <button 
                    onClick={handleLogoutCurrent}
                    className={`px-6 py-4 font-bold rounded-2xl border transition-all flex items-center justify-center gap-2 ${isDark ? 'bg-[#4b5d7a] text-[#eef3fb] border-[#6c7fa1] hover:bg-[#55698a]' : 'bg-surface-container-lowest text-on-surface border-outline-variant hover:bg-white shadow-sm'}`}
                  >
                    Đăng xuất thiết bị này
                  </button>
                  <button 
                    onClick={handleLogoutAll}
                    className={`px-6 py-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${isDark ? 'bg-[#4b5d7a] text-[#eef3fb] border border-[#6c7fa1] hover:bg-[#55698a]' : 'bg-primary text-white hover:opacity-90 shadow-lg shadow-primary/20'}`}
                  >
                    Đăng xuất tất cả thiết bị
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Decorative */}
      <div className="fixed -bottom-40 -left-40 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="fixed -top-40 -right-40 w-96 h-96 bg-secondary-container/10 rounded-full blur-[100px] pointer-events-none"></div>
    </div>
  );
};

export default SessionsPage;
