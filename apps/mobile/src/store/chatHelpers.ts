import { Message, Conversation } from './types';

export const safeJsonParse = (str: string | undefined | null, fallback = []) => {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
};

export const getMsgTime = (m: Partial<Message>) => {
  const t = m?.createdAt ? Date.parse(m.createdAt) : NaN;
  return Number.isFinite(t) ? t : 0;
};

export const sortMessages = (arr: Message[]) =>
  [...(arr || [])].sort((a, b) => {
    const ta = getMsgTime(a);
    const tb = getMsgTime(b);
    if (tb !== ta) return tb - ta;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });

export const dedupeMessagesById = (messages: Message[]) => {
  const seen = new Set();
  return (Array.isArray(messages) ? messages : []).filter((message) => {
    const id = String(message?.id || "").trim();
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const normalizeMessage = (message: any): Message | null => {
  if (!message || typeof message !== "object") return null;

  const conversationId = String(
    message.conversationId || message.convId || "",
  ).trim();

  const id = String(message.id || message.SK || "").trim();
  const senderId = String(message.senderId || message.sender_id || "").trim() || "unknown";
  const content = typeof message.content === "string" ? message.content : message.content ?? "";
  const replyTo = message.replyTo || message.reply_to || null;
  const createdAt = message.createdAt || message.created_at || null;

  if (!id || !conversationId) return null;

  return {
    ...message,
    id,
    conversationId,
    convId: conversationId,
    senderId,
    content,
    replyTo,
    createdAt,
  };
};

export const normalizeConversation = (conv: any, currentUserEmail: string | null): Conversation | null => {
  if (!conv || typeof conv !== "object") return null;
  
  const id = String(conv.id || conv.PK || "").trim();
  if (!id) return null;

  let partner = conv.partner;
  if (conv.type === "direct" && !partner && Array.isArray(conv.members)) {
    const myEmail = String(currentUserEmail || "").toLowerCase();
    partner = conv.members.find((m: string) => String(m).toLowerCase() !== myEmail);
  }

  return {
    ...conv,
    id,
    partner,
    name: conv.name || "",
    avatar: conv.avatar || "",
    unreadCount: Number(conv.unreadCount || 0),
    updatedAt: conv.updatedAt || conv.created_at || new Date().toISOString(),
  };
};
export const normalizeAttachment = (f: any) => {
  const dataUrl = f.dataUrl || f.url || "";
  const name = f.name || f.fileName || (dataUrl ? dataUrl.split("/").pop() : "file");
  const size = f.size || f.fileSize || 0;
  const mimeType = f.mimeType || f.fileType || "";
  return { ...f, dataUrl, name, size, mimeType };
};
