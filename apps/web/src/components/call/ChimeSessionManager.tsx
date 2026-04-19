/**
 * ChimeSessionManager — Component vô hình, luôn mount trong App.
 * Mục đích: Giữ `useChime` hook luôn active để không bị destroy khi
 * CallOverlay re-render hay unmount. Điều này đảm bảo session Chime
 * không bị gián đoạn trong quá trình call.
 */
import React from 'react';
import { useChime } from '../../hooks/useChime';

const ChimeSessionManager: React.FC = () => {
  useChime();
  return null;
};

export default ChimeSessionManager;
