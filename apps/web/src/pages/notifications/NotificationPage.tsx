import React from 'react';

export const NotificationPage: React.FC = () => (
  <div className="flex-1 h-full flex items-center justify-center bg-surface-container-lowest">
    <div className="text-center">
      <span className="material-symbols-outlined text-[64px] text-primary/20 mb-4">notifications</span>
      <h2 className="text-xl font-bold text-on-surface opacity-30">Thông báo</h2>
      <p className="text-sm text-on-surface-variant opacity-40">Tính năng đang được phát triển.</p>
    </div>
  </div>
);

export const CloudPage: React.FC = () => (
  <div className="flex-1 h-full flex items-center justify-center bg-surface-container-lowest">
    <div className="text-center">
      <span className="material-symbols-outlined text-[64px] text-primary/20 mb-4">cloud</span>
      <h2 className="text-xl font-bold text-on-surface opacity-30">My Cloud</h2>
      <p className="text-sm text-on-surface-variant opacity-40">Kho lưu trữ cá nhân đang chờ sếp Chung hoàn thiện.</p>
    </div>
  </div>
);
