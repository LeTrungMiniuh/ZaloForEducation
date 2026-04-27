import { safeJsonParse } from "./chatHelpers";

let storage: any = null;
const memoryCache = new Map();

try {
  const { MMKV } = require("react-native-mmkv");
  storage = new MMKV();
} catch (error) {
  console.log("MMKV initialization failed or not supported in this environment:", error);
}

export const getCachedMessages = (convId: string) => {
  const key = `messages#${convId}`;
  if (!storage) return memoryCache.get(key) || [];
  try {
    const data = storage.getString(key);
    return data ? safeJsonParse(data, []) : [];
  } catch (e) {
    console.warn("MMKV get failed, falling back to memory:", e);
    return memoryCache.get(key) || [];
  }
};

export const setCachedMessages = (convId: string, messagesNewestFirst: any[]) => {
  const key = `messages#${convId}`;
  const payload = (Array.isArray(messagesNewestFirst) ? messagesNewestFirst : []).slice(0, 50);
  memoryCache.set(key, payload);
  if (storage) {
    try {
      storage.set(key, JSON.stringify(payload));
    } catch (e) {
      console.warn("MMKV set failed:", e);
    }
  }
};

export const getStorage = () => storage;
