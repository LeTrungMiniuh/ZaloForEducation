import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "chat_cache_v1_";

export const getCachedMessages = async (convId: string): Promise<any[]> => {
  if (!convId) return [];
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${convId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error(`[ChatCache] Load failed for ${convId}`, err);
    return [];
  }
};

export const setCachedMessages = async (convId: string, messages: any[]): Promise<void> => {
  if (!convId) return;
  try {
    // Only cache the last 50 messages to save space
    const toCache = messages.slice(0, 50);
    await AsyncStorage.setItem(`${CACHE_PREFIX}${convId}`, JSON.stringify(toCache));
  } catch (err) {
    console.error(`[ChatCache] Save failed for ${convId}`, err);
  }
};

const PINNED_CACHE_PREFIX = "pinned_msg_cache_";

export const getCachedPinnedMessage = async (messageId: string): Promise<any | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${PINNED_CACHE_PREFIX}${messageId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const setCachedPinnedMessage = async (messageId: string, message: any): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${PINNED_CACHE_PREFIX}${messageId}`, JSON.stringify(message));
  } catch (err) {
    console.error(`[ChatCache] Save pinned failed for ${messageId}`, err);
  }
};
