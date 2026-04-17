import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useChatStore } from '../../store/chatStore';
import { isUnread } from '../../utils/chatUtils';
import { 
  MessageSquare, 
  Users, 
  Bell, 
  Cloud, 
  Settings, 
  User, 
  LogOut 
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { conversations, setIsSearching, setSearchQuery } = useChatStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasUnreadMessages = conversations.some(conv => isUnread(conv, user?.email));

  const navItems = [
    { id: 'chat', icon: MessageSquare, label: 'Tin nhắn', path: '/chat', hasBadge: hasUnreadMessages },
    { id: 'contacts', icon: Users, label: 'Danh bạ', path: '/contacts', hasBadge: false },
    { id: 'notifications', icon: Bell, label: 'Thông báo', path: '/notifications', hasBadge: false },
    { id: 'cloud', icon: Cloud, label: 'Cloud', path: '/cloud', hasBadge: false },
  ];

  const handleNavClick = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  return (
    <>
      <aside className="fixed left-0 top-0 h-full z-50 w-20 flex flex-col items-center py-6 bg-gradient-to-br from-[#0058bc] to-[#00418f] shadow-[0px_20px_40px_rgba(0,65,143,0.06)] shrink-0">
        {/* Top Avatar Area */}
        <div className="mb-8 group relative">
          <img
            alt="User Avatar"
            onClick={() => navigate('/profile')}
            className="w-12 h-12 rounded-full border-2 border-white/20 p-0.5 object-cover bg-white/10 cursor-pointer hover:border-white transition-all duration-300 hover:scale-105"
            src={user?.avatarUrl || "https://lh3.googleusercontent.com/aida-public/AB6AXuCFw8hQBOq4JKJazc3GAIcVjmlrrfkICsk9jcBPauM53xp43QRLa6DqnEMow0-o1mRGziDfptfm02FgIlDbYltgzrSJtsP-_9ZmmuU5a1HL7JGFMujo8aASzX0ctHu6vqLGHtPPfgD52k6jx6G96Ll7O72OmXDkjh4_ow9-Pm7zokfO_INwwFExRPgQJIjpqmh5hidvLzAXnfEYTg61gAUYlTRiSMH5ZUorMbj1-J4SuqKTeDZetL9hIls8Yq8wumlUwCODZQaS6A"}
          />
        </div>

        {/* Middle Navigation area */}
        <nav className="flex flex-col gap-4 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={handleNavClick}
              className={({ isActive }) => `
                rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative group
                ${isActive
                  ? 'bg-white/20 backdrop-blur-md text-white active:scale-90 scale-100'
                  : 'text-white/60 hover:text-white hover:bg-white/10 active:scale-90'
                }
              `}
              title={item.label}
            >
              {({ isActive }) => (
                <>
                  <item.icon 
                    size={26} 
                    strokeWidth={2}
                    className={isActive ? 'fill-white/10' : ''}
                  />
                  {item.hasBadge && (
                    <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-[#00418f] animate-pulse"></span>
                  )}
                  {/* Tooltip */}
                  <span className="absolute left-full ml-4 px-2 py-1 bg-surface-container-highest text-on-surface text-[11px] font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] shadow-lg border border-outline-variant/10">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom Area */}
        <div className="mt-auto flex flex-col gap-4">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`rounded-2xl transition-all duration-300 p-3 scale-95 flex items-center justify-center relative hover:bg-white/10 text-white/60 hover:text-white ${isDropdownOpen ? (isDark ? 'bg-[#4b5d7a] text-[#eef3fb] border border-[#6c7fa1]' : 'bg-white/20 text-white') : ''}`}
            >
              <Settings size={26} />
            </button>

            {/* Settings Dropdown */}
            {isDropdownOpen && (
              <div className={`absolute bottom-0 left-16 w-64 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border overflow-hidden z-[100] animate-in fade-in slide-in-from-left-4 duration-200 ${isDark ? 'bg-surface-container border-outline-variant/30' : 'bg-white border-outline-variant/10'}`}>
                <div className="p-4 border-b border-outline-variant/5">
                  <h3 className="font-bold text-on-surface">Cài đặt</h3>
                </div>
                <div className="py-2">
                  <button 
                    onClick={() => { navigate('/profile'); setIsDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors text-on-surface font-semibold text-sm"
                  >
                    <User size={18} className="text-on-surface-variant" />
                    Thông tin tài khoản
                  </button>
                  <button 
                    onClick={() => navigate('/settings')}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors text-on-surface font-semibold text-sm"
                  >
                    <Settings size={18} className="text-on-surface-variant" />
                    Cài đặt chung
                  </button>
                </div>
                <div className="border-t border-outline-variant/5 py-1">
                  <button
                    onClick={() => { logout(); setIsDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors text-on-surface font-bold text-sm"
                  >
                    <LogOut size={18} />
                    Đăng xuất
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
