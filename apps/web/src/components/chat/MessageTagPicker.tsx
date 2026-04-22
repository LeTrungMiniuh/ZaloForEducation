import React from 'react';
import { useChatStore } from '../../store/chatStore';

const MessageTagPicker: React.FC<{
  convId: string;
  messageId: string;
  x: number;
  y: number;
  onClose?: () => void;
}> = ({ convId, messageId, x, y, onClose }) => {
  const { tags, assignTagToMessage, removeTagFromMessage } = useChatStore();
  const msg = useChatStore.getState().messages.find((m:any)=>m.id===messageId);
  const currentTagId = msg?.tagId;

  return (
    <div style={{ position: 'absolute', left: Math.min(x, window.innerWidth-260), top: Math.min(y, window.innerHeight-340), zIndex: 130 }}>
      <div className="w-64 rounded-2xl border bg-white p-2 shadow-lg">
        <div className="p-2 text-sm text-on-surface-variant">Phân loại tin nhắn</div>
        <div className="space-y-1 px-2 pb-2">
          <button onClick={async ()=>{ await assignTagToMessage(convId, messageId, undefined as any); onClose && onClose(); }} className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] ${!currentTagId ? 'text-primary' : ''}`}>Không có thẻ {!currentTagId && <span className="material-symbols-outlined">check</span>}</button>
          {(tags||[]).map((t:any)=> (
            <button key={t.id} onClick={async ()=>{ await assignTagToMessage(convId, messageId, t.id); onClose && onClose(); }} className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] ${currentTagId===t.id ? 'text-primary' : ''}`}>
              <div className="flex items-center gap-2"><span style={{background:t.color}} className="w-3 h-3 inline-block rounded-sm" />{t.name}</div>
              {currentTagId===t.id && <span className="material-symbols-outlined">check</span>}
            </button>
          ))}
          <div className="border-t pt-2 mt-2">
            <button onClick={() => window.dispatchEvent(new CustomEvent('open-chat-tag-manager'))} className="w-full text-left px-3 py-2 text-[13px] text-on-surface-variant">Quản lý thẻ</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageTagPicker;
