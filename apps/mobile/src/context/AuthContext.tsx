import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Alert from '../utils/Alert';
import SocketService from '../utils/socket';
import { getDeviceId } from '../utils/deviceId';
import { apiRequest } from '../utils/api';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { chimeRef } from '../utils/chimeRef';
import { pushSecurityAlert } from '../utils/securityAlerts';

export interface AuthContextType {
  user: any;
  token: string | null;
  loading: boolean;
  login: (userData: any, accessToken: string, currentDeviceId: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (userData: any) => Promise<void>;
  profileVersion: number;
  handleForceLogout: (data?: any) => void;
  deviceId: string;
  checkSessionStatus: () => Promise<void>;
  pendingGoogleUser: any;
  loginGoogle: (token: string, pendingData: any, currentDeviceId: string) => Promise<void>;
  completeGoogleProfile: (userData: any, accessToken: string, currentDeviceId: string) => Promise<void>;
  requestLockAccount: (p: string) => Promise<any>;
  confirmLockAccount: (otp: string) => Promise<void>;
  requestDeleteAccount: (p: string) => Promise<any>;
  confirmDeleteAccount: (otp: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  onForceLogoutNavigate?: (screen: string) => void;
}

export const AuthProvider = ({ children, onForceLogoutNavigate }: AuthProviderProps) => {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [profileVersion, setProfileVersion] = useState(Date.now());
  const [pendingGoogleUser, setPendingGoogleUser] = useState<any>(null);

  const isKickingRef = useRef(false);
  const callTimeoutRef = useRef<any>(null);

  const checkSessionStatus = async () => {
    const token = await AsyncStorage.getItem('token');
    if (!token) return;

    try {
      await apiRequest('/auth/sessions');
    } catch (err: any) {
      if (err.message === 'SESSION_INVALIDATED') {
        console.warn('[AUTH] Session invalidated detected during Heartbeat.');
        handleForceLogout();
      } else {
        console.error('[AUTH] Heartbeat check failed:', err.message);
      }
    }
  };

  const handleForceLogout = useCallback((data: any = {}) => {
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
          [{ text: 'Tôi đã hiểu', onPress: () => { isKickingRef.current = false; } }]
        );
      }
    };

    triggerLogout();
  }, [onForceLogoutNavigate]);

  if (typeof global !== 'undefined') {
    (global as any).handleForceLogout = handleForceLogout;
  }

  const handleForceLogoutRef = useRef(handleForceLogout);
  useEffect(() => {
    handleForceLogoutRef.current = handleForceLogout;
  }, [handleForceLogout]);

  const setupSocketListeners = useCallback((currentDeviceId: string) => {
    if (!SocketService.socket) return;

    // Clear existing to avoid dupes
    SocketService.off('force_logout');
    SocketService.off('profile_update');
    SocketService.off('receiveMessage');
    SocketService.off('message_patched');
    SocketService.off('PIN_UPDATE');
    SocketService.off('conversation_marked_read');
    SocketService.off('notification:new');
    SocketService.off('security_alert');
    SocketService.off('call:incoming');
    SocketService.off('call:dismiss');
    SocketService.off('call:accept');
    SocketService.off('call:reject');
    SocketService.off('call:hangup');
    SocketService.off('call:timeout');
    SocketService.off('call:handled_elsewhere');
    SocketService.off('call:upgrade_request');
    SocketService.off('call:upgrade_accepted');
    SocketService.off('call:upgrade_declined');

    SocketService.on('force_logout', (data: any) => {
      if (handleForceLogoutRef.current) {
        const currentDeviceIdRef = currentDeviceId || deviceId;
        const shouldLogout =
          data?.all === true ||
          (data?.targetDeviceId && data.targetDeviceId === currentDeviceIdRef) ||
          (data?.reason === 'SESSION_INVALIDATED');

        if (shouldLogout) handleForceLogoutRef.current(data);
      }
    });

    SocketService.on('security_alert', (data: any) => {
      pushSecurityAlert(data).catch((error) => {
        console.warn('[AUTH] Failed to persist security alert', error?.message);
      });
    });

    SocketService.on('profile_update', (data: any) => {
      if (data && data.profile) updateUser(data.profile);
    });

    SocketService.on('receiveMessage', (data: any) => {
      useChatStore.getState().addMessage(data);
    });

    SocketService.on('message_patched', (data: any) => {
      if (data && data.message) {
        useChatStore.getState().updateMessage(data.message.id, data.message);
        if (data.message.pinnedMessageIds) {
          useChatStore.getState().setConversations((prev: any[]) => 
            prev.map((c: any) => c.id === data.convId ? { ...c, pinnedMessageIds: data.message.pinnedMessageIds } : c)
          );
        }
      }
    });

    SocketService.on('PIN_UPDATE', (data: any) => {
      const convId = data.conversationId || data.convId;
      if (convId && data.pinnedMessageIds) {
        useChatStore.getState().setConversations((prev: any[]) => 
          prev.map((c: any) => c.id === convId ? { ...c, pinnedMessageIds: data.pinnedMessageIds } : c)
        );
      }
    });

    SocketService.on('conversation_marked_read', (data: any) => {
      if (data && data.convId) {
        useChatStore.getState().markReadLocal(data.convId);
      }
    });

    SocketService.on('notification:new', (data: any) => {
      useChatStore.getState().addNotification(data);
    });

    SocketService.on('CALL_ENDED', (data: any) => {
      const { hangupCall, activeCallId } = useCallStore.getState();
      console.log('[SOCKET] CALL_ENDED received:', data);
      if (SocketService.socket && activeCallId === data.callId) {
        hangupCall();
        if (chimeRef.current) {
          chimeRef.current.cleanup();
        }
      }
    });

    SocketService.on('call:incoming', (data: any) => {
      const { callState, activeCallId, receiveIncomingCall } = useCallStore.getState();
      if (callState !== 'IDLE') {
        if (activeCallId !== data.callId) {
          SocketService.socket?.emit('call:reject', {
            convId: data.convId,
            callId: data.callId,
            fromEmail: user?.email,
            toEmail: data.fromEmail,
            reason: 'BUSY'
          });
        }
        return;
      }
      receiveIncomingCall(data.callerProfile, data.callType, data.convId, data.callId);
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = setTimeout(() => {
        const state = useCallStore.getState();
        if (state.callState === 'RINGING' && state.activeCallId === data.callId) {
          SocketService.socket?.emit('call:reject', {
            convId: data.convId, callId: data.callId, toEmail: data.fromEmail, reason: 'NO_ANSWER',
          });
          useCallStore.getState().resetCall();
        }
        callTimeoutRef.current = null;
      }, 30000);
    });

    SocketService.on('call:dismiss', (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup('Socket-call:dismiss');
        useCallStore.getState().resetCall();
      }
    });

    SocketService.on('call:accept', (data: any) => {
      console.log('[SOCKET] call:accept received:', data);
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        useCallStore.getState().acceptCall(data.meetingInfo || {});
      }
    });

    SocketService.on('call:reject', (data: any) => {
      console.log('[SOCKET] call:reject received:', data);
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup('Socket-call:reject');
        useCallStore.getState().rejectCall();
      }
    });

    SocketService.on('call:hangup', (data: any) => {
      console.log('[SOCKET] call:hangup received:', data);
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup('Socket-call:hangup');
        useCallStore.getState().hangupCall();
      }
    });

    SocketService.on('call:timeout', (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (state.callState === 'CONNECTED' || state.callState === 'JOINING') return;
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup('Socket-call:timeout');
        useCallStore.getState().rejectCall();
      }
    });

    SocketService.on('call:handled_elsewhere', (data: any) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          useCallStore.getState().resetCall();
        }
    });

    SocketService.on('call:upgrade_request', (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        state.setIncomingUpgradeRequest(true);
        state.setUpgradeRequesterEmail(data.fromProfile?.email ?? null);
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = setTimeout(() => {
           const currentState = useCallStore.getState();
           if (currentState.incomingUpgradeRequest && currentState.activeCallId === data.callId) {
             currentState.setIncomingUpgradeRequest(false);
             SocketService.socket?.emit('call:upgrade_declined', {
               convId: data.convId, callId: data.callId, toEmail: data.fromProfile?.email || currentState.caller?.email || currentState.receiver?.email
             });
           }
        }, 20000);
      }
    });

    SocketService.on('call:upgrade_accepted', async (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        state.setCallType('video');
        state.setRemoteCameraOn(true);
        state.setCameraOn(true);
        state.setUpgradeRequestPending(false);
      }
    });

    SocketService.on('call:upgrade_declined', (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        state.setUpgradeRequestPending(false);
        Alert.alert('Từ chối', 'Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.');
      }
    });
  }, [deviceId, user?.email]);

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

        if (savedUser && savedToken) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setToken(savedToken);
          useChatStore.getState().setCurrentUserEmail(parsedUser.email);

          const currentDeviceId = savedDeviceId || await getDeviceId();
          SocketService.connect(parsedUser.email, currentDeviceId, savedToken);

          apiRequest('/auth/sessions').catch(err => {
            if (err.message === 'SESSION_INVALIDATED') handleForceLogout();
          });

          setupSocketListeners(currentDeviceId);
        } else if (savedToken) {
          setToken(savedToken);
          try {
            const res = await apiRequest('/users/profile');
            if (res.ok && res.profile) {
              await login(res.profile, savedToken, savedDeviceId || await getDeviceId());
            } else if (savedPending) {
              setPendingGoogleUser(JSON.parse(savedPending));
            }
          } catch (err: any) {
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

    loadSession();

    const handleAppStateChange = async (nextAppState: any) => {
      if (nextAppState === 'active') checkSessionStatus();
    };

    const subscription = require('react-native').AppState.addEventListener('change', handleAppStateChange);

    return () => {
      SocketService.off('force_logout');
      SocketService.off('profile_update');
      SocketService.off('notification:new');
      SocketService.off('security_alert');
      SocketService.off('call:incoming');
      SocketService.off('call:dismiss');
      SocketService.off('call:accept');
      SocketService.off('call:reject');
      SocketService.off('call:hangup');
      SocketService.off('call:timeout');
      SocketService.off('call:handled_elsewhere');
      SocketService.off('call:upgrade_request');
      SocketService.off('call:upgrade_accepted');
      SocketService.off('call:upgrade_declined');
      subscription.remove();
    };
  }, [setupSocketListeners, handleForceLogout]);

  const login = async (userData: any, accessToken: string, currentDeviceId: string) => {
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    await AsyncStorage.setItem('token', accessToken);
    await AsyncStorage.setItem('deviceId', currentDeviceId);
    setUser(userData);
    setToken(accessToken);
    setDeviceId(currentDeviceId);
    setProfileVersion(Date.now());
    useChatStore.getState().setCurrentUserEmail(userData.email);
    SocketService.connect(userData.email, currentDeviceId, accessToken);
    setupSocketListeners(currentDeviceId);
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

  const updateUser = async (userData: any) => {
    setUser((prevUser: any) => ({ ...prevUser, ...userData }));
    const saved = await AsyncStorage.getItem('user');
    if (saved) {
      const current = JSON.parse(saved);
      await AsyncStorage.setItem('user', JSON.stringify({ ...current, ...userData }));
    }
    setProfileVersion(Date.now());
  };

  const loginGoogle = async (token: string, pendingData: any, currentDeviceId: string) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('deviceId', currentDeviceId);
    setToken(token);
    setDeviceId(currentDeviceId);

    if (pendingData) {
      await AsyncStorage.setItem('pendingGoogleUser', JSON.stringify(pendingData));
      setPendingGoogleUser(pendingData);
    }
  };

  const completeGoogleProfile = async (userData: any, accessToken: string, currentDeviceId: string) => {
    await AsyncStorage.removeItem('pendingGoogleUser');
    setPendingGoogleUser(null);
    await login(userData, accessToken, currentDeviceId);
  };

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout, updateUser,
      profileVersion, handleForceLogout, deviceId, checkSessionStatus,
      pendingGoogleUser, loginGoogle, completeGoogleProfile,
      requestLockAccount: async (p: string) => apiRequest('/auth/lock-account/request', { method: 'POST', body: JSON.stringify({ currentPassword: p }) }),
      confirmLockAccount: async (otp: string) => { await apiRequest('/auth/lock-account/confirm', { method: 'POST', body: JSON.stringify({ otp }) }); logout(); },
      requestDeleteAccount: async (p: string) => apiRequest('/auth/delete-account/request', { method: 'POST', body: JSON.stringify({ currentPassword: p }) }),
      confirmDeleteAccount: async (otp: string) => { await apiRequest('/auth/delete-account/confirm', { method: 'POST', body: JSON.stringify({ otp }) }); logout(); },
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
