import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Shadows, Typography } from '../constants/Theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}

export default function Button({ 
  title, 
  onPress, 
  variant = 'primary', 
  size = 'medium', 
  disabled = false, 
  icon,
  style 
}: ButtonProps) {
  
  const renderContent = () => (
    <View style={styles.content}>
      {icon && <Text style={[styles.icon, styles[`${variant}Text`]]}>{icon}</Text>}
      <Text style={[styles.text, styles[`${size}Text`], styles[`${variant}Text`]]}>{title}</Text>
    </View>
  );

  if (variant === 'primary' && !disabled) {
    return (
      <TouchableOpacity 
        onPress={onPress} 
        activeOpacity={0.8}
        style={[styles.button, style]}
      >
        <LinearGradient
          colors={['#00418f', '#002d63']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, styles[size]]}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.button,
        styles[variant],
        styles[size],
        disabled && styles.disabled,
        style
      ]}
    >
      {renderContent()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Shadows.soft,
  },
  gradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  danger: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  disabled: {
    opacity: 0.5,
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  small: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  large: {
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  text: {
    ...Typography.label,
    fontWeight: '700',
    textAlign: 'center',
  },
  smallText: { fontSize: 13 },
  mediumText: { fontSize: 15 },
  largeText: { fontSize: 17 },
  primaryText: { color: '#fff' },
  secondaryText: { color: '#1e293b' },
  outlineText: { color: Colors.primary },
  dangerText: { color: '#dc2626' },
  icon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
  },
} as any);
