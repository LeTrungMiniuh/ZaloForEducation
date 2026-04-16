import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import SearchOverlay from './SearchOverlay';
import AddFriendModal from '../chat/AddFriendModal';
import { useSocketListeners } from '../../hooks/useSocketListeners';

const MainLayout: React.FC = () => {
  // Activate global socket listeners
  useSocketListeners();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface text-on-surface antialiased font-['Plus_Jakarta_Sans']">
      {/* Side Navigation (80px) */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 h-full relative ml-20 bg-surface-container-lowest overflow-hidden flex flex-col">
        <Outlet />
      </main>

      {/* Global Overlays */}
      <SearchOverlay />
      <AddFriendModal />
    </div>
  );
};

export default MainLayout;
