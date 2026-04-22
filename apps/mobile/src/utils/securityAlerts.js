import AsyncStorage from '@react-native-async-storage/async-storage';

const SECURITY_ALERTS_STORAGE_KEY = "security_alerts_storage";

const normalizeSecurityAlert = (payload) => ({
  id: payload.id || `alert#${Date.now()}#${Math.random().toString(36).slice(2, 5)}`,
  type: payload.type || "SECURITY_INFO",
  title: payload.title || "Cảnh báo bảo mật",
  message: payload.message || "",
  at: payload.at || new Date().toISOString(),
  read: false,
  metadata: payload.metadata || {},
});

export const getSecurityAlerts = async () => {
  try {
    const raw = await AsyncStorage.getItem(SECURITY_ALERTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return (Array.isArray(parsed) ? parsed : [])
      .map((item) => normalizeSecurityAlert(item))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  } catch (error) {
    console.warn("[securityAlerts] Failed to read alerts", error?.message);
    return [];
  }
};

const saveSecurityAlerts = async (alerts) => {
  await AsyncStorage.setItem(
    SECURITY_ALERTS_STORAGE_KEY,
    JSON.stringify(Array.isArray(alerts) ? alerts : []),
  );
};

export const pushSecurityAlert = async (payload) => {
  const normalized = normalizeSecurityAlert(payload);
  const current = await getSecurityAlerts();
  // Keep last 100 alerts
  const next = [normalized, ...current].slice(0, 100);
  await saveSecurityAlerts(next);
  return next;
};

export const markAllSecurityAlertsRead = async () => {
  const current = await getSecurityAlerts();
  const next = current.map((item) => ({ ...item, read: true }));
  await saveSecurityAlerts(next);
  return next;
};

export const clearSecurityAlerts = async () => {
  await saveSecurityAlerts([]);
  return [];
};
