import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { BOT_EMAIL, BOT_AVATAR } from '@zalo-edu/shared';
import {
  Send,
  Bot,
  Loader2,
  Image,
  Paperclip,
  X,
  FileText,
  Sparkles,
} from 'lucide-react';

const BOT_EMAIL_CONST = BOT_EMAIL; // alias to avoid name clash with Bot icon import

const botPost = async (path: string, body: any) => {
  try {
    return await api.post(`/bot${path}`, body);
  } catch {
    return await api.post(`/api/bot${path}`, body);
  }
};

const chatGet = async (path: string) => {
  try {
    return await api.get(`/chat${path}`);
  } catch {
    return await api.get(`/api/chat${path}`);
  }
};

const chatPost = async (path: string, body: any) => {
  try {
    return await api.post(`/chat${path}`, body);
  } catch {
    return await api.post(`/api/chat${path}`, body);
  }
};

const chatUpload = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  try {
    return await api.post('/chat/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  } catch {
    return await api.post('/api/chat/uploads', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }
};

type Attachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  fileUrl?: string;
  file?: File;
};

const BotChatPanel: React.FC = () => {
  const { user, socket } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [botConvId, setBotConvId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Init bot conversation
  useEffect(() => {
    if (!user?.email) return;

    const init = async () => {
      try {
        const res = await botPost('/conversation', {});
        const convId = res.data?.convId;
        if (!convId) return;

        setBotConvId(convId);

        // Load existing messages
        const msgRes = await chatGet(`/conversations/${encodeURIComponent(convId)}/messages`);
        const loaded = msgRes.data?.messages || [];
        setMessages(loaded);
      } catch (err) {
        console.error('Failed to init bot conversation', err);
      }
    };

    init();
  }, [user?.email]);

  // Join socket room
  useEffect(() => {
    if (socket && botConvId) {
      socket.emit('join_room', { convId: botConvId });
    }
  }, [socket, botConvId]);

  // Listen for bot replies
  useEffect(() => {
    console.log('[BotChat] Socket listener effect:', { socket: !!socket, botConvId });
    if (!socket || !botConvId) return;

    const handleMessage = (msg: any) => {
      console.log('[BotChat] receiveMessage:', { id: msg?.id, senderId: msg?.senderId, convId: msg?.conversationId || msg?.convId });
      if (!msg?.id) return;
      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId !== botConvId) {
        console.log('[BotChat] ConvId mismatch:', { incomingConvId, botConvId });
        return;
      }

      setMessages((prev) => {
        const existed = prev.some((m) => m.id === msg.id);
        return existed ? prev.map((m) => (m.id === msg.id ? msg : m)) : [...prev, msg];
      });
      // Only stop typing when bot replies, not when user's own message echoes back
      if (msg.senderId === BOT_EMAIL_CONST) {
        console.log('[BotChat] Bot reply received → setIsSending(false)');
        setIsSending(false);
      } else {
        console.log('[BotChat] Non-bot message, senderId:', msg.senderId, 'BOT_EMAIL:', BOT_EMAIL);
      }
    };

    socket.on('receiveMessage', handleMessage);
    return () => socket.off('receiveMessage', handleMessage);
  }, [socket, botConvId]);

  // Auto-scroll
  useEffect(() => {
    console.log('[BotChat] Auto-scroll trigger:', { msgCount: messages.length, isSending });
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Upload files
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const newAttachments: Attachment[] = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`File "${file.name}" quá lớn (tối đa 10MB)`);
          continue;
        }
        const res = await chatUpload(file);
        const data = res.data;
        newAttachments.push({
          name: data.name || file.name,
          mimeType: data.mimeType || file.type,
          size: data.size || file.size,
          dataUrl: data.fileUrl || data.url || URL.createObjectURL(file),
          file,
        });
      }
      setAttachments((prev) => [...prev, ...newAttachments].slice(0, 8));
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Send message
  const handleSend = useCallback(async () => {
    console.log('[BotChat] handleSend called:', { text: inputText.trim(), botConvId, isSending, hasAttachments: attachments.length > 0 });
    if ((!inputText.trim() && attachments.length === 0) || !botConvId || isSending) return;

    const text = inputText.trim();
    const media = attachments.filter((a) => a.mimeType.startsWith('image/')).map((a) => ({
      fileName: a.name,
      fileType: a.mimeType,
      size: a.size,
      dataUrl: a.dataUrl,
    }));
    const files = attachments.filter((a) => !a.mimeType.startsWith('image/')).map((a) => ({
      fileName: a.name,
      fileType: a.mimeType,
      size: a.size,
      dataUrl: a.dataUrl,
    }));

    setInputText('');
    setAttachments([]);
    setIsSending(true);
    console.log('[BotChat] setIsSending(true) called');

    try {
      const res = await chatPost(`/conversations/${encodeURIComponent(botConvId)}/messages`, {
        content: text || (media.length > 0 ? '' : ''),
        media: media.length > 0 ? media : undefined,
        files: files.length > 0 ? files : undefined,
      });

      const created = res.data;
      console.log('[BotChat] API response:', { id: created?.id, senderId: created?.senderId });
      if (created?.id) {
        setMessages((prev) => {
          const existed = prev.some((m) => m.id === created.id);
          return existed ? prev : [...prev, created];
        });
        if (socket) {
          socket.emit('sendMessage', { convId: botConvId, message: { ...created, conversationId: botConvId } });
        }
      }
    } catch (err) {
      console.error('Failed to send bot message', err);
      setIsSending(false);
    }
  }, [inputText, attachments, botConvId, isSending, socket]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getFileIcon = (mime?: string, name?: string) => {
    const n = (name || '').toLowerCase();
    const m = (mime || '').toLowerCase();
    if (m.includes('pdf') || n.endsWith('.pdf')) return <FileText size={16} className="text-red-500" />;
    if (m.startsWith('image/')) return <Image size={16} className="text-blue-500" />;
    return <FileText size={16} className="text-gray-500" />;
  };

  return (
    <div className="flex flex-col h-full bg-[#f7f9fb]">
      {/* Header */}
      <header className="h-16 flex items-center gap-4 px-6 bg-white/90 backdrop-blur-xl border-b border-outline-variant/15 z-20 shrink-0">
        <div className="relative">
          <img src={BOT_AVATAR} className="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20 shadow-sm" alt="Bot" />
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary border-2 border-white rounded-full flex items-center justify-center">
            <Sparkles size={8} className="text-white" />
          </div>
        </div>
        <div className="flex flex-col">
          <h2 className="font-extrabold text-on-surface leading-tight text-[16px] tracking-tight">ZaloEdu AI</h2>
          <p className="text-[12px] text-primary font-bold flex items-center gap-1">
            <Bot size={12} />
            {isSending ? 'Đang soạn tin...' : 'Trợ lý giáo dục AI'}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 hide-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Bot size={40} className="text-primary" />
            </div>
            <h3 className="font-extrabold text-on-surface text-lg">Chào bạn! Tôi là ZaloEdu AI</h3>
            <p className="text-on-surface-variant text-sm text-center max-w-xs leading-relaxed">
              Hỏi tôi về thông tin tài khoản, bạn bè, hoặc gửi ảnh/PDF bài học để tôi phân tích!
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === user?.email;
          const isRecalled = !!msg.recalled;

          return (
            <div
              key={msg.id}
              className={`flex items-end gap-3 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              {!isMe && (
                <img
                  src={BOT_AVATAR}
                  className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-primary/20"
                  alt=""
                />
              )}

              {/* Bubble */}
              <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div
                  className={`px-4 py-3 rounded-2xl shadow-sm border ${isMe
                    ? 'bg-primary/10 text-on-surface rounded-tr-none border-primary/15'
                    : 'bg-white text-on-surface rounded-tl-none border-outline-variant/20'
                    }`}
                >
                  <p className={`text-[14px] leading-relaxed whitespace-pre-wrap ${isRecalled ? 'italic opacity-50' : ''}`}>
                    {isRecalled ? 'Tin nhắn đã được thu hồi' : msg.content}
                  </p>

                  {/* Media */}
                  {msg.media && msg.media.length > 0 && !isRecalled && (
                    <div className="mt-2 space-y-2">
                      {msg.media.map((m: any, i: number) => (
                        <img
                          key={i}
                          src={m.dataUrl || m.url}
                          className="max-w-full rounded-xl border border-outline-variant/10"
                          alt=""
                        />
                      ))}
                    </div>
                  )}

                  {/* Files */}
                  {msg.files && msg.files.length > 0 && !isRecalled && (
                    <div className="mt-2 space-y-2">
                      {msg.files.map((f: any, i: number) => (
                        <a
                          key={i}
                          href={f.dataUrl || f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 p-2 rounded-xl bg-white/70 border border-outline-variant/10 hover:bg-white transition-all"
                        >
                          {getFileIcon(f.mimeType || f.fileType, f.name || f.fileName)}
                          <span className="text-[12px] font-medium truncate max-w-[200px]">{f.name || f.fileName}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-[10px] font-medium text-on-surface-variant/50 mt-1 px-1">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isSending && (
          <div className="flex items-end gap-3">
            <img src={BOT_AVATAR} className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-primary/20" alt="" />
            <div className="bg-white px-5 py-3.5 rounded-2xl rounded-tl-none shadow-sm border border-outline-variant/20">
              <div className="flex items-center gap-1.5">
                <span className="typing-dot" />
                <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-outline-variant/10 bg-white">
          <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div key={i} className="relative group/att">
                <div className="w-16 h-16 rounded-xl bg-surface-container-low border border-outline-variant/10 flex items-center justify-center overflow-hidden">
                  {a.mimeType.startsWith('image/') ? (
                    <img src={a.dataUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <FileText size={24} className="text-primary" />
                  )}
                </div>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-error text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg opacity-0 group-hover/att:opacity-100 transition-all"
                >
                  <X size={12} strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white/80 backdrop-blur-xl border-t border-outline-variant/10">
        <div className="flex items-center gap-3 bg-surface-container-low/50 p-2 rounded-[28px] border border-primary/20 focus-within:ring-4 focus-within:ring-primary/10 focus-within:border-primary transition-all">
          <div className="flex items-center gap-1 px-1">
            <button
              onClick={() => imageInputRef.current?.click()}
              className="w-9 h-9 flex items-center justify-center hover:bg-primary/10 rounded-full text-on-surface-variant hover:text-primary transition-all"
              title="Gửi hình ảnh"
            >
              <Image size={20} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 flex items-center justify-center hover:bg-primary/10 rounded-full text-on-surface-variant hover:text-primary transition-all"
              title="Đính kèm tệp (PDF)"
            >
              <Paperclip size={20} />
            </button>
          </div>

          <textarea
            rows={1}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi tôi bất cứ điều gì..."
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[14px] font-medium py-2.5 px-1 resize-none max-h-32 hide-scrollbar text-on-surface placeholder:text-on-surface-variant/60 leading-relaxed"
          />

          <button
            onClick={handleSend}
            disabled={isSending || isUploading || (!inputText.trim() && attachments.length === 0)}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${isSending || isUploading || (!inputText.trim() && attachments.length === 0)
              ? 'bg-surface-container text-outline/30 scale-95 opacity-50'
              : 'bg-gradient-to-tr from-primary to-primary-container text-white shadow-lg shadow-primary/30 hover:shadow-primary/40 active:scale-95'
              }`}
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}
          </button>
        </div>

        <input type="file" ref={imageInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'image')} />
        <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => handleFileChange(e, 'file')} />
      </div>
    </div>
  );
};

export default BotChatPanel;
