import React, { useState } from "react";
import { X, Clock, Calendar } from "lucide-react";
import Swal from "sweetalert2";

interface ReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendReminder: (reminder: {
    content: string;
    time: string;
    date: string;
    repeatType: "none" | "daily" | "weekly" | "monthly";
  }) => Promise<void>;
}

const ReminderModal: React.FC<ReminderModalProps> = ({
  isOpen,
  onClose,
  onSendReminder,
}) => {
  const [content, setContent] = useState("");
  const [time, setTime] = useState("13:00");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [repeatType, setRepeatType] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >("none");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Swal.fire("Lỗi", "Vui lòng nhập nội dung nhắc hẹn", "error");
      return;
    }

    const reminderDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (reminderDate < today) {
      Swal.fire("Lỗi", "Vui lòng chọn ngày trong tương lai", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSendReminder({
        content: content.trim(),
        time,
        date,
        repeatType,
      });
      setContent("");
      setTime("13:00");
      setDate(new Date().toISOString().split("T")[0]);
      setRepeatType("none");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-surface-container rounded-3xl shadow-2xl max-w-md w-full mx-4 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/10 dark:border-outline-variant/20">
          <h2 className="text-[18px] font-extrabold text-on-surface">
            Tạo nhắc hẹn
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
          >
            <X size={20} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Content Input */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-on-surface uppercase tracking-wider">
              Nhập nội dung
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, 200))}
              placeholder="Nhập nội dung mới hoặc dán link"
              maxLength={200}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[14px] resize-none"
              rows={3}
            />
            <p className="text-[11px] text-on-surface-variant">
              {content.length}/200
            </p>
          </div>

          {/* Time Selection */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-on-surface uppercase tracking-wider">
              Chọn thời gian
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setTime("09:00")}
                className={`py-2 rounded-lg font-bold text-[12px] transition-all ${
                  time === "09:00"
                    ? "bg-primary text-white"
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                9:00 sáng
              </button>
              <button
                onClick={() => setTime("13:00")}
                className={`py-2 rounded-lg font-bold text-[12px] transition-all ${
                  time === "13:00"
                    ? "bg-primary text-white"
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                1:00 chiều
              </button>
              <button
                onClick={() => setTime("18:00")}
                className={`py-2 rounded-lg font-bold text-[12px] transition-all ${
                  time === "18:00"
                    ? "bg-primary text-white"
                    : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                }`}
              >
                6:00 tối
              </button>
            </div>
            <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2">
              <Clock size={16} className="text-on-surface-variant" />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="bg-transparent flex-1 outline-none text-[13px] text-on-surface"
              />
            </div>
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-on-surface uppercase tracking-wider">
              Chọn ngày nhắc hẹn
            </label>
            <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2">
              <Calendar size={16} className="text-on-surface-variant" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent flex-1 outline-none text-[13px] text-on-surface"
              />
            </div>
          </div>

          {/* Repeat Type */}
          <div className="space-y-2">
            <label className="text-[13px] font-bold text-on-surface uppercase tracking-wider">
              Chọn kiểu lập lại
            </label>
            <select
              value={repeatType}
              onChange={(e) => setRepeatType(e.target.value as any)}
              className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[13px] text-on-surface cursor-pointer"
            >
              <option value="none">Không lập lại</option>
              <option value="daily">Hàng ngày</option>
              <option value="weekly">Hàng tuần</option>
              <option value="monthly">Hàng tháng</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/10 dark:border-outline-variant/20 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-surface-container-high text-on-surface rounded-full hover:bg-surface-container-highest font-bold text-[13px] transition-all disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2.5 bg-primary text-white rounded-full hover:bg-primary/90 font-bold text-[13px] transition-all disabled:opacity-50 active:scale-95"
          >
            {isSubmitting ? "Đang gửi..." : "Tạo nhắc hẹn"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReminderModal;
