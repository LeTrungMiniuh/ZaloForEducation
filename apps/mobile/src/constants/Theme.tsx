import { Platform } from 'react-native';

export const Colors = {
  primary: '#00418f',
  onPrimary: '#ffffff',
  primaryContainer: '#0058bc',
  onPrimaryContainer: '#c3d4ff',

  secondary: '#4b5e86',
  onSecondary: '#ffffff',
  secondaryContainer: '#bed2ff',
  onSecondaryContainer: '#475981',

  tertiary: '#782c00',
  onTertiary: '#ffffff',
  tertiaryContainer: '#9e3d00',
  onTertiaryContainer: '#ffc9b2',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  background: '#f7f9fb',
  onBackground: '#191c1e',
  surface: '#f7f9fb',
  onSurface: '#191c1e',

  surfaceVariant: '#e0e3e5',
  onSurfaceVariant: '#424753',
  outline: '#727784',
  outlineVariant: '#c2c6d5',

  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f6',
  surfaceContainer: '#eceef0',
  surfaceContainerHigh: '#e6e8ea',
  surfaceContainerHighest: '#e0e3e5',
  surfaceDim: '#d8dadc',
};

// Platform-aware shadows:
//  • Web (react-native-web ≥0.20): only boxShadow is accepted (shadow* props are deprecated)
//  • Native (iOS/Android): shadow* props + elevation
export const Shadows = {
  soft: Platform.select({
    web: { boxShadow: '0px 10px 20px rgba(0, 65, 143, 0.08)' },
    default: {
      shadowColor: '#00418f',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 3,
    },
  }),
  medium: Platform.select({
    web: { boxShadow: '0px 15px 25px rgba(0, 65, 143, 0.10)' },
    default: {
      shadowColor: '#00418f',
      shadowOffset: { width: 0, height: 15 },
      shadowOpacity: 0.1,
      shadowRadius: 25,
      elevation: 5,
    },
  }),
  glow: Platform.select({
    web: { boxShadow: '0px 8px 15px rgba(0, 65, 143, 0.25)' },
    default: {
      shadowColor: '#00418f',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 15,
      elevation: 8,
    },
  }),
  strong: Platform.select({
    web: { boxShadow: '0px 20px 40px rgba(0, 0, 0, 0.2)' },
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.2,
      shadowRadius: 40,
      elevation: 12,
    },
  }),
};

export const Typography = {
  fontFamily: 'PlusJakartaSans',
  heading: { fontFamily: 'PlusJakartaSans_800ExtraBold', letterSpacing: -0.5 },
  body: { fontFamily: 'PlusJakartaSans_500Medium' },
  label: { fontFamily: 'PlusJakartaSans_700Bold', tracking: 1 },
};
