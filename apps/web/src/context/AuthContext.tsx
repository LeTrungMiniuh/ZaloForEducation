import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { io } from 'socket.io-client';
import { getDeviceId, getDeviceInfo } from '../utils/device';

interface AuthContextType {
  user: any;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requireOtp?: boolean; email?: string; success?: boolean }>;
  requestRegisterOtp: (email: string) => Promise<void>;
  confirmRegister: (data: any) => Promise<void>;
  resendOtp: (email: string, type: 'register' | 'forgot_password') => Promise<void>;
  requestForgotPassword: (email: string) => Promise<void>;
  resetPassword: (data: any) => Promise<void>;
  getSessions: () => Promise<any>;
  revokeSession: (deviceId: string) => Promise<void>;
  refreshUser: () => Promise<any>;
  logout: () => void;
  logoutAll: () => Promise<void>;
  requestChangePassword: (data: { currentPassword: string; newPassword: string }) => Promise<void>;
  confirmChangePassword: (otp: string) => Promise<void>;
  requestLockAccount: (currentPassword: string) => Promise<void>;
  confirmLockAccount: (otp: string) => Promise<void>;
  requestDeleteAccount: (currentPassword: string) => Promise<void>;
  confirmDeleteAccount: (otp: string) => Promise<void>;
  verifyLoginOtp: (otp: string, email: string) => Promise<any>;
  googleLogin: (idToken: string) => Promise<{ isProfileComplete?: boolean; requireOtp?: boolean; email?: string; success?: boolean }>;
  requestGoogleCompletionOtp: (email: string) => Promise<void>;
  completeGoogleProfile: (data: any) => Promise<void>;
  pendingGoogleUser: any;
  setPendingGoogleUser: (user: any) => void;
  socket: any;
  deviceId: string;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<any>(null);
  const [deviceId, setDeviceId] = useState<string>('');


  // FIX 2+3: dùng ref để track socket hiện tại,
  // tránh tạo nhiều socket và memory leak
  const socketRef = useRef<any>(null);

  // FIX 5: getDeviceId có thể async, dùng useEffect để lấy
  useEffect(() => {
    const initDeviceId = async () => {
      const id = await Promise.resolve(getDeviceId());
      setDeviceId(id);
    };
    initDeviceId();
  }, []);

  useEffect(() => {
    const initSession = async () => {
      const savedUser = localStorage.getItem('user');
      const savedToken = localStorage.getItem('token');
      const savedPending = localStorage.getItem('pendingGoogleUser');

      // 1. Khôi phục user đầy đủ nếu có
      if (savedUser && savedUser !== 'undefined' && savedToken) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setupSocket(parsedUser.email);
        } catch (e) {
          console.error('Failed to parse saved user:', e);
        }
      } 
      // 2. Nếu chỉ có token (VD: F5 khi đang Profile Completion), gọi API lấy profile
      else if (savedToken) {
        try {
          // Sếp yêu cầu dùng /auth/me để lấy profile mới nhất
          const res = await api.get('/auth/me');
          if (res.data.profile) {
            setUser(res.data.profile);
            setupSocket(res.data.profile.email);
            localStorage.setItem('user', JSON.stringify(res.data.profile));
          }
        } catch (err: any) {
          console.error('Rehydration failed:', err);
          // Nếu lỗi 403 (Pending) hoặc 401 thì check savedPending
          if (savedPending) {
            setPendingGoogleUser(JSON.parse(savedPending));
          } else {
            localStorage.removeItem('token');
          }
        }
      }
      
      setLoading(false);
    };

    initSession();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const setupSocket = (email: string) => {
    // FIX 3: disconnect socket cũ trước khi tạo mới
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const token = localStorage.getItem('token');

    const newSocket = io(apiUrl, {
      auth: {
        token
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to socket server');
      // FIX 1: gửi cả deviceId khi join_identity
      const currentDeviceId = deviceId || localStorage.getItem('deviceId') || '';
      newSocket.emit('join_identity', { email, deviceId: currentDeviceId });
    });

    newSocket.on('force_logout', (data) => {
      console.log('🔥 [SOCKET] force_logout EVENT RECEIVED:', data);
      const currentDeviceId = deviceId || localStorage.getItem('deviceId') || '';

      // FIX: Chấp nhận logout nếu targetDeviceId khớp, all=true, hoặc bị invalidate session
      const shouldLogout =
        data?.all === true ||
        (data?.targetDeviceId && data.targetDeviceId === currentDeviceId) ||
        (data?.reason === 'SESSION_INVALIDATED');

      if (shouldLogout) {
        console.log('✅ [SOCKET] Target device matched. Initiating local logout...');
        alert('Phiên đăng nhập của bạn đã hết hạn hoặc bị đăng xuất từ thiết bị khác.');
        logoutLocal();
      } else {
        console.log('[SOCKET] force_logout ignored — not targeting this device', {
          targetDeviceId: data?.targetDeviceId,
          currentDeviceId,
        });
      }
    });

    newSocket.on('profile_update', (data) => {
      if (data && data.profile) {
        console.log('⚡ [SOCKET] Profile update event received:', data.profile);
        setUser((prevUser: any) => {
          const merged = { ...prevUser, ...data.profile };
          localStorage.setItem('user', JSON.stringify(merged));
          console.log('✅ [AUTH] User state updated from socket sync');
          return merged;
        });
      }
    });

    // FIX 2: lưu vào ref để quản lý lifecycle
    socketRef.current = newSocket;
    setSocket(newSocket);
  };

  const login = async (email: string, password: string) => {
    const { deviceName, deviceType } = getDeviceInfo();
    const currentDeviceId = deviceId || await Promise.resolve(getDeviceId());

    try {
      const res = await api.post('/auth/login', {
        email,
        password,
        deviceId: currentDeviceId,
        deviceName,
        deviceType: 'web', // Ép kiểu web cho app Web
        platform: 'web',
      });

      if (res.data.type === 'REQUIRE_OTP') {
        return { requireOtp: true, email };
      }

      const { accessToken, user: userData } = res.data;

      localStorage.setItem('token', accessToken);
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('deviceId', currentDeviceId);

      setUser(userData);
      setupSocket(userData.email);
      return { success: true };
    } catch (err: any) {
      if (err.response?.data?.type === 'REQUIRE_OTP') {
        return { requireOtp: true, email };
      }
      throw err;
    }
  };

  const verifyLoginOtp = async (otp: string, email: string) => {
    const { deviceName, deviceType } = getDeviceInfo();
    const currentDeviceId = deviceId || await Promise.resolve(getDeviceId());

    const res = await api.post('/auth/verify-login-otp', {
      email,
      otp,
      deviceId: currentDeviceId,
      deviceName,
      deviceType: 'web', // Ép kiểu web
    });

    const { accessToken, user: userData } = res.data;

    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('deviceId', currentDeviceId);

    setUser(userData);
    setupSocket(userData.email);
    return userData;
  };

  const requestRegisterOtp = async (email: string) => {
    await api.post('/auth/register', { email });
  };

  const confirmRegister = async (data: any) => {
    await api.post('/auth/register/confirm', data);
  };

  const resendOtp = async (email: string, type: 'register' | 'forgot_password') => {
    await api.post('/auth/resend-otp', { email, type });
  };

  const requestForgotPassword = async (email: string) => {
    await api.post('/auth/forgot-password', { email });
  };

  const resetPassword = async (data: any) => {
    await api.post('/auth/reset-password', data);
  };

  const getSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return [];
      const res = await api.get('/auth/sessions');
      return res.data;
    } catch (err) {
      console.error('Error fetching sessions', err);
      return [];
    }
  };

  const revokeSession = async (targetDeviceId: string) => {
    try {
      await api.delete(`/auth/sessions/${targetDeviceId}`);
    } catch (err) {
      console.error('Revoke session error', err);
      throw err;
    }
  };

  const logoutLocal = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('pendingGoogleUser');
    // deviceId được giữ lại để duy trì trạng thái "Thiết bị tin cậy"
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setUser(null);
    setSocket(null);
    setPendingGoogleUser(null);
    window.location.href = '/login';
  };

  const logout = async () => {
    try {
      if (user) {
        // FIX: Ưu tiên deviceId từ localStorage (đúng với session đang active)
        // vì sau QR login, deviceId state có thể khác với deviceId trong JWT
        const currentDeviceId = deviceId || localStorage.getItem('deviceId') || '';
        await api.post('/auth/logout', { email: user.email, deviceId: currentDeviceId });
      }
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      logoutLocal();
    }
  };

  const refreshUser = async () => {
    try {
      const res = await api.get('/users/profile');
      const updatedProfile = res.data.profile;
      const newUser = { ...user, ...updatedProfile };
      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      return newUser;
    } catch (err) {
      console.error('Refresh user error', err);
      return user;
    }
  };

  const logoutAll = async () => {
    if (user) {
      await api.post('/auth/logout-all', { email: user.email });
      logoutLocal();
    }
  };

  const requestChangePassword = async (data: { currentPassword: string; newPassword: string }) => {
    await api.post('/auth/change-password/request', data);
  };

  const confirmChangePassword = async (otp: string) => {
    await api.post('/auth/change-password/confirm', { otp });
    // confirm xong backend đá logoutall rồi, web gọi logoutLocal để dọn dẹp
    logoutLocal();
  };

  // ===== KHÓA TÀI KHOẢN =====

  const requestLockAccount = async (currentPassword: string) => {
    await api.post('/auth/lock-account/request', { currentPassword });
  };

  const confirmLockAccount = async (otp: string) => {
    await api.post('/auth/lock-account/confirm', { otp });
    alert('Tài khoản của bạn đã được khóa thành công. Hẹn gặp lại!');
    logoutLocal();
  };

  // ===== XÓA TÀI KHOẢN =====

  const requestDeleteAccount = async (currentPassword: string) => {
    await api.post('/auth/delete-account/request', { currentPassword });
  };

  const confirmDeleteAccount = async (otp: string) => {
    await api.post('/auth/delete-account/confirm', { otp });
    alert('Tài khoản của bạn đã được xóa hoàn toàn. Cảm ơn bạn đã đồng hành cùng Zalo Education!');
    logoutLocal();
  };

  const googleLogin = async (idToken: string) => {
    const { deviceName, deviceType } = getDeviceInfo();
    const currentDeviceId = deviceId || await Promise.resolve(getDeviceId());

    const res = await api.post('/auth/google-login', {
      idToken,
      deviceId: currentDeviceId,
      deviceName,
      deviceType: 'web' // Ép kiểu web cho app Web
    });

    if (res.data.isProfileComplete === false) {
      const { accessToken, ...pendingData } = res.data;
      localStorage.setItem('token', accessToken);
      localStorage.setItem('pendingGoogleUser', JSON.stringify(pendingData));
      localStorage.setItem('deviceId', currentDeviceId);
      
      setPendingGoogleUser(pendingData);
      return { isProfileComplete: false, email: res.data.email };
    }

    if (res.data.type === 'REQUIRE_OTP') {
      return { requireOtp: true, email: res.data.email };
    }

    const { accessToken, user: userData } = res.data;
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('deviceId', currentDeviceId);

    setUser(userData);
    setupSocket(userData.email);
    return { success: true };
  };

  const requestGoogleCompletionOtp = async (email: string) => {
    await api.post('/auth/google-complete/request-otp', { email });
  };

  const completeGoogleProfile = async (data: any) => {
    const { deviceName, deviceType } = getDeviceInfo();
    const currentDeviceId = deviceId || await Promise.resolve(getDeviceId());

    const res = await api.post('/auth/google-complete/confirm', {
      ...data,
      deviceId: currentDeviceId,
      deviceName,
      deviceType: 'web', // Ép kiểu web
    });

    const { accessToken, user: userData } = res.data;
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('deviceId', currentDeviceId);
    localStorage.removeItem('pendingGoogleUser');

    setUser(userData);
    setPendingGoogleUser(null);
    setupSocket(userData.email);
  };


  return (
    <AuthContext.Provider value={{
      user, loading, login, requestRegisterOtp, confirmRegister,
      resendOtp, requestForgotPassword, resetPassword, getSessions,
      revokeSession, logout, logoutAll, socket, deviceId, refreshUser,
      requestChangePassword, confirmChangePassword,
      requestLockAccount, confirmLockAccount,
      requestDeleteAccount, confirmDeleteAccount,
      verifyLoginOtp,
      googleLogin, requestGoogleCompletionOtp, completeGoogleProfile,
      pendingGoogleUser, setPendingGoogleUser
    }}>

      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
