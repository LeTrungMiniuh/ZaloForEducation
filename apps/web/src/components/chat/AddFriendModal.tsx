import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

import { X, Search, UserPlus, ArrowRight } from 'lucide-react';

const AddFriendModal: React.FC = () => {
  const { user } = useAuth();
  const { isAddFriendModalOpen, setIsAddFriendModalOpen } = useChatStore();
  
  const [email, setEmail] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsAddFriendModalOpen]);

  const handleClose = () => {
    setIsAddFriendModalOpen(false);
    setEmail('');
    setSearchResult(null);
    setError('');
    setSuccess('');
  };

  const handleSearch = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Vui lòng nhập Email hợp lệ');
      return;
    }

    setIsSearching(true);
    setError('');
    setSearchResult(null);
    
    try {
      const res = await api.get(`/chat/friends/search`, { params: { email: email.trim() } });
      if (res.data?.found) {
        setSearchResult(res.data);
      } else {
        setError('Không tìm thấy người dùng này');
      }
    } catch (err) {
      setError('Đã xảy ra lỗi khi tìm kiếm');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddFriend = async (targetEmail: string) => {
    try {
      await api.post('/chat/friends/request', { targetEmail });
      setSuccess('Đã gửi lời mời kết bạn!');
      // Update result status locally
      if (searchResult && searchResult.user.email === targetEmail) {
        setSearchResult({
          ...searchResult,
          friendship: { status: 'pending', senderEmail: user?.email }
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không thể gửi lời mời');
    }
  };

  if (!isAddFriendModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={handleClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-white rounded-[32px] shadow-[0_24px_50px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-low">
          <h2 className="text-[18px] font-extrabold text-on-surface">Thêm bạn mới</h2>
          <button 
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 text-on-surface-variant transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] hide-scrollbar">
          {/* Email Input Section */}
          <div className="space-y-3 px-1">
            <p className="text-[13px] font-bold text-on-surface-variant">Tìm kiếm qua Email</p>
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary text-[22px] group-focus-within:scale-110 transition-transform" size={20} />
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ví dụ: example@gmail.com"
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-[24px] py-4 pl-[52px] pr-4 text-[15px] outline-none text-on-surface focus:border-primary/50 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-on-surface-variant/90 shadow-inner"
              />
            </div>
            {error && <p className="text-error text-[12px] px-2 font-medium animate-in fade-in slide-in-from-top-1">{error}</p>}
            {success && <p className="text-success text-[12px] px-2 font-medium animate-in fade-in slide-in-from-top-1">{success}</p>}
          </div>

          <div className="h-px bg-outline-variant/10 w-full" />

          {/* Result / Recommendations Section */}
          <div className="min-h-[160px]">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <p className="text-[13px] text-on-surface-variant font-medium">Đang tìm kiếm...</p>
              </div>
            ) : searchResult ? (
              <div className="space-y-4 animate-in fade-in zoom-in-95">
                <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-widest px-1">Kết quả tìm kiếm</p>
                <div className="bg-primary/5 rounded-[28px] p-4 flex items-center gap-4 border border-primary/10 shadow-sm">
                  <img src={searchResult.user.avatarUrl || '/logo_blue.png'} className="w-14 h-14 rounded-full object-cover shadow-sm ring-2 ring-white" alt="" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-extrabold text-on-surface truncate">{searchResult.user.fullName || searchResult.user.fullname}</p>
                    <p className="text-[12px] text-on-surface-variant/60 truncate italic">{searchResult.user.email}</p>
                  </div>
                  
                  {searchResult.isSelf ? (
                    <span className="px-3 py-1 bg-surface-container rounded-full text-[11px] font-bold text-on-surface-variant">Bạn</span>
                  ) : searchResult.friendship?.status === 'accepted' ? (
                    <button className="px-4 py-2 bg-primary/10 text-primary rounded-full text-[12px] font-bold">Bạn bè</button>
                  ) : searchResult.friendship?.status === 'pending' ? (
                    <button className="px-4 py-2 bg-surface-container text-on-surface-variant rounded-full text-[12px] font-bold italic">Chờ phản hồi</button>
                  ) : (
                    <button 
                      onClick={() => handleAddFriend(searchResult.user.email)}
                      className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-full text-[13px] font-extrabold hover:shadow-lg hover:shadow-primary/30 transition-all active:scale-95"
                    >
                      <UserPlus size={18} />
                      Kết bạn
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex justify-between items-center px-1">
                  <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-widest">Có thể bạn quen</p>
                  <button className="text-[12px] text-primary font-bold hover:underline">Xem thêm</button>
                </div>
                
                {/* Mock Recommendations */}
                <div className="space-y-3">
                  {[
                    { name: 'Phạm Văn Hiệp', email: 'hiepph@edu.vn', reason: 'Bạn chung' },
                    { name: 'An Lại', email: 'anlai77@edu.vn', reason: 'Tùng học cùng' },
                    { name: 'Arch La Verne', email: 'laverne@edu.vn', reason: 'Cùng sở thích' }
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-4 p-3.5 hover:bg-surface-container-low rounded-[24px] transition-all group border border-transparent hover:border-outline-variant/5">
                       <div className="w-11 h-11 rounded-full bg-primary/5 flex items-center justify-center text-primary text-[16px] font-extrabold shadow-inner">
                         {item.name.charAt(0)}
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-extrabold text-on-surface truncate group-hover:text-primary transition-colors">{item.name}</p>
                          <p className="text-[11px] text-on-surface-variant/60">{item.reason}</p>
                       </div>
                       <button className="px-4 py-2 bg-white border border-outline-variant/20 text-on-surface text-[12px] font-bold rounded-full hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm">
                          Kết bạn
                       </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-surface-container-low flex gap-3">
          <button 
            onClick={handleClose}
            className="flex-1 py-4 rounded-[24px] bg-white border border-outline-variant/30 text-on-surface-variant font-extrabold text-[14px] hover:bg-surface-container-highest transition-all active:scale-95 shadow-sm"
          >
            Hủy
          </button>
          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="flex-1 py-4 rounded-[24px] bg-primary text-white font-extrabold text-[14px] shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50"
          >
            Tìm kiếm
          </button>
        </div>

      </div>
    </div>
  );
};

export default AddFriendModal;
