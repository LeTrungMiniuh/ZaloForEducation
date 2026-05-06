import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform, View, Text, Image, AppState, NativeModules } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Alert from '../utils/Alert';
import SocketService from '../utils/socket';
import { getDeviceId } from '../utils/deviceId';
import { apiRequest } from '../utils/api';
import { useCallStore } from '../store/callStore';
import { useChatStore } from '../store/chatStore';
import { chimeRef } from '../utils/chimeRef';
import { pushSecurityAlert } from '../utils/securityAlerts';
import { dismissNotificationsByConversation, scheduleReminderNotification } from '../utils/reminderNotifications';


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
  isDataLoaded: boolean;
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
  const [isDataLoaded, setIsDataLoaded] = useState(false);

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

  const preloadAppData = useCallback(async (currentUser: any) => {
    if (!currentUser) {
      setIsDataLoaded(true);
      return;
    }

    try {
      console.log('🚀 [PRELOAD] Starting data preload for:', currentUser.email);
      const chatStore = useChatStore.getState();
      
      // 1. Initialize Socket
      const dId = deviceId || await AsyncStorage.getItem('deviceId') || await getDeviceId();
      SocketService.connect(currentUser.email, dId);
      
      // 2. Fetch Conversations
      const convs = await chatStore.fetchConversations();
      console.log(`🚀 [PRELOAD] Fetched ${convs.length} conversations`);

      // 3. Extract member emails to fetch profiles
      const memberEmails = new Set<string>();
      convs.forEach(c => {
        if (Array.isArray(c.members)) {
          c.members.forEach((m: string) => {
            if (m.toLowerCase() !== currentUser.email.toLowerCase()) {
              memberEmails.add(m.toLowerCase());
            }
          });
        }
      });

      // 4. Fetch missing profiles in batch
      if (memberEmails.size > 0) {
        console.log(`🚀 [PRELOAD] Fetching profiles for ${memberEmails.size} members`);
        await chatStore.loadMultipleProfiles(Array.from(memberEmails));
      }

      // 5. Prefetch Avatars (Current user + Partners)
      const avatarsToPrefetch = new Set<string>();
      if (currentUser.avatarUrl) avatarsToPrefetch.add(currentUser.avatarUrl);
      
      const updatedProfiles = useChatStore.getState().userProfiles;
      Object.values(updatedProfiles).forEach((p: any) => {
        if (p?.avatarUrl) avatarsToPrefetch.add(p.avatarUrl);
        if (p?.avatar) avatarsToPrefetch.add(p.avatar);
      });

      console.log(`🚀 [PRELOAD] Prefetching ${avatarsToPrefetch.size} avatars`);
      const images = Array.from(avatarsToPrefetch).map(url => {
        const fullUrl = url.startsWith('http') ? url : `${process.env.EXPO_PUBLIC_API_URL}${url}`;
        return Image.prefetch(fullUrl).catch(e => console.warn('[PRELOAD] Avatar prefetch failed', url));
      });
      await Promise.allSettled(images);

      console.log('✅ [PRELOAD] Data preload complete');
    } catch (err) {
      console.error('❌ [PRELOAD] Data preload failed:', err);
    } finally {
      setIsDataLoaded(true);
    }
  }, []);

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
      const chatStore = useChatStore.getState();
      chatStore.addMessage(data);

      const convId = data.conversationId || data.convId;
      const isActiveChat = chatStore.activeConvId === convId;

      // [SENIOR] Update the conversation list (preview + unread count)
      chatStore.upsertConversationLastMessage(convId, data);

      // [SENIOR] If this is the active chat, clear any pending notifications for it immediately
      if (isActiveChat && AppState.currentState === 'active') {
        dismissNotificationsByConversation(convId).catch(() => {});
      }

      // [NHẮC HẸN] Handle auto-scheduling if it's a reminder
      const reminder = data.reminder || data.payload?.reminder;
      if (reminder) {
        scheduleReminderNotification({
          ...reminder,
          conversationId: convId,
        }).catch((err) => {
          console.warn('[AUTH] Auto-scheduling reminder failed:', err.message);
        });
      }

      // Notification logic: Trigger if app is in background OR user is in a different chat
      const isMe = String(data.senderId || '').replace(/^USER#/, "").trim().toLowerCase() === String(user?.email || '').trim().toLowerCase();
      
      if ((AppState.currentState !== 'active' || !isActiveChat) && !isMe) {
        const getProfileName = (email: string) => {
          if (!email) return 'Người dùng';
          const profiles = chatStore.userProfiles;
          const norm = String(email).replace(/^USER#/, "").trim().toLowerCase();
          const p = profiles[norm] || profiles[email];
          return p?.nickname || p?.fullName || p?.fullname || norm.split('@')[0];
        };
        const senderName = getProfileName(data.senderId);
        const content = data.content || 'Đã gửi một tin nhắn';
        
        Notifications.scheduleNotificationAsync({
          content: {
            title: `Tin nhắn từ ${senderName}`,
            body: content,
            sound: true,
            data: { convId },
          },
          trigger: null,
        });
      }
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
        useChatStore.getState().updateConversationById(convId, {
          pinnedMessageIds: data.pinnedMessageIds
        });
      }
    });

    SocketService.on('conversation_marked_read', (data: any) => {
      if (data && data.convId) {
        useChatStore.getState().markReadLocal(data.convId);
      }
    });

    SocketService.on('conversation:updated', (data: any) => {
      const { convId, updates } = data;
      if (convId && updates) {
        useChatStore.getState().setConversations((prev: any[]) => 
          prev.map((c: any) => c.id === convId ? { ...c, ...updates } : c)
        );
      }
    });

    SocketService.on('notification:new', (data: any) => {
      useChatStore.getState().addNotification(data);
    });

    SocketService.on('CALL_ENDED', (data: any) => {
      const { hangupCall, activeCallId } = useCallStore.getState();
      console.log('[SOCKET] CALL_ENDED received:', data);
      if (SocketService.socket && activeCallId === data.callId) {
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
          NativeModules.ChimeModule.clearWakeUpScreen();
        }
        Notifications.dismissAllNotificationsAsync();
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

      if (AppState.currentState !== 'active') {
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.wakeUpScreen) {
          NativeModules.ChimeModule.wakeUpScreen();
        }
        
        const getProfileName = (email: string) => {
          if (!email) return 'Người dùng';
          const profiles = useChatStore.getState().userProfiles;
          const norm = String(email).replace(/^USER#/, "").trim().toLowerCase();
          const p = profiles[norm] || profiles[email];
          return p?.nickname || p?.fullName || p?.fullname || norm.split('@')[0];
        };
        const callerName = data.callerProfile?.fullName || getProfileName(data.fromEmail);

        Notifications.scheduleNotificationAsync({
          content: {
            title: `Cuộc gọi ${data.callType === 'video' ? 'video' : 'thoại'} đến`,
            body: `${callerName} đang gọi cho bạn...`,
            sound: true,
            data: { callId: data.callId, convId: data.convId },
            categoryIdentifier: 'incoming_call',
            autoDismiss: false,
            sticky: true,
            vibrate: [0, 500, 1000, 500, 1000, 500],
          },
          trigger: null,
        });
      }

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
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
          NativeModules.ChimeModule.clearWakeUpScreen();
        }
        Notifications.dismissAllNotificationsAsync();
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup();
        useCallStore.getState().resetCall();
      }
    });

    SocketService.on('call:accept', async (data: any) => {
      console.log('[SOCKET] call:accept received:', data);
      const store = useCallStore.getState();
      
      // Chỉ xử lý nếu Mobile là Caller (isIncoming = false)
      if (data.callId !== store.activeCallId) return;
      if (store.isIncoming) return; // Bỏ qua nếu là Callee
      
      // Mobile Caller nhận call:accept -> peer đã chấp nhận, Caller bắt đầu media
      // Dùng attendee đã tạo từ lúc /call/create (không gọi /call/join nữa)
      console.log('[Socket] call:accept — Peer accepted. Starting media.');
      store.acceptCall(store.meetingData ? undefined : (data.meetingInfo || {}));
    });

    SocketService.on('call:reject', (data: any) => {
      console.log('[SOCKET] call:reject received:', data);
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
          NativeModules.ChimeModule.clearWakeUpScreen();
        }
        Notifications.dismissAllNotificationsAsync();
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup();
        useCallStore.getState().rejectCall();
      }
    });

    SocketService.on('call:hangup', (data: any) => {
      console.log('[SOCKET] call:hangup received:', data);
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
          NativeModules.ChimeModule.clearWakeUpScreen();
        }
        Notifications.dismissAllNotificationsAsync();
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup();
        useCallStore.getState().hangupCall();
      }
    });

    SocketService.on('call:timeout', (data: any) => {
      const state = useCallStore.getState();
      if (state.activeCallId === data.callId) {
        if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
          NativeModules.ChimeModule.clearWakeUpScreen();
        }
        Notifications.dismissAllNotificationsAsync();
        if (state.callState === 'CONNECTED' || state.callState === 'JOINING') return;
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
        chimeRef.current?.cleanup();
        useCallStore.getState().rejectCall();
      }
    });

    SocketService.on('call:handled_elsewhere', (data: any) => {
        const state = useCallStore.getState();
        if (state.activeCallId === data.callId) {
          if (Platform.OS === 'android' && NativeModules.ChimeModule?.clearWakeUpScreen) {
            NativeModules.ChimeModule.clearWakeUpScreen();
          }
          Notifications.dismissAllNotificationsAsync();
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
          await preloadAppData(parsedUser);

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
            if (res.ok && res.data?.profile) {
              const profile = res.data.profile;
              await login(profile, savedToken, savedDeviceId || await getDeviceId());
              await preloadAppData(profile);
            } else {
              setIsDataLoaded(true);
              if (savedPending) setPendingGoogleUser(JSON.parse(savedPending));
            }
          } catch (err: any) {
            console.warn('[AUTH] Session recovery failed:', err.message);
            setIsDataLoaded(true);
            if (savedPending) setPendingGoogleUser(JSON.parse(savedPending));
          }
        } else {
          setIsDataLoaded(true);
          if (savedPending) setPendingGoogleUser(JSON.parse(savedPending));
        }
      } catch (e) {
        console.error('[AUTH_CONTEXT] Error loading session:', e);
        setIsDataLoaded(true);
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    const handleAppStateChange = async (nextAppState: any) => {
      if (nextAppState === 'active') checkSessionStatus();
    };

    const subscription = require('react-native').AppState.addEventListener('change', handleAppStateChange);

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      // Xóa thông báo ngay khi có tương tác (Nghe, Từ chối, hoặc bấm thẳng vào thông báo)
      Notifications.dismissAllNotificationsAsync();
      
      if (response.actionIdentifier === 'REJECT') {
        const { callId, convId } = response.notification.request.content.data as any;
        const state = useCallStore.getState();
        if (state.activeCallId === callId) {
          SocketService.socket?.emit('call:reject', {
            convId,
            callId,
            reason: 'BUSY'
          });
          useCallStore.getState().rejectCall();
        }
      }
    });

    return () => {
      SocketService.off('force_logout');
      SocketService.off('profile_update');
      SocketService.off('receiveMessage');
      SocketService.off('message_patched');
      SocketService.off('PIN_UPDATE');
      SocketService.off('conversation_marked_read');
      SocketService.off('conversation:updated');
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
      responseListener.remove();
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
      pendingGoogleUser, loginGoogle, completeGoogleProfile, isDataLoaded,
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
