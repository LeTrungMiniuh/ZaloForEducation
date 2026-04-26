import React, { useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { Colors, Typography, Shadows } from '../../constants/Theme';

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
      <Text style={styles.forgotPasswordText}>Forgot password?</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Portal Login</Text>
              <Text style={styles.subtitle}>Please log in to your account or request magic link</Text>
            </View>

            <View style={styles.form}>
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

            <View style={styles.footer}>
              <Text style={styles.footerText}>New to the portal? </Text>
              <TouchableOpacity>
                 <Text style={styles.registerText}>Register now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f3f4f6', // gray-100
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    ...Shadows.medium,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    ...Typography.heading,
    fontSize: 30,
    color: '#111827', // gray-900
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    fontSize: 14,
    color: '#6b7280', // gray-500
  },
  form: {
    gap: 16,
  },
  forgotPasswordText: {
    fontSize: 12,
    color: '#2563eb', // blue-600
    fontWeight: '600',
  },
  footer: {
    marginTop: 32,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
  },
  registerText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '700',
  },
});
