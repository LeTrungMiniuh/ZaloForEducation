import React, { useState, useRef } from 'react';
import { chatService } from '../../services/chatService';
import type { Attachment } from '../../utils/chatUtils';
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

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => Promise<void>;
  replyTarget: any | null;
  onClearReply: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, replyTarget, onClearReply }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (!text.trim() && attachments.length === 0) return;
    const currentText = text;
    const currentAttachments = [...attachments];
    
    setText('');
    setAttachments([]);
    
    await onSendMessage(currentText, currentAttachments);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'file') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const newAttachments: Attachment[] = [];
      for (const file of files) {
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
    }
  };

  return (
    <div className="p-4 bg-white/80 backdrop-blur-xl border-t border-outline-variant/10 space-y-3 shadow-[0_-4px_24px_rgba(0,0,0,0.03)] z-10 transition-all duration-300">
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
        <div className="flex flex-wrap gap-3 py-2 animate-in fade-in slide-in-from-left-2 duration-300">
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
      <div className="flex items-center gap-3 bg-surface-container-low/50 p-2 rounded-[28px] border border-primary/20 transition-all duration-300 hover:shadow-lg focus-within:shadow-xl focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 group">
        <div className="flex items-center gap-1 px-1">
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

        <div className="flex-1 flex items-center min-w-0">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
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
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-[14px] font-medium py-2.5 px-1 resize-none max-h-32 hide-scrollbar text-on-surface placeholder:text-on-surface-variant/60 leading-relaxed transition-all"
          />
          <button className="w-10 h-10 flex items-center justify-center hover:bg-yellow-500/10 rounded-full text-yellow-500/80 hover:text-yellow-500 transition-all duration-300 active:scale-90 overflow-hidden">
            <Smile size={22} className="animate-in zoom-in-50" />
          </button>
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
