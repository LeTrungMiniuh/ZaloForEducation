import React from 'react';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Theme';

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
import CreateGroupComponent from '../screens/main/CreateGroup';
import SecurityAlertsScreen from '../screens/main/SecurityAlertsScreen';
import InChatSearchScreen from '../screens/main/InChatSearchScreen';

// Profile Screens
import ProfileScreen from '../screens/profile/ProfileScreen';
import QRScannerScreen from '../screens/profile/QRScannerScreen';
import StatusPickerScreen from '../screens/profile/StatusPickerScreen';
import ProfileMoreScreen from '../screens/profile/ProfileMoreScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function wrapModularScreen(Component: any, extraProps: any = {}) {
  return (props: any) => (
    <Component
      {...extraProps}
      onNavigate={(screen: string, params: any) => props.navigation.navigate(screen, params)}
      goBack={() => props.navigation.goBack()}
      params={props.route?.params}
      {...props}
    />
  );
}

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
        options={{ tabBarLabel: 'Tin nhắn' }}
      >
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'messages' }} />}
      </Tab.Screen>
      <Tab.Screen
        name="Contacts"
        options={{ tabBarLabel: 'Danh bạ' }}
      >
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'contacts' }} />}
      </Tab.Screen>
      <Tab.Screen
        name="AI"
        options={{ tabBarLabel: 'AI Assistant' }}
      >
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'ai' }} />}
      </Tab.Screen>
      <Tab.Screen
        name="ProfileTab"
        options={{ tabBarLabel: 'Cá nhân' }}
      >
        {(props) => <ProfileScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} goBack={() => props.navigation.goBack()} onLogout={onLogout} params={props.route.params} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function RootNavigator({ user, onLogout }: { user: any; onLogout: any }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Group>
          <Stack.Screen name="Login" component={wrapModularScreen(LoginScreen)} />
          <Stack.Screen name="Register" component={wrapModularScreen(RegisterScreen)} />
          <Stack.Screen name="Forgot" component={wrapModularScreen(ForgotPasswordScreen)} />
          <Stack.Screen name="ResetPassword" component={wrapModularScreen(ResetPasswordScreen)} />
          <Stack.Screen name="LoginOtp" component={wrapModularScreen(LoginOtpScreen)} />
        </Stack.Group>
      ) : (
        <Stack.Group>
          <Stack.Screen name="Main">
            {(props) => <TabNavigator {...props} onLogout={onLogout} />}
          </Stack.Screen>
          <Stack.Screen name="Chat" component={wrapModularScreen(ChatScreen)} />
          <Stack.Screen name="Sessions" component={wrapModularScreen(SessionsScreen)} />
          <Stack.Screen name="SecurityAlerts" component={wrapModularScreen(SecurityAlertsScreen)} />
          <Stack.Screen name="Notifications" component={wrapModularScreen(NotificationScreen)} />
          <Stack.Screen name="Search" component={wrapModularScreen(SearchScreen)} />
          <Stack.Screen name="Profile" component={wrapModularScreen(ProfileScreen, { onLogout })} />
          <Stack.Screen name="QRScanner" component={wrapModularScreen(QRScannerScreen)} />
          <Stack.Screen name="StatusPicker" component={wrapModularScreen(StatusPickerScreen)} />
          <Stack.Screen name="ProfileMore" component={wrapModularScreen(ProfileMoreScreen)} />
          <Stack.Screen name="Settings" component={wrapModularScreen(SettingsScreen, { onLogout })} />
          <Stack.Screen name="ChangePassword" component={wrapModularScreen(ChangePasswordScreen)} />
          <Stack.Screen name="ChatDetails" component={wrapModularScreen(ChatDetailsScreen)} />
          <Stack.Screen name="ChatGallery" component={wrapModularScreen(ChatGalleryScreen)} />
          <Stack.Screen name="CreateGroup" component={wrapModularScreen(CreateGroupComponent)} />
          <Stack.Screen name="InChatSearch" component={wrapModularScreen(InChatSearchScreen)} />
          <Stack.Screen name="MediaDetail" component={wrapModularScreen(MediaDetailScreen)} options={{ animation: 'fade' }} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
