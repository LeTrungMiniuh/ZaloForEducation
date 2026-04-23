import React from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { ChimeModule } = NativeModules;
const eventEmitter = Platform.OS !== 'web' && ChimeModule ? new NativeEventEmitter(ChimeModule) : null;

// [SENIOR] Tránh đăng ký trùng lặp khi Hot Reload
let NativeChimeView: any;
if (Platform.OS !== 'web') {
  const { requireNativeComponent } = require('react-native');
  NativeChimeView = requireNativeComponent('RNChimeVideoView');
} else {
  NativeChimeView = require('react-native').View;
}

/**
 * [SENIOR] RNChimeVideoView
 * Component Native để render video. Dùng SurfaceView ở tầng dưới.
 * Đã được bọc lại để an toàn hơn với Hot Reloading.
 */
export const RNChimeVideoView = (props: any) => {
  if (Platform.OS === 'web') {
    const { View, Text } = require('react-native');
    return <View {...props}><Text>Chime not supported on Web</Text></View>;
  }
  return <NativeChimeView {...props} />;
};

/**
 * [SENIOR] ChimeModuleBridge
 * Bộ API tinh gọn để điều khiển cuộc gọi Chime.
 */
export const ChimeModuleBridge = {
  // Bắt đầu cuộc gọi với data từ Backend
  startMeeting: (meetingData: any, attendeeData: any) => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.startMeeting(meetingData, attendeeData);
  },
  
  // Kết thúc và dọn dẹp session
  stopMeeting: () => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.stopMeeting();
  },
  
  // Bật/Tắt Mic
  toggleMic: (enabled: boolean) => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.toggleMic(enabled);
  },
  
  // Bật/Tắt Camera
  toggleCamera: (enabled: boolean) => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.toggleCamera(enabled);
  },

  // Chuyển đầu ra âm thanh (speaker: boolean)
  switchAudioOutput: (useSpeaker: boolean) => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.switchAudioOutput(useSpeaker);
  },

  // Đảo Camera trước / sau
  switchCamera: () => {
    if (Platform.OS === 'web') return;
    return ChimeModule?.switchCamera();
  },
  
  // Đăng ký lắng nghe sự kiện (onVideoTileAdded, onVideoTileRemoved)
  addListener: (eventName: string, callback: (data: any) => void) => {
    if (Platform.OS === 'web' || !eventEmitter) return { remove: () => {} };
    console.log(`[Chime-Bridge] 👂 Registering listener for: ${eventName}`);
    return eventEmitter.addListener(eventName, (data: any) => {
      callback(data);
    });
  },

  // Hủy đăng ký lắng nghe
  removeAllListeners: (eventName: string) => {
    if (Platform.OS === 'web' || !eventEmitter) return;
    console.log(`[Chime-Bridge] 🚮 Removing all listeners for: ${eventName}`);
    return eventEmitter.removeAllListeners(eventName);
  }
};

// Export giả lập để tương thích với code đang có (nếu cần)
export default {
  RNChimeVideoView,
  ChimeModuleBridge
};
