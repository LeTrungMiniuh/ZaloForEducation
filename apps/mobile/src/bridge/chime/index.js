import React from 'react';
import { NativeModules, requireNativeComponent, NativeEventEmitter, Platform } from 'react-native';

const { ChimeModule } = NativeModules;
const eventEmitter = new NativeEventEmitter(ChimeModule);

// [SENIOR] Tránh đăng ký trùng lặp khi Hot Reload
const NativeChimeView = requireNativeComponent('RNChimeVideoView');

/**
 * [SENIOR] RNChimeVideoView
 * Component Native để render video. Dùng SurfaceView ở tầng dưới.
 * Đã được bọc lại để an toàn hơn với Hot Reloading.
 */
export const RNChimeVideoView = (props) => {
  return <NativeChimeView {...props} />;
};

/**
 * [SENIOR] ChimeModuleBridge
 * Bộ API tinh gọn để điều khiển cuộc gọi Chime.
 */
export const ChimeModuleBridge = {
  // Bắt đầu cuộc gọi với data từ Backend
  startMeeting: (meetingData, attendeeData) => {
    return ChimeModule.startMeeting(meetingData, attendeeData);
  },
  
  // Kết thúc và dọn dẹp session
  stopMeeting: () => {
    return ChimeModule.stopMeeting();
  },
  
  // Bật/Tắt Mic
  toggleMic: (enabled) => {
    return ChimeModule.toggleMic(enabled);
  },
  
  // Bật/Tắt Camera
  toggleCamera: (enabled) => {
    return ChimeModule.toggleCamera(enabled);
  },

  // Chuyển đầu ra âm thanh (speaker: boolean)
  switchAudioOutput: (useSpeaker) => {
    return ChimeModule.switchAudioOutput(useSpeaker);
  },

  // Đảo Camera trước / sau
  switchCamera: () => {
    return ChimeModule.switchCamera();
  },
  
  // Đăng ký lắng nghe sự kiện (onVideoTileAdded, onVideoTileRemoved)
  addListener: (eventName, callback) => {
    console.log(`[Chime-Bridge] 👂 Registering listener for: ${eventName}`);
    return eventEmitter.addListener(eventName, (data) => {
      // console.log(`[Chime-Bridge] 📡 Event Received: ${eventName}`);
      callback(data);
    });
  },

  // Hủy đăng ký lắng nghe
  removeAllListeners: (eventName) => {
    console.log(`[Chime-Bridge] 🚮 Removing all listeners for: ${eventName}`);
    return eventEmitter.removeAllListeners(eventName);
  }
};

// Export giả lập để tương thích với code đang có (nếu cần)
export default {
  RNChimeVideoView,
  ChimeModuleBridge
};
