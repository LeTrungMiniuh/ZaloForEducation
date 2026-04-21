import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { userService } from '../services/userService';
import Swal from 'sweetalert2';
import { 
  X, 
  Camera, 
  Edit3, 
  User, 
  Cake, 
  Phone, 
  MapPin, 
  Mail,
  Loader2
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, refreshUser } = useAuth();
  const { isDark } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState<'avatar' | 'background' | null>(null);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    fullName: '',
    gender: true, // true: Nam, false: Nữ
    dataOfBirth: '',
    phone: '',
    address: '',
    bio: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  useEffect(() => {
    if (user && isOpen) {
      setProfile((prev: any) => ({ ...prev, ...user }));
      
      if (!isEditing) {
        setFormData(prev => ({
          ...prev,
          fullName: user.fullName || prev.fullName,
          gender: user.gender !== undefined ? user.gender : prev.gender,
          dataOfBirth: user.dataOfBirth || prev.dataOfBirth,
          phone: user.phone || prev.phone,
          address: user.address || prev.address,
          bio: user.bio || prev.bio
        }));
      }
    }
  }, [user, isOpen, isEditing]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await userService.getProfile();
      setProfile(data);
      setFormData({
        fullName: data.fullName || '',
        gender: data.gender !== undefined ? data.gender : true,
        dataOfBirth: data.dataOfBirth || '',
        phone: data.phone || '',
        address: data.address || '',
        bio: data.bio || ''
      });
    } catch (err) {
      console.error('Lỗi khi tải thông tin cá nhân', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      await userService.updateProfile(formData);
      await refreshUser();
      await loadProfile();
      setIsEditing(false);
      Swal.fire({
        icon: 'success',
        title: 'Thành công',
        text: 'Thông tin cá nhân đã được cập nhật.',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire('Lỗi', err.response?.data?.message || 'Không thể cập nhật thông tin.', 'error');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'background') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(type);
    try {
      if (type === 'avatar') {
        await userService.uploadAvatar(file);
      } else {
        await userService.uploadBackground(file);
      }
      await refreshUser();
      await loadProfile();
      Swal.fire({
        icon: 'success',
        title: 'Thành công',
        text: 'Ảnh đã được cập nhật.',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire('Lỗi', err.response?.data?.message || 'Không thể upload ảnh.', 'error');
    } finally {
      setUploading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-surface-container w-full max-w-[420px] rounded-[32px] overflow-hidden shadow-2xl animate-slide-up flex flex-col h-fit max-h-[90vh]">
        
        {/* Header - Transparent overlay on background */}
        <div className="relative h-48 shrink-0">
          <img 
            src={profile?.backgroundUrl || 'https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=1000'} 
            className="w-full h-full object-cover"
            alt="Cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-transparent"></div>
          
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 p-2 rounded-full transition-colors"
          >
            <X size={24} />
          </button>

          <button 
            onClick={() => bgInputRef.current?.click()}
            className="absolute bottom-4 right-4 bg-white/20 hover:bg-white/40 backdrop-blur-md text-white p-2 rounded-full transition-colors border border-white/30"
            title="Đổi ảnh bìa"
          >
            <Camera size={18} />
          </button>
          <input type="file" ref={bgInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'background')} accept="image/*" />
        </div>

        {/* Content */}
        <div className="px-6 pb-8 relative -mt-16 flex-1 overflow-y-auto hide-scrollbar">
          {/* Avatar Area */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              <img 
                src={profile?.avatarUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCFw8hQBOq4JKJazc3GAIcVjmlrrfkICsk9jcBPauM53xp43QRLa6DqnEMow0-o1mRGziDfptfm02FgIlDbYltgzrSJtsP-_9ZmmuU5a1HL7JGFMujo8aASzX0ctHu6vqLGHtPPfgD52k6jx6G96Ll7O72OmXDkjh4_ow9-Pm7zokfO_INwwFExRPgQJIjpqmh5hidvLzAXnfEYTg61gAUYlTRiSMH5ZUorMbj1-J4SuqKTeDZetL9hIls8Yq8wumlUwCODZQaS6A'} 
                className="w-32 h-32 rounded-full border-4 border-white shadow-xl object-cover bg-white"
                alt="Avatar"
              />
              <button 
                onClick={() => avatarInputRef.current?.click()}
                className="absolute bottom-1 right-1 bg-primary text-white p-2 rounded-full border-2 border-white shadow-lg hover:scale-110 active:scale-95 transition-all"
                title="Đổi ảnh đại diện"
              >
                <Camera size={18} />
              </button>
              <input type="file" ref={avatarInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'avatar')} accept="image/*" />
              
              {uploading && (
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                  <Loader2 size={32} className="text-white animate-spin" />
                </div>
              )}
            </div>
            
            {!isEditing ? (
              <>
                <h2 className="text-2xl font-black mt-4 text-on-surface">{profile?.fullName || 'Người dùng'}</h2>
                <p className="text-on-surface-variant font-medium text-sm mt-1">{user?.email}</p>
                {formData.bio && (
                  <p className="text-on-surface-variant text-sm mt-3 text-center px-4 italic leading-relaxed">"{formData.bio}"</p>
                )}
              </>
            ) : (
              <div className="w-full mt-4 space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Họ và tên</label>
                    <input 
                      className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-bold text-on-surface"
                      value={formData.fullName}
                      onChange={e => setFormData({...formData, fullName: e.target.value})}
                      placeholder="Nhập họ tên"
                    />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Tiểu sử</label>
                    <textarea 
                      className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-medium text-on-surface resize-none"
                      value={formData.bio}
                      onChange={e => setFormData({...formData, bio: e.target.value})}
                      placeholder="Giới thiệu ngắn về bản thân"
                      rows={2}
                    />
                 </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-outline-variant/10 pb-4">
              <h3 className="font-extrabold text-primary dark:text-on-surface text-[15px] tracking-tight">Thông tin cá nhân</h3>
              {!isEditing ? (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 text-primary bg-primary/5 hover:bg-primary/10 px-4 py-1.5 rounded-full transition-all text-xs font-bold"
                >
                  <Edit3 size={14} /> Chỉnh sửa
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="text-on-surface-variant hover:bg-surface-container-high px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleUpdate}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${isDark ? 'bg-[#4b5d7a] text-[#eef3fb] border border-[#6c7fa1] hover:bg-[#55698a]' : 'bg-primary text-white hover:bg-primary-container shadow-md shadow-primary/20'}`}
                  >
                    Lưu
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <User size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Giới tính</p>
                  {!isEditing ? (
                    <p className="font-bold text-on-surface">{formData.gender ? 'Nam' : 'Nữ'}</p>
                  ) : (
                    <div className="flex gap-4 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={formData.gender} onChange={() => setFormData({...formData, gender: true})} className="accent-primary" />
                        <span className="font-bold text-sm">Nam</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={!formData.gender} onChange={() => setFormData({...formData, gender: false})} className="accent-primary" />
                        <span className="font-bold text-sm">Nữ</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Cake size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Ngày sinh</p>
                  {!isEditing ? (
                    <p className="font-bold text-on-surface">{formData.dataOfBirth || 'Chưa cập nhật'}</p>
                  ) : (
                    <div className="flex gap-2 mt-1">
                      <input 
                        type="text"
                        maxLength={2}
                        className="w-12 bg-surface-container rounded-xl border-none p-2 outline-none font-bold text-sm text-center"
                        value={formData.dataOfBirth.split(/[-/]/)[0] || ''}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                          const parts = formData.dataOfBirth.split(/[-/]/);
                          const m = parts[1] || '';
                          const y = parts[2] || '';
                          setFormData({...formData, dataOfBirth: `${val}-${m}-${y}`});
                        }}
                        placeholder="DD"
                      />
                      <input 
                        type="text"
                        maxLength={2}
                        className="w-12 bg-surface-container rounded-xl border-none p-2 outline-none font-bold text-sm text-center"
                        value={formData.dataOfBirth.split(/[-/]/)[1] || ''}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 2);
                          const parts = formData.dataOfBirth.split(/[-/]/);
                          const d = parts[0] || '';
                          const y = parts[2] || '';
                          setFormData({...formData, dataOfBirth: `${d}-${val}-${y}`});
                        }}
                        placeholder="MM"
                      />
                      <input 
                        type="text"
                        maxLength={4}
                        className="w-20 bg-surface-container rounded-xl border-none p-2 outline-none font-bold text-sm text-center"
                        value={formData.dataOfBirth.split(/[-/]/)[2] || ''}
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                          const parts = formData.dataOfBirth.split(/[-/]/);
                          const d = parts[0] || '';
                          const m = parts[1] || '';
                          setFormData({...formData, dataOfBirth: `${d}-${m}-${val}`});
                        }}
                        placeholder="YYYY"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Phone size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Số điện thoại</p>
                  {!isEditing ? (
                    <p className="font-bold text-on-surface">{formData.phone || 'Chưa cập nhật'}</p>
                  ) : (
                    <input 
                      type="text"
                      className="w-full bg-surface-container rounded-xl border-none p-2 mt-1 outline-none font-bold text-sm"
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                      placeholder="Nhập số điện thoại"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <MapPin size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Địa chỉ</p>
                  {!isEditing ? (
                    <p className="font-bold text-on-surface">{formData.address || 'Chưa cập nhật'}</p>
                  ) : (
                    <input 
                      type="text"
                      className="w-full bg-surface-container rounded-xl border-none p-2 mt-1 outline-none font-bold text-sm"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                      placeholder="Nhập địa chỉ"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0">
                  <Mail size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Email</p>
                  <p className="font-bold text-on-surface">{user?.email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {!isEditing && (
          <div className="p-6 pt-2 shrink-0">
            <button 
              onClick={onClose}
              className="w-full py-4 bg-surface-container font-bold text-on-surface-variant rounded-2xl hover:bg-surface-container-high transition-all active:scale-[0.98]"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileModal;
