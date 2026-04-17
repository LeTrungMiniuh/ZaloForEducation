import React, { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar, highlightText, getFileIcon } from '../../utils/chatUtils';

import { X, Search, ArrowRight } from 'lucide-react';

const SearchOverlay: React.FC = () => {
  const { user } = useAuth();
  const { 
    isSearching,
    setIsSearching,
    searchQuery,
    setSearchQuery,
    searchResults,
    performGlobalSearch,
    startDirectChat,
    searchHistory,
    clearSearchHistory,
    setActiveConversation,
    userProfiles,
    loadUserProfile
  } = useChatStore();

  const [searchTab, setSearchTab] = useState<'all' | 'contacts' | 'messages' | 'files'>('all');
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);

  // Auto-load profiles for message senders and contacts in search results
  useEffect(() => {
    // Scan messages
    if (searchResults.messages.length > 0) {
      searchResults.messages.forEach((msg: any) => {
        if (msg.senderId) loadUserProfile(msg.senderId);
      });
    }
    // Scan contacts
    if (searchResults.contacts.length > 0) {
      searchResults.contacts.forEach((contact: any) => {
        if (contact.email) loadUserProfile(contact.email);
      });
    }
  }, [searchResults.messages, searchResults.contacts, loadUserProfile]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearching(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsSearching, setSearchQuery]);

  if (!isSearching) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[5vh] sm:pt-[10vh] px-4">
      {/* Backdrop with enhanced blur */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
        onClick={() => { setIsSearching(false); setSearchQuery(''); }}
      />

      {/* Modal Container: Premium "Floating" Design */}
      <div className="relative w-full max-w-2xl bg-white/90 backdrop-blur-xl rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.3)] flex flex-col h-[75vh] overflow-hidden border border-white/20 animate-in slide-in-from-top-8 zoom-in-95 duration-300">
        
        {/* Header Section */}
        <div className="p-6 pb-4 space-y-5 shrink-0 border-b border-outline-variant/5">
           <div className="flex items-center gap-4">
              <div className="relative flex-1 group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={20} />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => {
                    const q = e.target.value;
                    setSearchQuery(q);
                    if (q.trim()) {
                      const timer = setTimeout(() => performGlobalSearch(q), 300);
                      return () => clearTimeout(timer);
                    }
                  }}
                  className="w-full bg-surface-container border-none rounded-[24px] py-4 pl-[60px] pr-12 text-[16px] outline-none text-on-surface placeholder:text-on-surface-variant transition-all font-medium shadow-inner"
                  placeholder="Tìm bạn bè, tin nhắn, tệp tin..."
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-outline hover:text-on-surface-variant bg-black/5 hover:bg-black/10 rounded-full transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                )}
              </div>
              <button 
                onClick={() => { setIsSearching(false); setSearchQuery(''); }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container hover:bg-error/10 hover:text-error transition-all group"
                title="Đóng (Esc)"
              >
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
           </div>

           {/* Tabs: Pill Style */}
           <div className="flex bg-surface-container rounded-[18px] p-1 gap-1 w-fit">
            {['all', 'contacts', 'messages', 'files'].map((tab) => (
              <button
                key={tab}
                onClick={() => setSearchTab(tab as any)}
                className={`px-5 py-2.5 rounded-[14px] text-[13px] font-extrabold transition-all duration-300 ${
                  searchTab === tab 
                    ? 'bg-white text-primary shadow-sm ring-1 ring-black/5 dark:bg-primary/20 dark:text-on-surface' 
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/50'
                }`}
              >
                {tab === 'all' ? 'Tất cả' : tab === 'contacts' ? 'Liên hệ' : tab === 'messages' ? 'Tin nhắn' : 'File'}
              </button>
            ))}
          </div>
        </div>

        {/* Results Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc]/50 hide-scrollbar">
           {!searchQuery ? (
             /* EMPTY STATE / RECENT SEARCHES */
             <div className="max-w-xl mx-auto space-y-8 py-4">
                {searchHistory.length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-4 px-2">
                      <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-[0.1em]">Tìm kiếm gần nhất</p>
                      <button onClick={clearSearchHistory} className="text-[12px] text-primary/60 font-bold hover:text-primary transition-colors">Xóa lịch sử</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchHistory.map((h, i) => (
                        <button 
                          key={i} 
                          onClick={() => { setSearchQuery(h); performGlobalSearch(h); }} 
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant/10 rounded-full hover:bg-primary/5 hover:border-primary/20 transition-all text-[14px] text-on-surface font-semibold shadow-sm group"
                        >
                           <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary">history</span>
                           {h}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="text-center py-12 space-y-3">
                   <div className="w-16 h-16 bg-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-primary text-[32px]">travel_explore</span>
                   </div>
                   <p className="text-[16px] font-extrabold text-on-surface mb-1">ZaloEdu Global Search</p>
                   <p className="text-[14px] text-on-surface-variant/60 max-w-[280px] mx-auto leading-relaxed">Tìm kiếm nhanh chóng mọi nội dung trong thế giới ZaloEdu của sếp.</p>
                </div>
             </div>
           ) : (
             <div className="space-y-8">
                {/* 1. CONTACTS CATEGORY */}
                {(searchTab === 'all' || searchTab === 'contacts') && searchResults.contacts.length > 0 && (
                  <section className="space-y-4">
                    <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-[0.1em] px-2 leading-none">Người dùng & Liên hệ</p>
                    <div className="bg-white rounded-[24px] p-2 shadow-sm border border-outline-variant/10">
                       {(showAllContacts ? searchResults.contacts : searchResults.contacts.slice(0, 5)).map((contact: any) => (
                         <div 
                           key={contact.email} 
                           onClick={() => startDirectChat(contact.email)}
                           className="flex items-center gap-4 p-3.5 hover:bg-primary/5 rounded-[20px] cursor-pointer transition-all group border border-transparent active:scale-[0.98]"
                         >
                            <img className="w-12 h-12 rounded-full object-cover shrink-0 shadow-sm ring-2 ring-white" src={getDisplayAvatar(contact.email, user, userProfiles)} alt="" />
                            <div className="flex-1 min-w-0">
                               <p className="text-[15px] font-extrabold text-on-surface truncate group-hover:text-primary transition-colors">{highlightText(contact.fullName || contact.email, searchQuery)}</p>
                               <p className="text-[13px] text-on-surface-variant/60 truncate font-medium">{contact.email}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                               <span className="material-symbols-outlined text-primary text-[20px]">chat</span>
                            </div>
                         </div>
                       ))}
                       {!showAllContacts && searchResults.contacts.length > 5 && (
                          <button onClick={() => setShowAllContacts(true)} className="w-full py-3.5 text-[13px] font-extrabold text-primary hover:bg-primary/5 rounded-[18px] transition-all border-t border-outline-variant/5 mt-1">
                             Xem tất cả {searchResults.contacts.length} kết quả
                          </button>
                        )}
                    </div>
                  </section>
                )}

                {/* 2. MESSAGES CATEGORY */}
                {(searchTab === 'all' || searchTab === 'messages') && searchResults.messages.length > 0 && (
                   <section className="space-y-4">
                      <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-[0.1em] px-2 leading-none">Nội dung tin nhắn</p>
                      <div className="space-y-2">
                         {(showAllMessages ? searchResults.messages : searchResults.messages.slice(0, 5)).map((msg: any) => (
                           <div 
                             key={msg.id} 
                             onClick={() => { setActiveConversation(msg.conversationId || msg.convId); setIsSearching(false); setSearchQuery(''); }}
                             className="bg-white p-5 rounded-[24px] hover:bg-primary/5 cursor-pointer transition-all group border border-outline-variant/10 hover:border-primary/10 shadow-sm"
                           >
                              <div className="flex items-start gap-4">
                                <img className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm" src={getDisplayAvatar(msg.senderId, user, userProfiles)} alt="" />
                                <div className="flex-1 min-w-0">
                                   <div className="flex justify-between items-center mb-1.5">
                                      <p className="text-[14px] font-extrabold text-on-surface truncate group-hover:text-primary transition-colors">{getDisplayName(msg.senderId, user, userProfiles)}</p>
                                      <span className="text-[10px] text-on-surface-variant/60 font-bold bg-surface-container px-2.5 py-1 rounded-full">{new Date(msg.createdAt).toLocaleDateString('vi-VN')}</span>
                                   </div>
                                   <p className="text-[14px] text-on-surface-variant line-clamp-2 leading-relaxed opacity-90 italic">
                                      "{highlightText(msg.content, searchQuery)}"
                                   </p>
                                </div>
                              </div>
                           </div>
                         ))}
                         {!showAllMessages && searchResults.messages.length > 5 && (
                            <button onClick={() => setShowAllMessages(true)} className="w-full py-4 text-[13px] font-extrabold text-primary bg-white hover:bg-primary/5 rounded-[24px] transition-all shadow-sm border border-outline-variant/10">
                               Khám phá thêm {searchResults.messages.length - 5} cuộc trò chuyện
                            </button>
                         )}
                      </div>
                   </section>
                )}

                {/* 3. FILES CATEGORY */}
                {(searchTab === 'all' || searchTab === 'files') && searchResults.files.length > 0 && (
                  <section className="space-y-4">
                     <p className="text-[11px] font-extrabold text-on-surface-variant/50 uppercase tracking-[0.1em] px-2 leading-none">Tệp tin & Đa phương tiện</p>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(showAllFiles ? searchResults.files : searchResults.files.slice(0, 6)).map((f: any) => (
                          <div 
                            key={f.messageId} 
                            onClick={() => { setActiveConversation(f.convId || f.conversationId); setIsSearching(false); setSearchQuery(''); }}
                            className="bg-white flex items-center gap-4 p-4 rounded-[22px] cursor-pointer transition-all group border border-outline-variant/10 hover:border-primary/20 shadow-sm hover:shadow-md"
                          >
                             <div className="w-12 h-12 bg-primary/5 rounded-[16px] flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-all scale-100 group-hover:scale-110">
                                <span className="material-symbols-outlined text-primary text-[28px]">
                                   {getFileIcon(f.name)}
                                </span>
                             </div>
                             <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-extrabold text-on-surface truncate group-hover:text-primary transition-colors">{highlightText(f.name, searchQuery)}</p>
                                <p className="text-[12px] text-on-surface-variant/60 font-medium truncate italic">
                                   {(f.size / 1024 / 1024).toFixed(1)} MB • {getDisplayName(f.senderId, user, userProfiles)}
                                </p>
                             </div>
                          </div>
                        ))}
                     </div>
                  </section>
                )}

                {/* EMPTY RESULTS STATE */}
                {searchResults.contacts.length === 0 && searchResults.messages.length === 0 && searchResults.files.length === 0 && (
                   <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in slide-in-from-bottom-4">
                      <div className="w-24 h-24 bg-surface-container rounded-[32px] flex items-center justify-center mb-6 shadow-inner">
                         <span className="material-symbols-outlined text-[48px] text-outline/40">sentiment_neutral</span>
                      </div>
                      <h3 className="text-[18px] font-extrabold text-on-surface mb-2">Hơi tiếc sếp ơi...</h3>
                      <p className="text-[14px] text-on-surface-variant/60 max-w-xs mx-auto leading-relaxed">Bộ lọc không tìm thấy kết quả nào phù hợp. Sếp thử đổi từ khóa khác xem sao nhé!</p>
                   </div>
                )}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default SearchOverlay;
