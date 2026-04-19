import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar, isUnread } from '../../utils/chatUtils';
import CreateGroupModal from './CreateGroupModal';
import Swal from 'sweetalert2';

import { 
  Lock,
  MoreHorizontal,
  UserPlus, 
  Users, 
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
    setActiveConversation,
    loadUserProfile,
    userProfiles,
    hiddenConversations,
    hideConversationWithPin,
    unhideConversationWithPin,
    setIsAddFriendModalOpen,
    isCreateGroupModalOpen,
    setIsCreateGroupModalOpen
  } = useChatStore();

  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [openMenuConvId, setOpenMenuConvId] = useState<string | null>(null);

  // Fetch conversations on mount
  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Keep inbox search inline, do not open global search modal from this input.
  React.useEffect(() => {
    useChatStore.getState().setIsSearching(false);
  }, []);

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
    useChatStore.getState().setIsSearching(false);
  };

  const normalizedSearch = String(searchQuery || '').trim().toLowerCase();

  const conversationMatchesSearch = (conv: any) => {
    if (!normalizedSearch) return true;

    const partnerEmail = conv.type === 'direct'
      ? (Array.isArray(conv.members) ? conv.members.find((m: string) => m !== user?.email) : '')
      : '';

    const name = conv.type === 'direct'
      ? getDisplayName(partnerEmail, user, userProfiles)
      : (conv.name || '');

    const haystack = [
      String(name || ''),
      String(partnerEmail || ''),
      String(conv.lastMessageContent || ''),
      String(conv.lastMessage || ''),
    ].join(' ').toLowerCase();

    return haystack.includes(normalizedSearch);
  };

  const filteredConversations = conversations
    .filter(conv => chatFilter === 'all' || isUnread(conv, user?.email))
    .filter((conv) => {
      const isHidden = !!hiddenConversations[conv.id];
      if (!isHidden) return conversationMatchesSearch(conv);

      // Hidden conversations only appear in list when user searches them.
      return normalizedSearch.length > 0 && conversationMatchesSearch(conv);
    });

  const handleHideConversation = async (convId: string) => {
    const res = await Swal.fire({
      title: 'Ẩn trò chuyện',
      text: 'Thiết lập mã PIN cá nhân (4-6 số) để ẩn hội thoại này.',
      input: 'password',
      inputPlaceholder: 'Nhập mã PIN',
      inputAttributes: { maxlength: '6', autocapitalize: 'off', autocorrect: 'off' },
      showCancelButton: true,
      confirmButtonText: 'Ẩn',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#00418f',
      inputValidator: (value) => {
        if (!/^\d{4,6}$/.test(String(value || ''))) {
          return 'PIN phải gồm 4-6 chữ số.';
        }
        return undefined;
      }
    });

    if (!res.isConfirmed || !res.value) return;
    hideConversationWithPin(convId, String(res.value));
    setOpenMenuConvId(null);
    Swal.fire({ icon: 'success', title: 'Đã ẩn trò chuyện', timer: 1300, showConfirmButton: false });
  };

  const handleUnhideConversation = async (convId: string) => {
    const res = await Swal.fire({
      title: 'Mở khóa trò chuyện',
      text: 'Nhập mã PIN để hiện lại hội thoại.',
      input: 'password',
      inputPlaceholder: 'Nhập mã PIN',
      showCancelButton: true,
      confirmButtonText: 'Mở khóa',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#00418f',
    });
    if (!res.isConfirmed || !res.value) return;

    const ok = unhideConversationWithPin(convId, String(res.value));
    if (!ok) {
      Swal.fire('Sai mã PIN', 'PIN không đúng, vui lòng thử lại.', 'error');
      return;
    }
    setOpenMenuConvId(null);
    Swal.fire({ icon: 'success', title: 'Đã hiện lại trò chuyện', timer: 1300, showConfirmButton: false });
  };

  return (
    <div className="w-[340px] h-full border-r border-outline-variant/30 flex flex-col bg-white dark:bg-surface-container shrink-0">
      {/* Search Header */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
           <div className="relative flex-1 group">
             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] group-focus-within:text-primary transition-colors">search</span>
             <input
               value={searchQuery}
               onChange={handleSearchTrigger}
               className="w-full bg-surface-container-highest border-none rounded-[16px] py-2 pl-[34px] pr-4 text-[13px] outline-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 transition-all cursor-text"
               placeholder="Tìm kiếm..."
             />
           </div>
           
           <div className="flex items-center gap-1">
          <button 
            onClick={() => useChatStore.getState().setIsAddFriendModalOpen(true)}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/60 dark:hover:bg-surface-container-high rounded-full transition-all text-on-surface-variant hover:text-primary active:scale-95"
          >
            <UserPlus size={20} />
          </button>
          <button 
            onClick={() => setIsCreateGroupModalOpen(true)}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/60 dark:hover:bg-surface-container-high rounded-full transition-all text-on-surface-variant hover:text-primary active:scale-95"
          >
            <Users size={20} />
          </button>
          <div className="w-px h-6 bg-outline-variant/10 mx-1" />
          <button className="w-10 h-10 flex items-center justify-center hover:bg-white/60 dark:hover:bg-surface-container-high rounded-full transition-all text-on-surface-variant hover:text-primary">
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar p-2 space-y-1">
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
            const isHidden = !!hiddenConversations[chat.id];

            return (
              <div
                key={chat.id}
                onClick={() => {
                  if (isHidden) {
                    Swal.fire({
                      icon: 'info',
                      title: 'Trò chuyện đang ẩn',
                      text: 'Bấm dấu ... rồi chọn "Mở lại trò chuyện" để nhập PIN.',
                      timer: 1800,
                      showConfirmButton: false,
                    });
                    return;
                  }
                  setActiveConversation(chat.id);
                }}
                className={`flex items-center gap-3 p-3 rounded-[16px] cursor-pointer transition-all ${
                  isSelected ? 'bg-primary/10 shadow-sm' : 'hover:bg-surface-container/70'
                }`}
              >
                <div className="relative shrink-0">
                  <img className="w-12 h-12 rounded-full object-cover shadow-sm bg-surface-container ring-1 ring-black/5" alt={chatName} src={chatAvatar} />
                  {isOnline && (
                    <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-surface-container rounded-full shadow-sm ring-1 ring-black/5 animate-pulse"></div>
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
                      {isHidden
                        ? 'Trò chuyện đã ẩn (yêu cầu PIN)'
                        : (chat.lastMessageContent || chat.lastMessage || 'Chưa có tin nhắn')}
                    </p>
                    {unread && (
                      <div className="w-2.5 h-2.5 bg-primary rounded-full shrink-0 ml-2 shadow-sm shadow-primary/20"></div>
                    )}
                  </div>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (hiddenConversations[chat.id]) {
                        handleUnhideConversation(chat.id);
                        return;
                      }
                      setOpenMenuConvId((prev) => prev === chat.id ? null : chat.id);
                    }}
                    className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {openMenuConvId === chat.id && !hiddenConversations[chat.id] && (
                    <div className="absolute right-0 top-[110%] z-20 w-44 bg-white border border-outline-variant/20 rounded-xl shadow-lg p-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHideConversation(chat.id);
                        }}
                        className="w-full h-9 px-2 rounded-lg hover:bg-surface-container-low flex items-center gap-2 text-[13px] font-semibold text-on-surface"
                      >
                        <Lock size={14} />
                        Ẩn trò chuyện
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <CreateGroupModal 
        isOpen={isCreateGroupModalOpen} 
        onClose={() => setIsCreateGroupModalOpen(false)} 
      />
    </div>
  );
};

export default InboxList;
