import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'app_device_id';

/**
 * Gets a persistent device ID from AsyncStorage.
 * If not exists, generates a new one and saves it.
 */
export async function getDeviceId() {
  try {
    let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      // Simple UUID-like generator
      deviceId = 'idx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
      await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.error('[DEVICE_ID] Error getting/setting deviceId:', error);
    return `fallback-${Math.random().toString(36).slice(2, 9)}`;
  }
}
