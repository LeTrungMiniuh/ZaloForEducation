import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions, StatusBar, Easing, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Shadows } from '../constants/Theme';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  // 1. Animated values
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(10)).current;
  const breathingScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 2. Entrance Animation Sequence
    Animated.sequence([
      // Step 1: Background fade-in
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Step 2: Logo animation (Scale bounce + Opacity)
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.poly(4)), // Smooth ease-out
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.05,
            duration: 500,
            easing: Easing.out(Easing.poly(4)),
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.poly(4)),
            useNativeDriver: true,
          }),
        ]),
      ]),
      // Step 3: Subtitle animation (Fade + Translate)
      // Note: User requested 300ms delay after logo, parallel allows us to use delay
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 600,
          delay: 300,
          useNativeDriver: true,
        }),
        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 600,
          delay: 300,
          easing: Easing.out(Easing.poly(4)),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Step 4: Start breathing effect after entrance
      startBreathing();
    });
  }, []);

  const startBreathing = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathingScale, {
          toValue: 1.02,
          duration: 2000,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        }),
        Animated.timing(breathingScale, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.linear),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  return (
    <Animated.View style={[styles.container, { opacity: bgOpacity }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <LinearGradient
        colors={[Colors.primaryContainer, Colors.primary]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative glass blobs for depth */}
      <View style={[styles.blob, styles.blob1]} />
      <View style={[styles.blob, styles.blob2]} />

      <Animated.View style={[
        styles.logoContainer,
        {
          opacity: logoOpacity,
          transform: [
            { scale: Animated.multiply(logoScale, breathingScale) }
          ]
        }
      ]}>
        <View style={styles.logoBox}>
          <Image 
            source={require('../../assets/logo_white.png')} 
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandTitle}>Zalo Education</Text>
      </Animated.View>

      <Animated.View style={[
        styles.footer,
        { 
          opacity: subtitleOpacity,
          transform: [{ translateY: subtitleTranslateY }]
        }
      ]}>
        <Text style={styles.subtitle}>Khai phóng tiềm năng tri thức</Text>
        
        {/* Minimalist loading bar */}
        <View style={styles.loaderLine}>
          <View style={[styles.loaderProgress, { width: '35%' }]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  blob: {
    position: 'absolute',
    borderRadius: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  blob1: {
    width: 350,
    height: 350,
    top: -100,
    right: -100,
  },
  blob2: {
    width: 250,
    height: 250,
    bottom: -80,
    left: -80,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: { 
    width: 100, 
    height: 100, 
    borderRadius: 32, 
    backgroundColor: 'rgba(255, 255, 255, 0.12)', 
    borderWidth: 1, 
    borderColor: 'rgba(255, 255, 255, 0.15)', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 20,
    overflow: 'hidden', // Ensure logo doesn't bleed outside border radius
    ...Platform.select({
      ios: {
        shadowColor: '#ffffff',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      web: {
        boxShadow: '0px 10px 30px rgba(255, 255, 255, 0.15)',
      }
    }),
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    ...Typography.heading,
    color: '#ffffff',
    fontSize: 42,
    letterSpacing: -1.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 80,
    alignItems: 'center',
    width: '100%',
  },
  subtitle: {
    ...Typography.body,
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 24,
    textTransform: 'uppercase',
  },
  loaderLine: {
    width: width * 0.35,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loaderProgress: {
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 1,
    opacity: 0.8,
  },
});
