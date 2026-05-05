import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type ReminderRepeatType = "none" | "daily" | "weekly" | "monthly";

export interface ReminderPayload {
  title: string;
  date: string;
  time: string;
  repeatType: ReminderRepeatType;
  audience: "self" | "group";
  conversationId?: string;
}

const REMINDER_CHANNEL_ID = "reminders";

const toLocalDateTime = (date: string, time: string) => {
  const [year, month, day] = String(date || "")
    .split("-")
    .map(Number);
  const [hour, minute] = String(time || "")
    .split(":")
    .map(Number);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

const buildTrigger = (
  payload: ReminderPayload,
): Notifications.NotificationTriggerInput | null => {
  const scheduledAt = toLocalDateTime(payload.date, payload.time);
  if (!scheduledAt) return null;

  const [hour, minute] = payload.time.split(":").map(Number);

  if (payload.repeatType === "daily") {
    return { hour, minute, repeats: true } as any;
  }

  if (payload.repeatType === "weekly") {
    const weekday = scheduledAt.getDay() + 1;
    return { weekday, hour, minute, repeats: true } as any;
  }

  if (payload.repeatType === "monthly") {
    return { day: scheduledAt.getDate(), hour, minute, repeats: true } as any;
  }

  return { date: scheduledAt } as any;
};

export const ensureReminderNotificationChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: "Nhắc hẹn",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0068FF",
  });
};

export type ScheduleReminderResult =
  | { scheduled: true; id: string }
  | { scheduled: false; reason: "NOTIFICATION_PERMISSION_DENIED" };

export const scheduleReminderNotification = async (
  payload: ReminderPayload,
): Promise<ScheduleReminderResult> => {
  const scheduledAt = toLocalDateTime(payload.date, payload.time);
  if (!scheduledAt) {
    throw new Error("INVALID_REMINDER_TIME");
  }

  if (payload.repeatType === "none" && scheduledAt.getTime() <= Date.now()) {
    throw new Error("REMINDER_IN_PAST");
  }

  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    // Return a result instead of throwing: caller can still persist the reminder
    return { scheduled: false, reason: "NOTIFICATION_PERMISSION_DENIED" };
  }

  await ensureReminderNotificationChannel();

  const trigger = buildTrigger(payload);
  if (!trigger) {
    throw new Error("INVALID_REMINDER_TRIGGER");
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Nhắc hẹn",
      body: payload.title,
      sound: true,
      data: {
        reminder: payload,
        conversationId: payload.conversationId,
      },
    },
    trigger: {
      ...trigger,
      channelId: REMINDER_CHANNEL_ID,
    } as any,
  });

  return { scheduled: true, id };
};

export const formatReminderDateTime = (date: string, time: string) => {
  const scheduledAt = toLocalDateTime(date, time);
  if (!scheduledAt) return "";
  return scheduledAt.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};
export const dismissNotificationsByConversation = async (convId: string) => {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const notification of presented) {
      const data = notification.request.content.data as any;
      const notificationConvId = data?.convId || data?.conversationId || data?.reminder?.conversationId;
      
      if (notificationConvId === convId) {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
      }
    }
  } catch (error) {
    console.warn("[Notifications] Failed to dismiss notifications for", convId, error);
  }
};

export const cancelScheduledRemindersByConversation = async (convId: string) => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      const data = notification.content.data as any;
      const notificationConvId = data?.convId || data?.conversationId || data?.reminder?.conversationId;
      
      if (notificationConvId === convId) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (error) {
    console.warn("[Notifications] Failed to cancel scheduled notifications for", convId, error);
  }
};
