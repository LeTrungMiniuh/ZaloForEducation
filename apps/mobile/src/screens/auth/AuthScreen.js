import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    // API Code
    alert(`Attempting login with: ${email}`);
  };

  const handleMagicLink = () => {
    alert("Gửi thư Magic link vào email " + email);
  }

  const ForgotPasswordLink = () => (
    <TouchableOpacity onPress={handleMagicLink}>
      <Text className="text-xs text-blue-600 font-semibold">Forgot password?</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-100 dark:bg-gray-900">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}>
          <View className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 w-full max-w-md mx-auto">
            <View className="mb-8">
              <Text className="text-3xl font-bold text-gray-900 dark:text-white mb-2 font-display">Portal Login</Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400">Please log in to your account or request magic link</Text>
            </View>

            <View className="space-y-6">
              <Input
                label="University Email"
                placeholder="student.name@university.edu"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />

              <Input
                label="Password"
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                rightElement={<ForgotPasswordLink />}
              />

              <Button title="Sign In" onPress={handleLogin} variant="primary" />
              <Button title="Gửi Magic Link OTP Tới Gmail" onPress={handleMagicLink} variant="secondary" />
            </View>

            <View className="mt-8 items-center flex-row justify-center">
              <Text className="text-sm text-gray-500 dark:text-gray-400">New to the portal? </Text>
              <TouchableOpacity>
                 <Text className="text-sm text-blue-600 font-bold">Register now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
