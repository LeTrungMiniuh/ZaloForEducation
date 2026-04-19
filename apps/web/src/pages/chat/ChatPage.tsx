import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import InboxList from '../../components/chat/InboxList';
import ChatHeader from '../../components/chat/ChatHeader';
import ChatInput from '../../components/chat/ChatInput';
import MessageBubble from '../../components/chat/MessageBubble';
import ChatInfoSidebar from '../../components/chat/ChatInfoSidebar';
import ImageModal from '../../components/chat/ImageModal';
import ForwardModal from '../../components/chat/ForwardModal';
import { getMessageTimeContext } from '../../utils/chatUtils';
import type { Attachment } from '../../utils/chatUtils';

import { 
  Copy, 
  Pin, 
  Star, 
  ListChecks, 
  Info, 
  LayoutGrid, 
  ChevronRight, 
  RotateCcw, 
  Trash2 
} from 'lucide-react';
import Swal from 'sweetalert2';

const ChatPage: React.FC = () => {
  const { user, socket } = useAuth();
  const {
    activeConvId,
    conversations,
    messages,
    sendMessageOptimistic,
    startDirectChat,
    setActiveConversation,
    userProfiles,
    markAsRead,
    fetchMessages
  } = useChatStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [isInfoOpen, setIsInfoOpen] = useState(true);
  const [replyTarget, setReplyTarget] = useState<any | null>(null);
  const [forwardMessage, setForwardMessage] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevRoomRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef(0);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Utility to scroll to bottom
  const scrollToBottom = (instant = false) => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end'
      });
    }, 100);
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // Only scroll if it's the initial load or a new message was added
      if (prevMessagesLengthRef.current === 0 || messages.length > prevMessagesLengthRef.current) {
        // Option: Check if user is near bottom to avoid force-scroll when reading old messages.
        // For now, we fix the specific issue where *reactions* cause forced scroll down.
        scrollToBottom();
      }
      prevMessagesLengthRef.current = messages.length;
    } else {
      prevMessagesLengthRef.current = 0;
    }
  }, [messages]);

  // Initial fetch when activeConvId changes
  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);
      
      // Join Socket Room for Real-time
      if (socket) {
        // Leave previous room if exists
        if (prevRoomRef.current && prevRoomRef.current !== activeConvId) {
          socket.emit('leave_room', { convId: prevRoomRef.current });
        }
        
        socket.emit('join_room', { convId: activeConvId });
        prevRoomRef.current = activeConvId;
      }
    }
    
    return () => {
      // Cleanup: leave room on unmount
      if (activeConvId && socket) {
        socket.emit('leave_room', { convId: activeConvId });
      }
    };
  }, [activeConvId, fetchMessages, socket]);

  // Handle typing indicator via CustomEvent from useSocketListeners
  useEffect(() => {
    setTypingUsers(new Set()); // Reset when changing room
    
    const handleTypingEvent = (e: any) => {
      const data = e.detail;
      if (data.convId === activeConvId && data.email !== user?.email) {
        if (data.isTyping) {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.add(data.email);
            return next;
          });
          // Remove after 5 seconds to prevent stuck indicator
          setTimeout(() => {
            setTypingUsers(prev => {
              const next = new Set(prev);
              next.delete(data.email);
              return next;
            });
          }, 5000);
        } else {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.email);
            return next;
          });
        }
      }
    };

    document.addEventListener('chat_typing_update', handleTypingEvent);
    return () => document.removeEventListener('chat_typing_update', handleTypingEvent);
  }, [activeConvId, user]);

  // Mark as read when messages change or room opens
  useEffect(() => {
    if (activeConvId) {
      markAsRead(activeConvId);
    }
  }, [activeConvId, messages.length, markAsRead]);

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!activeConvId || !user?.email) return;

    // Gửi tin nhắn kèm đính kèm và thông tin reply
    await sendMessageOptimistic(
      activeConvId,
      user.email,
      text,
      'text',
      attachments,
      replyTarget
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

  const [contextMenu, setContextMenu] = useState<{ message: any; x: number; y: number } | null>(null);

  useEffect(() => {
    const navState = (location.state || null) as {
      openConversationId?: string;
      openDirectChatEmail?: string;
    } | null;

    const requestedConvId = String(navState?.openConversationId || '').trim();
    const requestedEmail = String(navState?.openDirectChatEmail || '').trim().toLowerCase();

    if (!requestedConvId && !requestedEmail) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (requestedConvId) {
          setActiveConversation(requestedConvId);
          return;
        }

        const normalizedMe = String(user?.email || '').trim().toLowerCase();
        const existingDirect = conversations.find((conversation) => {
          if (conversation?.type !== 'direct') return false;
          const members = Array.isArray(conversation.members)
            ? conversation.members.map((item) => String(item || '').toLowerCase())
            : [];
          return members.includes(normalizedMe) && members.includes(requestedEmail);
        });

        if (existingDirect?.id) {
          setActiveConversation(existingDirect.id);
          return;
        }

        if (!cancelled && requestedEmail) {
          await startDirectChat(requestedEmail);
        }
      } finally {
        if (!cancelled) {
          navigate('/chat', { replace: true, state: null });
        }
      }
    };

    run().catch((error) => {
      console.error('Failed to open chat from navigation state', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    location.state,
    conversations,
    navigate,
    setActiveConversation,
    startDirectChat,
    user?.email,
  ]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-surface-container-lowest">
      {/* 1. Inbox List Panel */}
      <InboxList />

      {/* 2. Main Chat Area */}
      <div className="flex-1 h-full flex flex-col min-w-0 bg-[#f7f9fb] dark:bg-surface-container-low shadow-[inset_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[inset_1px_0_0_rgba(255,255,255,0.04)]">
        {activeConvId ? (
          <>
            <ChatHeader
              isInfoOpen={isInfoOpen}
              onToggleInfo={() => setIsInfoOpen(!isInfoOpen)}
            />

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 hide-scrollbar flex flex-col"
            >
              {/* Spacer để đẩy tin nhắn xuống dưới cùng */}
              <div className="flex-1" />


              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center opacity-40 py-20">
                  <p className="text-[14px]">Chưa có tin nhắn nào. Gửi lời chào ngay!</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {messages.map((m, index) => {
                    const prevMsg = index > 0 ? messages[index - 1] : undefined;
                    const { dateHeader, showTimeHeader, formattedTime } = getMessageTimeContext(
                      new Date(m.createdAt),
                      prevMsg ? new Date(prevMsg.createdAt) : undefined
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
                        <div className={!dateHeader && !showTimeHeader ? 'mt-1' : 'mt-4'}>
                          <MessageBubble
                            message={m}
                            userProfiles={userProfiles}
                            hideTime={!showTimeHeader}
                            onContextMenu={(msg, x, y) => setContextMenu({ message: msg, x, y })}
                            onReply={(msg) => setReplyTarget(msg)}
                            onForward={(msg) => setForwardMessage(msg)}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* Typing Indicator */}
              {typingUsers.size > 0 && (
                <div className="absolute bottom-[95px] left-8 z-[10] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white dark:bg-surface-container-high rounded-full px-4 py-2 border border-outline-variant/10 flex items-center gap-3">
                     <div className="flex gap-1.5 items-center">
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                     </div>
                     <span className="text-[12px] font-bold text-on-surface-variant italic">
                       {Array.from(typingUsers).map(email => userProfiles[email]?.fullName || email.split('@')[0]).join(', ')} đang soạn tin...
                     </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
            </div>

            <ChatInput
              onSendMessage={handleSendMessage}
              onSendContactCard={handleSendContactCard}
              onSendLocation={handleSendLocation}
              replyTarget={replyTarget}
              onClearReply={() => setReplyTarget(null)}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-48 h-48 bg-primary/5 rounded-full flex items-center justify-center mb-8 animate-float">
              <img src="/logo_blue.png" className="w-24 grayscale opacity-20" alt="" />
            </div>
            <h2 className="text-2xl font-extrabold text-on-surface mb-2">Chào mừng đến với Zalo Edu</h2>
            <p className="text-on-surface-variant max-w-sm">Chọn một cuộc trò chuyện để bắt đầu trao đổi công việc và học tập hiệu quả.</p>
          </div>
        )}
      </div>

      <ForwardModal 
        isOpen={!!forwardMessage} 
        onClose={() => setForwardMessage(null)} 
        message={forwardMessage} 
      />

      {/* 3. Info Sidebar */}
      {activeConvId && isInfoOpen && <ChatInfoSidebar />}

      {/* Context Menu Overlay (Zalo Style Redesign) */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[110]"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="absolute bg-white dark:bg-surface-container rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.2)] border border-outline-variant/10 dark:border-outline-variant/30 py-1.5 w-64 animate-in fade-in zoom-in-95 duration-200"
            style={{ 
              left: Math.min(contextMenu.x, window.innerWidth - 270), 
              top: Math.min(contextMenu.y, window.innerHeight - 400) 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Group 1: Basic Actions */}
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
                  action: contextMenu.message.pinned ? 'unpin' : 'pin' 
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Pin size={18} className="text-on-surface-variant" />
              {contextMenu.message.pinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn'}
            </button>
            <button 
              onClick={() => {
                Swal.fire({
                  title: 'Đánh dấu tin nhắn',
                  text: 'Tin nhắn đã được đánh dấu và lưu vào Cloud của bạn!',
                  icon: 'success',
                  timer: 2000,
                  showConfirmButton: false
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Star size={18} className="text-on-surface-variant" />
              Đánh dấu tin nhắn
            </button>

            <div className="h-px bg-outline-variant/10 my-1 mx-2" />

            {/* Group 2: Advanced Actions */}
            <button 
              onClick={() => {
                Swal.fire({
                  title: 'Chọn nhiều tin nhắn',
                  text: 'Chức năng chọn nhiều tin nhắn đang được phát triển.',
                  icon: 'info',
                  confirmButtonColor: '#00418f'
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
                const date = new Date(contextMenu.message.createdAt).toLocaleString();
                Swal.fire({
                  title: 'Chi tiết tin nhắn',
                  html: `
                    <div class="text-left space-y-2 mt-4 text-sm text-on-surface">
                      <p><strong>Người gửi:</strong> ${contextMenu.message.senderId}</p>
                      <p><strong>Đã gửi lúc:</strong> ${date}</p>
                      <p><strong>Trạng thái:</strong> ${contextMenu.message.status}</p>
                      <p><strong>Mã tin nhắn:</strong> <span class="text-xs text-outline font-mono">${contextMenu.message.id}</span></p>
                    </div>
                  `,
                  icon: 'info',
                  confirmButtonColor: '#00418f'
                });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Info size={18} className="text-on-surface-variant" />
              Xem chi tiết
            </button>

            <div className="h-px bg-outline-variant/10 my-1 mx-2" />

            {/* Group 3: Destructive Actions */}
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
      {/* Image Preview Modal (Lightbox) */}
      <ImageModal />
    </div>
  );
};

export default ChatPage;
