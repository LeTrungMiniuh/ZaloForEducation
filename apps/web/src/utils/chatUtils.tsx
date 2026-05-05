import React from "react";

// --- TYPES ---
export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  file?: File;
  isSticker?: boolean;
  isHD?: boolean;
}

export interface ConversationMuteSchedule {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

const MUTE_SCHEDULE_STORAGE_PREFIX = "chat_notification_mute_schedule:";
export const DEFAULT_GROUP_AVATAR =
  "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

const getMuteScheduleStorageKey = (convId: string) =>
  `${MUTE_SCHEDULE_STORAGE_PREFIX}${convId}`;

const timeToMinutes = (time: string) => {
  const [hours, minutes] = String(time || "00:00")
    .split(":")
    .map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number) => {
  const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (safeMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const getConversationMuteSchedule = (
  convId: string,
): ConversationMuteSchedule | null => {
  if (typeof window === "undefined" || !convId) return null;

  const raw = localStorage.getItem(getMuteScheduleStorageKey(convId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as ConversationMuteSchedule;
    if (!parsed?.enabled) return null;
    if (!parsed.startTime || !parsed.endTime) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setConversationMuteSchedule = (
  convId: string,
  schedule: ConversationMuteSchedule,
) => {
  if (typeof window === "undefined" || !convId) return;

  localStorage.setItem(
    getMuteScheduleStorageKey(convId),
    JSON.stringify(schedule),
  );
};

export const clearConversationMuteSchedule = (convId: string) => {
  if (typeof window === "undefined" || !convId) return;
  localStorage.removeItem(getMuteScheduleStorageKey(convId));
};

export const isConversationMutedNow = (convId: string, now = new Date()) => {
  const schedule = getConversationMuteSchedule(convId);
  if (!schedule) return false;

  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  const current = now.getHours() * 60 + now.getMinutes();

  if (start === end) return true;

  if (start < end) {
    return current >= start && current < end;
  }

  return current >= start || current < end;
};

export const formatMuteScheduleLabel = (schedule: ConversationMuteSchedule) => {
  if (!schedule.enabled) return "Đã tắt";
  return `${minutesToTime(timeToMinutes(schedule.startTime))} - ${minutesToTime(
    timeToMinutes(schedule.endTime),
  )}`;
};

export const createConversationMuteScheduleFromDuration = (
  hours: number,
  now = new Date(),
): ConversationMuteSchedule => {
  const startMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = startMinutes + hours * 60;

  return {
    enabled: true,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
};

export const createConversationMuteScheduleUntilMorning = (
  targetHour = 8,
  now = new Date(),
): ConversationMuteSchedule => {
  const startMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = targetHour * 60;
  const endMinutes =
    startMinutes < targetMinutes ? targetMinutes : targetMinutes + 24 * 60;

  return {
    enabled: true,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
};

// --- FORMATTERS ---
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const formatDate = (date: string | number | Date): string => {
  if (!date) return "--:--";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleDateString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// --- DISPLAY HELPERS ---
export const getFileIcon = (fileName: string): string => {
  if (!fileName) return "insert_drive_file";
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return "picture_as_pdf";
    case "doc":
    case "docx":
      return "description";
    case "xls":
    case "xlsx":
      return "table_view";
    case "ppt":
    case "pptx":
      return "slideshow";
    case "zip":
    case "rar":
    case "7z":
      return "archive";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
      return "image";
    case "mp4":
    case "mov":
      return "video_library";
    case "mp3":
    case "wav":
      return "audio_file";
    default:
      return "article";
  }
};

export const getDisplayName = (
  email: string | undefined,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  if (!email) return "Người dùng";
  const normalized = String(email).trim().toLowerCase();
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();
  if (normalized === myEmail)
    return currentUser?.fullName || currentUser?.fullname || "Bạn";
  const profile = userProfiles[normalized] || userProfiles[email];
  return (
    profile?.nickname ||
    profile?.fullName ||
    profile?.fullname ||
    String(email).split("@")[0]
  );
};

export const getDisplayAvatar = (
  email: string | undefined,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  if (!email) return DEFAULT_GROUP_AVATAR;
  const normalized = String(email).trim().toLowerCase();
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();
  if (normalized === myEmail) return currentUser?.avatarUrl || "/logo_blue.png";
  return (
    userProfiles[normalized]?.avatarUrl ||
    userProfiles[email]?.avatarUrl ||
    "/logo_blue.png"
  );
};

// --- CHAT LOGIC HELPERS ---
export const getMessagePreview = (message: any): string => {
  if (!message) return "Tin nhắn";
  if (message.recalled) return "Tin nhắn đã được thu hồi";

  // Rich Preview for Calls
  if (message.type === "SYSTEM_CALL" || message.type === "call") {
    const callType = message.callType || message.metadata?.callType || "audio";
    const callStatus = (
      message.callStatus ||
      message.metadata?.callStatus ||
      ""
    ).toLowerCase();
    const isVideo = callType === "video";
    const label = isVideo ? "Video" : "Thoại";

    if (
      callStatus === "missed" ||
      callStatus === "no_answer" ||
      callStatus === "cancelled"
    ) {
      return `[Cuộc gọi ${label} nhỡ]`;
    }
    return `[Cuộc gọi ${label}]`;
  }

  if (message.type === "contact_card") return "[Danh thiếp]";

  // ★ Check known placeholder content FIRST before inspecting media
  // This ensures [Sticker] saved in content is always respected
  const knownPlaceholders = [
    "[Sticker]",
    "[Hình ảnh]",
    "[Ảnh HD]",
    "[Ảnh/Video]",
    "[Tin nhắn thoại]",
    "[Ghi âm]",
    "[Tệp tin]",
    "[Tệp đính kèm]",
    "[Danh thiếp]",
    "[Vị trí]",
  ];
  const rawContent = String(message.content || "");
  if (knownPlaceholders.includes(rawContent)) return rawContent;

  if (Array.isArray(message.media) && message.media.length > 0) {
    const hasSticker = message.media.some((item: any) => {
      const mime = String(item?.mimeType || item?.fileType || "").toLowerCase();
      return mime.includes("sticker") || item?.isSticker === true;
    });
    if (hasSticker) return "[Sticker]";

    const hasHDImage = message.media.some((item: any) => item?.isHD === true);
    if (hasHDImage) return "[Ảnh HD]";

    return "[Ảnh/Video]";
  }
  if (Array.isArray(message.files) && message.files.length > 0)
    return "[Tệp đính kèm]";
  if (message.type === "system") {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.action) {
        switch (parsed.action) {
          case "member_added":
            return "[Thêm thành viên]";
          case "member_removed":
          case "member_kicked":
            return "[Xóa thành viên]";
          case "member_left":
            return "[Rời nhóm]";
          case "role_updated":
          case "promoted_to_deputy":
          case "demoted_to_member":
          case "transferred_owner":
            return "[Cập nhật vai trò]";
          case "info_updated":
            return "[Cập nhật thông tin]";
          case "group_created":
            return "[Tạo nhóm]";
        }
      }
    } catch (e) {
      // Fallback to raw content if not JSON
    }
    return message.content || "[Hệ thống]";
  }

  return String(
    message.content || (message.type === "media" ? "[Tệp tin]" : "Tin nhắn"),
  );
};

const formatConversationActorLabel = (
  email: string | undefined,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  if (!email) return "Người dùng";
  const normalized = String(email).trim().toLowerCase();
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();
  if (normalized === myEmail) return "Bạn";
  return getDisplayName(email, currentUser, userProfiles);
};

const formatSystemPreview = (
  rawContent: string,
  senderId: string | undefined,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();

  const buildTargetLabel = (target?: string) => {
    if (!target) return "thành viên";
    const normalizedTarget = String(target).trim().toLowerCase();
    return normalizedTarget === myEmail
      ? "bạn"
      : getDisplayName(target, currentUser, userProfiles);
  };

  try {
    const parsed = JSON.parse(rawContent);
    if (parsed?.action) {
      const actorEmail =
        senderId && String(senderId).trim().toLowerCase() !== "system"
          ? senderId
          : parsed.actor;
      const actorLabel = formatConversationActorLabel(
        actorEmail,
        currentUser,
        userProfiles,
      );
      switch (parsed.action) {
        case "group_created":
          return `${actorLabel} đã tạo nhóm`;
        case "group_name_updated":
          return `${actorLabel} đã đổi tên nhóm`;
        case "member_added":
          return `${actorLabel} đã thêm ${buildTargetLabel(parsed.target)} vào nhóm`;
        case "member_removed":
        case "member_kicked":
          return `${actorLabel} đã xóa ${buildTargetLabel(parsed.target)} khỏi nhóm`;
        case "member_left":
          return `${actorLabel} đã rời nhóm`;
        case "role_updated":
        case "promoted_to_deputy":
        case "demoted_to_member":
        case "transferred_owner":
        case "demoted_from_deputy":
        case "ownership_transferred": {
          const role = parsed.role || (parsed.action === "promoted_to_deputy" ? "deputy" : parsed.action === "transferred_owner" ? "owner" : "member");
          if (role === "owner" || parsed.action === "transferred_owner" || parsed.action === "ownership_transferred") {
            return `${actorLabel} đã chuyển quyền trưởng nhóm cho ${buildTargetLabel(parsed.target)}`;
          }
          if (role === "deputy" || parsed.action === "promoted_to_deputy") {
            return `${actorLabel} đã đặt ${buildTargetLabel(parsed.target)} làm phó nhóm`;
          }
          return `${actorLabel} đã hạ ${buildTargetLabel(parsed.target)} xuống thành viên`;
        }
        case "pin_message":
          return `${actorLabel} đã ghim một tin nhắn`;
        case "unpin_message":
          return `${actorLabel} đã bỏ ghim tin nhắn`;
        case "info_updated":
          return `${actorLabel} đã cập nhật thông tin nhóm`;
        case "group_name_updated":
          return `${actorLabel} đã đổi tên nhóm`;
        case "group_avatar_updated":
          return `${actorLabel} đã thay đổi ảnh đại diện nhóm`;
        default:
          return `${actorLabel} đã thực hiện hành động hệ thống`;
      }
    }
  } catch {
    // Fall through to legacy label mapping.
  }

  const actorLabel = formatConversationActorLabel(
    senderId,
    currentUser,
    userProfiles,
  );
  const legacy = String(rawContent || "").trim();
  switch (legacy) {
    case "[Tạo nhóm]":
      return `${actorLabel} đã tạo nhóm`;
    case "[Thêm thành viên]":
      return `${actorLabel} đã thêm thành viên vào nhóm`;
    case "[Xóa thành viên]":
      return `${actorLabel} đã xóa thành viên khỏi nhóm`;
    case "[Rời nhóm]":
      return `${actorLabel} đã rời nhóm`;
    case "[Cập nhật vai trò]":
      return `${actorLabel} đã cập nhật vai trò thành viên`;
    case "[Cập nhật thông tin]":
      return `${actorLabel} đã cập nhật thông tin nhóm`;
    case "[Chuyển quyền trưởng nhóm]":
      return `${actorLabel} đã chuyển quyền trưởng nhóm`;
    default:
      return legacy || "[Hệ thống]";
  }
};

export const getConversationPreviewText = (
  conv: any,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  if (!conv) return "";

  const rawContent = String(conv.lastMessageContent || conv.lastMessage || "");
  const senderId = conv.lastMessageSenderId || conv.senderId;
  const messageType = String(conv.lastMessageType || "").toLowerCase();

  if (messageType === "system" || rawContent.trim().startsWith("{")) {
    return formatSystemPreview(rawContent, senderId, currentUser, userProfiles);
  }

  const preview = getMessagePreview({
    type: conv.lastMessageType,
    content: rawContent,
    media: conv.lastMessageMedia,
    files: conv.lastMessageFiles,
    recalled: conv.recalled,
  });

  if (!senderId) return preview;

  const normalizedSender = String(senderId).trim().toLowerCase();
  const myEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();

  // If I sent the message, show "Bạn: ..."
  if (normalizedSender === myEmail) {
    return `Bạn: ${preview}`;
  }

  // If someone else sent it, show only the preview content
  return preview;
};

export const normalizeAttachment = (item: any) => {
  const name = item?.name || item?.fileName || "Tệp";
  const mimeType =
    item?.mimeType || item?.fileType || "application/octet-stream";
  const size = Number(item?.size || 0);
  const dataUrl = item?.dataUrl || item?.fileUrl || item?.url || "";
  return { name, mimeType, size, dataUrl };
};

export const truncateFileName = (name: string, maxLength: number = 35) => {
  if (!name || name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex !== -1 && name.length - extIndex <= 6) {
    const ext = name.substring(extIndex);
    const nameWithoutExt = name.substring(0, extIndex);
    const charsToShow = maxLength - ext.length - 3;
    return `${nameWithoutExt.substring(0, charsToShow)}...${ext}`;
  }
  return `${name.substring(0, maxLength - 3)}...`;
};

export const isUnread = (
  conv: any,
  currentUserEmail: string | undefined,
): boolean => {
  if (!conv || !currentUserEmail) return false;

  const normalize = (email: string) =>
    (email || "")
      .replace(/^USER#/, "")
      .trim()
      .toLowerCase();
  const myEmail = normalize(currentUserEmail);
  const lastSender = normalize(conv.lastMessageSenderId || conv.senderId || "");

  if (lastSender === myEmail) return false;
  if (!conv.lastMessageTimestamp && !conv.updatedAt) return false;

  if (conv.unreadCount && conv.unreadCount > 0) return true;

  const lastReadTs = conv.lastReadAt || 0;
  const lastMsgTs =
    conv.lastMessageTimestamp ||
    (conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0);

  return lastReadTs < lastMsgTs;
};

export const normalizeConversation = (
  conv: any,
  currentUser: any,
  userProfiles: Record<string, any>,
) => {
  if (conv?.type !== "direct") return conv;
  const partner =
    conv.partner ||
    (Array.isArray(conv.members)
      ? conv.members.find((member: string) => member !== currentUser?.email)
      : undefined);

  return {
    ...conv,
    partner,
    name: conv.name || getDisplayName(partner, currentUser, userProfiles),
    avatar: conv.avatar || getDisplayAvatar(partner, currentUser, userProfiles),
  };
};

// --- DATE & TIME LOGIC ---
export const getMessageTimeContext = (
  currentDate: Date,
  previousDate?: Date,
) => {
  const isSameDay =
    previousDate &&
    currentDate.getDate() === previousDate.getDate() &&
    currentDate.getMonth() === previousDate.getMonth() &&
    currentDate.getFullYear() === previousDate.getFullYear();

  let dateHeader: string | null = null;
  if (!isSameDay) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate(),
    );

    if (msgDate.getTime() === today.getTime()) {
      dateHeader = "Hôm nay";
    } else if (msgDate.getTime() === yesterday.getTime()) {
      dateHeader = "Hôm qua";
    } else {
      dateHeader = currentDate.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year:
          currentDate.getFullYear() !== now.getFullYear()
            ? "numeric"
            : undefined,
      });
    }
  }

  const timeGap = previousDate
    ? currentDate.getTime() - previousDate.getTime()
    : Infinity;
  const showTimeHeader = timeGap > 5 * 60 * 1000; // 5 minutes

  return {
    dateHeader,
    showTimeHeader,
    formattedTime: currentDate.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};

export const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span
            key={i}
            className="text-primary font-bold bg-primary/10 px-0.5 rounded"
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
