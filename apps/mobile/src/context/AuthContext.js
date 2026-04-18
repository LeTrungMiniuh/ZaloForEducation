import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Alert from '../utils/Alert';
import SocketService from '../utils/socket';
import { getDeviceId } from '../utils/deviceId';
import { apiRequest } from '../utils/api';

const AuthContext = createContext();

export const AuthProvider = ({ children, onForceLogoutNavigate }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [profileVersion, setProfileVersion] = useState(Date.now());
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null);

  const isKickingRef = useRef(false);

  const checkSessionStatus = async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;

    try {
      await apiRequest('/auth/sessions');
    } catch (err) {
      if (err.message === 'SESSION_INVALIDATED') {
        console.warn('[AUTH] Session invalidated detected during Heartbeat.');
        handleForceLogout();
      } else {
        console.error('[AUTH] Heartbeat check failed:', err.message);
      }
    }
  };

  const handleForceLogout = (data = {}) => {
    console.log('🔥 [AUTH] handleForceLogout CALLED with data:', data);
    if (isKickingRef.current) return;
    isKickingRef.current = true;

    const message = data.message || 'Phiên đăng nhập đã hết hạn hoặc bị thay thế bởi thiết bị khác.';
    const time = data.time || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    const triggerLogout = async () => {
      try {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');
      } catch (err) {
        console.error('[AUTH] Storage cleanup error:', err);
      } finally {
        setUser(null);
        setToken(null);
        SocketService.disconnect();

        if (onForceLogoutNavigate) onForceLogoutNavigate('login');

        Alert.alert(
          'Phiên đăng nhập hết hạn',
          `${message}\n\nLúc: ${time}`,
          [{ text: 'Tôi đã hiểu', onPress: () => { isKickingRef.current = false; } }],
          { cancelable: false }
        );
      }
    };

    triggerLogout();
  };

  if (typeof global !== 'undefined') {
    global.handleForceLogout = handleForceLogout;
  }

  const handleForceLogoutRef = useRef(handleForceLogout);
  useEffect(() => {
    handleForceLogoutRef.current = handleForceLogout;
  }, [handleForceLogout]);

  useEffect(() => {
    if (user && token) {
      const interval = setInterval(() => {
        checkSessionStatus();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [user, token]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const savedUser = await AsyncStorage.getItem('user');
        const savedToken = await AsyncStorage.getItem('token');
        const savedDeviceId = await AsyncStorage.getItem('deviceId');
        const savedPending = await AsyncStorage.getItem('pendingGoogleUser');

        if (savedDeviceId) setDeviceId(savedDeviceId);

        // 1. Khôi phục session đầy đủ
        if (savedUser && savedToken) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setToken(savedToken);

          const currentDeviceId = savedDeviceId || await getDeviceId();
          SocketService.connect(parsedUser.email, currentDeviceId, savedToken);

          // Heartbeat check
          apiRequest('/auth/sessions').catch(err => {
            if (err.message === 'SESSION_INVALIDATED') handleForceLogout();
          });

          setupSocketListeners(savedDeviceId);
        } 
        // 2. Khôi phục session tạm thời (Pending Profile)
        else if (savedToken) {
          setToken(savedToken);
          try {
            const res = await apiRequest('/users/profile');
            if (res.ok && res.profile) {
              await login(res.profile, savedToken, savedDeviceId || await getDeviceId());
            } else if (savedPending) {
              setPendingGoogleUser(JSON.parse(savedPending));
            }
          } catch (err) {
            console.warn('[AUTH] Session recovery failed:', err.message);
            if (savedPending) setPendingGoogleUser(JSON.parse(savedPending));
          }
        }
      } catch (e) {
        console.error('[AUTH_CONTEXT] Error loading session:', e);
      } finally {
        setLoading(false);
      }
    };

    const setupSocketListeners = (savedDeviceId) => {
      SocketService.on('force_logout', (data) => {
        if (handleForceLogoutRef.current) {
          const currentDeviceIdRef = savedDeviceId || deviceId;
          const shouldLogout =
            data?.all === true ||
            (data?.targetDeviceId && data.targetDeviceId === currentDeviceIdRef) ||
            (data?.reason === 'SESSION_INVALIDATED');

          if (shouldLogout) handleForceLogoutRef.current(data);
        }
      });

      SocketService.on('profile_update', (data) => {
        if (data && data.profile) updateUser(data.profile);
      });
    };

    loadSession();

    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') checkSessionStatus();
    };

    const subscription = require('react-native').AppState.addEventListener('change', handleAppStateChange);

    return () => {
      SocketService.off('force_logout');
      subscription.remove();
    };
  }, []);

  const login = async (userData, accessToken, currentDeviceId) => {
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    await AsyncStorage.setItem('token', accessToken);
    await AsyncStorage.setItem('deviceId', currentDeviceId);
    setUser(userData);
    setToken(accessToken);
    setDeviceId(currentDeviceId);
    setProfileVersion(Date.now());
    SocketService.connect(userData.email, currentDeviceId, accessToken);
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ deviceId })
      });
    } catch (e) {
      console.warn('[AUTH] Backend logout failed', e);
    } finally {
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      setUser(null);
      setToken(null);
      SocketService.disconnect();
    }
  };

  // ===== KHÓA TÀI KHOẢN =====

  const requestLockAccount = async (currentPassword) => {
    await apiRequest('/auth/lock-account/request', {
      method: 'POST',
      body: JSON.stringify({ currentPassword }),
    });
  };

  const confirmLockAccount = async (otp) => {
    await apiRequest('/auth/lock-account/confirm', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
    // Backend đã kick tất cả sessions — dọn dẹp local
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setUser(null);
    setToken(null);
    SocketService.disconnect();
  };

  // ===== XÓA TÀI KHOẢN =====

  const requestDeleteAccount = async (currentPassword) => {
    await apiRequest('/auth/delete-account/request', {
      method: 'POST',
      body: JSON.stringify({ currentPassword }),
    });
  };

  const confirmDeleteAccount = async (otp) => {
    await apiRequest('/auth/delete-account/confirm', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    });
    // Backend đã kick tất cả sessions — dọn dẹp local
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    setUser(null);
    setToken(null);
    SocketService.disconnect();
  };

  const updateUser = async (userData) => {
    if (!userData) return;
    setUser(prevUser => {
      const merged = { ...(prevUser || {}), ...userData };
      AsyncStorage.setItem('user', JSON.stringify(merged));
      return merged;
    });
    setProfileVersion(Date.now());
  };

  const loginGoogle = async (token, pendingData, currentDeviceId) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('deviceId', currentDeviceId);
    setToken(token);
    setDeviceId(currentDeviceId);

    if (pendingData) {
      await AsyncStorage.setItem('pendingGoogleUser', JSON.stringify(pendingData));
      setPendingGoogleUser(pendingData);
    }
  };

  const completeGoogleProfile = async (userData, accessToken, currentDeviceId) => {
    await AsyncStorage.removeItem('pendingGoogleUser');
    setPendingGoogleUser(null);
    await login(userData, accessToken, currentDeviceId);
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser,
      profileVersion, handleForceLogout, deviceId, checkSessionStatus,
      pendingGoogleUser, loginGoogle, completeGoogleProfile,
      requestLockAccount, confirmLockAccount,
      requestDeleteAccount, confirmDeleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
