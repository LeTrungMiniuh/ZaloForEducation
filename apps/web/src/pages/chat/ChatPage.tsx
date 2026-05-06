import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChatStore } from "../../store/chatStore";
import { useAuth } from "../../context/AuthContext";
import InboxList from "../../components/chat/InboxList";
import ChatHeader from "../../components/chat/ChatHeader";
import ChatInput from "../../components/chat/ChatInput";
import MessageBubble from "../../components/chat/MessageBubble";
import ChatInfoSidebar from "../../components/chat/ChatInfoSidebar";
import ImageModal from "../../components/chat/ImageModal";
import ForwardModal from "../../components/chat/ForwardModal";
import TagManagerModal from "../../components/chat/TagManagerModal";
import PollModal from "../../components/chat/PollModal";
import ReminderModal from "../../components/chat/ReminderModal";
import SecurityAlertsView from "../../components/chat/SecurityAlertsView";
import GroupCallOverlay from "../../components/call/GroupCallOverlay";
import IncomingGroupCallModal from "../../components/call/IncomingGroupCallModal";
import { getMessageTimeContext, getDisplayName } from "../../utils/chatUtils";
import type { Attachment } from "../../utils/chatUtils";
import { useGroupSocketListeners } from "../../hooks/useGroupSocketListeners";
import type { Message } from "@zalo-edu/shared";

import {
  Copy,
  Pin,
  Star,
  ListChecks,
  Info,
  LayoutGrid,
  ChevronRight,
  RotateCcw,
  Trash2,
  ArrowDown,
} from "lucide-react";
import Swal from "sweetalert2";

