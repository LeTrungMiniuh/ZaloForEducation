import React from 'react';
import { Phone, Video } from 'lucide-react';

const formatCallDuration = (sec: number = 0): string => {
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface SystemCallMessageItemProps {
  message: any;
  currentUserEmail: string;
  onCallBack?: (type: 'audio' | 'video') => void;
}

const SystemCallMessageItem: React.FC<SystemCallMessageItemProps> = ({ message, currentUserEmail, onCallBack }) => {
  // 1. Extract Metadata
  const metadata = message.metadata || message;
  let { callType = 'audio', callStatus, duration = 0, callerId } = metadata;

  // 2. Fail-safe Status for SYSTEM_CALL
  if (!callStatus && message.type === 'SYSTEM_CALL') {
    callStatus = 'completed';
  }

  // 3. Legacy Parsing Fallback (ONLY for non-SYSTEM_CALL or clearly missing data)
  if (!callStatus && message.type !== 'SYSTEM_CALL' && message.content) {
    const content = message.content;
    callType = content.includes('video') ? 'video' : 'audio';
    if (content.includes('lỡ') || content.includes('nhỡ')) callStatus = 'missed';
    else if (content.includes('từ chối')) callStatus = 'rejected';
    else callStatus = 'completed';

    const durationMatch = content.match(/\((\d{2}):(\d{2})\)/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10) * 60 + parseInt(durationMatch[2], 10);
      if (duration > 0) callStatus = 'completed';
    }
    if (!callerId) callerId = message.senderId;
  }

  // 4. Direction Logic (Fail-safe)
  const isOutgoing = !!callerId && callerId.toLowerCase() === currentUserEmail.toLowerCase();

  // 5. [UI 10/10] Zalo Card Mapping (Individual Perspective)
  const getCallDisplay = () => {
    const isVideo = callType === 'video';
    const typeLabel = isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
    const typeIcon = isVideo ? '🎥' : '📞';

    // Status: Rejected (One side declined)
    if (callStatus === 'rejected') {
      return {
        title: isOutgoing ? 'Người nhận từ chối' : 'Bạn đã từ chối',
        subtitle: `${typeIcon} ${typeLabel}`,
        isMissed: !isOutgoing // Only missed for receiver if they didn't answer (but they rejected, so it's red)
      };
    }

    // Status: Missed (No answer or Canceled)
    if (callStatus === 'missed') {
      return {
        title: isOutgoing ? 'Không có câu trả lời' : 'Cuộc gọi nhỡ',
        subtitle: `${typeIcon} ${typeLabel}`,
        isMissed: !isOutgoing
      };
    }

    // Status: Completed (Talked)
    if (callStatus === 'completed') {
      const durationLabel = duration > 0 ? formatCallDuration(duration) : 'Đã kết nối';
      return {
        title: isOutgoing ? (isVideo ? 'Cuộc gọi video đi' : 'Cuộc gọi thoại đi') : (isVideo ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến'),
        subtitle: `${typeIcon} ${durationLabel}`,
        isMissed: false
      };
    }

    return { title: 'Cuộc gọi', subtitle: '', isMissed: false };
  };

  const display = getCallDisplay();

  return (
    <div className={`flex w-full my-3 px-4 group ${isOutgoing ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex flex-col max-w-[70%] ${isOutgoing ? 'items-end' : 'items-start'}`}>
        {/* Zalo Premium Card */}
        <div className="bg-[#cfefff] rounded-[16px] p-3 shadow-md border border-blue-200/30 flex flex-col min-w-[180px] transition-all hover:bg-[#bce6ff]">
          <div className="border-b border-gray-300/40 pb-2.5 mb-2.5">
            <h4 className={`text-[15px] font-bold leading-tight ${display.isMissed ? 'text-red-500' : 'text-[#222]'}`}>
              {display.title}
            </h4>
            <p className="text-[13px] text-[#555] mt-1.5 flex items-center gap-1.5 font-medium">
              {display.subtitle}
            </p>
          </div>
          
          {onCallBack && (
            <button 
              onClick={() => onCallBack(callType as 'audio' | 'video')}
              className="w-full text-center text-[#007AFF] font-bold text-[13px] hover:text-[#005bb5] transition-colors py-0.5"
            >
              GỌI LẠI
            </button>
          )}
        </div>
        
        <span className="text-[10px] text-gray-400 mt-1.5 px-1 font-medium">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default SystemCallMessageItem;
