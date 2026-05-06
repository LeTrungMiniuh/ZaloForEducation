import React from 'react';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Theme';
import { useChatStore } from '../store/chatStore';
import { BOT_EMAIL } from '../constants/bot';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import LoginOtpScreen from '../screens/auth/LoginOtpScreen';

// Main Screens
import HomeScreen from '../screens/main/HomeScreen';
import ChatScreen from '../screens/main/ChatScreen';
import SessionsScreen from '../screens/main/SessionsScreen';
import NotificationScreen from '../screens/main/NotificationScreen';
import SearchScreen from '../screens/main/SearchScreen';
import ChatDetailsScreen from '../screens/main/ChatDetailsScreen';
import MediaDetailScreen from '../screens/main/MediaDetailScreen';
import ChatGalleryScreen from '../screens/main/ChatGalleryScreen';
import InChatSearchScreen from '../screens/main/InChatSearchScreen';
import CreateGroupComponent from '../screens/main/CreateGroup';
import SecurityAlertsScreen from '../screens/main/SecurityAlertsScreen';

// Profile Screens
import ProfileScreen from '../screens/profile/ProfileScreen';
import QRScannerScreen from '../screens/profile/QRScannerScreen';
import StatusPickerScreen from '../screens/profile/StatusPickerScreen';
import ProfileMoreScreen from '../screens/profile/ProfileMoreScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const AiChatWrapper = (props: any) => (
  <ChatScreen 
    {...props}
    onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)}
    params={{ targetEmail: 'bot@zaloedu.system' }} 
  />
);

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Text
      style={{
        fontFamily: 'Material Symbols Outlined',
        fontSize: 26,
        color: focused ? Colors.primary : '#757575',
        textAlign: 'center',
      }}
    >
      {name}
    </Text>
  );
}

function TabNavigator({ onLogout }: { onLogout: any }) {
  const insets = useSafeAreaInsets();
  const { conversations } = useChatStore();

  const totalUnread = (conversations || []).reduce((acc, conv) => {
    // Check if it's a bot conversation
    const isBot = Array.isArray(conv.members) && conv.members.some((m: string) => {
      const normalized = String(m || "").toLowerCase();
      return normalized === BOT_EMAIL || normalized.includes('bot@zaloedu.system');
    });
    if (isBot) return acc;
    return acc + (conv.unreadCount || 0);
  }, 0);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#757575',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 4,
        },
        tabBarStyle: {
          height: 65 + (insets.bottom > 0 ? insets.bottom - 10 : 10),
          paddingTop: 10,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#eee',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarIcon: ({ focused }) => {
          let iconName = 'chat';
          if (route.name === 'Messages') iconName = 'chat';
          else if (route.name === 'Contacts') iconName = 'contacts';
          else if (route.name === 'AI') iconName = 'smart_toy';
          else if (route.name === 'ProfileTab') iconName = 'person';

          return <TabIcon name={iconName} focused={focused} />;
        },
      })}
    >
      <Tab.Screen 
        name="Messages" 
        options={{ 
          tabBarLabel: 'Tin nhắn',
          tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.primary, fontSize: 10 }
        }}
      >
        {(props: any) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'messages' }} />}
      </Tab.Screen>
      <Tab.Screen name="Contacts" options={{ tabBarLabel: 'Danh bạ' }}>
        {(props: any) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'contacts' }} />}
      </Tab.Screen>
      <Tab.Screen 
        name="AI" 
        component={AiChatWrapper} 
        options={{ 
          tabBarLabel: 'AI Assistant',
        }} 
      />
      <Tab.Screen name="ProfileTab" options={{ tabBarLabel: 'Cá nhân' }}>
        {(props: any) => <ProfileScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} onLogout={onLogout} params={props.route.params} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator({ user, onLogout }: { user: any; onLogout: any }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Group>
          <Stack.Screen name="Login">
            {(props: any) => <LoginScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Register">
            {(props: any) => <RegisterScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Forgot">
            {(props: any) => <ForgotPasswordScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="ResetPassword">
            {(props: any) => <ResetPasswordScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="LoginOtp">
            {(props: any) => <LoginOtpScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Main">
            {(props) => <TabNavigator {...props} onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="Chat">
            {(props: any) => <ChatScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Sessions">
            {(props: any) => <SessionsScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="SecurityAlerts">
            {(props: any) => <SecurityAlertsScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Notifications">
            {(props: any) => <NotificationScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Search">
            {(props: any) => <SearchScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Profile">
            {(props: any) => <ProfileScreen {...props} onLogout={onLogout} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="QRScanner">
            {(props: any) => <QRScannerScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="StatusPicker">
            {(props: any) => <StatusPickerScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="ProfileMore">
            {(props: any) => <ProfileMoreScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {(props: any) => <SettingsScreen {...props} onLogout={onLogout} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="ChangePassword">
            {(props: any) => <ChangePasswordScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="ChatDetails">
            {(props: any) => <ChatDetailsScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="ChatGallery">
            {(props: any) => <ChatGalleryScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="InChatSearch">
            {(props: any) => <InChatSearchScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="CreateGroup">
            {(props: any) => <CreateGroupComponent {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
          <Stack.Screen name="MediaDetail" options={{ animation: 'fade' }}>
            {(props: any) => <MediaDetailScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} params={props.route?.params} />}
          </Stack.Screen>
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
