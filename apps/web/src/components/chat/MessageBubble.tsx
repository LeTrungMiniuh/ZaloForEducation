/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    AlertCircle,
    Download,
    FileDigit,
    FileImage,
    FileText,
    Forward,
    Heart,
    Loader2,
    MoreHorizontal,
    Music,
    Pin,
    Quote,
    Video
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { formatFileSize, getDisplayAvatar, getDisplayName, normalizeAttachment, truncateFileName } from '../../utils/chatUtils';

interface MessageBubbleProps {
  message: any;
  onContextMenu: (message: any, x: number, y: number) => void;
  userProfiles: Record<string, any>;
  hideTime?: boolean;
  onReply: (message: any) => void;
  onForward?: (message: any) => void;
}

const FLUENT_EMOJI_MAP: Record<string, string> = {
  '👍': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Thumbs%20Up/3D/thumbs_up_3d.png',
  '❤️': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20Heart/3D/red_heart_3d.png',
  '😄': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png',
  '😮': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png',
  '😭': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png',
  '😡': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Enraged%20Face/3D/enraged_face_3d.png',
};

// URL-encode spaces for all links
Object.keys(FLUENT_EMOJI_MAP).forEach(key => {
  FLUENT_EMOJI_MAP[key] = FLUENT_EMOJI_MAP[key].replace(/ /g, '%20');
});

