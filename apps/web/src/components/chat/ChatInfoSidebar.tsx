import {
  BellOff,
  FileDigit,
  FileImage,
  FileText,
  Link as LinkIcon,
  Music,
  Trash2,
  Video
} from 'lucide-react';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { formatFileSize, getDisplayAvatar, getDisplayName, normalizeAttachment } from '../../utils/chatUtils';

const ChatInfoSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, activeConvId, userProfiles, messages } = useChatStore();

  const activeChat = conversations.find(c => c.id === activeConvId);
  const [activeStorageTab, setActiveStorageTab] = useState<'media' | 'file' | 'link'>('media');
  const [senderFilter, setSenderFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');

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
    return arr.map(a => ({ ...a, senderId: m.senderId }));
  }).map(f => ({ ...normalizeAttachment(f), senderId: f.senderId })).reverse();

  const isMedia = (f: any) => 
    f.mimeType?.startsWith('image/') || 
    f.mimeType?.startsWith('video/') ||
    f.name?.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|wmv)$/i);

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

  const sharedMedia = filteredAttachments.filter(isMedia);
  const sharedFiles = filteredAttachments.filter(f => !isMedia(f));

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
                      <a key={i} href={m.dataUrl} target="_blank" rel="noreferrer" className="relative group block">
                        {isVideoMedia(m) ? (
                          <video
                            src={m.dataUrl}
                            className="w-full aspect-square object-cover rounded-lg border border-outline-variant/10 hover:opacity-90 transition-opacity"
                            controls
                            preload="metadata"
                            playsInline
                          />
                        ) : (
                          <img src={m.dataUrl} className="w-full aspect-square object-cover rounded-lg border border-outline-variant/10 cursor-alias hover:opacity-80 transition-opacity" alt="" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg p-1 flex justify-end">
                           <span className="text-[9px] font-medium text-white/90">
                             {m.createdAt ? new Date(m.createdAt).toLocaleDateString('vi-VN') : ''}
                           </span>
                        </div>
                      </a>
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
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all">
              <BellOff size={20} className="text-on-surface-variant" />
              Tắt thông báo
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-error dark:text-[#eef3fb] font-bold text-[13px] transition-all">
              <Trash2 size={20} />
              Xóa lịch sử trò chuyện
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInfoSidebar;
