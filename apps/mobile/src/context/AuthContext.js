import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Alert from '../utils/Alert';
import SocketService from '../utils/socket';
import { getDeviceId } from '../utils/deviceId';
import { apiRequest } from '../utils/api';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { chimeRef } from '../utils/chimeRef';
import { pushSecurityAlert } from '../utils/securityAlerts';

const AuthContext = createContext();

export const AuthProvider = ({ children, onForceLogoutNavigate }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [profileVersion, setProfileVersion] = useState(Date.now());
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null);

  const isKickingRef = useRef(false);
  const callTimeoutRef = useRef(null);

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
          useChatStore.getState().setCurrentUserEmail(parsedUser.email);

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

      SocketService.on('security_alert', (data) => {
        pushSecurityAlert(data).catch((error) => {
          console.warn('[AUTH] Failed to persist security alert', error?.message);
        });
      });

      SocketService.on('profile_update', (data) => {
        if (data && data.profile) updateUser(data.profile);
      });

      // [CORE CHAT SYNC]
      SocketService.on('receiveMessage', (data) => {
        const store = useChatStore.getState();
        store.addMessage(data);
      });

      SocketService.on('message_patched', (data) => {
        if (data && data.message) {
          useChatStore.getState().updateMessage(data.message.id, data.message);
        }
      });

      SocketService.on('conversation_marked_read', (data) => {
        if (data && data.convId) {
          useChatStore.getState().markReadLocal(data.convId);
        }
      });

      SocketService.on('typing_update', (data) => {
        // Typing updates are usually screen-specific, but can be emitted as events
        // If we want to support typing indicators in the Inbox list, we handle it here.
        // For now, we emit a CustomEvent or similar for Screen-level hooks.
      });

      // [NEW: NOTIFICATION FEATURE]
      SocketService.on('notification:new', (data) => {
        console.log('[AUTH] New notification received:', data);
        const { addNotification } = useChatStore.getState();
        addNotification(data);
      });

      SocketService.on('security_alert', (data) => {
        console.log('[AUTH] Security alert received:', data);
        const { addNotification } = useChatStore.getState();
        addNotification({
          ...data,
          type: 'security'
        });
        pushSecurityAlert(data).catch(err => {
          console.warn('[AUTH] Failed to save security alert:', err.message);
        });
      });

      // ===== CALL SIGNALING =====
      
      SocketService.on('call:incoming', (data) => {
        const { callState, activeCallId, receiveIncomingCall } = useCallStore.getState();
        
        // Auto-reject if already in a call (and not the same callId)
        if (callState !== 'IDLE') {
          if (activeCallId === data.callId) {
            console.log('[AUTH] Duplicate incoming signal for same callId, ignoring:', data.callId);
            return;
          }
          console.warn('[AUTH] Busy: auto-rejecting call info from', data.fromEmail);
          SocketService.socket.emit('call:reject', {
            convId: data.convId,
            callId: data.callId,
            fromEmail: user?.email,
            toEmail: data.fromEmail,
            reason: 'BUSY'
          });
          return;
        }

        console.log('[AUTH] Incoming call from:', data.callerProfile?.fullName, '| CallId:', data.callId);
        receiveIncomingCall(data.callerProfile, data.callType, data.convId, data.callId, data.engine);

        // Start 30s timeout
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = setTimeout(() => {
          console.log('[AUTH] Call timeout (30s) reached');
          const state = useCallStore.getState();
          if (state.callState === 'RINGING' && state.activeCallId === data.callId) {
            SocketService.socket?.emit('call:reject', {
              convId: data.convId,
              callId: data.callId,
              toEmail: data.fromEmail,
              reason: 'NO_ANSWER',
            });
            useCallStore.getState().resetCall();
          }
          callTimeoutRef.current = null;
        }, 30000);
      });

      SocketService.on('call:dismiss', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call dismissed (reason:', data.reason + ')');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          chimeRef.current?.cleanup();
          useCallStore.getState().resetCall();
        }
      });

      SocketService.on('call_handled_elsewhere', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call handled on another device, cleaning up.');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          chimeRef.current?.cleanup();
          useCallStore.getState().resetCall();
        }
      });

      SocketService.on('call:accept', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call accepted by peer');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          
          useCallStore.getState().acceptCall(data.meetingInfo || {});
          // [MIGRATED] Chime starts automatically via useChime effect when meetingData is populated.
        }
      });

      SocketService.on('call:reject', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call rejected by peer');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          chimeRef.current?.cleanup();
          useCallStore.getState().rejectCall();
        }
      });

      SocketService.on('call:hangup', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Peer hung up');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          chimeRef.current?.cleanup();
          useCallStore.getState().hangupCall();
        }
      });

      SocketService.on('call:timeout', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          // [SENIOR] Protect active call from accidental timeout signals
          if (state.callState === 'CONNECTED' || state.callState === 'JOINING') {
            console.log('[AUTH] call:timeout ignored — call is already active/joining');
            return;
          }
          console.log('[AUTH] Call timed out on peer side');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          chimeRef.current?.cleanup();
          useCallStore.getState().rejectCall();
        }
      });

      // [SENIOR] Sync dismiss signal from other devices
      SocketService.on('call:handled_elsewhere', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call handled on another device, silencing this one');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          // [CRITICAL] Just reset the UI state, DO NOT emit hangup/reject signals back!
          useCallStore.getState().resetCall();
        }
      });

      SocketService.on('call:dismiss', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Call dismissed elsewhere');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = null;
          useCallStore.getState().resetCall();
        }
      });

      // ===== UPGRADE FLOW =====
      SocketService.on('call:upgrade_request', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Peer requested video upgrade');
          state.setIncomingUpgradeRequest(true);
          state.setUpgradeRequesterEmail(data.fromProfile?.email ?? null);
          
          // [SENIOR] 20s receiver-side timeout
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = setTimeout(() => {
             const currentState = useCallStore.getState();
             if (currentState.incomingUpgradeRequest && currentState.activeCallId === data.callId) {
               console.log('[AUTH] Upgrade request timed out on receiver side');
               currentState.setIncomingUpgradeRequest(false);
               SocketService.socket?.emit('call:upgrade_declined', {
                 convId: data.convId,
                 callId: data.callId,
                 toEmail: data.fromProfile?.email || currentState.caller?.email || currentState.receiver?.email
               });
             }
          }, 20000);
        }
      });

      SocketService.on('call:upgrade_accepted', async (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Peer accepted video upgrade');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          
          state.setCallType('video');
          state.setRemoteCameraOn(true);
          state.setCameraOn(true); // [SENIOR] Triggers UI Hardware Effect
          state.setUpgradeRequestPending(false);
        }
      });

      SocketService.on('call:upgrade_declined', (data) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          console.log('[AUTH] Peer declined video upgrade');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          state.setUpgradeRequestPending(false);
          Alert.alert('Từ chối', 'Đối phương đã từ chối yêu cầu bật Video hoặc không phản hồi.');
        }
      });
    };

    loadSession();

    const handleAppStateChange = async (nextAppState) => {
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
  }, []);

  const login = async (userData, accessToken, currentDeviceId) => {
    await AsyncStorage.setItem('user', JSON.stringify(userData));
    await AsyncStorage.setItem('token', accessToken);
    await AsyncStorage.setItem('deviceId', currentDeviceId);
    setUser(userData);
    setToken(accessToken);
    setDeviceId(currentDeviceId);
    setProfileVersion(Date.now());
    useChatStore.getState().setCurrentUserEmail(userData.email);
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
