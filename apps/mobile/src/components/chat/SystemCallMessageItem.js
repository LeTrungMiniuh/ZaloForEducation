import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const CALL_UI = {
  colors: {
    missed: '#ef4444',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    actionBlue: '#0068FF',
  }
};

const formatCallDuration = (sec = 0) => {
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/**
 * SystemCallMessageItem - Minimalist Premium Version (v3.0)
 */
const SystemCallMessageItem = ({ message, currentUserEmail, onCallBack }) => {
  // 1. Extract Unified Metadata
  const metadata = message.metadata || message;
  let { callType = 'audio', callStatus, duration = 0, callerId } = metadata;

  // 2. Fail-safe Status for SYSTEM_CALL
  if (!callStatus && message.type === 'SYSTEM_CALL') {
    callStatus = 'completed';
  }
  
  // 3. [SENIOR] Legacy Parsing Fallback
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
        isMissed: !isOutgoing
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
    <View style={[styles.wrapper, isOutgoing ? styles.wrapperOutgoing : styles.wrapperIncoming]}>
      <View style={styles.card}>
        <View style={styles.content}>
          <Text style={[styles.title, display.isMissed && styles.textMissed]}>
            {display.title}
          </Text>
          <Text style={styles.subtitle}>
            {display.subtitle}
          </Text>
        </View>

        {onCallBack && (
          <TouchableOpacity
            style={styles.callBackBtn}
            onPress={() => onCallBack(callType)}
            activeOpacity={0.6}
          >
            <Text style={styles.callBackText}>GỌI LẠI</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.timestamp}>
        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    paddingHorizontal: 16,
    marginVertical: 4,
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
  },
  wrapperOutgoing: {
    flexDirection: 'row-reverse',
  },
  wrapperIncoming: {
    justifyContent: 'flex-start',
  },
  card: {
    backgroundColor: '#cfefff',
    borderRadius: 12,
    padding: 12,
    maxWidth: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  content: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    paddingBottom: 8,
    minWidth: 140,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 4,
  },
  textMissed: {
    color: '#ef4444',
  },
  callBackBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 4,
  },
  callBackText: {
    color: '#007AFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
});

export default SystemCallMessageItem;
