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
    <div className="w-full max-w-sm space-y-5 p-6 rounded-[32px] border border-amber-200/20 dark:border-amber-900/20 bg-gradient-to-br from-amber-50/90 to-white/90 dark:from-amber-900/10 dark:to-surface-container backdrop-blur-xl shadow-[0_8px_32px_rgba(245,158,11,0.05)] hover:shadow-[0_12px_48px_rgba(245,158,11,0.1)] transition-all duration-500 group">
      {/* Reminder Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-[20px] bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center shrink-0 shadow-inner">
          <Bell size={24} className="text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
        </div>
        <div className="flex-1 pt-1">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600/50 dark:text-amber-400/50 mb-1.5">
            Nhắc hẹn
          </p>
          <p className="text-[18px] font-black text-on-surface leading-tight tracking-tight">
            {content}
          </p>
        </div>
      </div>

      {/* Reminder Details */}
      <div className="space-y-4 bg-white/40 dark:bg-black/20 rounded-[24px] p-5 backdrop-blur-sm border border-amber-200/30">
        {/* Date */}
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 flex flex-col items-center justify-center rounded-[20px] bg-white dark:bg-surface-container border border-amber-200/50 shadow-sm group-hover:scale-110 transition-transform duration-500">
            <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">
              {reminderDate.toLocaleDateString("vi-VN", { month: "short" })}
            </span>
            <span className="text-[24px] font-black text-on-surface leading-none">
              {reminderDate.getDate().toString().padStart(2, "0")}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-black text-on-surface uppercase tracking-tight mb-0.5">
              {formattedDate}
            </p>
            <p className="text-[14px] font-bold text-on-surface-variant opacity-60">
              {reminderDate.toLocaleDateString("vi-VN", { weekday: "long" })}
            </p>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-4 px-5 py-4 bg-white/60 dark:bg-black/20 rounded-[20px] border border-amber-100/50">
          <Clock
            size={20}
            className="text-amber-600 dark:text-amber-400 shrink-0"
          />
          <div className="flex-1">
            <p className="text-[11px] font-black text-amber-600/60 uppercase tracking-widest mb-1">
              Thời gian
            </p>
            <p className="text-[16px] font-black text-on-surface leading-none">
              {formattedTime}
            </p>
          </div>
          {repeatType !== "none" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm">
              <span className="text-[11px] font-black uppercase tracking-wider">
                {repeatLabels[repeatType]}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between pt-4 border-t border-amber-200/20">
        <p className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-[0.1em]">
          Tự động nhắc hẹn
        </p>
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10 shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-black uppercase tracking-widest">
            Active
          </span>
        </div>
      </div>
    </div>
  );
};

export default ReminderMessage;
