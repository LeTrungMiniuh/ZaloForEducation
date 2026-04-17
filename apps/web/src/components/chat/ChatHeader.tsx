import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar } from '../../utils/chatUtils';
import { 
  Search, 
  Video, 
  Phone, 
  PanelRightOpen
} from 'lucide-react';

import PinnedHeader from './PinnedHeader';

interface ChatHeaderProps {
  onToggleInfo: () => void;
  isInfoOpen: boolean;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ onToggleInfo, isInfoOpen }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations, activeConvId, userProfiles, loadUserProfile } = useChatStore();
  
  const activeChat = conversations.find(c => c.id === activeConvId);
  if (!activeChat) return null;

  const partnerEmail = activeChat.type === 'direct' 
    ? (Array.isArray(activeChat.members) ? activeChat.members.find(m => m !== user?.email) : undefined)
    : undefined;

  React.useEffect(() => {
    if (partnerEmail) {
      loadUserProfile(partnerEmail);
    }
  }, [partnerEmail, loadUserProfile]);

  const chatName = activeChat.type === 'direct' 
    ? getDisplayName(partnerEmail, user, userProfiles)
    : activeChat.name || 'Group';

  const chatAvatar = activeChat.type === 'direct' 
    ? getDisplayAvatar(partnerEmail, user, userProfiles)
    : (activeChat.avatar || '/logo_blue.png');

  const isOnline = partnerEmail ? userProfiles[partnerEmail]?.status === 'online' : false;

  const handleOpenProfile = () => {
    if (!partnerEmail) return;
    navigate(`/profile?email=${encodeURIComponent(partnerEmail)}`);
  };

  return (
    <>
      <header className="h-16 flex items-center justify-between px-6 bg-white/90 dark:bg-surface-container/90 backdrop-blur-xl border-b border-outline-variant/15 dark:border-outline-variant/30 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div
            className={`relative group ${partnerEmail ? 'cursor-pointer' : ''}`}
            onClick={handleOpenProfile}
            title={partnerEmail ? 'Xem trang cá nhân' : undefined}
          >
            <img className="w-11 h-11 rounded-full object-cover bg-surface-container ring-2 ring-white dark:ring-surface-container-high shadow-sm group-hover:ring-primary/20 transition-all" alt="" src={chatAvatar} />
            {isOnline && (
              <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-surface-container rounded-full shadow-sm animate-pulse"></div>
            )}
          </div>
          <div className="flex flex-col">
            <h2 className="font-extrabold text-on-surface leading-tight text-[16px] tracking-tight">{chatName}</h2>
            <p className="text-[12px] text-on-surface-variant font-bold flex items-center gap-1.5">
               <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-outline/40'}`}></span>
               {activeChat.type === 'group' 
                 ? `${activeChat.members?.length || 0} thành viên` 
                 : (isOnline ? 'Đang hoạt động' : 'Đang ngoại tuyến')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button className="w-10 h-10 flex items-center justify-center hover:bg-surface-container rounded-full transition-all text-on-surface-variant hover:text-primary"><Search size={20} /></button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-surface-container rounded-full transition-all text-on-surface-variant hover:text-primary"><Video size={20} /></button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-surface-container rounded-full transition-all text-on-surface-variant hover:text-primary"><Phone size={20} /></button>
          <div className="w-px h-6 bg-outline-variant/20 mx-1" />
          <button
            onClick={onToggleInfo}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isInfoOpen ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container text-on-surface-variant hover:text-primary'}`}
          >
            <PanelRightOpen size={20} />
          </button>
        </div>
      </header>

      {/* Modern Multi-Pin Header */}
      <PinnedHeader />
    </>
  );
};

export default ChatHeader;
