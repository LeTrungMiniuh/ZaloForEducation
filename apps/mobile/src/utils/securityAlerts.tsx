import AsyncStorage from "@react-native-async-storage/async-storage";

export const SECURITY_ALERTS_STORAGE_KEY = "security_alerts_v1";

export interface SecurityAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  at: string;
  metadata: any;
  read: boolean;
}

const normalizeLegacyVietnamese = (value: string = "") => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();

  if (trimmed === "Canh bao bao mat") return "Cảnh báo bảo mật";
  if (trimmed === "Mat khau da duoc thay doi")
    return "Mật khẩu đã được thay đổi";
  if (trimmed === "Phat hien dang nhap thiet bi la")
    return "Phát hiện đăng nhập thiết bị lạ";
  if (
    trimmed ===
    "He thong ghi nhan mat khau tai khoan vua duoc thay doi. Neu khong phai ban, hay khoa tai khoan ngay."
  ) {
    return "Hệ thống ghi nhận mật khẩu tài khoản vừa được thay đổi. Nếu không phải bạn, hãy khóa tài khoản ngay.";
  }
  if (
    trimmed ===
    "Ban vua doi mat khau thanh cong. Tat ca phien dang nhap se duoc dang xuat de bao mat."
  ) {
    return "Bạn vừa đổi mật khẩu thành công. Tất cả phiên đăng nhập sẽ được đăng xuất để bảo mật.";
  }

  return value
    .replace("Tai khoan vua dang nhap tren thiet bi", "Tài khoản vừa đăng nhập trên thiết bị")
    .replace("khong xac dinh", "không xác định")
    .replace("Neu khong phai ban", "Nếu không phải bạn")
    .replace("vui long doi mat khau ngay.", "vui lòng đổi mật khẩu ngay.")
    .replace("Tai khoan cua ban vua co hoat dong can chu y.", "Tài khoản của bạn vừa có hoạt động cần chú ý.");
};

const normalizeSecurityAlert = (payload: any = {}): SecurityAlert => {
  const now = new Date().toISOString();
  const rawTime = payload.at || payload.createdAt || now;
  const parsed = new Date(rawTime);
  const at = Number.isNaN(parsed.getTime()) ? now : parsed.toISOString();

  return {
    id:
      payload.id ||
      `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    type: payload.type || "SECURITY_ALERT",
    title: normalizeLegacyVietnamese(payload.title || "Cảnh báo bảo mật"),
    message: normalizeLegacyVietnamese(
      payload.message || "Tài khoản của bạn vừa có hoạt động cần chú ý.",
    ),
    at,
    metadata: payload.metadata || {},
    read: Boolean(payload.read),
  };
};

export const getSecurityAlerts = async (): Promise<SecurityAlert[]> => {
  try {
    const raw = await AsyncStorage.getItem(SECURITY_ALERTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeSecurityAlert(item))
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  } catch (error: any) {
    console.warn("[securityAlerts] Failed to read alerts", error?.message);
    return [];
  }
};

const saveSecurityAlerts = async (alerts: SecurityAlert[]) => {
  await AsyncStorage.setItem(
    SECURITY_ALERTS_STORAGE_KEY,
    JSON.stringify(Array.isArray(alerts) ? alerts : []),
  );
};

export const pushSecurityAlert = async (payload: any) => {
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
