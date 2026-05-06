/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AlertCircle,
  AudioLines,
  Download,
  FileDigit,
  FileImage,
  FileText,
  Forward,
  Loader2,
  MoreHorizontal,
  Music,
  Pin,
  Quote,
  ThumbsUp,
  Video,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCallStore } from "../../store/callStore";
import { useChatStore } from "../../store/chatStore";
import {
  formatFileSize,
  getDisplayAvatar,
  getDisplayName,
  normalizeAttachment,
  truncateFileName,
} from "../../utils/chatUtils";
import { useCallActions } from "../../hooks/useCallActions";
import SystemCallMessageItem from "./SystemCallMessageItem";
import PollMessage from "./PollMessage";
import ReminderMessage from "./ReminderMessage";
import CodeSnippet from "./CodeSnippet";

interface MessageBubbleProps {
  message: any;
  onContextMenu: (message: any, x: number, y: number) => void;
  userProfiles: Record<string, any>;
  hideTime?: boolean;
  onReply: (message: any) => void;
  onForward?: (message: any) => void;
  isConsecutive?: boolean;
  activeConvId?: string;
  onVotePoll?: (messageId: string, optionIndex: number) => Promise<void>;
}

const FLUENT_EMOJI_MAP: Record<string, string> = {
  "👍": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Thumbs%20Up/3D/thumbs_up_3d.png",
  "❤️": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20Heart/3D/red_heart_3d.png",
  "😄": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png",
  "😮": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png",
  "😭": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png",
  "😡": "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Enraged%20Face/3D/enraged_face_3d.png",
};

// URL-encode spaces for all links
Object.keys(FLUENT_EMOJI_MAP).forEach((key) => {
  FLUENT_EMOJI_MAP[key] = FLUENT_EMOJI_MAP[key].replace(/ /g, "%20");
});

const WebAudioPlayer: React.FC<{ src: string }> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [src]);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d)) {
        setDuration(d);
      }
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || !isFinite(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 p-3 w-[280px] md:w-[340px] max-w-full bg-white/80 dark:bg-surface-container-high/80 border border-primary/20 rounded-2xl shadow-sm hover:shadow-md transition-all group">
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${error ? "bg-error/10 text-error" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white"}`}
      >
        {error ? (
          <AlertCircle size={20} />
        ) : (
          <AudioLines size={20} className="animate-pulse-slow" />
        )}
      </div>
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex justify-between items-center">
          <p className="text-[11px] font-extrabold text-primary/80 uppercase tracking-wider">
            Tin nhắn thoại
          </p>
          <span className="text-[10px] font-bold opacity-60">
            {duration ? formatTime(duration) : "--:--"}
          </span>
        </div>
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          className="w-full h-8 brightness-95 contrast-125 focus:outline-none"
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => setError(true)}
          src={src}
        />
        {error && (
          <p className="text-[9px] text-error font-bold italic">
            Không thể phát tệp này
          </p>
        )}
      </div>
    </div>
  );
};

