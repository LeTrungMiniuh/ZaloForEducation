import { safeJsonParse } from "./chatHelpers";

let storage: any = null;
const memoryCache = new Map();

try {
  const { MMKV } = require("react-native-mmkv");
  storage = new MMKV();
} catch (error) {
  // Fallback to memoryCache
}

export const getCachedMessages = (convId: string) => {
  const key = `messages#${convId}`;
  if (!storage) return memoryCache.get(key) || [];
  const data = storage.getString(key);
  return data ? safeJsonParse(data, []) : [];
};

export const setCachedMessages = (convId: string, messagesNewestFirst: any[]) => {
  const key = `messages#${convId}`;
  const payload = (Array.isArray(messagesNewestFirst) ? messagesNewestFirst : []).slice(0, 50);
  memoryCache.set(key, payload);
  if (storage) {
    storage.set(key, JSON.stringify(payload));
  }
};

export const getStorage = () => storage;
