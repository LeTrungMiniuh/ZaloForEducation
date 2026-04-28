import React, { useState, useEffect } from 'react';
import { Platform, View, Text, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import * as Font from 'expo-font';
import { 
  PlusJakartaSans_300Light, 
  PlusJakartaSans_400Regular, 
  PlusJakartaSans_500Medium, 
  PlusJakartaSans_600SemiBold, 
  PlusJakartaSans_700Bold, 
  PlusJakartaSans_800ExtraBold 
} from '@expo-google-fonts/plus-jakarta-sans';

import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from './src/navigation';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

Notifications.setNotificationCategoryAsync('incoming_call', [
  {
    identifier: 'ACCEPT',
    buttonTitle: 'Nghe',
    options: {
      opensAppToForeground: true,
    },
  },
  {
    identifier: 'REJECT',
    buttonTitle: 'Từ chối',
    options: {
      isDestructive: true,
      opensAppToForeground: false,
    },
  },
]);

import SplashScreen from './src/components/SplashScreen';
import CallOverlay from './src/components/chat/CallOverlay';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function MainApp() {
  const { user, loading: authLoading, logout, isDataLoaded } = useAuth();
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [isSplashTimeout, setIsSplashTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplashTimeout(true);
    }, 1500); // Minimum splash time
    
    Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: true,
    }).catch(err => console.warn('Audio mode set failed', err));

    // Yêu cầu quyền thông báo
    const requestPushPermissions = async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
    };
    requestPushPermissions();

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          PlusJakartaSans: PlusJakartaSans_400Regular,
          PlusJakartaSans_300Light,
          PlusJakartaSans_500Medium,
          PlusJakartaSans_600SemiBold,
          PlusJakartaSans_700Bold,
          PlusJakartaSans_800ExtraBold,
          'Material Symbols Outlined': require('./assets/fonts/MaterialSymbolsOutlined-Regular.ttf')
        });
        setFontsLoaded(true);
      } catch (e) {
        console.warn(e);
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  const isEverythingLoaded = fontsLoaded && !authLoading && isSplashTimeout && isDataLoaded;

  return (
    <NavigationContainer>
      {!isEverythingLoaded ? (
        <SplashScreen />
      ) : (
        <RootNavigator user={user} onLogout={logout} />
      )}
      <CallOverlay />
    </NavigationContainer>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider onForceLogoutNavigate={(target) => {
          console.log('🚨 [APP] Global Force Logout trigger received. Target:', target);
          // Note: With React Navigation, we'll need a navigation ref to handle this globally
        }}>
          <MainApp />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