const FluentEmoji: React.FC<{
  emoji: string;
  className?: string;
  alt?: string;
}> = ({ emoji, className, alt }) => {
  const [failed, setFailed] = useState(false);
  const url = FLUENT_EMOJI_MAP[emoji];

  if (failed || !url) return <span className={className}>{emoji}</span>;

  return (
    <img
      src={url}
      className={className}
      alt={alt || emoji}
      onError={() => setFailed(true)}
    />
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onContextMenu,
  userProfiles,
  onReply,
  onForward,
  isConsecutive,
  onVotePoll,
}) => {
  // --- HOOKS (Must be at the top level) ---
  const navigate = useNavigate();
  const { user } = useAuth();
  const isCallOverlayActive = useCallStore(
    (state) => state.callState === "CONNECTED" || state.callState === "JOINING",
  );
  const {
    patchMessageOptimistic,
    activeConvId,
    highlightedMessageId,
    setPreviewImage,
    startDirectChat,
    tags,
  } = useChatStore();
  const { startCall, joinGroupCall } = useCallActions();
  const [isReactionDockOpen, setIsReactionDockOpen] = useState(false);
  const reactionDockRef = useRef<HTMLDivElement | null>(null);

  // Use state to track conversation/message changes and reset reaction dock
  // This is a safe way to handle state resets based on prop changes
  const [prevConvMsgKey, setPrevConvMsgKey] = useState(`${activeConvId}-${message.id}`);
  const [prevCallOverlay, setPrevCallOverlay] = useState(isCallOverlayActive);

  // Sync state with props in a safe way
  const currentConvMsgKey = `${activeConvId}-${message.id}`;
  if (prevConvMsgKey !== currentConvMsgKey) {
    setPrevConvMsgKey(currentConvMsgKey);
    setIsReactionDockOpen(false);
  }
  if (isCallOverlayActive !== prevCallOverlay) {
    setPrevCallOverlay(isCallOverlayActive);
    if (isCallOverlayActive) {
      setIsReactionDockOpen(false);
    }
  }

  useEffect(() => {
    if (!isReactionDockOpen) return;

    const closePicker = () => setIsReactionDockOpen(false);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        closePicker();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const node = reactionDockRef.current;
      if (!node) return;
      if (event.target instanceof Node && !node.contains(event.target)) {
        closePicker();
      }
    };

    window.addEventListener("blur", closePicker);
    window.addEventListener("scroll", closePicker, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      window.removeEventListener("blur", closePicker);
      window.removeEventListener("scroll", closePicker, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [isReactionDockOpen]);

  // --- UTILS & DATA (No hooks here) ---
  const isVideoMedia = (mediaItem: any) => {
    const mime = String(
      mediaItem?.mimeType || mediaItem?.fileType || "",
    ).toLowerCase();
    const name = String(
      mediaItem?.name ||
        mediaItem?.fileName ||
        mediaItem?.url ||
        mediaItem?.dataUrl ||
        "",
    ).toLowerCase();
    return (
      mime.startsWith("video/") ||
      /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name)
    );
  };

  const isStickerMedia = (mediaItem: any) => {
    const mime = String(
      mediaItem?.mimeType || mediaItem?.fileType || "",
    ).toLowerCase();
    return mime.includes("sticker") || mediaItem?.isSticker === true;
  };

  const isAudioFile = (fileItem: any) => {
    const mime = String(
      fileItem?.mimeType || fileItem?.fileType || "",
    ).toLowerCase();
    const name = String(
      fileItem?.name || fileItem?.fileName || "",
    ).toLowerCase();
    return (
      mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(name)
    );
  };

  const isMe = message.senderId === user?.email;
  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;
  const isHighlighted = highlightedMessageId === message.id;

  const isMediaOnly = (() => {
    if (!message.content) return true;
    const placeholders = [
      "[Hình ảnh]",
      "[Tin nhắn thoại]",
      "[Ghi âm]",
      "[Tệp tin]",
      "[Ảnh/Video]",
    ];
    if (placeholders.includes(message.content)) {
      return (
        (message.media && message.media.length > 0) ||
        (message.files && message.files.some(isAudioFile)) ||
        !!message.audioUrl
      );
    }
    return false;
  })();

  const isSticker = (() => {
    if (message.media && message.media.length === 1) {
      return isStickerMedia(message.media[0]);
    }
    return false;
  })();

  const shouldHideBubble = isMediaOnly || isSticker;
  const hasReactions = !!(
    message.reactions &&
    Object.keys(message.reactions).length > 0 &&
    !isRecalled
  );

  const bubbleClass = isMe
    ? "bg-primary/15 text-on-surface shadow-[0_2px_12px_rgba(var(--color-primary-rgb),0.08)] rounded-[22px] rounded-tr-[4px] border border-primary/20"
    : "bg-white dark:bg-surface-container-high text-on-surface shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-[22px] rounded-tl-[4px] border border-outline-variant/10";

  const handleReact = (emoji: string, action: "add" | "remove" = "add") => {
    if (isCallOverlayActive) return;
    if (!activeConvId) return;

    patchMessageOptimistic(activeConvId, message.id, {
      action: "react",
      reactAction: action,
      emoji,
    });
  };

  const handleOpenSenderProfile = () => {
    if (isMe || !message.senderId) return;
    navigate(`/profile?email=${encodeURIComponent(message.senderId)}`);
  };

  const FileIconComponent = ({ fileName }: { fileName: string }) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i))
      return <FileImage size={24} />;
    if (fileName.match(/\.(mp4|mov|avi|wmv)$/i)) return <Video size={24} />;
    if (fileName.match(/\.(mp3|wav|ogg|m4a)$/i)) return <Music size={24} />;
    if (fileName.match(/\.(zip|rar|7z|tar)$/i)) return <FileDigit size={24} />;
    return <FileText size={24} />;
  };

  if (
    message.type === "system" ||
    message.type === "SYSTEM_CALL" ||
    message.type === "call"
  ) {
    if (
      message.type === "SYSTEM_CALL" ||
      message.type === "call" ||
      (message.type === "system" && message.content?.includes("Cuộc gọi"))
    ) {
      return (
        <SystemCallMessageItem
          message={message}
          currentUserEmail={user?.email || ""}
          onCallBack={(type) => {
            startCall(type);
          }}
          onJoinCall={(callId, type) => {
            joinGroupCall(activeConvId!, callId, type);
          }}
        />
      );
    }

    let displayContent = message.content;
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.action) {
        const actorName = getDisplayName(parsed.actor, user, userProfiles);
        const rawTarget = parsed.target
          ? String(parsed.target).trim().toLowerCase()
          : "";
        const targetName = parsed.target
          ? getDisplayName(parsed.target, user, userProfiles)
          : "";
        const isActorMe =
          String(parsed.actor || "").trim().toLowerCase() ===
          String(user?.email || "")
            .trim()
            .toLowerCase();
        const actorLabel = isActorMe ? "Bạn" : actorName;
        const targetLabel =
          rawTarget &&
          user?.email &&
          rawTarget === String(user.email).trim().toLowerCase()
            ? "bạn"
            : targetName;

        switch (parsed.action) {
          case "member_added":
            displayContent = `${actorLabel} đã thêm ${targetLabel} vào nhóm`;
            break;
          case "member_removed":
          case "member_kicked":
            displayContent = `${actorLabel} đã xóa ${targetLabel} khỏi nhóm`;
            break;
          case "member_left":
            displayContent = `${actorLabel} đã rời nhóm`;
            break;
          case "role_updated":
          case "promoted_to_deputy":
          case "demoted_to_member":
          case "transferred_owner":
          case "demoted_from_deputy":
          case "ownership_transferred": {
            const role = parsed.role || (parsed.action === "promoted_to_deputy" ? "deputy" : (parsed.action === "transferred_owner" || parsed.action === "ownership_transferred") ? "owner" : "member");
            if (role === "owner") {
              displayContent = `${actorLabel} đã chuyển quyền trưởng nhóm cho ${targetLabel}`;
            } else if (role === "deputy") {
              displayContent = `${actorLabel} đã đặt ${targetLabel} làm phó nhóm`;
            } else {
              displayContent = `${actorLabel} đã hạ ${targetLabel} xuống làm thành viên`;
            }
            break;
          }
          case "pin_message":
            displayContent = `${actorLabel} đã ghim một tin nhắn`;
            break;
          case "unpin_message":
            displayContent = `${actorLabel} đã bỏ ghim tin nhắn`;
            break;
          case "info_updated":
            displayContent = `${actorLabel} đã cập nhật thông tin nhóm`;
            break;
          case "group_name_updated":
            displayContent = `${actorLabel} đã đổi tên nhóm`;
            break;
          case "group_avatar_updated":
            displayContent = `${actorLabel} đã thay đổi ảnh đại diện nhóm`;
            break;
          case "group_created":
            displayContent = `${actorLabel} đã tạo nhóm`;
            break;
          default:
            displayContent = `${actorLabel} đã thực hiện một thay đổi hệ thống`;
            break;
        }
      }
    } catch (e) {
      // Fallback to legacy parsing
      const actorEmail = (message as any).systemActionBy;
      const isActorMe = actorEmail === user?.email;
      if (isActorMe && actorEmail) {
        const actorProfile = userProfiles[actorEmail];
        const actorName =
          actorProfile?.fullName || actorProfile?.fullname || actorEmail;
        displayContent = displayContent.replace(actorName, "Bạn");
      }
    }

    return (
      <div className="flex justify-center my-8 animate-in fade-in zoom-in-95 duration-700 w-full">
        <div className="flex flex-col items-center gap-2">
          <div className="bg-black/5 dark:bg-white/5 px-5 py-2 rounded-2xl backdrop-blur-md border border-white/10 shadow-sm">
            <p className="text-[12px] font-bold text-on-surface-variant/80 tracking-wide text-center">
              {displayContent}
            </p>
          </div>
          <p className="text-[10px] font-black text-on-surface-variant/40 tracking-widest text-center uppercase">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="contents">
      <style>
        {`
          @keyframes message-flash {
            0% { background-color: transparent; }
            30% { background-color: rgba(255, 245, 157, 0.6); }
            60% { background-color: transparent; }
            80% { background-color: rgba(255, 245, 157, 0.6); }
            100% { background-color: transparent; }
          }
          .message-flash-active {
            animation: message-flash 2s ease-out;
          }
        `}
      </style>
      <div
        id={`msg-${message.id}`}
        className={`flex items-end gap-3 group relative mb-4 transition-all duration-500 ${isMe ? "flex-row-reverse" : "flex-row"} ${isHighlighted ? "scale-[1.02] z-10" : ""}`}
      >
        <div className="shrink-0 mb-1">
          {!isMe && !isConsecutive ? (
            <img
              src={getDisplayAvatar(message.senderId, user, userProfiles)}
              className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-black/5 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={handleOpenSenderProfile}
              title="Xem trang cá nhân"
              alt=""
            />
        ) : !isMe && isConsecutive ? (
          <div className="w-10" />
        ) : null}
      </div>

      <div
        className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {!isMe && !isConsecutive && (
            <span className="text-[12px] font-extrabold text-on-surface-variant/70">
              {getDisplayName(message.senderId, user, userProfiles)}
            </span>
          )}
          {isPinned && (
            <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full ring-1 ring-amber-200 animate-in fade-in zoom-in">
              <Pin size={12} strokeWidth={2.5} className="fill-amber-600/10" />
              <span className="text-[10px] font-extrabold uppercase tracking-tighter">
                Đã ghim
              </span>
            </div>
          )}
          {message.tagId &&
            (() => {
              const tag = (tags || []).find((t: any) => t.id === message.tagId);
              if (!tag) return null;
              return (
                <div className="flex items-center gap-1 ml-2">
                  <div
                    style={{ background: tag.color }}
                    className="px-2 py-0.5 rounded-full text-[11px] font-extrabold text-white shadow-sm"
                  >
                    {tag.name}
                  </div>
                </div>
              );
            })()}
        </div>

        <div className="relative group/bubble">
          {!isRecalled && !isCallOverlayActive && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5 z-[30] ${isMe ? "-left-32 flex-row-reverse animate-in slide-in-from-right-4" : "-right-32 animate-in slide-in-from-left-4"}`}
            >
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onContextMenu(message, rect.left, rect.top);
                }}
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                title="Tùy chọn khác"
              >
                <MoreHorizontal
                  size={18}
                  className="group-hover/btn:text-primary transition-colors"
                />
              </button>

              <button
                onClick={() => onForward?.(message)}
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                title="Chia sẻ"
              >
                <Forward
                  size={18}
                  className="group-hover/btn:text-primary transition-colors"
                />
              </button>

              <button
                onClick={() => onReply(message)}
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                title="Trả lời"
              >
                <Quote
                  size={18}
                  className="group-hover/btn:text-primary transition-colors"
                />
              </button>
            </div>
          )}

          <div
            className={`rounded-2xl relative transition-all duration-500 ${
              shouldHideBubble
                ? "bg-transparent p-0 border-none shadow-none"
                : `p-3 shadow-sm border ${bubbleClass} ${isMe ? "border-primary/20" : "border-outline-variant/20"}`
            } ${isHighlighted ? "message-flash-active" : ""}`}
          >
            {message.replyTo && (
              <div className={`mb-3 rounded-xl ${isMe ? 'bg-primary/10' : 'bg-black/5'} p-3 text-[12px] border-l-4 border-primary/50 flex items-center gap-3 transition-colors hover:bg-black/5`}>
                <div className="flex-1 min-w-0">
                  <p className={`font-black opacity-50 text-[10px] uppercase tracking-[0.1em] mb-1`}>
                    Phản hồi
                  </p>
                  <p className={`truncate italic ${isMe ? 'text-white/90' : 'text-on-surface/80'} font-medium`}>
                    {message.replyTo.content}
                  </p>
                </div>
              </div>
            )}

            {message.content && !isMediaOnly && (
              <div className="flex flex-col gap-2">
                {(() => {
                  if (isRecalled) {
                    return (
                      <p className="text-[15px] leading-[1.6] whitespace-pre-wrap font-medium italic opacity-50 text-on-surface">
                        Tin nhắn đã được thu hồi
                      </p>
                    );
                  }

                  // 1. Detect explicit code blocks: ```[language][:filename][\n]code```
                  const codeBlockRegex = /```(\w+)?(?::([^ \n]+))?[\n\r]?([\s\S]*?)```/g;
                  const parts = [];
                  let lastIndex = 0;
                  let match;

                  while ((match = codeBlockRegex.exec(message.content)) !== null) {
                    // Text before the code block
                    if (match.index > lastIndex) {
                      const textBefore = message.content.substring(lastIndex, match.index);
                      if (textBefore) {
                        parts.push(
                          <p key={`text-${lastIndex}`} className="text-[15px] leading-[1.6] whitespace-pre-wrap font-medium text-on-surface">
                            {textBefore}
                          </p>
                        );
                      }
                    }

                    const language = match[1] || "text";
                    const filename = match[2] || "";
                    const code = match[3].trim();

                    if (code) {
                      parts.push(
                        <CodeSnippet 
                          key={`code-${match.index}`} 
                          code={code} 
                          language={language} 
                          filename={filename} 
                        />
                      );
                    }

                    lastIndex = codeBlockRegex.lastIndex;
                  }

                  // 2. Heuristic Detection for "Plain Text Code"
                  // If no explicit blocks were found, check if the WHOLE content looks like code
                  if (parts.length === 0) {
                    const content = message.content.trim();
                    const lines = content.split('\n');
                    
                    const codeKeywords = ['import ', 'export ', 'const ', 'function ', 'class ', 'interface ', 'public ', 'private ', 'namespace ', 'using ', 'package '];
                    const hasKeyword = codeKeywords.some(kw => content.includes(kw));
                    const hasStructure = (content.match(/{/g)?.length || 0) > 0 && (content.match(/}/g)?.length || 0) > 0;
                    const isLongEnough = lines.length >= 3;

                    if ((hasKeyword && hasStructure) || (isLongEnough && hasStructure)) {
                      // Basic language guessing
                      let guessedLang = "javascript"; // default for JS/TS
                      if (content.includes("<?php")) guessedLang = "php";
                      else if (content.includes("def ") && content.includes(":")) guessedLang = "python";
                      else if (content.includes("namespace ") && content.includes(";")) guessedLang = "csharp";
                      else if (content.includes("package ") && content.includes("class ")) guessedLang = "java";
                      else if (content.includes("<html>") || content.includes("</div>")) guessedLang = "html";
                      else if (content.includes("body {") || content.includes(".class {")) guessedLang = "css";

                      return [
                        <CodeSnippet 
                          key="auto-code" 
                          code={content} 
                          language={guessedLang} 
                          filename="Auto-Detected Code" 
                        />
                      ];
                    }
                  }

                  // Remaining text after last code block
                  if (lastIndex < message.content.length) {
                    parts.push(
                      <p key={`text-${lastIndex}`} className="text-[15px] leading-[1.6] whitespace-pre-wrap font-medium text-on-surface">
                        {message.content.substring(lastIndex)}
                      </p>
                    );
                  }

                  return parts.length > 0 ? parts : (
                    <p className="text-[15px] leading-[1.6] whitespace-pre-wrap font-medium text-on-surface">
                      {message.content}
                    </p>
                  );
                })()}
              </div>
            )}

            {!isRecalled && message.contactCard && (
              <div
                className="mt-2 p-3 rounded-2xl border border-primary/20 bg-white/70 dark:bg-surface-container-high/70 max-w-[320px] cursor-pointer hover:bg-white dark:hover:bg-surface-container transition-all"
                onClick={() =>
                  navigate(
                    `/profile?email=${encodeURIComponent(message.contactCard.email)}`,
                  )
                }
              >
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary/80 mb-2">
                  Danh thiếp liên hệ
                </p>
                <div className="flex items-center gap-3">
                  <img
                    src={
                      message.contactCard.avatarUrl ||
                      getDisplayAvatar(
                        message.contactCard.email,
                        user,
                        userProfiles,
                      )
                    }
                    alt=""
                    className="w-11 h-11 rounded-full object-cover ring-1 ring-outline-variant/20"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-extrabold text-on-surface truncate">
                      {message.contactCard.fullName ||
                        message.contactCard.email}
                    </p>
                    <p className="text-[12px] text-on-surface-variant truncate">
                      {message.contactCard.email}
                    </p>
                    {message.contactCard.phone && (
                      <p className="text-[11px] text-on-surface-variant/80 truncate">
                        {message.contactCard.phone}
                      </p>
                    )}
                  </div>
                </div>
                {message.contactCard.email &&
                  message.contactCard.email !== user?.email && (
                    <div
                      className="flex gap-2 mt-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="flex-1 py-1.5 rounded-full bg-primary text-white text-[12px] font-bold hover:opacity-90 active:scale-[0.98] transition-all"
                        onClick={() =>
                          startDirectChat(message.contactCard.email)
                        }
                      >
                        Nhắn tin
                      </button>
                    </div>
                  )}
              </div>
            )}

            {!isRecalled && message.location && (
              <div className="mt-2 p-3 rounded-2xl border border-sky-200 bg-sky-50/70 dark:bg-sky-900/20 max-w-[340px]">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 mb-2">
                  {message.location.isLive
                    ? "Vị trí trực tiếp"
                    : "Vị trí hiện tại"}
                </p>
                <p className="text-[13px] font-semibold text-on-surface">
                  {message.location.label || "Vị trí chia sẻ"}
                </p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  {Number(message.location.latitude).toFixed(5)},{" "}
                  {Number(message.location.longitude).toFixed(5)}
                </p>
                {message.location.isLive && (
                  <p className="text-[11px] text-rose-600 font-bold mt-1">
                    Đang chia sẻ trực tiếp
                  </p>
                )}
                <a
                  href={`https://www.google.com/maps?q=${message.location.latitude},${message.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex mt-3 px-3 py-1.5 rounded-full bg-sky-600 text-white text-[12px] font-bold hover:opacity-90"
                >
                  Mở bản đồ
                </a>
              </div>
            )}

            {!isRecalled && (message.payload?.poll || message.poll) && (
              <div className="mt-2">
                <PollMessage
                  messageId={message.id}
                  topic={(message.payload?.poll || message.poll).topic}
                  options={(message.payload?.poll || message.poll).options}
                  votes={(message.payload?.poll || message.poll).votes || {}}
                  senderEmail={message.senderId}
                  isClosed={(message.payload?.poll || message.poll).isClosed}
                  userProfiles={userProfiles}
                  onVote={async (optionIndex: number) => {
                    if (onVotePoll) {
                      await onVotePoll(message.id, optionIndex);
                    }
                  }}
                  onClosePoll={async () => {
                    const { closePoll } = useChatStore.getState();
                    const { activeConvId } = useChatStore.getState();
                    if (activeConvId) {
                      await closePoll(activeConvId, message.id);
                    }
                  }}
                />
              </div>
            )}

            {!isRecalled && message.payload?.reminder && (
              <div className="mt-2">
                <ReminderMessage
                  messageId={message.id}
                  content={message.payload.reminder.content}
                  time={message.payload.reminder.time}
                  date={message.payload.reminder.date}
                  repeatType={message.payload.reminder.repeatType}
                />
              </div>
            )}

            {!isRecalled && (
              <div className="mt-2 space-y-2">
                {message.audioUrl && (
                  <WebAudioPlayer src={message.audioUrl} />
                )}

                {message.media && message.media.length > 0 && (
                  <div
                    className={
                      message.media.length === 1
                        ? "flex flex-col gap-2"
                        : message.media.length === 2 ||
                            message.media.length === 4
                          ? "grid grid-cols-2 gap-1.5 max-w-[280px]"
                          : "grid grid-cols-3 gap-1.5 max-w-[320px]"
                    }
                  >
                    {message.media.map((m: any, i: number) => {
                      const src = m.dataUrl || m.url;
                      const isVideo = isVideoMedia(m);
                      const isSticker = isStickerMedia(m);
                      const isHD = m?.isHD === true;
                      const mediaClass = `${
                        message.media.length === 1
                          ? "max-w-full max-h-[300px] object-contain rounded-2xl"
                          : "w-full aspect-square object-cover rounded-[10px]"
                      } border border-outline-variant/10 shadow-sm transition-opacity backdrop-blur-sm bg-surface-container`;

                      if (isVideo) {
                        return (
                          <video
                            key={i}
                            src={src}
                            className={`${mediaClass} hover:opacity-95`}
                            controls
                            preload="metadata"
                            playsInline
                          />
                        );
                      }

                      return (
                        <div key={i} className="relative inline-block">
                          <img
                            src={src}
                            onClick={() =>
                              setPreviewImage(
                                src,
                                m.fileName || m.name || "image.png",
                              )
                            }
                            className={`${isSticker ? "max-h-[180px] object-contain bg-transparent border-0 shadow-none" : mediaClass} hover:opacity-90 cursor-pointer active:scale-[0.98]`}
                            alt=""
                          />
                          {(isSticker || isHD) && (
                            <div className="absolute left-2 bottom-2 flex gap-1">
                              {isSticker && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                  STK
                                </span>
                              )}
                              {isHD && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">
                                  HD
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {(message.files || []).map((f: any, i: number) => {
                  const file = normalizeAttachment(f);

                  if (file.mimeType === "application/location") {
                    try {
                      const loc = JSON.parse(file.dataUrl || "{}");
                      return (
                        <div
                          key={i}
                          className="mt-2 p-3 rounded-2xl border border-sky-200 bg-sky-50/70 dark:bg-sky-900/20 max-w-[340px]"
                        >
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700 mb-2">
                            Vị trí chia sẻ
                          </p>
                          <p className="text-[13px] font-semibold text-on-surface">
                            {loc.label || "Vị trí hiện tại"}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">
                            {Number(loc.latitude).toFixed(5)},{" "}
                            {Number(loc.longitude).toFixed(5)}
                          </p>
                          <a
                            href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex mt-3 px-3 py-1.5 rounded-full bg-sky-600 text-white text-[12px] font-bold hover:opacity-90"
                          >
                            Mở bản đồ
                          </a>
                        </div>
                      );
                    } catch (e) {
                      return null;
                    }
                  }

                  if (file.mimeType === "application/contact") {
                    try {
                      const contact = JSON.parse(file.dataUrl || "{}");
                      return (
                        <div
                          key={i}
                          className="mt-2 p-3 rounded-2xl border border-primary/20 bg-white/70 dark:bg-surface-container-high/70 max-w-[320px]"
                        >
                          <p className="text-[10px] font-extrabold uppercase tracking-wider text-primary/80 mb-2">
                            Danh thiếp liên hệ
                          </p>
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                contact.avatarUrl ||
                                getDisplayAvatar(
                                  contact.email,
                                  user,
                                  userProfiles,
                                )
                              }
                              alt=""
                              className="w-11 h-11 rounded-full object-cover ring-1 ring-outline-variant/20"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-extrabold text-on-surface truncate">
                                {contact.fullName || contact.email}
                              </p>
                              <p className="text-[12px] text-on-surface-variant truncate">
                                {contact.email}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="mt-3 px-3 py-1.5 rounded-full bg-primary text-white text-[12px] font-bold hover:opacity-90 active:scale-[0.98]"
                            onClick={() => startDirectChat(contact.email)}
                          >
                            Nhắn tin
                          </button>
                        </div>
                      );
                    } catch (e) {
                      return null;
                    }
                  }

                  if (isAudioFile(f)) {
                    return <WebAudioPlayer key={i} src={file.dataUrl} />;
                  }

                  const handleDownload = async (e: React.MouseEvent) => {
                    e.preventDefault();
                    try {
                      const response = await fetch(file.dataUrl);
                      const blob = await response.blob();
                      const blobUrl = window.URL.createObjectURL(blob);

                      const link = document.createElement("a");
                      link.href = blobUrl;
                      link.download = file.name;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(blobUrl);
                    } catch (err) {
                      console.error("Download failed", err);
                      window.open(file.dataUrl, "_blank");
                    }
                  };

                  return (
                    <div
                      key={i}
                      onClick={handleDownload}
                      className="flex items-center gap-3 p-3 w-[270px] md:w-[320px] max-w-full bg-white/50 dark:bg-surface-container-high/70 border border-outline-variant/10 dark:border-outline-variant/40 rounded-xl hover:bg-white dark:hover:bg-surface-container-high transition-all shadow-sm group/file cursor-pointer active:scale-[0.98]"
                    >
                      <div className="w-10 h-10 flex items-center justify-center bg-primary/5 rounded-xl text-primary group-hover/file:bg-primary/10 transition-colors">
                        <FileIconComponent fileName={file.name} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[14px] font-bold text-on-surface"
                          title={file.name}
                        >
                          {truncateFileName(file.name, 40)}
                        </p>
                        <p className="text-[11px] font-medium opacity-50 uppercase">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Download
                        size={20}
                        className="ml-2 opacity-40 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!isRecalled && !isCallOverlayActive && (
            <div
              ref={reactionDockRef}
              className={`absolute ${hasReactions ? "-bottom-10" : "-bottom-4"} ${isMe ? "left-2" : "right-2"} z-[30]`}
              onMouseEnter={() => setIsReactionDockOpen(true)}
              onMouseLeave={() => setIsReactionDockOpen(false)}
            >
              <div className="absolute bottom-full h-3 left-0 right-0" />
              <button
                className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant"
                title="Thả cảm xúc"
              >
                <ThumbsUp
                  size={16}
                  className={`transition-colors ${isReactionDockOpen ? "text-primary" : ""}`}
                />
              </button>

              <div
                className={`absolute bottom-full mb-3 transition-all duration-300 bg-white/90 dark:bg-surface-container/90 backdrop-blur-xl border border-outline-variant/10 rounded-[32px] flex items-center p-2 gap-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.2)] z-[40] ${isMe ? "right-0" : "left-0"} ${isReactionDockOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-90 pointer-events-none"}`}
              >
                {[
                  { e: "👍", label: "Thích" },
                  { e: "❤️", label: "Yêu thích" },
                  { e: "😄", label: "Cười" },
                  { e: "😮", label: "Ngạc nhiên" },
                  { e: "😭", label: "Buồn" },
                  { e: "😡", label: "Giận dữ" },
                ].map(({ e, label }) => (
                  <button
                    key={e}
                    onClick={() => handleReact(e)}
                    className="w-11 h-11 flex items-center justify-center hover:bg-primary/10 rounded-full transition-all hover:scale-150 active:scale-95 duration-200"
                    title={label}
                  >
                    <FluentEmoji emoji={e} className="w-8 h-8 drop-shadow-md" alt={label} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasReactions && (
            <div
              className={`absolute -bottom-3.5 flex flex-wrap gap-1 ${isMe ? "right-2" : "left-2"} z-[5] ${isCallOverlayActive ? "pointer-events-none" : ""}`}
            >
              <div className="flex items-center bg-white dark:bg-surface-container-high shadow-lg rounded-full px-2 py-1 border border-outline-variant/20 gap-1.5 animate-in zoom-in-50 duration-300">
                {Object.entries(message.reactions).map(
                  ([emoji, users]: [string, any]) => (
                    <div
                      key={emoji}
                      className="flex items-center gap-1 group/emoji relative cursor-pointer hover:scale-110 active:scale-95 transition-all"
                      title={users.join(", ")}
                      onClick={() => handleReact(emoji, "add")}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleReact(emoji, "remove");
                      }}
                    >
                      <FluentEmoji emoji={emoji} className="w-4.5 h-4.5 drop-shadow-sm" />
                      <span className="text-[11px] font-black text-on-surface-variant/80">
                        {users.length}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5 px-1 opacity-60 transition-all">
          <span className="text-[10px] font-extrabold uppercase tracking-tight">
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {isMe && (
            <div className="flex items-center ml-1">
              {message.status === "sending" ? (
                <span className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Đang gửi...
                </span>
              ) : message.status === "error" ? (
                <span className="text-[10px] text-error font-medium flex items-center gap-1">
                  <AlertCircle size={10} /> Lỗi
                </span>
              ) : message.status === "read" ? (
                <span className="text-[10px] text-primary font-bold">
                  Đã xem
                </span>
              ) : message.status === "delivered" ? (
                <span className="text-[10px] text-outline font-medium">
                  Đã nhận
                </span>
              ) : (
                <span className="text-[10px] text-outline font-medium">
                  Đã gửi
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
};

export default MessageBubble;
