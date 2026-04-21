import React from 'react';

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

// --- FORMATTERS ---
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const formatDate = (date: string | number | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// --- DISPLAY HELPERS ---
export const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'picture_as_pdf';
    case 'doc':
    case 'docx': return 'description';
    case 'xls':
    case 'xlsx': return 'table_view';
    case 'ppt':
    case 'pptx': return 'slideshow';
    case 'zip':
    case 'rar':
    case '7z': return 'archive';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif': return 'image';
    case 'mp4':
    case 'mov': return 'video_library';
    case 'mp3':
    case 'wav': return 'audio_file';
    default: return 'article';
  }
};

export const getDisplayName = (email: string | undefined, currentUser: any, userProfiles: Record<string, any>) => {
  if (!email) return 'Người dùng';
  if (email === currentUser?.email) return currentUser?.fullName || currentUser?.fullname || 'Bạn';
  const profile = userProfiles[email];
  return profile?.fullName || profile?.fullname || email;
};

export const getDisplayAvatar = (email: string | undefined, currentUser: any, userProfiles: Record<string, any>) => {
  if (!email) return '/logo_blue.png';
  if (email === currentUser?.email) return currentUser?.avatarUrl || '/logo_blue.png';
  return userProfiles[email]?.avatarUrl || '/logo_blue.png';
};

// --- CHAT LOGIC HELPERS ---
export const getMessagePreview = (message: any): string => {
  if (!message) return 'Tin nhắn';
  if (message.recalled) return 'Tin nhắn đã được thu hồi';
  if (Array.isArray(message.media) && message.media.length > 0) {
    const hasSticker = message.media.some((item: any) => {
      const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
      return mime.includes('sticker') || item?.isSticker === true;
    });
    if (hasSticker) return '[Sticker]';

    const hasHDImage = message.media.some((item: any) => item?.isHD === true);
    if (hasHDImage) return '[Ảnh HD]';

    return '[Ảnh/Video]';
  }
  if (Array.isArray(message.files) && message.files.length > 0) return '[Tệp đính kèm]';
  return String(message.content || 'Tin nhắn');
};

export const normalizeAttachment = (item: any) => {
  const name = item?.name || item?.fileName || 'Tệp';
  const mimeType = item?.mimeType || item?.fileType || 'application/octet-stream';
  const size = Number(item?.size || 0);
  const dataUrl = item?.dataUrl || item?.fileUrl || item?.url || '';
  return { name, mimeType, size, dataUrl };
};

export const truncateFileName = (name: string, maxLength: number = 35) => {
  if (!name || name.length <= maxLength) return name;
  const extIndex = name.lastIndexOf('.');
  if (extIndex !== -1 && name.length - extIndex <= 6) {
    const ext = name.substring(extIndex);
    const nameWithoutExt = name.substring(0, extIndex);
    const charsToShow = maxLength - ext.length - 3;
    return `${nameWithoutExt.substring(0, charsToShow)}...${ext}`;
  }
  return `${name.substring(0, maxLength - 3)}...`;
};

export const isUnread = (conv: any, currentUserEmail: string | undefined): boolean => {
  if (!conv || !currentUserEmail) return false;
  
  const normalize = (email: string) => (email || '').replace(/^USER#/, '').trim().toLowerCase();
  const myEmail = normalize(currentUserEmail);
  const lastSender = normalize(conv.lastMessageSenderId || conv.senderId || '');
  
  if (lastSender === myEmail) return false;
  if (!conv.lastMessageTimestamp && !conv.updatedAt) return false;
  
  const lastReadTs = conv.lastReadAt || 0;
  const lastMsgTs = conv.lastMessageTimestamp || (conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0);
  
  return lastReadTs < lastMsgTs;
};

export const normalizeConversation = (conv: any, currentUser: any, userProfiles: Record<string, any>) => {
  if (conv?.type !== 'direct') return conv;
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
export const getMessageTimeContext = (currentDate: Date, previousDate?: Date) => {
  const isSameDay = previousDate && 
    currentDate.getDate() === previousDate.getDate() &&
    currentDate.getMonth() === previousDate.getMonth() &&
    currentDate.getFullYear() === previousDate.getFullYear();

  let dateHeader: string | null = null;
  if (!isSameDay) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

    if (msgDate.getTime() === today.getTime()) {
      dateHeader = 'Hôm nay';
    } else if (msgDate.getTime() === yesterday.getTime()) {
      dateHeader = 'Hôm qua';
    } else {
      dateHeader = currentDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: currentDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  const timeGap = previousDate ? currentDate.getTime() - previousDate.getTime() : Infinity;
  const showTimeHeader = timeGap > 5 * 60 * 1000; // 5 minutes

  return {
    dateHeader,
    showTimeHeader,
    formattedTime: currentDate.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  };
};

export const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query || !text) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() 
          ? <span key={i} className="text-primary font-bold bg-primary/10 px-0.5 rounded">{part}</span> 
          : <span key={i}>{part}</span>
      )}
    </>
  );
};
