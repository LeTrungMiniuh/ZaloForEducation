import { Message, Conversation } from "../store/types";

export const friendEmailOf = (friendship: any, myEmail: string) => {
  if (!friendship) return "";
  const sender = String(friendship.sender_id || friendship.senderEmail || "").toLowerCase();
  const receiver = String(friendship.receiver_id || friendship.receiverEmail || "").toLowerCase();
  const me = String(myEmail || "").toLowerCase();
  return sender === me ? receiver : sender;
};

export const firstLetter = (label: string) => {
  const c = String(label || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (!c) return "#";
  return /[A-Z]/.test(c) ? c : "#";
};

export const pickBirthDateRaw = (profile: any) => {
  if (!profile || typeof profile !== "object") return "";
  return String(
    profile.date_of_birth ||
      profile.dataOfBirth ||
      profile.dateOfBirth ||
      profile.birthday ||
      profile.dob ||
      "",
  ).trim();
};

export const formatBirthDate = (value: any) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return raw;

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const d = String(parsed.getDate()).padStart(2, "0");
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const y = String(parsed.getFullYear());
  return `${d}/${m}/${y}`;
};

export const getBirthDateParts = (value: any) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const ddmmyyyy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month };
    }
    return null;
  }

  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const day = Number(ymd[3]);
    const month = Number(ymd[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { day, month };
    }
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { day: parsed.getDate(), month: parsed.getMonth() + 1 };
};

export const daysUntilNextBirthday = (value: any, now = new Date()) => {
  const parts = getBirthDateParts(value);
  if (!parts) return null;

  const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(nowStart.getFullYear(), parts.month - 1, parts.day);

  if (Number.isNaN(target.getTime())) return null;
  if (target < nowStart) {
    target = new Date(nowStart.getFullYear() + 1, parts.month - 1, parts.day);
  }

  const diffMs = target.getTime() - nowStart.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
};
