import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useChatStore } from '../../../store/chatStore';
import ChatInput from '../../../components/chat/ChatInput';
import MessageBubble from '../../../components/chat/MessageBubble';
import ChatInfoSidebar from '../../../components/chat/ChatInfoSidebar';
import ImageModal from '../../../components/chat/ImageModal';
import { getMessageTimeContext, getDisplayName } from '../../../utils/chatUtils';
import type { Attachment } from '../../../utils/chatUtils';
import type { Message } from '@zalo-edu/shared';
import api from '../../../services/api';
import { BOT_EMAIL, BOT_AVATAR } from '@zalo-edu/shared';
import {
  Copy,
  Pin,
  Star,
  ListChecks,
  Info,
  RotateCcw,
  Trash2,
  ArrowDown,
  Bot,
  Sparkles,
  Search,
  PanelRightOpen,
} from 'lucide-react';
import Swal from 'sweetalert2';

const BOT_EMAIL_CONST = BOT_EMAIL;

const botPost = async (path: string, body: any) => {
  try {
    return await api.post(`/bot${path}`, body);
  } catch {
    return await api.post(`/api/bot${path}`, body);
  }
};

const BotChatPage: React.FC = () => {
  const { user, socket } = useAuth();
  const {
    activeConvId,
    messages,
    sendMessageOptimistic,
    setActiveConversation,
    userProfiles,
    markAsRead,
    loadMoreMessages,
    isLoadingMessages,
    nextCursor,
    highlightedMessageId,
    jumpToMessage,
  } = useChatStore();

  const [botConvId, setBotConvId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<any | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);
  const lastCursorRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(true);

  // Init bot conversation
  useEffect(() => {
    if (!user?.email) return;

    const init = async () => {
      try {
        const res = await botPost('/conversation', {});
        const convId = res.data?.convId;
        if (!convId) return;

        setBotConvId(convId);
        setActiveConversation(convId);
      } catch (err) {
        console.error('Failed to init bot conversation', err);
      }
    };

    init();
  }, [user?.email]);

  // Socket listeners for bot replies
  useEffect(() => {
    if (!socket || !botConvId) return;

    socket.emit('join_room', { convId: botConvId });

    const handleMessage = (msg: any) => {
      if (!msg?.id) return;
      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId !== botConvId) return;

      useChatStore.getState().addMessage(msg);

      if (msg.senderId === BOT_EMAIL_CONST) {
        setIsBotTyping(false);
      }
    };

    socket.on('receiveMessage', handleMessage);
    return () => {
      socket.emit('leave_room', { convId: botConvId });
      socket.off('receiveMessage', handleMessage);
    };
  }, [socket, botConvId]);

  // Utility to scroll to bottom
  const scrollToBottom = (instant = false) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    const performScroll = () => {
      el.scrollTop = el.scrollHeight;
    };

    if (instant) {
      performScroll();
      requestAnimationFrame(performScroll);
      setTimeout(performScroll, 30);
      setTimeout(performScroll, 100);
      setTimeout(performScroll, 300);
    } else {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    }
  };


  // Handle scroll for Infinite Load and Scroll Bottom Button
  const handleScroll = () => {
    if (!scrollRef.current || !activeConvId) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollBottom(!isNearBottom);

    if (
      scrollTop < 100 &&
      nextCursor &&
      nextCursor !== lastCursorRef.current &&
      !isLoadingMessages &&
      !isLoadingMoreRef.current
    ) {
      lastCursorRef.current = nextCursor;
      isLoadingMoreRef.current = true;
      isPrependingRef.current = true;
      prevScrollHeightRef.current = scrollHeight;

      void (async () => {
        try {
          await loadMoreMessages(activeConvId);
        } finally {
          isLoadingMoreRef.current = false;
        }
      })();
    }
  };

  // Adjust scroll position after loading more messages
  useLayoutEffect(() => {
    if (isPrependingRef.current && prevScrollHeightRef.current > 0 && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      const heightDiff = newScrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        scrollRef.current.scrollTop += heightDiff;
      }
      prevScrollHeightRef.current = 0;
      isPrependingRef.current = false;
    }
  }, [messages.length]);

  // Reset scroll state when room changes
  useEffect(() => {
    prevMessagesLengthRef.current = 0;
    prevScrollHeightRef.current = 0;
    isLoadingMoreRef.current = false;
    isPrependingRef.current = false;
    lastCursorRef.current = null;
  }, [activeConvId]);

  // Scroll to bottom when messages change
  const IS_NEAR_BOTTOM_THRESHOLD = 150;

  useEffect(() => {
    if (messages.length > 0) {
      if (isPrependingRef.current) {
        prevMessagesLengthRef.current = messages.length;
        const timer = setTimeout(() => { isPrependingRef.current = false; }, 100);
        return () => clearTimeout(timer);
      }

      const isInitialLoad = prevMessagesLengthRef.current === 0;
      const isNewMessage = messages.length > prevMessagesLengthRef.current;

      if (isInitialLoad) {
        scrollToBottom(true);
      } else if (isNewMessage) {
        const el = scrollRef.current;
        if (el) {
          const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceToBottom < IS_NEAR_BOTTOM_THRESHOLD) {
            scrollToBottom();
          }
        }
      }
      prevMessagesLengthRef.current = messages.length;
    } else {
      prevMessagesLengthRef.current = 0;
    }
  }, [messages, activeConvId]);

  // Handle Dynamic Content Height (Images loading after initial render)
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    const resizeObserver = new ResizeObserver(() => {
      if (isPrependingRef.current) return;

      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < IS_NEAR_BOTTOM_THRESHOLD && distanceToBottom > 0) {
        scrollToBottom();
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [activeConvId]);

  // Mark as read when messages change
  useEffect(() => {
    if (activeConvId) {
      markAsRead(activeConvId);
    }
  }, [activeConvId, messages.length, markAsRead]);

  // Jump to highlighted message if it exists
  useEffect(() => {
    if (highlightedMessageId && messages.length > 0) {
      const el = document.getElementById(`msg-${highlightedMessageId}`);
      if (el) {
        jumpToMessage(highlightedMessageId);
      }
    }
  }, [highlightedMessageId, messages, jumpToMessage]);

  // Auto-load bot profile for display names
  useEffect(() => {
    if (messages.length > 0) {
      const { loadUserProfile } = useChatStore.getState();
      messages.forEach(m => {
        if (m.senderId && m.senderId !== user?.email) {
          loadUserProfile(m.senderId);
        }
      });
    }
  }, [messages, user?.email]);

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!activeConvId || !user?.email) return;

    setIsBotTyping(true);
    await sendMessageOptimistic(
      activeConvId,
      user.email,
      text,
      'text',
      attachments,
      replyTarget,
    );
    setReplyTarget(null);
  };

  const handleSendContactCard = async (card: {
    email: string;
    fullName?: string;
    avatarUrl?: string;
    phone?: string;
  }) => {
    if (!activeConvId || !user?.email) return;

    await sendMessageOptimistic(
      activeConvId,
      user.email,
      '[Danh thiếp]',
      'contact_card',
      [],
      replyTarget,
      { contactCard: card },
    );
    setReplyTarget(null);
  };

  const handleSendLocation = async (location: {
    latitude: number;
    longitude: number;
    label?: string;
    isLive?: boolean;
    liveSessionId?: string;
    sentAt?: string;
    expiresAt?: string;
  }) => {
    if (!activeConvId || !user?.email) return;

    await sendMessageOptimistic(
      activeConvId,
      user.email,
      location.isLive ? '[Vị trí trực tiếp]' : '[Vị trí]',
      'location',
      [],
      null,
      { location },
    );
  };

  const [contextMenu, setContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-surface-container-lowest">
      <div className="flex-1 flex flex-col h-full bg-[#f7f9fb] dark:bg-surface-container-low min-w-0">
      {/* Header */}
      <header className="h-16 flex items-center gap-4 px-6 bg-white/90 dark:bg-surface-container/90 backdrop-blur-xl border-b border-outline-variant/15 dark:border-outline-variant/30 z-20 shrink-0">
        <div className="relative">
          <img src={BOT_AVATAR} className="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20 shadow-sm" alt="Bot" />
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-surface-container rounded-full flex items-center justify-center">
            <Sparkles size={8} className="text-white" />
          </div>
        </div>
        <div className="flex flex-col">
          <h2 className="font-extrabold text-on-surface leading-tight text-[16px] tracking-tight">ZaloEdu AI</h2>
          <p className="text-[12px] text-on-surface-variant font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span>
            {isBotTyping ? 'AI đang soạn tin...' : 'Trợ lý giáo dục AI'}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            className="w-10 h-10 flex items-center justify-center hover:bg-surface-container rounded-full transition-all text-on-surface-variant hover:text-primary"
            title="Tìm kiếm tin nhắn"
          >
            <Search size={20} />
          </button>
          
          <div className="w-px h-6 bg-outline-variant/20 mx-1" />
          
          <button
            onClick={() => setIsInfoOpen(!isInfoOpen)}
            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isInfoOpen ? "bg-primary/10 text-primary" : "hover:bg-surface-container text-on-surface-variant hover:text-primary"}`}
            title="Thông tin hội thoại"
          >
            <PanelRightOpen size={20} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 hide-scrollbar flex flex-col"
        onScroll={handleScroll}
      >
        {/* Infinite Load Indicator */}
        {isLoadingMessages && nextCursor && (
          <div className="flex justify-center py-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="fixed bottom-32 right-12 z-[40] w-10 h-10 bg-white dark:bg-surface-container-high rounded-full shadow-lg border border-outline-variant/10 flex items-center justify-center text-primary hover:bg-surface-container transition-all animate-in fade-in zoom-in duration-200"
            title="Cuộn xuống dưới cùng"
          >
            <ArrowDown size={20} strokeWidth={2.5} className="text-primary" />
          </button>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Bot size={40} className="text-primary" />
            </div>
            <h3 className="font-extrabold text-on-surface text-lg">Chào bạn! Tôi là ZaloEdu AI</h3>
            <p className="text-on-surface-variant text-sm text-center max-w-xs leading-relaxed">
              Hỏi tôi về thông tin tài khoản, bạn bè, hoặc gửi ảnh/PDF bài học để tôi phân tích!
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {[...messages]
              .sort((a, b) => {
                const t1 = new Date(a.createdAt).getTime();
                const t2 = new Date(b.createdAt).getTime();
                if (isNaN(t1)) return 1;
                if (isNaN(t2)) return -1;
                return t1 - t2;
              })
              .map((m, index, sortedMsgs) => {
                const prevMsg = index > 0 ? sortedMsgs[index - 1] : undefined;
                const { dateHeader, showTimeHeader, formattedTime } =
                  getMessageTimeContext(
                    new Date(m.createdAt),
                    prevMsg ? new Date(prevMsg.createdAt) : undefined,
                  );

                return (
                  <React.Fragment key={m.id}>
                    {dateHeader && (
                      <div className="flex justify-center my-6">
                        <span className="text-[11px] font-bold text-on-surface-variant/70 bg-surface-container-high/40 px-3 py-1 rounded-full backdrop-blur-sm shadow-sm border border-outline-variant/5">
                          {dateHeader}
                        </span>
                      </div>
                    )}
                    {!dateHeader && showTimeHeader && (
                      <div className="flex justify-center my-4">
                        <span className="text-[10px] font-medium text-on-surface-variant/50 uppercase tracking-tighter">
                          {formattedTime}
                        </span>
                      </div>
                    )}
                    <div
                      className={
                        !dateHeader && !showTimeHeader ? 'mt-1' : 'mt-4'
                      }
                    >
                      <MessageBubble
                        message={m}
                        userProfiles={userProfiles}
                        hideTime={!showTimeHeader}
                        onContextMenu={(msg, x, y) =>
                          setContextMenu({ message: msg, x, y })
                        }
                        onReply={(msg) => setReplyTarget(msg)}
                        onForward={undefined}
                      />
                    </div>
                  </React.Fragment>
                );
              })}
          </div>
        )}

        {/* Typing Indicator for Bot */}
        {isBotTyping && (
          <div className="absolute bottom-24 left-8 z-10 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-white dark:bg-surface-container-high rounded-full px-4 py-2 border border-outline-variant/10 flex items-center gap-3">
              <div className="flex gap-1.5 items-center">
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce" />
              </div>
              <span className="text-[12px] font-bold text-on-surface-variant italic">
                ZaloEdu AI đang soạn tin...
              </span>
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>

      <ChatInput
        onSendMessage={handleSendMessage}
        onSendContactCard={handleSendContactCard}
        onSendLocation={handleSendLocation}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
      />

      </div>

      {/* Info Sidebar */}
      {botConvId && isInfoOpen && (
        <ChatInfoSidebar />
      )}

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-110"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu(null);
          }}
        >
          <div
            className="absolute bg-white dark:bg-surface-container rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] border border-outline-variant/10 dark:border-outline-variant/30 py-1.5 w-64 animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 270),
              top: Math.min(contextMenu.y, window.innerHeight - 400),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.message.content);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Copy size={18} className="text-on-surface-variant" />
              Sao chép tin nhắn
            </button>
            <button
              onClick={() => {
                useChatStore.getState().patchMessageOptimistic(activeConvId!, contextMenu.message.id, {
                  action: contextMenu.message.pinned ? 'unpin' : 'pin',
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Pin size={18} className="text-on-surface-variant" />
              {contextMenu.message.pinned
                ? 'Bỏ ghim tin nhắn'
                : 'Ghim tin nhắn'}
            </button>
            <button
              onClick={() => {
                Swal.fire({
                  title: 'Đánh dấu tin nhắn',
                  text: 'Tin nhắn đã được đánh dấu và lưu vào Cloud của bạn!',
                  icon: 'success',
                  timer: 2000,
                  showConfirmButton: false,
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Star size={18} className="text-on-surface-variant" />
              Đánh dấu tin nhắn
            </button>

            <div className="h-px bg-outline-variant/10 my-1 mx-2" />

            <button
              onClick={() => {
                Swal.fire({
                  title: 'Chọn nhiều tin nhắn',
                  text: 'Chức năng chọn nhiều tin nhắn đang được phát triển.',
                  icon: 'info',
                  confirmButtonColor: '#00418f',
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <ListChecks size={18} className="text-on-surface-variant" />
              Chọn nhiều tin nhắn
            </button>
            <button
              onClick={() => {
                const date = new Date(
                  contextMenu.message.createdAt,
                ).toLocaleString();
                Swal.fire({
                  title: 'Chi tiết tin nhắn',
                  html: `
                    <div class="text-left space-y-2 mt-4 text-sm text-on-surface">
                      <p><strong>Người gửi:</strong> ${getDisplayName(contextMenu.message.senderId, user, userProfiles)}</p>
                      <p><strong>Đã gửi lúc:</strong> ${date}</p>
                      <p><strong>Trạng thái:</strong> ${contextMenu.message.status}</p>
                      <p><strong>Mã tin nhắn:</strong> <span class="text-xs text-outline font-mono">${contextMenu.message.id}</span></p>
                    </div>
                  `,
                  icon: 'info',
                  confirmButtonColor: '#00418f',
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Info size={18} className="text-on-surface-variant" />
              Xem chi tiết
            </button>

            <div className="h-px bg-outline-variant/10 my-1 mx-2" />

            {contextMenu.message.senderId === user?.email && !contextMenu.message.recalled && (
              <button
                onClick={() => {
                  useChatStore.getState().patchMessageOptimistic(activeConvId!, contextMenu.message.id, { action: 'recall' });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-error/5 text-error text-[14px] font-bold transition-colors"
              >
                <RotateCcw size={18} />
                Thu hồi
              </button>
            )}
            <button
              onClick={() => {
                useChatStore.getState().deleteMessageOptimistic(activeConvId!, contextMenu.message.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-error/5 text-error text-[14px] font-bold transition-colors"
            >
              <Trash2 size={18} />
              Xóa chỉ ở phía tôi
            </button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      <ImageModal />
    </div>
  );
};

export default BotChatPage;
