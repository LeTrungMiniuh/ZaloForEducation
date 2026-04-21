import {
    BellOff,
    Clock3,
    FileDigit,
    FileImage,
    FileText,
    Link as LinkIcon,
    Music,
    Trash2,
    Video,
    X
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { formatFileSize, getDisplayAvatar, getDisplayName, normalizeAttachment } from '../../utils/chatUtils';

const ChatInfoSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    conversations,
    activeConvId,
    userProfiles,
    messages,
    setConversationAutoDelete,
    setPreviewImage,
    clearHistory,
    mutedConversations,
    muteConversationFor,
    clearConversationMuted,
    isConversationMuted,
  } = useChatStore();

  const activeChat = conversations.find(c => c.id === activeConvId);
  const [activeStorageTab, setActiveStorageTab] = useState<'media' | 'file' | 'link'>('media');
  const [senderFilter, setSenderFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showAutoDeleteModal, setShowAutoDeleteModal] = useState(false);
  const [pendingAutoDeleteDays, setPendingAutoDeleteDays] = useState<1 | 7 | 30 | null>(null);
  const [savingAutoDelete, setSavingAutoDelete] = useState(false);

  if (!activeChat) return null;

  const partnerEmail = activeChat.type === 'direct'
    ? (Array.isArray(activeChat.members) ? activeChat.members.find(m => m !== user?.email) : undefined)
    : undefined;

  const chatName = activeChat.type === 'direct'
    ? getDisplayName(partnerEmail, user, userProfiles)
    : activeChat.name || 'Group';

  const chatAvatar = activeChat.type === 'direct'
    ? getDisplayAvatar(partnerEmail, user, userProfiles)
    : (activeChat.avatar || '/logo_blue.png');

  const currentAutoDeleteDays = activeChat.autoDeleteDays ?? null;
  const muted = !!(activeConvId && isConversationMuted(activeConvId));
  const muteSetting = activeConvId ? mutedConversations[activeConvId] : undefined;

  const getMuteStatusLabel = () => {
    if (!activeConvId || !muted) return 'ĐANG BẬT';
    if (muteSetting === 'until-open') return 'ĐẾN KHI MỞ LẠI';
    if (muteSetting === true) return 'VĨNH VIỄN';
    if (typeof muteSetting === 'number') {
      const diff = muteSetting - Date.now();
      if (diff <= 0) return 'ĐANG BẬT';
      const hours = Math.floor(diff / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      if (hours > 0) return `${hours}G ${minutes}P`;
      return `${Math.max(1, minutes)} PHÚT`;
    }
    return 'ĐANG TẮT';
  };

  const autoDeleteLabel = (days: 1 | 7 | 30 | null) => {
    if (days === 1) return '1 ngày';
    if (days === 7) return '7 ngày';
    if (days === 30) return '30 ngày';
    return 'Không bao giờ';
  };

  const openAutoDeleteModal = () => {
    setPendingAutoDeleteDays(currentAutoDeleteDays as 1 | 7 | 30 | null);
    setShowAutoDeleteModal(true);
  };

  const confirmAutoDelete = async () => {
    if (!activeConvId) return;
    setSavingAutoDelete(true);
    try {
      await setConversationAutoDelete(activeConvId, pendingAutoDeleteDays);
      setShowAutoDeleteModal(false);
    } catch {
      // Errors are logged in store; modal stays open for retry.
    } finally {
      setSavingAutoDelete(false);
    }
  };

  // Helper to render file icon components
  const FileIconComponent = ({ fileName }: { fileName: string }) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <FileImage size={20} className="text-primary" />;
    if (fileName.match(/\.(mp4|mov|avi|wmv)$/i)) return <Video size={20} className="text-primary" />;
    if (fileName.match(/\.(mp3|wav|ogg|m4a)$/i)) return <Music size={20} className="text-primary" />;
    if (fileName.match(/\.(zip|rar|7z|tar)$/i)) return <FileDigit size={20} className="text-primary" />;
    return <FileText size={20} className="text-primary" />;
  };

  // Combine all attachments and store senderId for filtering
  const allAttachments = messages.flatMap(m => {
    const arr = [...(m.media || []), ...(m.files || [])];
    return arr.map(a => ({ ...a, senderId: m.senderId, createdAt: m.createdAt }));
  }).map(f => ({ ...normalizeAttachment(f), senderId: f.senderId, createdAt: f.createdAt })).reverse();

  const isStickerOrGif = (f: any) => {
    const mime = String(f?.mimeType || '').toLowerCase();
    const name = String(f?.name || '').toLowerCase();
    return (
      mime.includes('sticker') ||
      mime === 'image/gif' ||
      /^sticker-/.test(name) ||
      /\.gif(\?.*)?$/.test(name)
    );
  };

  const isMedia = (f: any) => {
    if (isStickerOrGif(f)) return false;
    return (
      f.mimeType?.startsWith('image/') ||
      f.mimeType?.startsWith('video/') ||
      f.name?.match(/\.(jpg|jpeg|png|webp|mp4|mov|avi|wmv)$/i)
    );
  };

  const isVideoMedia = (f: any) => {
    const mime = String(f?.mimeType || '').toLowerCase();
    const name = String(f?.name || '').toLowerCase();
    return mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name);
  };

  // Apply filters to files
  let filteredAttachments = allAttachments;
  if (senderFilter !== 'all') {
    filteredAttachments = filteredAttachments.filter(f => f.senderId === senderFilter);
  }
  if (dateFilter !== 'all') {
    if (dateFilter === 'oldest') {
      filteredAttachments = [...filteredAttachments].reverse();
    } else if (dateFilter !== 'newest') {
      const d = new Date(dateFilter).setHours(0,0,0,0);
      filteredAttachments = filteredAttachments.filter(f => new Date(f.createdAt || Date.now()).setHours(0,0,0,0) === d);
    }
  }

  const storageAttachments = filteredAttachments.filter((f) => !isStickerOrGif(f));
  const sharedMedia = storageAttachments.filter(isMedia);
  const sharedFiles = storageAttachments.filter((f) => !isMedia(f));

  // Extract links and apply filters
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let allLinks = messages
    .filter(m => m.content && typeof m.content === 'string' && m.content.match(urlRegex))
    .flatMap(m => {
      const urls = m.content.match(urlRegex) || [];
      return urls.map(url => ({ url, messageId: m.id, senderId: m.senderId, createdAt: m.createdAt }));
    })
    .reverse();

  if (senderFilter !== 'all') {
    allLinks = allLinks.filter(l => l.senderId === senderFilter);
  }
  if (dateFilter !== 'all') {
    if (dateFilter === 'oldest') {
      allLinks = [...allLinks].reverse();
    } else if (dateFilter !== 'newest') {
      const d = new Date(dateFilter).setHours(0,0,0,0);
      allLinks = allLinks.filter(l => new Date(l.createdAt || Date.now()).setHours(0,0,0,0) === d);
    }
  }
  const sharedLinks = allLinks;

  const uniqueSenders = activeChat?.members || [];

  const handleOpenProfile = () => {
    if (!partnerEmail) return;
    navigate(`/profile?email=${encodeURIComponent(partnerEmail)}`);
  };

  const handleToggleMute = async () => {
    if (!activeConvId) return;

    if (muted) {
      clearConversationMuted(activeConvId);
      await Swal.fire({
        icon: 'success',
        title: 'Đã bật lại thông báo',
        timer: 1300,
        showConfirmButton: false,
      });
      return;
    }

    const choice = await Swal.fire({
      title: 'Xác nhận',
      html: `
        <div style="text-align:left; margin-top:8px; font-size:18px; color:#1f2a44;">
          Bạn có chắc muốn tắt thông báo hội thoại này:
        </div>
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px; text-align:left; font-size:16px;">
          <label><input type="radio" name="mute-option" value="1h" checked /> Trong 1 giờ</label>
          <label><input type="radio" name="mute-option" value="4h" /> Trong 4 giờ</label>
          <label><input type="radio" name="mute-option" value="until-8am" /> Cho đến 8:00 AM</label>
          <label><input type="radio" name="mute-option" value="until-open" /> Cho đến khi được mở lại</label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Đồng ý',
      cancelButtonText: 'Hủy',
      focusConfirm: false,
      preConfirm: () => {
        const selected = document.querySelector('input[name="mute-option"]:checked') as HTMLInputElement | null;
        return selected?.value || '1h';
      },
    });

    if (!choice.isConfirmed || !choice.value) return;

    muteConversationFor(activeConvId, choice.value as '1h' | '4h' | 'until-8am' | 'until-open');
    await Swal.fire({
      icon: 'success',
      title: 'Đã tắt thông báo',
      timer: 1300,
      showConfirmButton: false,
    });
  };

  const handleClearConversationOneSide = async () => {
    if (!activeConvId) return;

    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Xóa cuộc trò chuyện phía bạn?',
      text: 'Tin nhắn sẽ bị xóa ở tài khoản của bạn, phía đối phương vẫn giữ nguyên.',
      showCancelButton: true,
      confirmButtonText: 'Xóa',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#d93025',
    });

    if (!confirm.isConfirmed) return;

    try {
      await clearHistory(activeConvId);
      await Swal.fire({
        icon: 'success',
        title: 'Đã xóa cuộc trò chuyện',
        timer: 1400,
        showConfirmButton: false,
      });
    } catch {
      await Swal.fire({
        icon: 'error',
        title: 'Không thể xóa cuộc trò chuyện',
        text: 'Vui lòng thử lại sau.',
      });
    }
  };

  return (
    <div className="w-[320px] h-full border-l border-outline-variant/30 dark:border-outline-variant/30 bg-white dark:bg-surface-container flex flex-col shrink-0 animate-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-outline-variant/10 flex flex-col items-center">
        <img
          className={`w-20 h-20 rounded-full object-cover shadow-md mb-3 border-2 border-white dark:border-surface-container-high ${partnerEmail ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
          src={chatAvatar}
          alt=""
          onClick={handleOpenProfile}
          title={partnerEmail ? 'Xem trang cá nhân' : undefined}
        />
        <h3 className="font-bold text-[16px] text-on-surface text-center leading-tight">{chatName}</h3>
        <p className="text-[12px] text-on-surface-variant font-medium mt-1">
          {activeChat.type === 'direct' ? 'Trò chuyện cá nhân' : 'Hội thoại nhóm'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="py-2">
          {/* Section: Kho lưu trữ Tabs & Filters */}
          <div className="border-b border-outline-variant/10 pb-4">
            {/* Tabs */}
            <div className="flex px-4 pt-2 mb-3 border-b border-outline-variant/10">
              <button 
                className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === 'media' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setActiveStorageTab('media')}
              >
                Ảnh/Video
              </button>
              <button 
                className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === 'file' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setActiveStorageTab('file')}
              >
                Files
              </button>
              <button 
                className={`flex-1 pb-2 text-[13px] font-semibold border-b-2 transition-colors ${activeStorageTab === 'link' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                onClick={() => setActiveStorageTab('link')}
              >
                Links
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 px-4 mb-4">
              <select 
                value={senderFilter}
                onChange={(e) => setSenderFilter(e.target.value)}
                className="flex-1 bg-surface-container-highest px-3 py-2 rounded-xl text-[12px] text-on-surface outline-none border border-transparent focus:border-primary/30 appearance-none cursor-pointer"
              >
                <option value="all">Người gửi</option>
                {uniqueSenders.map(email => (
                  <option key={email} value={email}>{getDisplayName(email, user, userProfiles)}</option>
                ))}
              </select>
              
              <input 
                type="date"
                value={dateFilter === 'all' || dateFilter === 'newest' || dateFilter === 'oldest' ? '' : dateFilter}
                onChange={(e) => setDateFilter(e.target.value || 'all')}
                className="flex-1 bg-surface-container-highest px-3 py-2 rounded-xl text-[12px] text-on-surface outline-none border border-transparent focus:border-primary/30 cursor-pointer"
                title="Chọn ngày"
              />
            </div>

            {/* Content Rendering based on Tab */}
            <div className="px-4 space-y-2">
              {activeStorageTab === 'media' && (
                sharedMedia.length === 0 ? (
                  <p className="text-[11px] text-on-surface-variant italic text-center py-4">Chưa có ảnh/video nào</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {sharedMedia.map((m, i) => (
                      <div key={i} className="relative group block">
                        {isVideoMedia(m) ? (
                          <video
                            src={m.dataUrl}
                            className="w-full aspect-square object-cover rounded-lg border border-outline-variant/10 hover:opacity-90 transition-opacity"
                            controls
                            preload="metadata"
                            playsInline
                          />
                        ) : (
                          <img
                            src={m.dataUrl}
                            className="w-full aspect-square object-cover rounded-lg border border-outline-variant/10 cursor-pointer hover:opacity-80 transition-opacity"
                            alt=""
                            onClick={() => setPreviewImage(m.dataUrl, m.name || `image-${i + 1}.png`)}
                          />
                        )}
                        <div className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg p-1 flex justify-end">
                           <span className="text-[9px] font-medium text-white/90">
                             {m.createdAt ? new Date(m.createdAt).toLocaleDateString('vi-VN') : ''}
                           </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeStorageTab === 'file' && (
                sharedFiles.length === 0 ? (
                  <p className="text-[11px] text-on-surface-variant italic text-center py-4">Chưa có tệp nào</p>
                ) : (
                  sharedFiles.map((f, i) => (
                    <a key={i} href={f.dataUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 bg-surface-container/50 rounded-xl hover:bg-surface-container transition-all cursor-pointer">
                      <FileIconComponent fileName={f.name} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold truncate text-on-surface">{f.name}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-[10px] text-on-surface-variant">{formatFileSize(f.size)}</p>
                          <p className="text-[10px] text-on-surface-variant opacity-70">
                            {f.createdAt ? new Date(f.createdAt).toLocaleDateString('vi-VN') : ''}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))
                )
              )}

              {activeStorageTab === 'link' && (
                sharedLinks.length === 0 ? (
                    <p className="text-[11px] text-on-surface-variant italic text-center py-4">Chưa có link nào</p>
                ) : (
                  sharedLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2 bg-surface-container/50 rounded-xl hover:bg-surface-container transition-all cursor-pointer">
                       <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                         <LinkIcon size={16} className="text-primary" />
                       </div>
                       <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-primary hover:underline truncate">{l.url}</p>
                          <p className="text-[10px] text-on-surface-variant opacity-70 mt-0.5">
                            {l.createdAt ? new Date(l.createdAt).toLocaleDateString('vi-VN') : ''}
                          </p>
                       </div>
                    </a>
                  ))
                )
              )}
            </div>
          </div>

          {/* Section: Settings */}
          <div className="mt-4 px-4 space-y-1">
            <button
              onClick={openAutoDeleteModal}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all"
            >
              <span className="flex items-center gap-3">
                <Clock3 size={20} className="text-on-surface-variant" />
                Tin nhắn tự xóa
              </span>
              <span className="text-[12px] font-bold text-primary">{autoDeleteLabel(currentAutoDeleteDays as 1 | 7 | 30 | null)}</span>
            </button>
            <button
              onClick={handleToggleMute}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all ${muted ? 'bg-surface-container/70' : ''}`}
            >
              <span className="flex items-center gap-3">
                <BellOff size={20} className={muted ? 'text-primary' : 'text-on-surface-variant'} />
                {muted ? 'Bật lại thông báo' : 'Tắt thông báo'}
              </span>
              <span className={`text-[11px] font-bold ${muted ? 'text-primary' : 'text-on-surface-variant/70'}`}>
                {getMuteStatusLabel()}
              </span>
            </button>
            <button
              onClick={handleClearConversationOneSide}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-error dark:text-[#eef3fb] font-bold text-[13px] transition-all"
            >
              <Trash2 size={20} />
              Xóa cuộc trò chuyện (1 phía)
            </button>
          </div>
        </div>
      </div>

      {showAutoDeleteModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-[460px] rounded-2xl bg-white dark:bg-surface-container shadow-2xl border border-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
              <h3 className="text-[18px] font-extrabold text-on-surface">Cài đặt tin nhắn tự xóa</h3>
              <button
                onClick={() => setShowAutoDeleteModal(false)}
                type="button"
                className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              >
                <X size={22} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {[1, 7, 30].map((days) => (
                <label key={days} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={pendingAutoDeleteDays === days}
                    onChange={() => setPendingAutoDeleteDays(days as 1 | 7 | 30)}
                    className="w-4 h-4"
                  />
                  <span className="text-[18px] text-on-surface">{days} ngày</span>
                </label>
              ))}

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  checked={pendingAutoDeleteDays === null}
                  onChange={() => setPendingAutoDeleteDays(null)}
                  className="w-4 h-4"
                />
                <span className="text-[18px] text-on-surface">Không bao giờ</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant/20 bg-surface-container/40">
              <button
                onClick={() => setShowAutoDeleteModal(false)}
                className="px-6 py-3 rounded-lg bg-surface-container-high text-on-surface font-bold hover:opacity-90"
                type="button"
              >
                Hủy
              </button>
              <button
                onClick={confirmAutoDelete}
                disabled={savingAutoDelete || pendingAutoDeleteDays === currentAutoDeleteDays}
                className="px-6 py-3 rounded-lg bg-primary text-white font-bold disabled:opacity-50"
                type="button"
              >
                {savingAutoDelete ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInfoSidebar;
