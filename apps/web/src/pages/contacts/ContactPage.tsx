import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { useFriendships } from '../../hooks/useFriendships';
import { useChatActions } from '../../hooks/useChatActions';
import { getDisplayName, getDisplayAvatar } from '../../utils/chatUtils';

const ContactPage: React.FC = () => {
  const { user } = useAuth();
  const { userProfiles, loadUserProfile } = useChatStore();
  const { acceptedFriends, pendingFriends, loading } = useFriendships();
  const { handleOpenDirectChat } = useChatActions();

  React.useEffect(() => {
    acceptedFriends.forEach((f) => {
      const friendEmail = f.sender_id === user?.email ? f.receiver_id : f.sender_id;
      loadUserProfile(friendEmail);
    });
  }, [acceptedFriends, user?.email, loadUserProfile]);

  return (
    <div className="flex h-full w-full bg-white">
      {/* Left Panel: Contact Navigation (320px) */}
      <div className="w-[320px] h-full border-r border-outline-variant/30 flex flex-col bg-surface-container-lowest">
        <div className="p-4 border-b border-outline-variant/10">
          <div className="flex items-center gap-2 mb-4">
             <span className="material-symbols-outlined text-primary">contacts</span>
             <h2 className="text-[17px] font-bold text-on-surface">Danh bạ</h2>
          </div>
          
          <div className="space-y-1">
             <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/10 text-primary font-bold text-[14px]">
               <span className="material-symbols-outlined">person</span>
               Danh sách bạn bè
             </button>
             <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-surface-container transition-all text-on-surface font-semibold text-[14px]">
               <div className="flex items-center gap-3">
                 <span className="material-symbols-outlined text-on-surface-variant">group</span>
                 Danh sách nhóm
               </div>
             </button>
             <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-surface-container transition-all text-on-surface font-semibold text-[14px]">
               <div className="flex items-center gap-3">
                 <span className="material-symbols-outlined text-on-surface-variant">person_add</span>
                 Lời mời kết bạn
               </div>
               {pendingFriends.length > 0 && (
                 <span className="bg-error text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                   {pendingFriends.length}
                 </span>
               )}
             </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 hide-scrollbar">
           {/* Section Title */}
           <div className="px-3 py-2">
             <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Bạn bè ({acceptedFriends.length})</p>
           </div>

           {loading ? (
             <div className="p-8 text-center opacity-50">
               <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
               <p className="text-[12px]">Đang tải...</p>
             </div>
           ) : acceptedFriends.length === 0 ? (
             <div className="p-8 text-center opacity-40">
                <p className="text-[13px]">Chưa có bạn bè nào</p>
             </div>
           ) : (
             acceptedFriends.map((f) => {
               const friendEmail = f.sender_id === user?.email ? f.receiver_id : f.sender_id;
               const name = getDisplayName(friendEmail, user, userProfiles);
               const avatar = getDisplayAvatar(friendEmail, user, userProfiles);
               const status = userProfiles[friendEmail]?.status;

               return (
                 <div
                   key={friendEmail}
                   onClick={() => handleOpenDirectChat(friendEmail)}
                   className="flex items-center gap-3 p-3 rounded-[16px] transition-all hover:bg-surface-container/70 cursor-pointer group"
                 >
                   <div className="relative shrink-0">
                     <img
                       className="w-11 h-11 rounded-full object-cover shadow-sm bg-surface-container border border-outline-variant/10"
                       alt={name}
                       src={avatar}
                     />
                     {status === 'online' && (
                       <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                     )}
                   </div>
                   <div className="flex-1 min-w-0">
                     <p className="font-bold text-[14px] text-on-surface truncate group-hover:text-primary transition-colors">{name}</p>
                     <p className="text-[12px] text-on-surface-variant truncate">Nhấn để nhắn tin</p>
                   </div>
                 </div>
               );
             })
           )}
        </div>
      </div>

      {/* Right Panel: Content (Empty default) */}
      <div className="flex-1 h-full flex flex-col items-center justify-center bg-surface-container-lowest animate-in fade-in duration-500">
         <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[40px] text-primary">person_search</span>
         </div>
         <h2 className="text-xl font-bold text-on-surface mb-2">Thông tin liên hệ</h2>
         <p className="text-on-surface-variant text-sm max-w-sm text-center">
           Chọn một người bạn từ danh sách bên trái để xem thông tin chi tiết và lịch sử trò chuyện chung.
         </p>
         
         <button className="mt-8 px-6 py-2.5 bg-primary text-white font-bold rounded-full shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
           Tìm thêm bạn mới
         </button>
      </div>
    </div>
  );
};

export default ContactPage;
