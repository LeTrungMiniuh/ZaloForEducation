import React from "react";
import { Clock, Bell } from "lucide-react";

interface ReminderMessageProps {
  messageId: string;
  content: string;
  time: string;
  date: string;
  repeatType: "none" | "daily" | "weekly" | "monthly";
}

const ReminderMessage: React.FC<ReminderMessageProps> = ({
  messageId,
  content,
  time,
  date,
  repeatType,
}) => {
  // Parse date and time
  const reminderDate = new Date(date);
  const [hours, minutes] = time.split(":").map(Number);
  reminderDate.setHours(hours, minutes, 0);

  const formattedDate = reminderDate.toLocaleDateString("vi-VN", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const formattedTime = reminderDate.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const repeatLabels: Record<string, string> = {
    none: "Một lần",
    daily: "Hàng ngày",
    weekly: "Hàng tuần",
    monthly: "Hàng tháng",
  };

  return (
    <div className="w-full max-w-sm space-y-3 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-gradient-to-br from-amber-50 to-amber-50/50 dark:from-amber-900/20 dark:to-amber-900/10">
      {/* Reminder Header */}
      <div className="flex items-start gap-2.5">
        <Bell
          size={18}
          className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
        />
        <div className="flex-1">
          <p className="text-[12px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
            Nhắc hẹn
          </p>
          <p className="text-[14px] font-bold text-on-surface break-words">
            {content}
          </p>
        </div>
      </div>

      {/* Reminder Details */}
      <div className="space-y-2 bg-white/40 dark:bg-black/20 rounded-xl p-3 backdrop-blur-sm">
        {/* Date */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex flex-col items-center justify-center rounded-lg bg-white dark:bg-surface-container border border-amber-200/50 dark:border-amber-900/40 shadow-sm">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              {reminderDate.toLocaleDateString("vi-VN", { month: "short" })}
            </span>
            <span className="text-[16px] font-extrabold text-on-surface">
              {reminderDate.getDate().toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-on-surface">
              {formattedDate}
            </p>
            <p className="text-[12px] text-on-surface-variant">
              {reminderDate.toLocaleDateString("vi-VN", { weekday: "long" })}
            </p>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-3 px-3 py-2 bg-white/50 dark:bg-black/10 rounded-lg">
          <Clock
            size={16}
            className="text-amber-600 dark:text-amber-400 shrink-0"
          />
          <div className="flex-1">
            <p className="text-[12px] font-medium text-on-surface-variant">
              Thời gian
            </p>
            <p className="text-[14px] font-bold text-on-surface">
              {formattedTime}
            </p>
          </div>
        </div>

        {/* Repeat Type */}
        {repeatType !== "none" && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
              🔄 {repeatLabels[repeatType]}
            </span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between pt-1 border-t border-amber-200/50 dark:border-amber-900/30">
        <p className="text-[11px] font-medium text-on-surface-variant">
          Nhắc hẹn sẽ được gửi
        </p>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-600/10 text-amber-600 dark:text-amber-400">
          ⏰ Chớp nhoáng
        </span>
      </div>
    </div>
  );
};

export default ReminderMessage;
