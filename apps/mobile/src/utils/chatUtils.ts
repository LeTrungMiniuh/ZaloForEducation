export const timeToMinutes = (timeString: string) => {
  const [hours, minutes] = String(timeString || "00:00").split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

export const isValidTimeString = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "").trim());

export const createMuteUntilHours = (hours: number) => {
  const now = Date.now();
  const endAt = now + hours * 60 * 60 * 1000;
  return { enabled: true, mode: `hours_${hours}`, endAt, createdAt: now };
};

export const createMuteUntilMorning = (targetHour = 8) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(targetHour, 0, 0, 0);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return { enabled: true, mode: "until_morning", endAt: end.getTime(), createdAt: now.getTime() };
};

export const createCustomWindowMuteSchedule = (startTime: string, endTime: string) => ({
  enabled: true, mode: "custom_window", startTime, endTime, createdAt: Date.now()
});

export const pruneExpiredSchedules = (map: Record<string, any>) => {
  const safeMap = map && typeof map === "object" ? map : {};
  const now = Date.now();
  const next: Record<string, any> = {};
  Object.entries(safeMap).forEach(([convId, schedule]: [string, any]) => {
    if (!schedule || schedule.enabled !== true) return;
    if (schedule.mode === "custom_window") {
      if (!isValidTimeString(schedule.startTime) || !isValidTimeString(schedule.endTime)) return;
      next[convId] = schedule;
      return;
    }
    if (typeof schedule.endAt !== "number") return;
    if (schedule.endAt <= now) return;
    next[convId] = schedule;
  });
  return next;
};

export const getMuteLabel = (schedule: any) => {
  if (!schedule) return "Đã tắt thông báo";
  if (schedule.mode === "custom_window" && schedule.startTime && schedule.endTime) {
    return `Đã tắt theo khung ${schedule.startTime} - ${schedule.endTime}`;
  }
  if (typeof schedule.endAt !== "number") return "Đã tắt thông báo";
  const endTime = new Date(schedule.endAt).toLocaleTimeString("vi-VN", {
    hour: "2-digit", minute: "2-digit"
  });
  return `Đã tắt thông báo đến ${endTime}`;
};

export const getMessagePreview = (message: any) => {
  if (!message) return "Tin nhắn";
  if (message.recalled) return "Tin nhắn đã được thu hồi";

  const contentStr = typeof message.content === "string" ? message.content : "";
  if (message.type === 'call' || message.type === 'SYSTEM_CALL' || (message.type === 'system' && contentStr.includes('Cuộc gọi'))) {
    const meta = message.metadata || {};
    const isVideo = meta.callType === 'video' || contentStr.includes('video');
    const label = isVideo ? 'Video' : 'Thoại';
    const status = (meta.callStatus || '').toLowerCase();
    if (status === 'missed' || status === 'no_answer' || status === 'cancelled') {
      return `[Cuộc gọi ${label} nhỡ]`;
    }
    return `[Cuộc gọi ${label}]`;
  }

  if (message.media?.length > 0) return "[Ảnh/Video]";
  if (message.files?.length > 0) return "[Tệp đính kèm]";
  return message.content || "Tin nhắn";
};
