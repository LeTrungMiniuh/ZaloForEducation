import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

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

function TabNavigator({ onLogout }: { onLogout: any }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Messages">
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'messages' }} />}
      </Tab.Screen>
      <Tab.Screen name="Contacts">
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'contacts' }} />}
      </Tab.Screen>
      <Tab.Screen name="Timeline">
        {(props) => <HomeScreen {...props} onNavigate={(s: string, p: any) => props.navigation.navigate(s, p)} params={{ tab: 'timeline' }} />}
      </Tab.Screen>
      <Tab.Screen name="ProfileTab">
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
          <Stack.Screen name="Notifications" component={wrapModularScreen(NotificationScreen)} />
          <Stack.Screen name="Search" component={wrapModularScreen(SearchScreen)} />
          <Stack.Screen name="Profile" component={wrapModularScreen(ProfileScreen, { onLogout })} />
          <Stack.Screen name="QRScanner" component={wrapModularScreen(QRScannerScreen)} />
          <Stack.Screen name="StatusPicker" component={wrapModularScreen(StatusPickerScreen)} />
          <Stack.Screen name="ProfileMore" component={wrapModularScreen(ProfileMoreScreen)} />
          <Stack.Screen name="Settings" component={wrapModularScreen(SettingsScreen, { onLogout })} />
          <Stack.Screen name="ChangePassword" component={wrapModularScreen(ChangePasswordScreen)} />
        </Stack.Group>
      )}
    </Stack.Navigator>
  );
}