const ChatPage: React.FC = () => {
  const { user, socket } = useAuth();
  useGroupSocketListeners();
  const {
    activeConvId,
    conversations,
    messages,
    sendMessageOptimistic,
    startDirectChat,
    setActiveConversation,
    userProfiles,
    loadUserProfile,
    markAsRead,
    highlightedMessageId,
    jumpToMessage,
    fetchMessages,
    loadMoreMessages,
    loadNewerMessages,
    isLoadingMessages,
    nextCursor,
    prevCursor,
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
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const prevScrollHeightRef = useRef(0);
  const isPrependingRef = useRef(false);
  const lastCursorRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false);

  // Utility to scroll to bottom
  const scrollToBottom = (instant = false) => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    const performScroll = () => {
      el.scrollTop = el.scrollHeight;
    };

    if (instant) {
      performScroll();
      // Multi-pass scroll to handle async layout changes (images, headers, etc)
      requestAnimationFrame(performScroll);
      setTimeout(performScroll, 30);
      setTimeout(performScroll, 100);
      setTimeout(performScroll, 300);
    } else {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const scrollToMessage = (
    messageId: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior, block: "center" });
    }
  };

  // Handle scroll for Infinite Load and Scroll Bottom Button
  const handleScroll = () => {
    if (!scrollRef.current || !activeConvId) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Show/Hide Scroll to Bottom button (threshold 300px from bottom)
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollBottom(!isNearBottom);

    // [SENIOR] Improved Trigger: Check Cursor lock to avoid spam
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

      // Fire-and-forget async call
      void (async () => {
        try {
          await loadMoreMessages(activeConvId);
        } finally {
          isLoadingMoreRef.current = false;
        }
      })();
    }

    // [SENIOR] Load NEWER messages when scrolling to the bottom
    if (
      isNearBottom &&
      prevCursor &&
      !isLoadingMessages &&
      !isLoadingMoreRef.current
    ) {
      isLoadingMoreRef.current = true;
      void (async () => {
        try {
          await loadNewerMessages(activeConvId);
        } finally {
          isLoadingMoreRef.current = false;
        }
      })();
    }
  };

  // Adjust scroll position after loading more messages (Prepend logic)
  useLayoutEffect(() => {
    if (
      isPrependingRef.current &&
      prevScrollHeightRef.current > 0 &&
      scrollRef.current
    ) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      const heightDiff = newScrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        // [SENIOR] Precise scroll restoration to avoid "jumps" when loading old messages
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
        const timer = setTimeout(() => {
          isPrependingRef.current = false;
        }, 100);
        return () => clearTimeout(timer);
      }

      const isInitialLoad = prevMessagesLengthRef.current === 0;
      const isNewMessage = messages.length > prevMessagesLengthRef.current;

      if (isInitialLoad) {
        const currentConv = conversations.find((c) => c.id === activeConvId);
        const unreadCount = currentConv?.unreadCount || 0;

        if (unreadCount > 0 && unreadCount <= messages.length) {
          const firstUnreadIndex = messages.length - unreadCount;
          const firstUnread = messages[firstUnreadIndex];
          if (firstUnread) {
            setTimeout(() => scrollToMessage(firstUnread.id, "auto"), 50);
            setTimeout(() => scrollToMessage(firstUnread.id, "auto"), 150);
          } else {
            scrollToBottom(true);
          }
        } else {
          scrollToBottom(true);
        }
      } else if (isNewMessage) {
        const el = scrollRef.current;
        if (el) {
          const distanceToBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
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

  // Initial fetch when activeConvId changes
  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);

      // Join Socket Room for Real-time
      if (socket) {
        // Leave previous room if exists
        if (prevRoomRef.current && prevRoomRef.current !== activeConvId) {
          socket.emit("leave_room", { convId: prevRoomRef.current });
        }

        socket.emit("join_room", { convId: activeConvId });
        prevRoomRef.current = activeConvId;

        // [SENIOR] Handle Reconnection: re-join room if socket drops and connects again
        const handleReconnect = () => {
          console.log("[Socket] Reconnected, re-joining room:", activeConvId);
          socket.emit("join_room", { convId: activeConvId });
        };
        socket.on("connect", handleReconnect);
        
        return () => {
          socket.off("connect", handleReconnect);
          if (activeConvId) {
            socket.emit("leave_room", { convId: activeConvId });
          }
        };
      }
    }
  }, [activeConvId, fetchMessages, socket]);

  // Reset typing users when room changes (store prev value as state)
  const [prevActiveConvId, setPrevActiveConvId] = useState(activeConvId);
  if (activeConvId !== prevActiveConvId) {
    setPrevActiveConvId(activeConvId);
    setTypingUsers(new Set());
  }

  // Handle typing indicator via CustomEvent from useSocketListeners
  useEffect(() => {
    setTypingUsers(new Set()); // Reset when changing room

    const handleTypingEvent = (e: any) => {
      const data = e.detail;
      if (!data?.email || !data?.convId) return;
      const email = data.email;
      const convId = data.convId;
      if (convId === activeConvId && email !== user?.email) {
        if (data.isTyping) {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.add(email);
            return next;
          });
          // Remove after 5 seconds to prevent stuck indicator
          setTimeout(() => {
            setTypingUsers((prev) => {
              const next = new Set(prev);
              next.delete(email);
              return next;
            });
          }, 5000);
        } else {
          setTypingUsers((prev) => {
            const next = new Set(prev);
            next.delete(email);
            return next;
          });
        }
      }
    };

    document.addEventListener("chat_typing_update", handleTypingEvent);
    return () =>
      document.removeEventListener("chat_typing_update", handleTypingEvent);
  }, [activeConvId, user]);

  // [SENIOR] Auto-load profiles for all message senders
  useEffect(() => {
    if (messages.length > 0) {
      const uniqueSenders = new Set<string>();
      messages.forEach((m) => {
        if (m.senderId) {
          const normalizedSender = String(m.senderId).trim().toLowerCase();
          const normalizedMe = String(user?.email || "")
            .trim()
            .toLowerCase();
          if (normalizedSender !== normalizedMe) {
            uniqueSenders.add(m.senderId);
          }
        }
      });
      uniqueSenders.forEach((email) => loadUserProfile(email));
    }
  }, [messages, user?.email, loadUserProfile]);

  // [SENIOR] Handle Dynamic Content Height (Images loading after initial render)
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;

    const resizeObserver = new ResizeObserver(() => {
      // If we are prepending (loading history), the layout effect handles it
      if (isPrependingRef.current) return;

      // If user is near bottom, keep them at the bottom as images/content expand
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceToBottom < IS_NEAR_BOTTOM_THRESHOLD && distanceToBottom > 0) {
        scrollToBottom();
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [activeConvId]);

  // Mark as read when messages change or room opens
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

  const handleSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!activeConvId || !user?.email) return;

    // Gửi tin nhắn kèm đính kèm và thông tin reply
    await sendMessageOptimistic(
      activeConvId,
      user.email,
      text,
      "text",
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
      "[Danh thiếp]",
      "contact_card",
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
      location.isLive ? "[Vị trí trực tiếp]" : "[Vị trí]",
      "location",
      [],
      null,
      { location },
    );
  };

  const handleSendPoll = async (poll: { topic: string; options: string[] }) => {
    if (!activeConvId || !user?.email) return;

    const normalizedOptions = (poll.options || [])
      .map((option) => String(option || "").trim())
      .filter(Boolean);

    if (!poll.topic?.trim() || normalizedOptions.length < 2) return;

    await sendMessageOptimistic(
      activeConvId,
      user.email,
      `[Bình chọn: ${poll.topic}]`,
      "poll",
      [],
      null,
      {
        payload: {
          poll: {
            topic: poll.topic.trim(),
            options: normalizedOptions,
            votes: {},
            allowMultiple: false,
          },
        },
      },
    );
  };

  const handleSendReminder = async (reminder: {
    content: string;
    time: string;
    date: string;
    repeatType: "none" | "daily" | "weekly" | "monthly";
  }) => {
    if (!activeConvId || !user?.email) return;

    await sendMessageOptimistic(
      activeConvId,
      user.email,
      `[Nhắc hẹn: ${reminder.content}]`,
      "reminder",
      [],
      null,
      { reminder },
    );
  };

  const handleVotePoll = async (messageId: string, optionIndex: number) => {
    const { votePoll } = useChatStore.getState();
    if (activeConvId) {
      await votePoll(activeConvId, messageId, optionIndex);
    }
  };

  const [contextMenu, setContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
  } | null>(null);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);

  useEffect(() => {
    const openTagManager: EventListener = () => setIsTagManagerOpen(true);
    window.addEventListener("open-chat-tag-manager", openTagManager);
    return () => {
      window.removeEventListener("open-chat-tag-manager", openTagManager);
    };
  }, []);

  useEffect(() => {
    const navState = (location.state || null) as {
      openConversationId?: string;
      openDirectChatEmail?: string;
    } | null;

    const requestedConvId = String(navState?.openConversationId || "").trim();
    const requestedEmail = String(navState?.openDirectChatEmail || "")
      .trim()
      .toLowerCase();

    if (!requestedConvId && !requestedEmail) return;

    let cancelled = false;
    const run = async () => {
      try {
        if (requestedConvId) {
          setActiveConversation(requestedConvId);
          return;
        }

        const normalizedMe = String(user?.email || "")
          .trim()
          .toLowerCase();
        const existingDirect = conversations.find((conversation) => {
          if (conversation?.type !== "direct") return false;
          const members = Array.isArray(conversation.members)
            ? conversation.members.map((item) =>
                String(item || "").toLowerCase(),
              )
            : [];
          return (
            members.includes(normalizedMe) && members.includes(requestedEmail)
          );
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
          navigate("/chat", { replace: true, state: null });
        }
      }
    };

    run().catch((error) => {
      console.error("Failed to open chat from navigation state", error);
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
        {activeConvId === "CONV#SYSTEM" ? (
          <SecurityAlertsView />
        ) : activeConvId ? (
          <>
            <ChatHeader
              isInfoOpen={isInfoOpen}
              onToggleInfo={() => setIsInfoOpen(!isInfoOpen)}
            />

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 hide-scrollbar flex flex-col relative"
              onScroll={handleScroll}
              style={{ 
                backgroundImage: "url('/background/background1.png')", 
                backgroundSize: 'cover', 
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
              }}
            >
              {/* Optional overlay for readability */}
              <div className="absolute inset-0 bg-white/40 dark:bg-black/20 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col flex-1">
              {/* Infinite Load Indicator */}
              {isLoadingMessages && nextCursor && (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {/* Nút cuộn xuống dưới cùng (Floating Action Button) */}
              {showScrollBottom && (
                <button
                  onClick={() => {
                    if (prevCursor || highlightedMessageId) {
                      // Return to latest messages from history mode
                      setActiveConversation(activeConvId);
                    } else {
                      scrollToBottom(true);
                    }
                  }}
                  className="fixed bottom-32 right-12 md:right-80 z-[40] min-w-[40px] px-3 h-10 bg-white dark:bg-surface-container-high rounded-full shadow-lg border border-outline-variant/10 flex items-center justify-center gap-2 text-primary hover:bg-surface-container transition-all animate-in fade-in zoom-in duration-200"
                  title={prevCursor ? "Quay lại tin nhắn mới nhất" : "Cuộn xuống dưới cùng"}
                >
                  {prevCursor && (
                    <span className="text-xs font-semibold mr-1 whitespace-nowrap">Về tin mới nhất</span>
                  )}
                  <ArrowDown
                    size={20}
                    strokeWidth={2.5}
                    className="text-primary"
                  />
                </button>
              )}
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center opacity-40 py-20">
                  <p className="text-[14px]">
                    Chưa có tin nhắn nào. Gửi lời chào ngay!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {messages.map((m, index) => {
                    const prevMsg =
                      index > 0 ? messages[index - 1] : undefined;

                      // Consecutive grouping logic: Same sender and within 5 minutes
                      const isSameSenderAsPrev =
                        prevMsg &&
                        prevMsg.senderId === m.senderId &&
                        m.type !== "system" &&
                        prevMsg.type !== "system";
                      const timeGapPrev = prevMsg
                        ? new Date(m.createdAt).getTime() -
                          new Date(prevMsg.createdAt).getTime()
                        : Infinity;
                      const isConsecutive =
                        isSameSenderAsPrev && timeGapPrev < 5 * 60 * 1000;

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
                              !dateHeader && !showTimeHeader && isConsecutive
                                ? "mt-1"
                                : "mt-4"
                            }
                          >
                            <MessageBubble
                              message={m}
                              userProfiles={userProfiles}
                              hideTime={!showTimeHeader}
                              isConsecutive={isConsecutive}
                              onContextMenu={(msg, x, y) =>
                                setContextMenu({ message: msg, x, y })
                              }
                              onReply={(msg) => setReplyTarget(msg)}
                              onForward={(msg) => setForwardMessage(msg)}
                              onVotePoll={handleVotePoll}
                            />
                          </div>
                        </React.Fragment>
                      );
                    })}
                </div>
              )}

              {/* Typing Indicator */}
              {typingUsers.size > 0 && (
                <div className="absolute bottom-24 left-8 z-10 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-white dark:bg-surface-container-high rounded-full px-4 py-2 border border-outline-variant/10 flex items-center gap-3">
                    <div className="flex gap-1.5 items-center">
                      <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-[12px] font-bold text-on-surface-variant italic">
                      {Array.from(typingUsers)
                        .map((email) =>
                          getDisplayName(email, user, userProfiles),
                        )
                        .join(", ")}{" "}
                      đang soạn tin...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} className="h-4" />
              </div>
            </div>

            <ChatInput
              onSendMessage={handleSendMessage}
              onSendContactCard={handleSendContactCard}
              onSendLocation={handleSendLocation}
              replyTarget={replyTarget}
              onClearReply={() => setReplyTarget(null)}
              onOpenPollModal={() => setIsPollModalOpen(true)}
              onOpenReminderModal={() => setIsReminderModalOpen(true)}
            />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-surface-container-lowest to-surface-container-low">
            <div className="w-48 h-48 bg-primary/5 rounded-full flex items-center justify-center mb-8 animate-float relative">
              <img
                src="/logo_blue.png"
                className="w-24 grayscale opacity-20"
                alt=""
              />
              <div className="absolute -top-2 -right-2 w-12 h-12 bg-white dark:bg-surface-container rounded-2xl shadow-xl flex items-center justify-center animate-bounce duration-3000">
                <LayoutGrid size={24} className="text-primary/40" />
              </div>
            </div>

            <h1 className="text-2xl font-extrabold text-on-surface mb-3">
              Chào mừng đến với ZaloEdu
            </h1>
            <p className="text-on-surface-variant max-w-md mb-10 leading-relaxed font-medium">
              Khám phá trải nghiệm làm việc và học tập hiện đại. Chọn một cuộc
              hội thoại bên trái để bắt đầu nhắn tin hoặc thực hiện cuộc gọi.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full">
              <div className="bg-white dark:bg-surface-container border border-outline-variant/10 p-4 rounded-3xl flex items-center gap-4 hover:shadow-lg transition-all group cursor-pointer active:scale-95">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600">
                  <Star size={24} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-[15px]">Tin nhắn ưu tiên</h3>
                  <p className="text-[12px] text-on-surface-variant/70">
                    Đánh dấu và theo dõi các tin nhắn quan trọng.
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-outline/30 group-hover:text-primary transition-colors"
                />
              </div>

              <div className="bg-white dark:bg-surface-container border border-outline-variant/10 p-4 rounded-3xl flex items-center gap-4 hover:shadow-lg transition-all group cursor-pointer active:scale-95">
                <div className="w-12 h-12 rounded-2xl bg-primary/5 flex items-center justify-center text-primary">
                  <LayoutGrid size={24} />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-[15px]">Tiện ích mở rộng</h3>
                  <p className="text-[12px] text-on-surface-variant/70">
                    Sử dụng các công cụ hỗ trợ giảng dạy và học tập.
                  </p>
                </div>
                <ChevronRight
                  size={18}
                  className="text-outline/30 group-hover:text-primary transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <ForwardModal
        isOpen={!!forwardMessage}
        onClose={() => setForwardMessage(null)}
        message={forwardMessage}
      />

      <PollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onSendPoll={handleSendPoll}
      />

      <ReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        onSendReminder={handleSendReminder}
      />

      {/* 3. Info Sidebar */}
      {activeConvId && activeConvId !== "CONV#SYSTEM" && isInfoOpen && (
        <ChatInfoSidebar />
      )}

      {/* Context Menu Overlay (Zalo Style Redesign) */}
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
                useChatStore
                  .getState()
                  .patchMessageOptimistic(
                    activeConvId!,
                    contextMenu.message.id,
                    {
                      action: contextMenu.message.pinned ? "unpin" : "pin",
                    },
                  );
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container text-[14px] font-medium text-on-surface transition-colors"
            >
              <Pin size={18} className="text-on-surface-variant" />
              {contextMenu.message.pinned
                ? "Bỏ ghim tin nhắn"
                : "Ghim tin nhắn"}
            </button>
            <button
              onClick={() => {
                Swal.fire({
                  title: "Đánh dấu tin nhắn",
                  text: "Tin nhắn đã được đánh dấu và lưu vào Cloud của bạn!",
                  icon: "success",
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

            {/* Group 2: Advanced Actions */}
            <button
              onClick={() => {
                Swal.fire({
                  title: "Chọn nhiều tin nhắn",
                  text: "Chức năng chọn nhiều tin nhắn đang được phát triển.",
                  icon: "info",
                  confirmButtonColor: "#00418f",
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
                  title: "Chi tiết tin nhắn",
                  html: `
                    <div class="text-left space-y-2 mt-4 text-sm text-on-surface">
                      <p><strong>Người gửi:</strong> ${getDisplayName(contextMenu.message.senderId, user, userProfiles)}</p>
                      <p><strong>Đã gửi lúc:</strong> ${date}</p>
                      <p><strong>Trạng thái:</strong> ${contextMenu.message.status}</p>
                      <p><strong>Mã tin nhắn:</strong> <span class="text-xs text-outline font-mono">${contextMenu.message.id}</span></p>
                    </div>
                  `,
                  icon: "info",
                  confirmButtonColor: "#00418f",
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
            {contextMenu.message.senderId === user?.email &&
              !contextMenu.message.recalled && (
                <button
                  onClick={() => {
                    useChatStore
                      .getState()
                      .patchMessageOptimistic(
                        activeConvId!,
                        contextMenu.message.id,
                        { action: "recall" },
                      );
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
                useChatStore
                  .getState()
                  .deleteMessageOptimistic(
                    activeConvId!,
                    contextMenu.message.id,
                  );
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
      <TagManagerModal
        isOpen={isTagManagerOpen}
        onClose={() => setIsTagManagerOpen(false)}
      />
      
      {/* Group Call Components */}
      <GroupCallOverlay />
      <IncomingGroupCallModal />
    </div>
  );
};

export default ChatPage;
