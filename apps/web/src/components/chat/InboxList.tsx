import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar, isUnread } from '../../utils/chatUtils';

import { 
  UserPlus, 
  Users, 
  MessageSquarePlus, 
  Settings, 
  Menu 
} from 'lucide-react';

const InboxList: React.FC = () => {
  const { user } = useAuth();
  const { 
    conversations, 
    activeConvId,
    fetchConversations, 
    searchQuery, 
    setSearchQuery, 
    setIsSearching,
    setActiveConversation,
    loadUserProfile,
    userProfiles,
    setIsAddFriendModalOpen
  } = useChatStore();

  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');

  // Fetch conversations on mount
  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Auto-load profiles for partners in conversations
  React.useEffect(() => {
    if (conversations.length > 0) {
      conversations.forEach((conv) => {
        if (conv.type === 'direct') {
          const partnerEmail = Array.isArray(conv.members) 
            ? conv.members.find(m => m !== user?.email)
            : undefined;
          
          if (partnerEmail) {
            loadUserProfile(partnerEmail);
          }
        }
      });
    }
  }, [conversations, user?.email, loadUserProfile]);

  const handleSearchTrigger = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsSearching(true);
  };

  const filteredConversations = conversations.filter(conv => 
    chatFilter === 'all' || isUnread(conv, user?.email)
  );

  return (
    <div className="w-[340px] h-full border-r border-outline-variant/30 flex flex-col bg-white shrink-0">
      {/* Search Header */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
           <div className="relative flex-1 group">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] group-focus-within:text-primary transition-colors">search</span>
             <input
               value={searchQuery}
               onChange={handleSearchTrigger}
               onFocus={() => setIsSearching(true)}
               className="w-full bg-surface-container-highest border-none rounded-[16px] py-2 pl-[34px] pr-4 text-[13px] outline-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 transition-all cursor-text"
               placeholder="Tìm kiếm..."
             />
           </div>
           
           <div className="flex items-center gap-1">
          <button 
            onClick={() => useChatStore.getState().setIsAddFriendModalOpen(true)}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/60 rounded-full transition-all text-on-surface-variant hover:text-primary active:scale-95"
          >
            <UserPlus size={20} />
          </button>
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/60 rounded-full transition-all text-on-surface-variant hover:text-primary active:scale-95">
            <Users size={20} />
          </button>
          <div className="w-px h-6 bg-outline-variant/10 mx-1" />
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/60 rounded-full transition-all text-on-surface-variant hover:text-primary">
            <Menu size={20} />
          </button>
        </div>
        </div>

        <div className="flex items-center gap-4 text-sm font-bold px-1">
          <button 
            onClick={() => setChatFilter('all')}
            className={`${chatFilter === 'all' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'} transition-all pb-2`}
          >
            Tất cả
          </button>
          <button 
            onClick={() => setChatFilter('unread')}
            className={`${chatFilter === 'unread' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-primary'} transition-all pb-2`}
          >
            Chưa đọc
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="text-center p-8 opacity-40 mt-10">
            <span className="material-symbols-outlined text-[48px] mb-2 text-on-surface-variant/20">chat_bubble</span>
            <p className="text-[13px] font-medium">Không có cuộc trò chuyện nào</p>
          </div>
        ) : (
          filteredConversations.map((chat) => {
            const isSelected = activeConvId === chat.id;
            const partnerEmail = chat.type === 'direct' 
              ? (Array.isArray(chat.members) ? chat.members.find(m => m !== user?.email) : undefined)
              : undefined;
            
            const chatName = chat.type === 'direct' 
              ? getDisplayName(partnerEmail, user, userProfiles)
              : chat.name || 'Group';
            
            const chatAvatar = chat.type === 'direct' 
              ? getDisplayAvatar(partnerEmail, user, userProfiles)
              : (chat.avatar || '/logo_blue.png');
            
            const unread = isUnread(chat, user?.email);
            const isOnline = partnerEmail ? userProfiles[partnerEmail]?.status === 'online' : false;

            return (
              <div
                key={chat.id}
                onClick={() => setActiveConversation(chat.id)}
                className={`flex items-center gap-3 p-3 rounded-[16px] cursor-pointer transition-all ${
                  isSelected ? 'bg-primary/10 shadow-sm' : 'hover:bg-surface-container/70'
                }`}
              >
                <div className="relative shrink-0">
                  <img className="w-12 h-12 rounded-full object-cover shadow-sm bg-surface-container ring-1 ring-black/5" alt={chatName} src={chatAvatar} />
                  {isOnline && (
                    <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full shadow-sm ring-1 ring-black/5 animate-pulse"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <h3 className={`text-[14px] truncate ${unread ? 'font-bold' : 'font-semibold'} ${isSelected ? 'text-primary' : 'text-on-surface'}`}>{chatName}</h3>
                    {chat.updatedAt && (
                      <span className="text-[10px] text-on-surface-variant font-medium shrink-0 ml-2">
                        {new Date(chat.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-[13px] truncate ${unread ? 'font-bold text-on-surface' : 'text-on-surface-variant'}`}>
                      {chat.lastMessageContent || chat.lastMessage || 'Chưa có tin nhắn'}
                    </p>
                    {unread && (
                      <div className="w-2.5 h-2.5 bg-primary rounded-full shrink-0 ml-2 shadow-sm shadow-primary/20"></div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default InboxList;
