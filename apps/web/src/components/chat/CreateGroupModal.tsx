import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useChatStore } from '../../store/chatStore';
import { getDisplayName, getDisplayAvatar } from '../../utils/chatUtils';
import { X, Users, Search, CheckCircle2, UserPlus, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import api from '../../services/api';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { createGroupConversation, setActiveConversation, conversations, userProfiles } = useChatStore();
  const [groupName, setGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setGroupName('');
      setSearch('');
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  const fetchFriends = () => {
    setIsLoading(true);
    
    setTimeout(() => {
      // Extract contacts from recent direct messages
      const contactsMap = new Map<string, any>();
      
      conversations.forEach(c => {
        if (c.type === 'direct') {
           const partnerEmail = c.members?.find((m: string) => m !== user?.email);
           if (partnerEmail && partnerEmail !== user?.email) {
              contactsMap.set(partnerEmail, {
                 email: partnerEmail,
                 displayName: getDisplayName(partnerEmail, user, userProfiles),
                 avatarUrl: getDisplayAvatar(partnerEmail, user, userProfiles)
              });
           }
        } else if (c.type === 'group') {
           // Also add people from existing groups we are in
           c.members?.forEach((m: string) => {
              if (m !== user?.email && !contactsMap.has(m)) {
                 contactsMap.set(m, {
                    email: m,
                    displayName: getDisplayName(m, user, userProfiles),
                    avatarUrl: getDisplayAvatar(m, user, userProfiles)
                 });
              }
           });
        }
      });
      
      setFriends(Array.from(contactsMap.values()));
      setIsLoading(false);
    }, 100);
  };

  if (!isOpen) return null;

  const handleToggle = (email: string) => {
    const next = new Set(selectedIds);
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    setSelectedIds(next);
  };

  const handleCreate = async () => {
    if (selectedIds.size === 0) {
       Swal.fire('Lỗi', 'Vui lòng chọn ít nhất 1 thành viên', 'error');
       return;
    }
    if (!groupName.trim()) {
       Swal.fire('Lỗi', 'Vui lòng nhập tên nhóm', 'error');
       return;
    }

    setIsCreating(true);
    try {
      const members = Array.from(selectedIds);
      // Backend automatically adds the creator
      const newGroup = await createGroupConversation(groupName.trim(), members);
      Swal.fire({
        title: 'Tạo nhóm thành công!',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
      onClose();
      // Jump to this conversation
      if (newGroup && newGroup._id) {
         setActiveConversation(newGroup._id);
      }
    } catch (err) {
      Swal.fire('Thất bại', 'Không thể tạo nhóm. Vui lòng thử lại.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const filtered = friends.filter(f => 
    (f.displayName || f.email).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-surface-container rounded-3xl w-full max-w-[420px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[85vh]">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/10 dark:border-outline-variant/20 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-on-surface flex items-center gap-2">
            <Users size={18} className="text-primary" />
            Tạo nhóm trò chuyện mới
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors"
          >
            <X size={20} className="text-on-surface-variant" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="space-y-1">
             <label className="text-[13px] font-bold text-on-surface">Tên nhóm</label>
             <input 
               value={groupName}
               onChange={e => setGroupName(e.target.value)}
               placeholder="Nhập tên nhóm..."
               className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-[14px]"
             />
          </div>

          <div className="space-y-1">
             <label className="text-[13px] font-bold text-on-surface">Thêm thành viên</label>
             <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl flex items-center px-4 py-2 gap-2 focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                <Search size={18} className="text-on-surface-variant/50" />
                <input 
                  type="text"
                  placeholder="Tìm bạn bè..."
                  className="bg-transparent flex-1 outline-none text-[14px] text-on-surface placeholder:text-on-surface-variant/50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
             </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 custom-scrollbar min-h-[250px]">
          {isLoading ? (
             <div className="flex justify-center items-center h-20">
                <Loader2 size={24} className="text-primary animate-spin" />
             </div>
          ) : (
            filtered.map(f => {
              const isSelected = selectedIds.has(f.email);
              return (
                <div 
                  key={f.email}
                  onClick={() => handleToggle(f.email)}
                  className={`flex items-center p-3 gap-3 rounded-2xl cursor-pointer transition-all ${isSelected ? 'bg-primary/5' : 'hover:bg-surface-container-high'}`}
                >
                  <img src={f.avatarUrl || '/avatar_placeholder.png'} className="w-10 h-10 rounded-full object-cover ring-1 ring-black/5" alt="" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-bold text-on-surface truncate">{f.displayName || f.fullName || f.email}</h3>
                    {f.displayName && <p className="text-[12px] text-on-surface-variant truncate">{f.email}</p>}
                  </div>
                  {!isSelected && <div className="w-5 h-5 rounded-full border-2 border-outline-variant/30" />}
                  {isSelected && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><CheckCircle2 size={14} className="text-white" /></div>}
                </div>
              );
            })
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center p-8 opacity-50">
               <p className="text-[13px]">Không tìm thấy người dùng nào.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-outline-variant/10 bg-surface-container-lowest">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-on-surface-variant">
              Đã chọn <strong>{selectedIds.size}</strong> người
            </span>
            <button
              onClick={handleCreate}
              disabled={selectedIds.size === 0 || !groupName.trim() || isCreating}
              className="bg-primary text-white px-5 py-2.5 rounded-full font-bold text-[14px] flex items-center gap-2 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 shadow-md shadow-primary/20"
            >
              {isCreating ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              Tạo nhóm
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CreateGroupModal;
