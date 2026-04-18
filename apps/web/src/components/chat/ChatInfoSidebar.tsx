import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar, normalizeAttachment, formatFileSize } from '../../utils/chatUtils';
import { 
  ChevronDown, 
  BellOff, 
  Trash2, 
  FileText, 
  FileImage, 
  Video, 
  Music, 
  FileDigit 
} from 'lucide-react';

const ChatInfoSidebar: React.FC = () => {
  const { user } = useAuth();
  const { conversations, activeConvId, userProfiles, messages } = useChatStore();
  
  const activeChat = conversations.find(c => c.id === activeConvId);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    media: true,
    file: true,
    link: true,
    members: true
  });

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

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Helper to render file icon components
  const FileIconComponent = ({ fileName }: { fileName: string }) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return <FileImage size={20} className="text-primary" />;
    if (fileName.match(/\.(mp4|mov|avi|wmv)$/i)) return <Video size={20} className="text-primary" />;
    if (fileName.match(/\.(mp3|wav|ogg|m4a)$/i)) return <Music size={20} className="text-primary" />;
    if (fileName.match(/\.(zip|rar|7z|tar)$/i)) return <FileDigit size={20} className="text-primary" />;
    return <FileText size={20} className="text-primary" />;
  };

  // Extract media and files from current message list (simple version for now)
  const sharedMedia = messages.flatMap(m => m.media || []).map(normalizeAttachment).reverse().slice(0, 6);
  const sharedFiles = messages.flatMap(m => m.files || []).map(normalizeAttachment).reverse().slice(0, 5);

  return (
    <div className="w-[320px] h-full border-l border-outline-variant/30 bg-white flex flex-col shrink-0 animate-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-outline-variant/10 flex flex-col items-center">
        <img className="w-20 h-20 rounded-full object-cover shadow-md mb-3 border-2 border-white" src={chatAvatar} alt="" />
        <h3 className="font-bold text-[16px] text-on-surface text-center leading-tight">{chatName}</h3>
        <p className="text-[12px] text-on-surface-variant font-medium mt-1">
          {activeChat.type === 'direct' ? 'Trò chuyện cá nhân' : 'Hội thoại nhóm'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="py-2">
           {/* Section: Media */}
           <div className="border-b border-outline-variant/5">
             <button 
               onClick={() => toggleSection('media')}
               className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container transition-all"
             >
               <span className="font-bold text-[13px] text-on-surface">Ảnh/Video</span>
               <ChevronDown size={18} className={`transition-transform duration-300 ${openSections.media ? 'rotate-180' : ''}`} />
             </button>
             {openSections.media && (
               <div className="px-4 pb-4">
                 {sharedMedia.length === 0 ? (
                   <p className="text-[11px] text-on-surface-variant italic">Chưa có ảnh/video nào</p>
                 ) : (
                   <div className="grid grid-cols-3 gap-1">
                     {sharedMedia.map((m, i) => (
                       <img key={i} src={m.dataUrl} className="w-full aspect-square object-cover rounded-lg border border-outline-variant/10 cursor-alias hover:opacity-80 transition-opacity" alt="" />
                     ))}
                   </div>
                 )}
               </div>
             )}
           </div>

           {/* Section: Files */}
           <div className="border-b border-outline-variant/5">
             <button 
               onClick={() => toggleSection('file')}
               className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-container transition-all"
             >
               <span className="font-bold text-[13px] text-on-surface">File đã gửi</span>
               <ChevronDown size={18} className={`transition-transform duration-300 ${openSections.file ? 'rotate-180' : ''}`} />
             </button>
             {openSections.file && (
               <div className="px-4 pb-4 space-y-2">
                 {sharedFiles.length === 0 ? (
                     <p className="text-[11px] text-on-surface-variant italic">Chưa có tệp nào</p>
                 ) : (
                   sharedFiles.map((f, i) => (
                     <div key={i} className="flex items-center gap-3 p-2 bg-surface-container/50 rounded-xl hover:bg-surface-container transition-all cursor-pointer">
                        <FileIconComponent fileName={f.name} />
                        <div className="min-w-0 flex-1">
                           <p className="text-[12px] font-bold truncate">{f.name}</p>
                           <p className="text-[10px] text-on-surface-variant">{formatFileSize(f.size)}</p>
                        </div>
                     </div>
                   ))
                 )}
               </div>
             )}
           </div>

           {/* Section: Settings */}
           <div className="mt-4 px-4 space-y-1">
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-on-surface font-semibold text-[13px] transition-all">
                <BellOff size={20} className="text-on-surface-variant" />
                Tắt thông báo
              </button>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-error font-bold text-[13px] transition-all">
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
