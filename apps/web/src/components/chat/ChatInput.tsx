import {
  CheckCircle2,
  CreditCard,
  Crop,
  Contact,
  MapPin,
  Mic,
  Radio,
  Square,
    FileText,
    Image,
    Loader2,
  MoreHorizontal,
    Paperclip,
  PenTool,
    Reply,
    SendHorizontal,
    Search,
    Smile,
    Sticker,
  ThumbsUp,
    X
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { useFriendships } from '../../hooks/useFriendships';
import { chatService } from '../../services/chatService';
import { useChatStore } from '../../store/chatStore';
import type { Attachment } from '../../utils/chatUtils';
import { compressImage } from '../../utils/imageUtils';
import GifPicker from './GifPicker';
import StickerPicker from './StickerPicker';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => Promise<void>;
  onSendContactCard: (card: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    phone?: string;
  }) => Promise<void>;
  onSendLocation: (location: {
    latitude: number;
    longitude: number;
    label?: string;
    isLive?: boolean;
    liveSessionId?: string;
    sentAt?: string;
    expiresAt?: string;
  }) => Promise<void>;
  replyTarget: any | null;
  onClearReply: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onSendContactCard, onSendLocation, replyTarget, onClearReply }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactEmail, setSelectedContactEmail] = useState('');
  const [sendImageAsHD, setSendImageAsHD] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [pendingVoice, setPendingVoice] = useState<{
    blob: Blob;
    url: string;
    durationSec: number;
  } | null>(null);
  const [isLiveSharing, setIsLiveSharing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveLocationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveLocationStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveLocationUpdatesRef = useRef(0);

  const { socket, user } = useAuth();
  const { activeConvId, userProfiles, loadUserProfile } = useChatStore();
  const { acceptedFriends } = useFriendships();

  const contactCandidates = acceptedFriends
    .map((friendship) =>
      friendship.sender_id === user?.email ? friendship.receiver_id : friendship.sender_id,
    )
    .filter((email, index, arr) => !!email && email !== user?.email && arr.indexOf(email) === index);

  const hasImageAttachments = attachments.some((a) => a.mimeType.startsWith('image/'));

  const handleTyping = () => {
    if (!socket || !activeConvId) return;

    // Only emit once every 2 seconds
    if (!typingTimeoutRef.current) {
      socket.emit('typing', { convId: activeConvId, isTyping: true });
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    }
  };

  const handleSend = async () => {
    if (!text.trim() && attachments.length === 0) return;
    const currentText = text;
    const currentAttachments = [...attachments];

    if (socket && activeConvId) {
      socket.emit('typing', { convId: activeConvId, isTyping: false });
    }

    setIsUploading(true);
    try {
      const uploadedAttachments: Attachment[] = await Promise.all(
        currentAttachments.map(async (item) => {
          if (!item.file) {
            return item;
          }

          let fileToUpload = item.file;
          const isImage = item.mimeType.startsWith('image/');

          if (isImage && !sendImageAsHD && item.mimeType !== 'image/gif') {
            try {
              fileToUpload = await compressImage(item.file, 1600, 0.82);
            } catch (compressError) {
              console.warn('Image compression failed, fallback to original file:', compressError);
            }
          }

          const res = await chatService.upload(fileToUpload);
          const data = res.data;
          return {
            name: data.name || fileToUpload.name,
            mimeType: data.mimeType || fileToUpload.type,
            size: data.size || fileToUpload.size,
            dataUrl: data.fileUrl || data.url || item.dataUrl,
            file: null as any,
            isHD: isImage ? sendImageAsHD : undefined,
            isSticker: item.isSticker,
          };
        }),
      );

      await onSendMessage(currentText, uploadedAttachments);
      setText('');
      setAttachments([]);
      setSendImageAsHD(false);
    } catch (err) {
      console.error('Send message failed', err);
      Swal.fire('Lỗi', 'Không thể gửi tin nhắn. Vui lòng thử lại.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuickLike = async () => {
    if (isUploading) return;
    await onSendMessage('👍', []);
  };

  const cleanupRecordingResources = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const sendVoiceBlob = async (blob: Blob, durationSec: number) => {
    try {
      setIsUploading(true);
      const mimeType = blob.type || 'audio/webm';
      const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
      const res = await chatService.upload(file);
      const data = res.data;

      await onSendMessage('', [{
        name: data.name || `voice-${durationSec}s.${extension}`,
        mimeType: data.mimeType || mimeType,
        size: data.size || blob.size,
        dataUrl: data.fileUrl || data.url,
        file: null as any,
      }]);
      return true;
    } catch (error) {
      console.error('Send voice message failed', error);
      Swal.fire('Lỗi', 'Không thể gửi tin nhắn thoại. Vui lòng thử lại.', 'error');
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const clearPendingVoice = () => {
    setPendingVoice((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  };

  const handleSendPendingVoice = async () => {
    if (!pendingVoice || isUploading) return;
    const ok = await sendVoiceBlob(pendingVoice.blob, pendingVoice.durationSec);
    if (ok) {
      clearPendingVoice();
    }
  };

  const startRecording = async () => {
    if (isRecording || isUploading) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      Swal.fire('Không hỗ trợ', 'Trình duyệt không hỗ trợ thu âm.', 'warning');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const duration = recordingSeconds;
        setRecordingSeconds(0);
        cleanupRecordingResources();
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setPendingVoice((prev) => {
            if (prev?.url) {
              URL.revokeObjectURL(prev.url);
            }
            return {
              blob,
              url,
              durationSec: duration,
            };
          });
        }
      };

      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start();

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Start recording failed', error);
      Swal.fire('Không thể thu âm', 'Bạn cần cho phép quyền microphone để gửi tin nhắn thoại.', 'warning');
      cleanupRecordingResources();
    }
  };

  const stopRecording = () => {
    if (!isRecording) return;
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupRecordingResources();
      setRecordingSeconds(0);
    }
  };

  const sendCurrentLocation = async () => {
    setShowLocationMenu(false);
    // One-shot location should never keep a previous live session running.
    stopLiveLocation();
    if (!navigator.geolocation) {
      Swal.fire('Không hỗ trợ', 'Trình duyệt không hỗ trợ định vị.', 'warning');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await onSendLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          label: 'Vị trí hiện tại',
          isLive: false,
          sentAt: new Date().toISOString(),
        });
      },
      () => Swal.fire('Không lấy được vị trí', 'Vui lòng bật quyền truy cập vị trí và thử lại.', 'warning'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const stopLiveLocation = () => {
    if (liveLocationTimerRef.current) {
      clearInterval(liveLocationTimerRef.current);
      liveLocationTimerRef.current = null;
    }
    if (liveLocationStopRef.current) {
      clearTimeout(liveLocationStopRef.current);
      liveLocationStopRef.current = null;
    }
    liveLocationUpdatesRef.current = 0;
    setIsLiveSharing(false);
  };

  const startLiveLocation = async () => {
    setShowLocationMenu(false);
    if (!navigator.geolocation) {
      Swal.fire('Không hỗ trợ', 'Trình duyệt không hỗ trợ định vị.', 'warning');
      return;
    }

    stopLiveLocation();
    const liveSessionId = `live-${Date.now()}`;
    const LIVE_DURATION_MS = 5 * 60 * 1000;
    const LIVE_INTERVAL_MS = 60 * 1000;
    const MAX_LIVE_UPDATES = 5;
    const expiresAt = new Date(Date.now() + LIVE_DURATION_MS).toISOString();

    liveLocationUpdatesRef.current = 0;

    const pushLocation = () => {
      if (liveLocationUpdatesRef.current >= MAX_LIVE_UPDATES) {
        stopLiveLocation();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await onSendLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            label: 'Vị trí trực tiếp',
            isLive: true,
            liveSessionId,
            sentAt: new Date().toISOString(),
            expiresAt,
          });
          liveLocationUpdatesRef.current += 1;
          if (liveLocationUpdatesRef.current >= MAX_LIVE_UPDATES) {
            stopLiveLocation();
          }
        },
        () => null,
        { enableHighAccuracy: true, timeout: 12000 },
      );
    };

    pushLocation();
    setIsLiveSharing(true);
    liveLocationTimerRef.current = setInterval(pushLocation, LIVE_INTERVAL_MS);
    liveLocationStopRef.current = setTimeout(() => {
      stopLiveLocation();
    }, LIVE_DURATION_MS);

    Swal.fire({
      icon: 'info',
      title: 'Đã bật vị trí trực tiếp',
      text: 'Hệ thống sẽ gửi tối đa 5 lần trong 5 phút hoặc đến khi bạn dừng.',
      timer: 2200,
      showConfirmButton: false,
    });
  };

  React.useEffect(() => {
    return () => {
      stopLiveLocation();
      cleanupRecordingResources();
      setPendingVoice((prev) => {
        if (prev?.url) {
          URL.revokeObjectURL(prev.url);
        }
        return null;
      });
    };
  }, []);

  const handleGifSelect = async (url: string) => {
    setShowGifPicker(false);
    // Instant send for GIF
    await onSendMessage('', [{
      name: `meme-${Date.now()}.gif`,
      mimeType: 'image/gif',
      size: 1024,
      dataUrl: url,
      file: null as any
    }]);
  };

  const handleStickerSelect = async (sticker: { url: string; name: string }) => {
    setShowStickerPicker(false);
    await onSendMessage('', [{
      name: `sticker-${Date.now()}.png`,
      mimeType: 'image/sticker',
      size: 1024,
      dataUrl: sticker.url,
      file: null as any,
      isSticker: true,
    }]);
  };

  const handleSendContact = async () => {
    if (!selectedContactEmail) return;

    const profile = userProfiles[selectedContactEmail] || {};
    setShowContactPicker(false);
    setContactSearch('');
    setSelectedContactEmail('');
    await onSendContactCard({
      email: selectedContactEmail,
      fullName: profile.fullName || profile.fullname || selectedContactEmail,
      avatarUrl: profile.avatarUrl || profile.urlAvatar,
      phone: profile.phone,
    });
  };

  const openContactPicker = () => {
    if (contactCandidates.length === 0) {
      Swal.fire('Chưa có liên hệ', 'Bạn cần kết bạn để gửi danh thiếp liên hệ.', 'info');
      return;
    }

    contactCandidates.forEach((email) => {
      loadUserProfile(email);
    });
    setContactSearch('');
    setSelectedContactEmail('');
    setShowContactPicker(true);
  };

  const normalizedSearch = contactSearch.trim().toLowerCase();
  const filteredContacts = contactCandidates
    .map((email) => {
      const profile = userProfiles[email] || {};
      const displayName = String(profile.fullName || profile.fullname || email);
      const phone = String(profile.phone || '');
      return {
        email,
        displayName,
        phone,
        avatarUrl: profile.avatarUrl || profile.urlAvatar || '',
      };
    })
    .filter((item) => {
      if (!normalizedSearch) return true;
      return (
        item.displayName.toLowerCase().includes(normalizedSearch) ||
        item.email.toLowerCase().includes(normalizedSearch) ||
        item.phone.toLowerCase().includes(normalizedSearch)
      );
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'file') => {
    let validFiles = Array.from(e.target.files || []);
    if (validFiles.length === 0) return;

    if (attachments.length + validFiles.length > 50) {
      Swal.fire('Quá giới hạn', 'Chỉ được tải lên tối đa 50 tệp/ảnh cùng một lúc.', 'warning');
      validFiles = validFiles.slice(0, 50 - attachments.length);
      if (validFiles.length === 0) return;
    }

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

    const oversizedFiles = validFiles.filter(f => {
      if (f.type.startsWith('image/')) {
        return f.size > MAX_IMAGE_SIZE;
      }
      // Covers video and all other file types
      return f.size > MAX_FILE_SIZE;
    });

    if (oversizedFiles.length > 0) {
      Swal.fire(
        'Tệp quá lớn', 
        `Có ${oversizedFiles.length} tệp vượt quá kích thước cho phép (Ảnh được vác tối đa 10MB, Video & Tệp tối đa 100MB) nên tự động bị bỏ qua.`, 
        'warning'
      );
      validFiles = validFiles.filter(f => {
        if (f.type.startsWith('image/')) {
          return f.size <= MAX_IMAGE_SIZE;
        }
        return f.size <= MAX_FILE_SIZE;
      });
      if (validFiles.length === 0) return;
    }

    try {
      const newAttachments: Attachment[] = [];
      for (const file of validFiles) {
        const isImage = _type === 'image' && file.type.startsWith('image/');
        newAttachments.push({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: URL.createObjectURL(file),
          file,
          isHD: false,
        });
      }
      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (err) {
      console.error('Upload failed', err);
      alert('Không thể tải tệp lên. Vui lòng thử lại.');
    } finally {
      if (e.target) e.target.value = '';
      
      // Auto focus textarea so Enter key acts on send immediately after picking files
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div className="p-2 bg-white/80 dark:bg-surface-container/90 backdrop-blur-xl border-t border-outline-variant/10 dark:border-outline-variant/30 space-y-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.25)] z-10 transition-all duration-300">
      {/* Reply Preview */}
      {replyTarget && (
        <div className="flex items-center justify-between p-2 bg-primary/5 rounded-xl border-l-[3px] border-primary animate-in slide-in-from-bottom-3 fade-in duration-300 shadow-sm overflow-hidden relative group">
           <div className="min-w-0 flex-1 relative z-10">
             <div className="flex items-center gap-1 mb-0.5">
               <Reply size={14} className="text-primary" />
               <p className="text-[11px] font-extrabold text-primary uppercase tracking-wider">Đang trả lời {replyTarget.senderId}</p>
             </div>
             <p className="text-[13px] text-on-surface-variant/80 truncate font-medium italic">{replyTarget.content}</p>
           </div>
           <button 
             onClick={onClearReply} 
             className="relative z-10 p-1 hover:bg-primary/10 rounded-full transition-all text-primary/60 hover:text-primary active:scale-90"
           >
             <X size={18} />
           </button>
           <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-primary/10 transition-all" />
        </div>
      )}

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 py-1 animate-in fade-in slide-in-from-left-2 duration-300 max-h-[170px] overflow-y-auto custom-scrollbar">
          {attachments.map((a, i) => (
            <div key={i} className="relative group/att shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-16 h-16 rounded-xl bg-surface-container-low border border-outline-variant/10 flex items-center justify-center overflow-hidden relative">
                {a.mimeType.startsWith('image/') ? (
                  <img src={a.dataUrl} className="w-full h-full object-cover group-hover/att:scale-110 transition-transform duration-500" alt="" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <FileText size={22} className="text-primary" />
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter truncate w-14 px-1">{a.name.split('.').pop()}</span>
                  </div>
                )}
                {(a.isSticker || (a.mimeType.startsWith('image/') && sendImageAsHD)) && (
                  <div className="absolute left-1 bottom-1 flex gap-1">
                    {a.isSticker && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">STK</span>}
                    {a.mimeType.startsWith('image/') && sendImageAsHD && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">HD</span>}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover/att:bg-black/5 transition-all" />
              </div>
              <button 
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 bg-error text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg opacity-0 group-hover/att:opacity-100 translate-y-2 group-hover/att:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-90"
              >
                <X size={12} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {hasImageAttachments && (
        <div className="flex items-center gap-1.5 px-0.5">
          <button
            onClick={() => setSendImageAsHD(prev => !prev)}
            className={`h-7 px-2.5 rounded-full text-[10px] font-bold transition-all border ${sendImageAsHD ? 'bg-primary text-white border-primary' : 'bg-transparent text-on-surface-variant border-outline-variant/40 hover:border-primary/60 hover:text-primary'}`}
            title="Bật để gửi ảnh HD (không nén)"
            type="button"
          >
            HD
          </button>
          <p className="text-[10px] text-on-surface-variant">HD chỉ hiện khi đã chọn ảnh.</p>
        </div>
      )}

      {pendingVoice && !isRecording && (
        <div className="flex items-center gap-2 p-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/60">
          <audio src={pendingVoice.url} controls className="h-9 flex-1 min-w-0" preload="metadata" />
          <div className="text-[11px] font-bold text-on-surface-variant shrink-0">
            {Math.floor(pendingVoice.durationSec / 60).toString().padStart(2, '0')}:{(pendingVoice.durationSec % 60).toString().padStart(2, '0')}
          </div>
          <button
            type="button"
            onClick={clearPendingVoice}
            className="h-9 px-3 rounded-lg border border-outline-variant/30 text-[12px] font-bold text-on-surface-variant hover:bg-surface-container"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSendPendingVoice}
            disabled={isUploading}
            className={`h-9 px-3 rounded-lg text-[12px] font-bold text-white ${isUploading ? 'bg-primary/40 cursor-not-allowed' : 'bg-primary hover:opacity-90'}`}
          >
            Gửi voice
          </button>
        </div>
      )}

      {/* Main Input Bar */}
      <div className="relative z-[30] rounded-xl border border-outline-variant/25 bg-white dark:bg-surface-container shadow-sm overflow-visible">
        <div className="px-2 py-1.5 border-b border-outline-variant/20 flex flex-wrap items-center gap-1">
          <div className="relative">
            <button
              onClick={() => {
                setShowStickerPicker(!showStickerPicker);
                setShowGifPicker(false);
                setShowLocationMenu(false);
              }}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${showStickerPicker ? 'bg-primary/10 text-primary' : 'text-primary hover:bg-primary/10'}`}
              type="button"
              title="Sticker"
            >
              <Sticker size={16} />
            </button>
            {showStickerPicker && (
              <div className="absolute bottom-[115%] left-0 z-[500]">
                <StickerPicker onSelect={handleStickerSelect} />
              </div>
            )}
          </div>

          <button onClick={() => imageInputRef.current?.click()} className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" type="button" title="Gửi hình ảnh">
            <Image size={16} />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" type="button" title="Đính kèm tệp">
            <Paperclip size={16} />
          </button>
          <button onClick={openContactPicker} className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" type="button" title="Gửi danh thiếp liên hệ">
            <Contact size={16} />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowLocationMenu((prev) => !prev)}
              className={`w-8 h-8 rounded-md flex items-center justify-center ${isLiveSharing ? 'text-rose-600 bg-rose-50' : 'text-primary hover:bg-primary/10'}`}
              type="button"
              title="Gửi vị trí"
            >
              <MapPin size={16} />
            </button>
            {showLocationMenu && (
              <div className="absolute bottom-[115%] left-0 z-[520] min-w-[220px] bg-white border border-outline-variant/20 rounded-xl shadow-lg p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={sendCurrentLocation}
                  className="w-full text-left h-9 px-3 rounded-lg hover:bg-surface-container-low text-[13px] font-semibold text-on-surface"
                >
                  Gửi vị trí hiện tại
                </button>
                <button
                  type="button"
                  onClick={startLiveLocation}
                  className="w-full text-left h-9 px-3 rounded-lg hover:bg-surface-container-low text-[13px] font-semibold text-on-surface"
                >
                  Chia sẻ vị trí trực tiếp (15 phút)
                </button>
                {isLiveSharing && (
                  <button
                    type="button"
                    onClick={stopLiveLocation}
                    className="w-full text-left h-9 px-3 rounded-lg hover:bg-rose-50 text-[13px] font-semibold text-rose-600"
                  >
                    Dừng chia sẻ vị trí trực tiếp
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-outline-variant/35 mx-0.5" />

          <button type="button" className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" title="Cắt ảnh (sắp có)">
            <Crop size={16} />
          </button>
          <button type="button" className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" title="Ghi chú ảnh (sắp có)">
            <PenTool size={16} />
          </button>
          <button type="button" className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" title="Tin nhắn nhanh (sắp có)">
            <CreditCard size={16} />
          </button>
          <button type="button" className="w-8 h-8 rounded-md flex items-center justify-center text-primary hover:bg-primary/10" title="Thêm tùy chọn">
            <MoreHorizontal size={16} />
          </button>
        </div>

        <div className="px-2 py-1.5 flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Nhập @, tin nhắn tới đồng nghiệp"
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[14px] font-medium py-0.5 px-0.5 resize-none max-h-28 hide-scrollbar text-on-surface placeholder:text-on-surface-variant/70 leading-relaxed transition-all"
          />

          <div className="relative">
            <button
              onClick={() => {
                setShowGifPicker(!showGifPicker);
                setShowStickerPicker(false);
                setShowLocationMenu(false);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${showGifPicker ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}`}
              type="button"
              title="GIF/Emoji"
            >
              <Smile size={18} />
            </button>
            {showGifPicker && (
              <div className="absolute bottom-[115%] right-0 z-[500]">
                <GifPicker onSelect={handleGifSelect} />
              </div>
            )}
          </div>

          <button
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-rose-100 text-rose-600' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}`}
            type="button"
            title={isRecording ? 'Dừng thu âm' : 'Tin nhắn thoại'}
          >
            {isRecording ? <Square size={15} /> : <Mic size={16} />}
          </button>

          {isRecording && (
            <div className="flex items-center gap-1 px-2 h-8 rounded-full bg-rose-50 text-rose-600 text-[11px] font-bold">
              <Radio size={12} className="animate-pulse" />
              {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
            </div>
          )}

          {(text.trim() || attachments.length > 0) ? (
            <button
              onClick={handleSend}
              disabled={isUploading}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isUploading ? 'bg-surface-container text-outline/40' : 'bg-primary text-white hover:opacity-90'}`}
              type="button"
              title="Gửi"
            >
              {isUploading ? <Loader2 size={15} className="animate-spin" /> : <SendHorizontal size={16} />}
            </button>
          ) : (
            <button
              onClick={handleQuickLike}
              className="w-8 h-8 rounded-full flex items-center justify-center text-amber-500 hover:bg-amber-50"
              type="button"
              title="Thả like nhanh"
            >
              <ThumbsUp size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Hidden Inputs */}
      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'image')} />
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => handleFileChange(e, 'file')} />

      {showContactPicker && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[2px] flex items-start justify-center pt-3 p-4" onClick={() => setShowContactPicker(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/20 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="text-[18px] font-extrabold text-on-surface">Gửi danh thiếp</h3>
              <button onClick={() => setShowContactPicker(false)} className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant">×</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
                <input
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Tìm danh thiếp theo tên, email hoặc số điện thoại"
                  className="w-full h-12 pl-10 pr-3 rounded-full border border-primary/40 focus:border-primary outline-none text-[15px] bg-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-full bg-primary text-white text-[13px] font-bold">Tất cả</span>
                <span className="text-[13px] text-on-surface-variant">{filteredContacts.length} liên hệ</span>
              </div>

              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-1">
                {filteredContacts.length === 0 && (
                  <div className="py-8 text-center text-[14px] text-on-surface-variant">Không có liên hệ phù hợp.</div>
                )}

                {filteredContacts.map((item) => (
                  <button
                    key={item.email}
                    className="w-full px-2 py-2 flex items-center gap-3 rounded-xl hover:bg-surface-container-low transition-colors text-left"
                    onClick={() => setSelectedContactEmail(item.email)}
                    type="button"
                  >
                    <span className="shrink-0 w-5 h-5 rounded-full border-2 border-outline-variant/60 flex items-center justify-center">
                      {selectedContactEmail === item.email ? <CheckCircle2 size={18} className="text-primary" /> : null}
                    </span>

                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt="" className="w-11 h-11 rounded-full object-cover ring-1 ring-outline-variant/20" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {String(item.displayName).charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-on-surface truncate">{item.displayName}</p>
                      <p className="text-[13px] text-on-surface-variant truncate">{item.phone || item.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3 border-t border-outline-variant/10 flex items-center justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={() => setShowContactPicker(false)}
                className="h-11 px-6 rounded-lg bg-surface-container-high text-on-surface font-bold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSendContact}
                disabled={!selectedContactEmail}
                className={`h-11 px-6 rounded-lg font-bold text-white ${selectedContactEmail ? 'bg-primary hover:opacity-90' : 'bg-primary/40 cursor-not-allowed'}`}
              >
                Gửi danh thiếp
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ChatInput;
