/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { getDisplayName, getDisplayAvatar } from '../../utils/chatUtils';
import { X, Search, CheckCircle2, Send, Loader2 } from 'lucide-react';

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: any;
}

const ForwardModal: React.FC<ForwardModalProps> = ({ isOpen, onClose, message }) => {
  const { user } = useAuth();
  const { conversations, userProfiles, sendMessageOptimistic } = useChatStore();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  if (!isOpen || !message) return null;

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleForward = async () => {
    if (selectedIds.size === 0) return;
    setIsSending(true);

    try {
      for (const convId of selectedIds) {
        // Find conversation to check if direct or group
        const conv = conversations.find(c => c.id === convId);
        if (!conv) continue;

        // Combine media and files into one attachments array
        const combinedAttachments = [
          ...(message.media || []),
          ...(message.files || [])
        ].map(a => ({
          name: a.name || a.fileName || 'attachment',
          dataUrl: a.dataUrl || a.url || a.fileUrl,
          url: a.url || a.fileUrl || a.dataUrl,
          mimeType: a.mimeType || a.fileType || 'application/octet-stream',
          size: a.size || 0
        }));

        // Strip senderId/status from original message
        await sendMessageOptimistic(
          convId,
          user!.email,
          message.content || '',
          message.type || 'text',
          combinedAttachments,
          null
        );
      }
    } catch (err) {
      console.error('Lỗi khi chuyển tiếp:', err);
    } finally {
      setIsSending(false);
      onClose();
    }
  };

  const filteredConvs = conversations.filter(c => {
    const name = c.type === 'group' ? (c.name || 'Group') : getDisplayName(
      c.members?.find((m: string) => m !== user?.email) || '',
      user,
      userProfiles
    );
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-surface-container rounded-3xl w-full max-w-[400px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/10 dark:border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-on-surface">Chuyển tiếp tin nhắn</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
          >
            <X size={20} className="text-on-surface-variant" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-outline-variant/5">
          <div className="bg-surface-container-low dark:bg-surface-container-high rounded-full flex items-center px-4 py-2 gap-2">
            <Search size={18} className="text-on-surface-variant/50" />
            <input 
              type="text"
              placeholder="Tìm kiếm bạn bè, nhóm..."
              className="bg-transparent flex-1 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[400px] p-2 space-y-1 custom-scrollbar">
          {filteredConvs.map(conv => {
            const targetEmail = conv.members?.find((m: string) => m !== user?.email) || '';
            const isSelected = selectedIds.has(conv.id);

            return (
              <div 
                key={conv.id}
                onClick={() => handleToggle(conv.id)}
                className={`flex items-center p-3 gap-3 rounded-2xl cursor-pointer transition-all ${isSelected ? 'bg-primary/5' : 'hover:bg-surface-container-high'}`}
              >
                <div className="relative">
                  {conv.type === 'group' ? (
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg ring-1 ring-black/5">
                      {(conv.name || 'G').charAt(0).toUpperCase()}
                    </div>
                  ) : (
                    <img 
                      src={getDisplayAvatar(targetEmail, user, userProfiles)} 
                      className="w-12 h-12 rounded-full object-cover ring-1 ring-black/5" 
                      alt=""
                    />
                  )}
                  {isSelected && (
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-surface-container rounded-full">
                      <CheckCircle2 size={18} className="text-primary fill-primary/20" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-bold text-on-surface truncate">
                    {conv.type === 'group' ? (conv.name || 'Group') : getDisplayName(targetEmail, user, userProfiles)}
                  </h3>
                  <p className="text-[13px] text-on-surface-variant/70 truncate">
                    {conv.type === 'group' ? `${conv.members?.length || 0} thành viên` : 'Bạn bè'}
                  </p>
                </div>

                {!isSelected && <div className="w-5 h-5 rounded-full border-2 border-outline-variant/30" />}
                {isSelected && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 size={14} className="text-white" /></div>}
              </div>
            );
          })}
          {filteredConvs.length === 0 && (
            <div className="p-8 text-center opacity-50">
              <p className="text-[14px]">Không tìm thấy liên hệ phù hợp.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-outline-variant/10 dark:border-outline-variant/20 bg-surface-container-lowest">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-on-surface-variant">
              Đã chọn <strong>{selectedIds.size}</strong> liên hệ
            </span>
            <button
              onClick={handleForward}
              disabled={selectedIds.size === 0 || isSending}
              className="bg-primary text-white px-6 py-2.5 rounded-full font-bold text-[14px] flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-primary/20"
            >
              {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              Gửi ngay
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ForwardModal;