const FluentEmoji: React.FC<{ emoji: string, className?: string, alt?: string }> = ({ emoji, className, alt }) => {
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

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onContextMenu, userProfiles, onReply, onForward }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { patchMessageOptimistic, activeConvId, highlightedMessageId, setPreviewImage } = useChatStore();
  const isMe = message.senderId === user?.email;
  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;
  const isHighlighted = highlightedMessageId === message.id;

  const isVideoMedia = (mediaItem: any) => {
    const mime = String(mediaItem?.mimeType || mediaItem?.fileType || '').toLowerCase();
    const name = String(mediaItem?.name || mediaItem?.fileName || mediaItem?.url || mediaItem?.dataUrl || '').toLowerCase();
    return mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name);
  };

  const isStickerMedia = (mediaItem: any) => {
    const mime = String(mediaItem?.mimeType || mediaItem?.fileType || '').toLowerCase();
    return mime.includes('sticker') || mediaItem?.isSticker === true;
  };

  const bubbleClass = isMe 
    ? 'bg-primary/10 text-on-surface rounded-2xl rounded-tr-none' 
    : 'bg-white dark:bg-surface-container-high text-on-surface rounded-2xl rounded-tl-none';

  const handleReact = (emoji: string, action: 'add' | 'remove' = 'add') => {
    if (!activeConvId) return;
    
    patchMessageOptimistic(activeConvId, message.id, {
      action: 'react',
      reactAction: action,
      emoji
    });
  };

  const handleOpenSenderProfile = () => {
    if (isMe || !message.senderId) return;
    navigate(`/profile?email=${encodeURIComponent(message.senderId)}`);
  };

  // Helper to render file icon components
  const FileIconComponent = ({ fileName }: { fileName: string }) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <FileImage size={24} />;
    if (fileName.match(/\.(mp4|mov|avi|wmv)$/i)) return <Video size={24} />;
    if (fileName.match(/\.(mp3|wav|ogg|m4a)$/i)) return <Music size={24} />;
    if (fileName.match(/\.(zip|rar|7z|tar)$/i)) return <FileDigit size={24} />;
    return <FileText size={24} />;
  };

  // 1. Handle System Messages separately
  if (message.type === 'system') {
    const actorEmail = (message as any).systemActionBy;
    const isActorMe = actorEmail === user?.email;
    
    // Replace actor name with "Bạn" if it's the current user
    let displayContent = message.content;
    if (isActorMe && actorEmail) {
      const actorProfile = userProfiles[actorEmail];
      const actorName = actorProfile?.fullName || actorProfile?.fullname || actorEmail;
      displayContent = displayContent.replace(actorName, 'Bạn');
    }

    return (
      <div className="flex justify-center my-6 animate-in fade-in zoom-in-95 duration-500 w-full">
        <div className="flex flex-col items-center gap-1">
          <div className="bg-surface-container-high/40 px-4 py-1.5 rounded-full backdrop-blur-sm border border-outline-variant/5 shadow-sm">
            <p className="text-[11px] font-bold text-on-surface-variant/70 tracking-tight text-center">
              {displayContent}
            </p>
          </div>
          <p className="text-[11px] font-bold text-on-surface-variant/70 tracking-tight text-center">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      id={`msg-${message.id}`}
      className={`flex items-end gap-3 group relative mb-4 transition-all duration-500 ${isMe ? 'flex-row-reverse' : 'flex-row'} ${isHighlighted ? 'scale-105 z-10' : ''}`}
    >
      {/* Avatar */}
      <div className="shrink-0 mb-1">
        {!isMe ? (
          <img 
            src={getDisplayAvatar(message.senderId, user, userProfiles)} 
            className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-black/5 cursor-pointer hover:opacity-90 transition-opacity" 
            onClick={handleOpenSenderProfile}
            title="Xem trang cá nhân"
            alt="" 
          />
        ) : null}
      </div>

      {/* Main Message Content */}
      <div className={`flex flex-col max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
        {/* Name & Pin Tag */}
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {!isMe && (
            <span className="text-[12px] font-extrabold text-on-surface-variant/70">
              {getDisplayName(message.senderId, user, userProfiles)}
            </span>
          )}
          {isPinned && (
            <div className="flex items-center gap-1 bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full ring-1 ring-amber-200 animate-in fade-in zoom-in">
              <Pin size={12} strokeWidth={2.5} className="fill-amber-600/10" />
              <span className="text-[10px] font-extrabold uppercase tracking-tighter">Đã ghim</span>
            </div>
          )}
        </div>

        {/* Bubble & Actions Wrapper */}
        <div className="relative group/bubble">
          {/* Action Toolbar (Hover icons on the side) */}
          {!isRecalled && (
            <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center gap-1.5 z-[100] ${isMe ? '-left-32 flex-row-reverse animate-in slide-in-from-right-4' : '-right-32 animate-in slide-in-from-left-4'}`}>
               
               {/* Click for Context Menu */}
               <button 
                 onClick={(e) => {
                   const rect = e.currentTarget.getBoundingClientRect();
                   onContextMenu(message, rect.left, rect.top);
                 }}
                 className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                 title="Tùy chọn khác"
               >
                 <MoreHorizontal size={18} className="group-hover/btn:text-primary transition-colors" />
               </button>

               {/* Share Button */}
               <button 
                 onClick={() => onForward?.(message)}
                 className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                 title="Chia sẻ"
               >
                 <Forward size={18} className="group-hover/btn:text-primary transition-colors" />
               </button>

               {/* Reply Button */}
               <button 
                 onClick={() => onReply(message)}
                 className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                 title="Trả lời"
               >
                 <Quote size={18} className="group-hover/btn:text-primary transition-colors" />
               </button>

               {/* Reaction Button with Hover Emoji Bar */}
               <div className="relative group/reactbtn">
                 <button 
                    className="w-8 h-8 flex items-center justify-center bg-white dark:bg-surface-container border border-outline-variant/30 dark:border-outline-variant/40 rounded-full shadow-lg hover:bg-surface-container active:scale-90 transition-all text-on-surface-variant group/btn"
                    title="Thả cảm xúc"
                 >
                   <Heart size={18} className="group-hover/btn:text-error transition-colors" />
                 </button>

                 {/* Floating Emoji Bar */}
                 <div className={`absolute bottom-full mb-2 opacity-0 group-hover/reactbtn:opacity-100 group-hover/reactbtn:translate-y-0 translate-y-2 pointer-events-none group-hover:pointer-events-auto transition-all duration-200 bg-white/95 dark:bg-surface-container/95 backdrop-blur-md border border-outline-variant/20 dark:border-outline-variant/40 rounded-full flex items-center p-1.5 gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.15)] z-[110] ${isMe ? 'right-0' : 'left-0'}`}>
                    {[
                      { e: '👍', label: 'Thích' },
                      { e: '❤️', label: 'Yêu thích' },
                      { e: '😄', label: 'Cười' },
                      { e: '😮', label: 'Ngạc nhiên' },
                      { e: '😭', label: 'Buồn' },
                      { e: '😡', label: 'Giận dữ' }
                    ].map(({e, label}) => (
                      <button 
                        key={e} 
                        onClick={() => handleReact(e)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-primary/5 rounded-full transition-all hover:scale-150 active:scale-110"
                        title={label}
                      >
                        <FluentEmoji emoji={e} className="w-7 h-7" alt={label} />
                      </button>
                    ))}
                 </div>
               </div>
            </div>
          )}

          {/* Actual Bubble */}
          <div className={`p-3 rounded-2xl shadow-sm border ${bubbleClass} ${isMe ? 'border-primary/20' : 'border-outline-variant/20'} relative transition-all duration-500 ${isHighlighted ? 'animate-pulse-highlight ring-4 ring-amber-400/50 shadow-2xl scale-[1.02]' : ''}`}>
             {message.replyTo && (
                <div className="mb-2 rounded-xl bg-black/5 p-2.5 text-[12px] border-l-4 border-primary/50 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold opacity-60 text-[10px] uppercase tracking-wider">Phản hồi</p>
                    <p className="truncate italic text-on-surface/80">{message.replyTo.content}</p>
                  </div>
                </div>
             )}

             <p className={`text-[15px] leading-relaxed whitespace-pre-wrap ${isRecalled ? 'italic opacity-50 font-medium' : 'text-on-surface'}`}>
               {isRecalled ? 'Tin nhắn đã được thu hồi' : message.content}
             </p>

             {!isRecalled && (
               <div className="mt-2 space-y-2">
                 {message.media && message.media.length > 0 && (
                   <div className={
                     message.media.length === 1 
                       ? 'flex flex-col gap-2' 
                       : message.media.length === 2 || message.media.length === 4
                       ? 'grid grid-cols-2 gap-1.5 max-w-[280px]'
                       : 'grid grid-cols-3 gap-1.5 max-w-[320px]'
                   }>
                    {message.media.map((m: any, i: number) => {
                      const src = m.dataUrl || m.url;
                      const isVideo = isVideoMedia(m);
                      const isSticker = isStickerMedia(m);
                      const isHD = m?.isHD === true;
                      const mediaClass = `${
                        message.media.length === 1
                          ? 'max-w-full max-h-[300px] object-contain rounded-2xl'
                          : 'w-full aspect-square object-cover rounded-[10px]'
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
                            onClick={() => setPreviewImage(src, m.fileName || m.name || 'image.png')}
                            className={`${isSticker ? 'max-h-[180px] object-contain bg-transparent border-0 shadow-none' : mediaClass} hover:opacity-90 cursor-pointer active:scale-[0.98]`}
                            alt=""
                          />
                          {(isSticker || isHD) && (
                            <div className="absolute left-2 bottom-2 flex gap-1">
                              {isSticker && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">STK</span>}
                              {isHD && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">HD</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                   </div>
                 )}
                 
                 {(message.files || []).map((f: any, i: number) => {
                   const file = normalizeAttachment(f);
                   
                   const handleDownload = async (e: React.MouseEvent) => {
                     e.preventDefault();
                     try {
                       const response = await fetch(file.dataUrl);
                       const blob = await response.blob();
                       const blobUrl = window.URL.createObjectURL(blob);
                       
                       const link = document.createElement('a');
                       link.href = blobUrl;
                       link.download = file.name; // Use the original filename
                       document.body.appendChild(link);
                       link.click();
                       document.body.removeChild(link);
                       window.URL.revokeObjectURL(blobUrl);
                     } catch (err) {
                       console.error('Download failed', err);
                       // Fallback to direct link if fetch fails (e.g. CORS)
                       window.open(file.dataUrl, '_blank');
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
                         <p className="text-[14px] font-bold text-on-surface" title={file.name}>{truncateFileName(file.name, 40)}</p>
                         <p className="text-[11px] font-medium opacity-50 uppercase">{formatFileSize(file.size)}</p>
                       </div>
                       <Download size={20} className="ml-2 opacity-40 group-hover:opacity-100 transition-opacity" />
                     </div>
                   );
                 })}
               </div>
             )}
          </div>

          {/* Reactions Row */}
          {message.reactions && Object.keys(message.reactions).length > 0 && !isRecalled && (
            <div className={`absolute -bottom-3 flex flex-wrap gap-1 ${isMe ? 'right-0' : 'left-0'} z-[5]`}>
              <div className="flex items-center bg-white dark:bg-surface-container-high shadow-md rounded-full px-1.5 py-0.5 border border-outline-variant/10 dark:border-outline-variant/40 gap-1 animate-in zoom-in-50 duration-200">
                {Object.entries(message.reactions).map(([emoji, users]: [string, any]) => (
                  <div 
                    key={emoji} 
                    className="flex items-center gap-0.5 group/emoji relative cursor-pointer hover:scale-110 active:scale-95 transition-transform" 
                    title={users.join(', ')}
                    onClick={() => handleReact(emoji, 'add')}
                    onContextMenu={(e) => { e.preventDefault(); handleReact(emoji, 'remove'); }}
                  >
                    <FluentEmoji emoji={emoji} className="w-4 h-4" />
                    <span className="text-[10px] font-extrabold text-on-surface-variant/60">{users.length}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Info (Time, Status) */}
        <div className="flex items-center gap-2 mt-1.5 px-1 opacity-60 transition-all">
          <span className="text-[10px] font-extrabold uppercase tracking-tight">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isMe && (
            <div className="flex items-center ml-1">
              {message.status === 'sending' ? (
                <span className="text-[10px] text-on-surface-variant font-medium flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" /> Đang gửi...
                </span>
              ) : message.status === 'error' ? (
                <span className="text-[10px] text-error font-medium flex items-center gap-1">
                  <AlertCircle size={10} /> Lỗi
                </span>
              ) : message.status === 'read' ? (
                <span className="text-[10px] text-primary font-bold">Đã xem</span>
              ) : message.status === 'delivered' ? (
                <span className="text-[10px] text-outline font-medium">Đã nhận</span>
              ) : (
                <span className="text-[10px] text-outline font-medium">Đã gửi</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
