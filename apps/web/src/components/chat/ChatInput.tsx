import React, { useState, useRef } from 'react';
import { chatService } from '../../services/chatService';
import type { Attachment } from '../../utils/chatUtils';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import GifPicker from './GifPicker';
import { 
  Reply, 
  X, 
  FileText, 
  Image, 
  Paperclip, 
  Smile, 
  SendHorizontal,
  Loader2
} from 'lucide-react';
import Swal from 'sweetalert2';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => Promise<void>;
  replyTarget: any | null;
  onClearReply: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, replyTarget, onClearReply }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { socket } = useAuth();
  const { activeConvId } = useChatStore();

  const handleTyping = () => {
    if (!socket || !activeConvId) return;

    // Only emit once every 2 seconds
    if (!typingTimeoutRef.current) {
      socket.emit('typing', { convId: activeConvId, isTyping: true });
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    }
  };

  const handleSend = async () => {
    if (!text.trim() && attachments.length === 0) return;
    const currentText = text;
    const currentAttachments = [...attachments];
    
    setText('');
    setAttachments([]);
    
    if (socket && activeConvId) {
      socket.emit('typing', { convId: activeConvId, isTyping: false });
    }
    
    await onSendMessage(currentText, currentAttachments);
  };

  const handleGifSelect = async (url: string) => {
    setShowGifPicker(false);
    // Instant send for GIF
    await onSendMessage('', [{
      name: `meme-${Date.now()}.gif`,
      mimeType: 'image/gif',
      size: 1024,
      dataUrl: url,
      file: null as any
    }]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'file') => {
    let validFiles = Array.from(e.target.files || []);
    if (validFiles.length === 0) return;

    if (attachments.length + validFiles.length > 50) {
      Swal.fire('Quá giới hạn', 'Chỉ được tải lên tối đa 50 tệp/ảnh cùng một lúc.', 'warning');
      validFiles = validFiles.slice(0, 50 - attachments.length);
      if (validFiles.length === 0) return;
    }

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

    const oversizedFiles = validFiles.filter(f => {
      if (f.type.startsWith('image/')) {
        return f.size > MAX_IMAGE_SIZE;
      }
      // Covers video and all other file types
      return f.size > MAX_FILE_SIZE;
    });

    if (oversizedFiles.length > 0) {
      Swal.fire(
        'Tệp quá lớn', 
        `Có ${oversizedFiles.length} tệp vượt quá kích thước cho phép (Ảnh được vác tối đa 10MB, Video & Tệp tối đa 100MB) nên tự động bị bỏ qua.`, 
        'warning'
      );
      validFiles = validFiles.filter(f => {
        if (f.type.startsWith('image/')) {
          return f.size <= MAX_IMAGE_SIZE;
        }
        return f.size <= MAX_FILE_SIZE;
      });
      if (validFiles.length === 0) return;
    }

    setIsUploading(true);
    try {
      const newAttachments: Attachment[] = [];
      for (const file of validFiles) {
        const res = await chatService.upload(file);
        const data = res.data;
        newAttachments.push({
          name: data.name || file.name,
          mimeType: data.mimeType || file.type,
          size: data.size || file.size,
          dataUrl: data.fileUrl || data.url || URL.createObjectURL(file),
          file: file
        });
      }
      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (err) {
      console.error('Upload failed', err);
      alert('Không thể tải tệp lên. Vui lòng thử lại.');
    } finally {
      setIsUploading(false);
      if (e.target) e.target.value = '';
      
      // Auto focus textarea so Enter key acts on send immediately after picking files
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  };

  return (
    <div className="p-4 bg-white/80 dark:bg-surface-container/90 backdrop-blur-xl border-t border-outline-variant/10 dark:border-outline-variant/30 space-y-3 shadow-[0_-4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.25)] z-10 transition-all duration-300">
      {/* Reply Preview */}
      {replyTarget && (
        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-2xl border-l-[4px] border-primary animate-in slide-in-from-bottom-3 fade-in duration-300 shadow-sm overflow-hidden relative group">
           <div className="min-w-0 flex-1 relative z-10">
             <div className="flex items-center gap-1.5 mb-0.5">
               <Reply size={14} className="text-primary" />
               <p className="text-[11px] font-extrabold text-primary uppercase tracking-wider">Đang trả lời {replyTarget.senderId}</p>
             </div>
             <p className="text-[13px] text-on-surface-variant/80 truncate font-medium italic">{replyTarget.content}</p>
           </div>
           <button 
             onClick={onClearReply} 
             className="relative z-10 p-1.5 hover:bg-primary/10 rounded-full transition-all text-primary/60 hover:text-primary active:scale-90"
           >
             <X size={18} />
           </button>
           <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl group-hover:bg-primary/10 transition-all" />
        </div>
      )}

      {/* Attachment Previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-3 py-2 animate-in fade-in slide-in-from-left-2 duration-300 max-h-[220px] overflow-y-auto custom-scrollbar">
          {attachments.map((a, i) => (
            <div key={i} className="relative group/att shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-20 h-20 rounded-2xl bg-surface-container-low border border-outline-variant/10 flex items-center justify-center overflow-hidden relative">
                {a.mimeType.startsWith('image/') ? (
                  <img src={a.dataUrl} className="w-full h-full object-cover group-hover/att:scale-110 transition-transform duration-500" alt="" />
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <FileText size={28} className="text-primary" />
                    <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-tighter truncate w-14 px-1">{a.name.split('.').pop()}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover/att:bg-black/5 transition-all" />
              </div>
              <button 
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-2 -right-2 bg-error text-white rounded-full w-6 h-6 flex items-center justify-center shadow-lg opacity-0 group-hover/att:opacity-100 translate-y-2 group-hover/att:translate-y-0 transition-all duration-300 hover:scale-110 active:scale-90"
              >
                <X size={14} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Input Bar */}
      <div className="flex items-end gap-3 bg-surface-container-low/50 p-2 rounded-[28px] border border-primary/20 transition-all duration-300 hover:shadow-lg focus-within:shadow-xl focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 group">
        <div className="flex items-center gap-1 px-1 pb-1">
          <button 
            onClick={() => imageInputRef.current?.click()}
            className="w-10 h-10 flex items-center justify-center hover:bg-primary/10 rounded-full text-on-surface-variant hover:text-primary transition-all duration-300 active:scale-90 group/btn"
            title="Gửi hình ảnh"
          >
            <Image size={22} className="group-hover/btn:scale-110 transition-transform" />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 flex items-center justify-center hover:bg-secondary/10 rounded-full text-on-surface-variant hover:text-secondary transition-all duration-300 active:scale-90 group/btn"
            title="Đính kèm tệp"
          >
            <Paperclip size={22} className="group-hover/btn:scale-110 transition-transform" />
          </button>
        </div>

        <div className="flex-1 flex items-end min-w-0 pb-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Nhập tin nhắn..."
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[14px] font-medium py-1 px-1 resize-none max-h-32 hide-scrollbar text-on-surface placeholder:text-on-surface-variant/60 leading-relaxed transition-all"
          />
          <div className="relative">
            <button 
              onClick={() => setShowGifPicker(!showGifPicker)}
              className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full transition-all duration-300 active:scale-90 overflow-hidden ${showGifPicker ? 'bg-yellow-500/20 text-yellow-500' : 'hover:bg-yellow-500/10 text-yellow-500/80 hover:text-yellow-500'}`}
            >
              <Smile size={22} className="animate-in zoom-in-50" />
            </button>
            {showGifPicker && (
              <div className="absolute bottom-[120%] right-0 z-50">
                <GifPicker onSelect={handleGifSelect} />
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={handleSend}
          disabled={isUploading || (!text.trim() && attachments.length === 0)}
          className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-all duration-500 shadow-lg ${
            (isUploading || (!text.trim() && attachments.length === 0))
              ? 'bg-surface-container text-outline/30 shadow-none scale-95 opacity-50'
              : 'bg-gradient-to-tr from-primary via-primary to-primary-container text-white shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 group/send'
          }`}
        >
          {isUploading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <SendHorizontal size={22} className="ml-0.5 group-hover/send:rotate-[-20deg] group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5 transition-all duration-300" />
          )}
        </button>
      </div>

      {/* Hidden Inputs */}
      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'image')} />
      <input type="file" ref={fileInputRef} className="hidden" multiple onChange={(e) => handleFileChange(e, 'file')} />
    </div>
  );
};

export default ChatInput;
