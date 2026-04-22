import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar, isUnread } from '../../utils/chatUtils';
import CreateGroupModal from './CreateGroupModal';
import ConversationTagPicker from './ConversationTagPicker';
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
    setIsSearching,
    setActiveConversation,
    loadUserProfile,
    userProfiles,
    hiddenConversations,
    hideConversationWithPin,
    unhideConversationWithPin,
    isCreateGroupModalOpen,
    setIsCreateGroupModalOpen,
    tags,
  } = useChatStore();

  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [convMenu, setConvMenu] = useState<null | {
    convId: string;
    x: number;
    y: number;
  }>(null);
  const [tagPickerPos, setTagPickerPos] = useState<null | {
    convId: string;
    x: number;
    y: number;
  }>(null);

  // Fetch conversations on mount
  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Sync friendship updates
  React.useEffect(() => {
    const handleFriendshipUpdated = () => {
      fetchConversations();
    };

    window.addEventListener("friendship-updated", handleFriendshipUpdated);
    return () => {
      window.removeEventListener("friendship-updated", handleFriendshipUpdated);
    };
  }, [fetchConversations]);

  // Auto-load profiles for partners in conversations
  React.useEffect(() => {
    if (conversations.length > 0) {
      conversations.forEach((conv) => {
        if (conv.type === "direct") {
          const partnerEmail = Array.isArray(conv.members)
            ? conv.members.find((m) => {
                const normalizedM = String(m || "").trim().toLowerCase();
                const normalizedMe = String(user?.email || "").trim().toLowerCase();
                return normalizedM !== normalizedMe;
              })
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
    setIsSearching(false);
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
    setConvMenu(null);
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
    setConvMenu(null);
    Swal.fire({ icon: 'success', title: 'Đã hiện lại trò chuyện', timer: 1300, showConfirmButton: false });
  };

  const filteredConversations = conversations.filter((conv: any) => {
    // 1. Unread filter
    if (chatFilter === "unread" && !isUnread(conv, user?.email)) return false;

    // 2. Tag filter
    if (tagFilter) {
      if (tagFilter === "none" && conv.tagId) return false;
      if (tagFilter !== "none" && conv.tagId !== tagFilter) return false;
    }

    // 3. Hidden conversations logic
    const isHidden = !!hiddenConversations[conv.id];
    if (isHidden) {
      // Only show hidden conversations if they match the search query (and search is active)
      return normalizedSearch.length > 0 && conversationMatchesSearch(conv);
    }

    // 4. Search filter
    return conversationMatchesSearch(conv);
  });

  return (
    <div className="w-85 h-full border-r border-outline-variant/30 flex flex-col bg-white dark:bg-surface-container shrink-0">
      {/* Search Header */}
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 group">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              value={searchQuery}
              onChange={handleSearchTrigger}
              onFocus={() => setIsSearching(true)}
              className="w-full bg-surface-container-highest border-none rounded-2xl py-2 pl-9 pr-4 text-[13px] outline-none text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary/20 transition-all cursor-text"
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

        <div className="flex items-center gap-4 text-sm font-bold px-1 relative">
          <button
            onClick={() => setChatFilter("all")}
            className={`${chatFilter === "all" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"} transition-all pb-2`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setChatFilter("unread")}
            className={`${chatFilter === "unread" ? "text-primary border-b-2 border-primary" : "text-on-surface-variant hover:text-primary"} transition-all pb-2`}
          >
            Chưa đọc
          </button>

          <button
            onClick={() => setClassifyOpen((prev) => !prev)}
            className="ml-auto flex items-center gap-1 rounded-full px-3 py-1 text-[13px] text-on-surface-variant hover:bg-surface-container"
          >
            Phân loại
            <span className="material-symbols-outlined text-[18px]">
              expand_more
            </span>
          </button>

          {classifyOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border border-outline-variant/20 bg-white shadow-xl">
              <div className="border-b px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">
                Theo trạng thái
              </div>
              <button
                onClick={() => {
                  setChatFilter("all");
                  setClassifyOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-surface-container ${chatFilter === "all" ? "text-primary" : "text-on-surface"}`}
              >
                <span>Tất cả</span>
                {chatFilter === "all" && (
                  <span className="material-symbols-outlined text-[18px]">
                    check
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setChatFilter("unread");
                  setClassifyOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-surface-container ${chatFilter === "unread" ? "text-primary" : "text-on-surface"}`}
              >
                <span>Chưa đọc</span>
                {chatFilter === "unread" && (
                  <span className="material-symbols-outlined text-[18px]">
                    check
                  </span>
                )}
              </button>

              <div className="border-t border-outline-variant/10" />
              <div className="px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-on-surface-variant">
                Theo thẻ phân loại
              </div>
              <button
                onClick={() => {
                  setTagFilter(null);
                  setClassifyOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-surface-container ${tagFilter === null ? "text-primary" : "text-on-surface"}`}
              >
                <span>Tất cả</span>
                {tagFilter === null && (
                  <span className="material-symbols-outlined text-[18px]">
                    check
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setTagFilter("none");
                  setClassifyOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-surface-container ${tagFilter === "none" ? "text-primary" : "text-on-surface"}`}
              >
                <span>Chưa có thẻ</span>
                {tagFilter === "none" && (
                  <span className="material-symbols-outlined text-[18px]">
                    check
                  </span>
                )}
              </button>
              {tags.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTagFilter(t.id);
                    setClassifyOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-surface-container ${tagFilter === t.id ? "text-primary" : "text-on-surface"}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      style={{ background: t.color || "#ffb020" }}
                      className="inline-block h-3 w-3 rounded-sm"
                    />
                    <span>{t.name}</span>
                  </div>
                  {tagFilter === t.id && (
                    <span className="material-symbols-outlined text-[18px]">
                      check
                    </span>
                  )}
                </button>
              ))}

              <div className="border-t border-outline-variant/10 px-3 py-2">
                <button
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("open-chat-tag-manager"),
                    );
                    setClassifyOpen(false);
                  }}
                  className="text-[13px] text-on-surface-variant"
                >
                  Quản lý thẻ phân loại
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="text-center p-8 opacity-40 mt-10">
            <span className="material-symbols-outlined text-[48px] mb-2 text-on-surface-variant/20">
              chat_bubble
            </span>
            <p className="text-[13px] font-medium">
              Không có cuộc trò chuyện nào
            </p>
          </div>
        ) : (
          filteredConversations.map((chat) => {
            const isSelected = activeConvId === chat.id;
            const conversationTag = (tags || []).find(
              (t: any) => t.id === (chat as any).tagId,
            );
            const partnerEmail = chat.type === "direct"
              ? (Array.isArray(chat.members) ? chat.members.find((m) => {
                  const normalizedM = String(m || "").trim().toLowerCase();
                  const normalizedMe = String(user?.email || "").trim().toLowerCase();
                  return normalizedM !== normalizedMe;
                }) : undefined)
              : undefined;

            const chatName = chat.type === "direct"
              ? getDisplayName(partnerEmail, user, userProfiles)
              : chat.name || "Group";

            const chatAvatar = chat.type === "direct"
              ? getDisplayAvatar(partnerEmail, user, userProfiles)
              : chat.avatar || "/logo_blue.png";

            const unread = isUnread(chat, user?.email);
            const normalizedPartner = partnerEmail ? String(partnerEmail).trim().toLowerCase() : "";
            const isOnline = normalizedPartner ? userProfiles[normalizedPartner]?.status === "online" : false;
            const isHidden = !!hiddenConversations[chat.id];

            return (
              <div
                key={chat.id}
                onClick={() => {
                  if (isHidden) {
                    Swal.fire({
                      icon: 'info',
                      title: 'Trò chuyện đang ẩn',
                      text: 'Bấm dấu ... rồi chọn "Mở khóa trò chuyện" để nhập PIN.',
                      timer: 2000,
                      showConfirmButton: false,
                    });
                    return;
                  }
                  setActiveConversation(chat.id);
                }}
                className={`group flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-all ${
                  isSelected ? "bg-primary/10 shadow-sm" : "hover:bg-surface-container/70"
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    className="w-12 h-12 rounded-full object-cover shadow-sm bg-surface-container ring-1 ring-black/5"
                    alt={chatName}
                    src={chatAvatar}
                  />
                  {isOnline && (
                    <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-white dark:border-surface-container rounded-full shadow-sm ring-1 ring-black/5 animate-pulse"></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <h3
                      className={`text-[14px] truncate ${unread ? "font-bold" : "font-semibold"} ${isSelected ? "text-primary" : "text-on-surface"}`}
                    >
                      {chatName}
                    </h3>
                    {chat.updatedAt && (
                      <span className="text-[10px] text-on-surface-variant font-medium shrink-0 ml-2">
                        {new Date(chat.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {conversationTag && (
                        <span
                          className="material-symbols-outlined shrink-0 text-[16px]"
                          style={{ color: conversationTag.color || "#ffb020" }}
                          title={`Thẻ: ${conversationTag.name}`}
                        >
                          folder
                        </span>
                      )}
                      <p className={`text-[13px] truncate ${unread ? "font-bold text-on-surface" : "text-on-surface-variant"}`}>
                        {isHidden
                          ? 'Trò chuyện đã ẩn (yêu cầu PIN)'
                          : (() => {
                              const content = chat.lastMessageContent || chat.lastMessage;
                              if (content === '[Cuộc gọi thoại]' || content === '[Cuộc gọi video]') {
                                const isMe = chat.lastMessageSenderId === user?.email;
                                const type = content.includes('video') ? 'video' : 'thoại';
                                return isMe ? `Cuộc gọi ${type} đi` : `Cuộc gọi ${type} đến`;
                              }
                              return content || 'Chưa có tin nhắn';
                            })()}
                      </p>
                    </div>
                    {unread && chat.unreadCount > 0 && (
                      <div className="min-w-[20px] h-5 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5 ml-2 shadow-sm shadow-error/20">
                        {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                      </div>
                    )}
                    {unread && (!chat.unreadCount || chat.unreadCount === 0) && (
                      <div className="w-2.5 h-2.5 bg-primary rounded-full shrink-0 ml-2 shadow-sm shadow-primary/20"></div>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setConvMenu({
                      convId: chat.id,
                      x: Math.min(rect.right - 220, window.innerWidth - 240),
                      y: Math.min(rect.bottom + 8, window.innerHeight - 180),
                    });
                  }}
                  className="rounded-full p-1 text-on-surface-variant opacity-0 transition group-hover:opacity-100 hover:bg-surface-container"
                  title="Tùy chọn"
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {convMenu && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setConvMenu(null)}
          />
          <div
            className="fixed z-[110] w-56 overflow-hidden rounded-2xl border border-outline-variant/20 bg-white p-2 shadow-2xl"
            style={{ left: convMenu.x, top: convMenu.y }}
          >
            <button
              onClick={() => {
                setTagPickerPos({
                  convId: convMenu.convId,
                  x: convMenu.x + 180,
                  y: convMenu.y,
                });
                setConvMenu(null);
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
            >
              Phân loại
            </button>
            <button
              onClick={() => {
                const isHidden = !!hiddenConversations[convMenu.convId];
                if (isHidden) {
                  handleUnhideConversation(convMenu.convId);
                } else {
                  handleHideConversation(convMenu.convId);
                }
              }}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
            >
              <Lock size={14} />
              {hiddenConversations[convMenu.convId] ? 'Mở khóa trò chuyện' : 'Ẩn trò chuyện'}
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("open-chat-tag-manager"));
                setConvMenu(null);
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-[13px] font-medium text-on-surface hover:bg-surface-container"
            >
              Quản lý thẻ phân loại
            </button>
          </div>
        </>
      )}

      {tagPickerPos && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tagPickerPos.x, window.innerWidth - 280),
            top: Math.min(tagPickerPos.y, window.innerHeight - 360),
            zIndex: 120,
          }}
        >
          <ConversationTagPicker
            convId={tagPickerPos.convId}
            onClose={() => setTagPickerPos(null)}
          />
        </div>
      )}

      <CreateGroupModal
        isOpen={isCreateGroupModalOpen}
        onClose={() => setIsCreateGroupModalOpen(false)}
      />
    </div>
  );
};

export default InboxList;