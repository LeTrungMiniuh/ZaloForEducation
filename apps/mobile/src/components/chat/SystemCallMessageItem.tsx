import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * SystemCallMessageItem - Custom Premium Design 10/10
 * Uses unified metadata structure for robust rendering
 */
interface SystemCallMessageItemProps {
  message: any;
  currentUserEmail: string;
  onCallBack?: (type: 'audio' | 'video') => void;
}

const SystemCallMessageItem = ({ message, currentUserEmail, onCallBack }: SystemCallMessageItemProps) => {
  const callerId = message.callerId || message.senderId;
  const isCaller = callerId === currentUserEmail;

  // [SENIOR 10/10] Super Radar: Tìm dữ liệu chuẩn nhất từ mọi ngóc ngách
  const callType = message.callType || message.metadata?.callType || 
                  (message.content?.toLowerCase().includes('video') ? 'video' : 'audio');
  
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
    switch (status) {
      case 'completed':
        return {
          bg: '#E8EAF6',
          border: '#C5CAE9',
          text: '#3F51B5',
          btnText: '#303F9F',
        };
      case 'missed':
      case 'no_answer':
        return isFromMe 
          ? { bg: '#F5F5F5', border: '#E0E0E0', text: '#616161', btnText: '#424242' }
          : { bg: '#FFEBEE', border: '#FFCDD2', text: '#C62828', btnText: '#D32F2F' };
      case 'rejected':
        return isFromMe
          ? { bg: '#FFF3E0', border: '#FFE0B2', text: '#EF6C00', btnText: '#E65100' }
          : { bg: '#F5F5F5', border: '#E0E0E0', text: '#616161', btnText: '#424242' };
      case 'cancelled':
        return isFromMe
          ? { bg: '#F5F5F5', border: '#E0E0E0', text: '#616161', btnText: '#424242' }
          : { bg: '#FFEBEE', border: '#FFCDD2', text: '#C62828', btnText: '#D32F2F' };
      default:
        return { bg: '#FAFAFA', border: '#F5F5F5', text: '#9E9E9E', btnText: '#757575' };
    }
  };

  const getStatusText = (status: string, isFromMe: boolean) => {
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
  const isVideo = callType === 'video';
  const callLabel = isVideo ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  const callIcon = isVideo ? '📹' : '📞';
  const durationStr = formatDuration(duration);

  return (
    <View style={[styles.wrapper, isCaller ? styles.wrapperRight : styles.wrapperLeft]}>
      <View style={[styles.card, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <View style={styles.contentPadding}>
          <Text style={[styles.statusText, { color: theme.text }]}>{statusText}</Text>
          <View style={styles.typeRow}>
            <Text style={styles.typeIcon}>{callIcon}</Text>
            <Text style={[styles.typeLabel, { color: theme.text, opacity: 0.7 }]}>
              {callLabel}
              {durationStr ? ` (${durationStr})` : ''}
            </Text>
          </View>
        </View>
        
        <View style={[styles.divider, { backgroundColor: theme.border, opacity: 0.5 }]} />
        
        <TouchableOpacity
          onPress={() => onCallBack?.(callType)}
          style={styles.callBackBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.callBackText, { color: theme.btnText }]}>GỌI LẠI</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.timestamp}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  wrapperRight: {
    alignItems: 'flex-end',
  },
  wrapperLeft: {
    alignItems: 'flex-start',
  },
  card: {
    borderRadius: 16,
    width: 220,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  contentPadding: {
    padding: 14,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeIcon: {
    fontSize: 12,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  callBackBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBackText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  timestamp: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 5,
    marginHorizontal: 6,
    fontWeight: '600',
  },
});

export default SystemCallMessageItem;
