import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { useFriendships } from '../../hooks/useFriendships';
import { useChatActions } from '../../hooks/useChatActions';
import { getDisplayName, getDisplayAvatar } from '../../utils/chatUtils';
import api from '../../services/api';

const ContactPage: React.FC = () => {
  const { user } = useAuth();
  const { userProfiles, loadUserProfile } = useChatStore();
  const { acceptedFriends, pendingFriends, loading, refreshFriendships } = useFriendships();
  const { handleOpenDirectChat } = useChatActions();
  const [activeTab, setActiveTab] = React.useState<'friends' | 'groups' | 'requests'>('friends');

  const incomingRequests = pendingFriends.filter(f => f.receiver_id === user?.email);
  const outgoingRequests = pendingFriends.filter(f => f.sender_id === user?.email);

  const acceptRequest = async (senderEmail: string) => {
    try {
      await api.post('/chat/friends/accept', { senderEmail });
      refreshFriendships();
    } catch (error) {
      console.error('Failed to accept request', error);
    }
  };

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
             <button
               onClick={() => setActiveTab('friends')}
               className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-[14px] ${activeTab === 'friends' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container text-on-surface font-semibold'}`}>
               <span className="material-symbols-outlined">person</span>
               Danh sách bạn bè
             </button>
             <button
               onClick={() => setActiveTab('groups')}
               className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-[14px] ${activeTab === 'groups' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container text-on-surface font-semibold'}`}>
               <div className="flex items-center gap-3">
                 <span className="material-symbols-outlined text-on-surface-variant">group</span>
                 Danh sách nhóm
               </div>
             </button>
             <button
               onClick={() => setActiveTab('requests')}
               className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-[14px] ${activeTab === 'requests' ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-surface-container text-on-surface font-semibold'}`}>
               <div className="flex items-center gap-3">
                 <span className="material-symbols-outlined text-on-surface-variant">person_add</span>
                 Lời mời kết bạn
               </div>
               {incomingRequests.length > 0 && (
                 <span className="bg-error text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                   {incomingRequests.length}
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

      {/* Right Panel: Content */}
      <div className="flex-1 h-full flex flex-col items-center bg-surface-container-lowest overflow-y-auto w-full">
         {activeTab === 'friends' && (
           <div className="flex-1 flex flex-col items-center justify-center animate-in fade-in duration-500 w-full">
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
         )}

         {activeTab === 'requests' && (
           <div className="w-full max-w-3xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex items-center gap-3 mb-8">
               <span className="material-symbols-outlined text-[32px] text-primary">person_add</span>
               <h2 className="text-2xl font-bold text-on-surface">Lời mời kết bạn</h2>
             </div>
             
             {/* Received Requests */}
             <div className="mb-8 bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="bg-surface-container-lowest p-4 border-b border-outline-variant/20">
                  <h3 className="font-bold text-[15px] text-on-surface">Lời mời đã nhận ({incomingRequests.length})</h3>
                </div>
                <div className="p-2">
                  {incomingRequests.length === 0 ? (
                    <div className="p-8 text-center text-on-surface-variant text-sm">Chưa có lời mời nào</div>
                  ) : (
                    incomingRequests.map(req => (
                      <div key={req.sender_id} className="flex items-center justify-between p-3 hover:bg-surface-container/50 rounded-xl transition-colors">
                        <div className="flex items-center gap-3">
                          <img src={getDisplayAvatar(req.sender_id, user, userProfiles)} alt="" className="w-12 h-12 rounded-full border border-outline-variant/10 bg-surface-container object-cover" />
                          <div>
                            <p className="font-bold text-on-surface">{getDisplayName(req.sender_id, user, userProfiles)}</p>
                            <p className="text-[12px] text-on-surface-variant">{req.sender_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => acceptRequest(req.sender_id)} className="px-4 py-2 bg-primary text-white font-bold text-sm rounded-full hover:bg-primary/90 transition-colors shadow-sm">
                            Chấp nhận
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
             </div>

             {/* Sent Requests */}
             <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
                <div className="bg-surface-container-lowest p-4 border-b border-outline-variant/20">
                  <h3 className="font-bold text-[15px] text-on-surface">Lời mời đã gửi ({outgoingRequests.length})</h3>
                </div>
                <div className="p-2">
                  {outgoingRequests.length === 0 ? (
                    <div className="p-8 text-center text-on-surface-variant text-sm">Chưa có lời mời nào</div>
                  ) : (
                    outgoingRequests.map(req => (
                      <div key={req.receiver_id} className="flex items-center justify-between p-3 hover:bg-surface-container/50 rounded-xl transition-colors">
                        <div className="flex items-center gap-3">
                          <img src={getDisplayAvatar(req.receiver_id, user, userProfiles)} alt="" className="w-12 h-12 rounded-full border border-outline-variant/10 bg-surface-container object-cover" />
                          <div>
                            <p className="font-bold text-on-surface">{getDisplayName(req.receiver_id, user, userProfiles)}</p>
                            <p className="text-[12px] text-on-surface-variant">{req.receiver_id}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1.5 rounded-full">Đang chờ xác nhận</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default ContactPage;
