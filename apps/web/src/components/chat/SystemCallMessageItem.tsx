import React, { useEffect, useState } from 'react';
import { Phone, Video } from 'lucide-react';
import api from '../../services/api';

interface SystemCallMessageItemProps {
  message: {
    id: string;
    senderId?: string;
    content: string;
    createdAt: string;
    type: string;
    callerId?: string;
    receiverId?: string;
    callType?: 'audio' | 'video';
    callStatus?: string;
    duration?: number;
    metadata?: any;
    callId?: string;
    isGroup?: boolean;
  };
  currentUserEmail: string;
  onCallBack?: (callType: 'audio' | 'video') => void;
  onJoinCall?: (callId: string, type: string) => void;
}

const SystemCallMessageItem: React.FC<SystemCallMessageItemProps> = ({ 
  message, 
  currentUserEmail, 
  onCallBack,
  onJoinCall 
}) => {
  const [isActive, setIsActive] = useState(false);

  const callId = message.callId || message.metadata?.callId;

  useEffect(() => {
    if (!callId) return;

    const checkStatus = async () => {
      try {
        const res = await api.get(`/group-call/status/${callId}`);
        setIsActive(res.data.isActive);
      } catch (error) {
        console.error("[SystemCallMessageItem] Check status failed:", error);
      }
    };

    checkStatus();
    
    // Polling every 10s if active to see when it ends
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [callId]);

  // [SENIOR 10/10] Super Radar: Tìm dữ liệu chuẩn nhất từ mọi ngóc ngách
  const callerId = message.callerId || message.senderId;
  const isCaller = callerId === currentUserEmail;

  const callType = (message.callType || message.metadata?.callType || 
                  (message.content?.toLowerCase().includes('video') ? 'video' : 'audio')) as 'audio' | 'video';
  
  const callStatus = (message.callStatus || message.metadata?.callStatus || 'missed').toLowerCase();
  
  const duration = message.duration || message.metadata?.duration || 0;

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const getTheme = (status: string, isFromMe: boolean) => {
    if (isActive) {
      return {
        bg: 'bg-emerald-50/80',
        border: 'border-emerald-100',
        text: 'text-emerald-800',
        btnText: 'text-emerald-900',
        btnHover: 'hover:bg-emerald-100/50',
      };
    }
    switch (status) {
      case 'completed':
        return {
          bg: 'bg-indigo-50/80',
          border: 'border-indigo-100',
          text: 'text-indigo-800',
          btnText: 'text-indigo-900',
          btnHover: 'hover:bg-indigo-100/50',
        };
      case 'missed':
      case 'no_answer':
        return isFromMe 
          ? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', btnText: 'text-slate-800', btnHover: 'hover:bg-slate-100' }
          : { bg: 'bg-rose-50/80', border: 'border-rose-100', text: 'text-rose-800', btnText: 'text-rose-900', btnHover: 'hover:bg-rose-100/50' };
      case 'rejected':
        return isFromMe
          ? { bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-800', btnText: 'text-amber-900', btnHover: 'hover:bg-amber-100/50' }
          : { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', btnText: 'text-slate-800', btnHover: 'hover:bg-slate-100' };
      case 'cancelled':
        return isFromMe
          ? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', btnText: 'text-slate-800', btnHover: 'hover:bg-slate-100' }
          : { bg: 'bg-rose-50/80', border: 'border-rose-100', text: 'text-rose-800', btnText: 'text-rose-900', btnHover: 'hover:bg-rose-100/50' };
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-100', text: 'text-gray-500', btnText: 'text-gray-700', btnHover: 'hover:bg-gray-100' };
    }
  };

  const getStatusText = (status: string, isFromMe: boolean) => {
    if (isActive) return 'Cuộc gọi đang diễn ra';
    
    const typeLabel = callType === 'video' ? 'video' : 'thoại';
    switch (status) {
      case 'completed':
        return isFromMe ? `Cuộc gọi ${typeLabel} đi` : `Cuộc gọi ${typeLabel} đến`;
      case 'missed':
      case 'no_answer':
        return isFromMe ? 'Không có câu trả lời' : 'Bạn bị lỡ';
      case 'rejected':
        return isFromMe ? 'Người nhận từ chối' : 'Bạn đã từ chối';
      case 'cancelled':
        return isFromMe ? 'Bạn đã hủy' : 'Bạn bị lỡ';
      default:
        return isFromMe ? 'Cuộc gọi đi' : 'Cuộc gọi đến';
    }
  };

  const theme = getTheme(callStatus, isCaller);
  const statusText = getStatusText(callStatus, isCaller);
  const isGroup = !!(message.isGroup || message.metadata?.isGroup);
  const isVideo = callType === 'video';
  const callLabel = isGroup 
    ? (isVideo ? 'Cuộc gọi video nhóm' : 'Cuộc gọi thoại nhóm')
    : (isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại');
  const CallIcon = isVideo ? Video : Phone;
  const durationStr = formatDuration(duration);

  return (
    <div className={`flex w-full my-5 px-8 animate-in fade-in slide-in-from-bottom-2 duration-700 ${isCaller ? 'justify-end' : 'justify-start'}`}>
      <div className="flex flex-col group">
        <div className={`w-[230px] ${theme.bg} rounded-[20px] shadow-sm border ${theme.border} overflow-hidden transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-0.5`}>
          {/* Top Content */}
          <div className="p-4 pb-3">
            <h4 className={`text-[15px] font-extrabold ${theme.text} leading-tight mb-1.5 tracking-tight`}>
              {statusText}
            </h4>
            <div className={`flex items-center gap-2 opacity-70 ${theme.text}`}>
              <CallIcon size={12} strokeWidth={3} />
              <span className="text-[13px] font-semibold">
                {callLabel}
                {durationStr && !isActive ? ` (${durationStr})` : ''}
              </span>
            </div>
          </div>
          
          {/* Divider */}
          <div className={`h-[1px] w-full opacity-30 ${theme.border.replace('border-', 'bg-')}`} />
          
          {/* Call Action */}
          {isActive ? (
            <button
              onClick={() => callId && onJoinCall?.(callId, callType)}
              className={`w-full py-3 text-[12px] font-black ${theme.btnText} ${theme.btnHover} transition-colors uppercase tracking-[0.1em]`}
            >
              THAM GIA LẠI
            </button>
          ) : (
            <button
              onClick={() => onCallBack?.(callType)}
              className={`w-full py-3 text-[12px] font-black ${theme.btnText} ${theme.btnHover} transition-colors uppercase tracking-[0.1em]`}
            >
              GỌI LẠI
            </button>
          )}
        </div>
        <span className={`text-[9px] font-black text-gray-300 mt-2 uppercase tracking-widest ${isCaller ? 'text-right mr-3' : 'text-left ml-3'}`}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default SystemCallMessageItem;
