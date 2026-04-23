import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Custom hook for React Native to manage OTP resend countdown with AsyncStorage persistence.
 * @param {string} key Unique identifier (email)
 * @param {number} initialSeconds Cooldown duration (default 30s)
 */
export const useOtpCountdown = (key: string, initialSeconds: number = 30) => {
  const normalizedKey = key ? key.toLowerCase().trim() : '';
  const storageKey = `otp_expiry_${normalizedKey}`;
  
  const [countdown, setCountdown] = useState(0);

  const getRemainingTime = useCallback(async () => {
    if (!normalizedKey) return 0;
    try {
      const expiry = await AsyncStorage.getItem(storageKey);
      if (!expiry) return 0;
      const remaining = Math.ceil((parseInt(expiry) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    } catch (e) {
      return 0;
    }
  }, [storageKey, normalizedKey]);

  // Start or restart the countdown
  const startCountdown = useCallback(async (seconds = initialSeconds) => {
    if (!normalizedKey) return;
    const expiry = Date.now() + seconds * 1000;
    try {
      await AsyncStorage.setItem(storageKey, expiry.toString());
      setCountdown(seconds);
    } catch (e) {
      // Fallback to memory state if storage fails
      setCountdown(seconds);
    }
  }, [storageKey, initialSeconds, normalizedKey]);

  // Sync with server duration (retryAfter)
  const syncWithServer = useCallback((seconds: number) => {
    if (seconds <= 0) return;
    startCountdown(seconds);
  }, [startCountdown]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      const rem = await getRemainingTime();
      setCountdown(rem);
    };
    init();
  }, [getRemainingTime]);

  // Background interval to tick down
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(async () => {
      const remaining = await getRemainingTime();
      setCountdown(remaining);
      
      if (remaining <= 0) {
        clearInterval(timer);
        try {
          await AsyncStorage.removeItem(storageKey);
        } catch (e) {}
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, getRemainingTime, storageKey]);

  return { countdown, startCountdown, syncWithServer };
};
