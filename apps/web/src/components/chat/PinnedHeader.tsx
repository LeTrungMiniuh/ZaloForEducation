import React, { useState, useMemo } from 'react';
import { useChatStore } from '../../store/chatStore';
import { 
  Pin, 
  ChevronDown, 
  ChevronUp, 
  X, 
  ExternalLink 
} from 'lucide-react';

const PinnedHeader: React.FC = () => {
  const { 
    activeConvId, 
    conversations, 
    messages, 
    jumpToMessage,
    patchMessageOptimistic 
  } = useChatStore();
  const [isExpanded, setIsExpanded] = useState(false);

  const activeChat = conversations.find(c => c.id === activeConvId) as any;
  const pinnedIds = activeChat?.pinnedMessageIds || [];

  // Find message objects for the pinned IDs
  const pinnedMessages = useMemo(() => {
    return pinnedIds.map(id => {
      const msg = messages.find(m => m.id === id);
      return msg || { id, content: 'Đang tải tin nhắn...', isPlaceholder: true };
    });
  }, [pinnedIds, messages]);

  if (pinnedIds.length === 0) return null;

  const latestPin = pinnedMessages[0];

  const handleUnpin = (e: React.MouseEvent, msgId: string) => {
    e.stopPropagation();
    if (activeConvId) {
      patchMessageOptimistic(activeConvId, msgId, { action: 'unpin' });
    }
  };

  return (
    <div className="relative z-30">
      {/* Main Banner */}
      <div 
        className={`h-12 px-6 bg-amber-50/90 dark:bg-surface-container-high/90 border-b border-amber-200/50 dark:border-outline-variant/40 backdrop-blur-xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-amber-100/80 dark:hover:bg-surface-container-high ${isExpanded ? 'rounded-b-none' : ''}`}
        onClick={() => pinnedIds.length > 1 ? setIsExpanded(!isExpanded) : jumpToMessage(latestPin.id)}
      >
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          <div className="w-8 h-8 rounded-full bg-amber-200/50 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <Pin size={16} className="text-amber-700 fill-amber-700/10" />
          </div>
          
          <div className="flex-1 min-w-0">
            {pinnedIds.length > 1 ? (
              <p className="text-[13px] font-bold text-amber-800 dark:text-on-surface">
                {pinnedIds.length} tin nhắn ghim
              </p>
            ) : (
              <div className="flex flex-col">
                <p className="text-[10px] font-black text-amber-600/70 dark:text-primary/70 uppercase tracking-widest leading-none mb-0.5">Tin nhắn đã ghim</p>
                <p className="text-[13px] text-on-surface/80 truncate font-medium">
                  {(latestPin as any).content}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {pinnedIds.length > 1 && (
            <div className="p-1 hover:bg-amber-200/50 rounded-full transition-colors">
              {isExpanded ? <ChevronUp size={18} className="text-amber-700" /> : <ChevronDown size={18} className="text-amber-700" />}
            </div>
          )}
          {pinnedIds.length === 1 && (
            <button 
              onClick={(e) => handleUnpin(e, latestPin.id)}
              className="p-1.5 hover:bg-amber-200/50 rounded-full transition-colors text-amber-700/60"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded List (Accordion Style) */}
      {isExpanded && pinnedIds.length > 1 && (
        <div className="absolute top-full left-0 right-0 bg-white/95 dark:bg-surface-container/95 backdrop-blur-2xl shadow-2xl border-b border-outline-variant/20 dark:border-outline-variant/40 animate-in slide-in-from-top-2 duration-200 rounded-b-3xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-2">
            {pinnedMessages.map((msg: any, index) => (
              <div 
                key={msg.id}
                className="group flex items-center justify-between px-6 py-3 hover:bg-primary/5 transition-all cursor-pointer border-b border-outline-variant/10 last:border-0"
                onClick={() => {
                   jumpToMessage(msg.id);
                   setIsExpanded(false);
                }}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <span className="text-[11px] font-black text-on-surface-variant/30 w-4">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-on-surface font-medium truncate group-hover:text-primary transition-colors">
                      {msg.content}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 font-bold uppercase tracking-tighter">
                      {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : 'Ghim gần đây'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      jumpToMessage(msg.id);
                    }}
                    className="p-2 hover:bg-primary/10 rounded-full text-primary transition-colors"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button 
                    onClick={(e) => handleUnpin(e, msg.id)}
                    className="p-2 hover:bg-error/10 rounded-full text-error transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-primary/5 py-2 px-6 flex justify-center">
             <button 
               onClick={() => setIsExpanded(false)}
               className="text-[11px] font-black text-primary/60 uppercase tracking-widest hover:text-primary transition-colors"
             >
               Thu gọn
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PinnedHeader;
