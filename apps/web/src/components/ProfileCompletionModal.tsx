import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';
import { useOtpCountdown } from '../hooks/useOtpCountdown';
import { 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  X,
  Loader2
} from 'lucide-react';

interface ProfileCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

const ProfileCompletionModal: React.FC<ProfileCompletionModalProps> = ({ isOpen, onClose, email }) => {
  const { completeGoogleProfile, requestGoogleCompletionOtp, pendingGoogleUser } = useAuth();
  
  const [formData, setFormData] = useState({
    password: '',
    fullName: pendingGoogleUser?.name || '',
    gender: true,
    dataOfBirth: '',
    phone: '',
    otp: ''
  });

  const [dobParts, setDobParts] = useState({ day: '', month: '', year: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { countdown, startCountdown, syncWithServer } = useOtpCountdown(email);

  useEffect(() => {
    if (pendingGoogleUser?.name && !formData.fullName) {
      setFormData(prev => ({ ...prev, fullName: pendingGoogleUser.name }));
    }
  }, [pendingGoogleUser]);

  const validatePhone = (phone: string) => {
    return /^0[0-9]{9}$/.test(phone);
  };

  const handleSendOtp = async () => {
    if (!validatePhone(formData.phone)) {
      Swal.fire('Lỗi', 'Số điện thoại không hợp lệ (Bắt đầu bằng 0, đủ 10 số).', 'error');
      return;
    }

    try {
      setLoading(true);
      await requestGoogleCompletionOtp(email);
      setIsOtpSent(true);
      startCountdown();
      Swal.fire({
        icon: 'success',
        title: 'Đã gửi mã',
        text: 'Vui lòng kiểm tra Gmail của bạn để lấy mã xác thực.',
        timer: 3000,
        showConfirmButton: false
      });
    } catch (err: any) {
      if (err.response?.status === 429 && err.response?.data?.retryAfter) {
        syncWithServer(err.response.data.retryAfter);
      }
      Swal.fire('Lỗi', err.response?.data?.message || 'Không thể gửi OTP.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    const dob = `${dobParts.day}-${dobParts.month}-${dobParts.year}`;
    
    if (!formData.password || !formData.fullName || !formData.otp || !validatePhone(formData.phone)) {
      Swal.fire('Thông báo', 'Vui lòng điền đầy đủ và chính xác thông tin bắt buộc.', 'warning');
      return;
    }

    if (!dobParts.day || !dobParts.month || !dobParts.year) {
      Swal.fire('Thông báo', 'Vui lòng nhập ngày sinh hợp lệ.', 'warning');
      return;
    }

    try {
      setLoading(true);
      await completeGoogleProfile({
        ...formData,
        email,
        dataOfBirth: dob
      });
      Swal.fire({
        icon: 'success',
        title: 'Chào mừng!',
        text: 'Tài khoản của bạn đã được khởi tạo thành công.',
        timer: 2000,
        showConfirmButton: false
      }).then(() => {
        window.location.href = '/chat';
      });
    } catch (err: any) {
      Swal.fire('Lỗi', err.response?.data?.message || 'Hoàn thiện hồ sơ thất bại.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-[450px] rounded-[32px] overflow-hidden shadow-2xl animate-fade-rise flex flex-col h-fit max-h-[90vh]">
        
        <div className="bg-primary p-8 text-white relative">
          <h2 className="text-3xl font-black tracking-tight">Hoàn thiện hồ sơ</h2>
          <p className="text-white/80 font-medium mt-2">Chỉ còn một bước nữa để bắt đầu với ZaloEdu</p>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <ShieldCheck size={64} strokeWidth={1} />
          </div>
        </div>

        <div className="px-8 py-8 overflow-y-auto hide-scrollbar space-y-6">
          
          {/* Email (Readonly) */}
          <div className="space-y-1.5 opacity-60">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Email Google</label>
            <div className="w-full bg-surface-container rounded-2xl px-4 py-3 font-bold text-on-surface">
              {email}
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Họ và tên</label>
            <input 
              className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-bold text-on-surface"
              value={formData.fullName}
              onChange={e => setFormData({...formData, fullName: e.target.value})}
              placeholder="Nhập họ tên đầy đủ"
            />
          </div>

          {/* Password with Eye Icon */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Mật khẩu mới</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-bold text-on-surface pr-12"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                placeholder="Đặt mật khẩu riêng cho ZaloEdu"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Gender */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Giới tính</label>
              <div className="flex bg-surface-container p-1.5 rounded-2xl gap-1">
                <button 
                  onClick={() => setFormData({...formData, gender: true})}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${formData.gender ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:bg-white/50'}`}
                >
                  Nam
                </button>
                <button 
                  onClick={() => setFormData({...formData, gender: false})}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${!formData.gender ? 'bg-white text-primary shadow-sm' : 'text-on-surface-variant hover:bg-white/50'}`}
                >
                  Nữ
                </button>
              </div>
            </div>

            {/* DOB */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Ngày sinh</label>
              <div className="flex gap-1.5">
                <input 
                  type="text" maxLength={2} placeholder="DD"
                  className="w-full bg-surface-container rounded-xl px-2 py-2 text-center font-bold text-sm outline-none focus:bg-white border-2 border-transparent focus:border-primary/20"
                  value={dobParts.day} onChange={e => setDobParts({...dobParts, day: e.target.value.replace(/\D/g, '')})}
                />
                <input 
                  type="text" maxLength={2} placeholder="MM"
                  className="w-full bg-surface-container rounded-xl px-2 py-2 text-center font-bold text-sm outline-none focus:bg-white border-2 border-transparent focus:border-primary/20"
                  value={dobParts.month} onChange={e => setDobParts({...dobParts, month: e.target.value.replace(/\D/g, '')})}
                />
                <input 
                  type="text" maxLength={4} placeholder="YYYY"
                  className="w-full bg-surface-container rounded-xl px-2 py-2 text-center font-bold text-sm outline-none focus:bg-white border-2 border-transparent focus:border-primary/20"
                  value={dobParts.year} onChange={e => setDobParts({...dobParts, year: e.target.value.replace(/\D/g, '')})}
                />
              </div>
            </div>
          </div>

          {/* Mandatory Phone */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Số điện thoại</label>
            <input 
              className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-bold text-on-surface"
              value={formData.phone}
              onChange={e => setFormData({...formData, phone: e.target.value})}
              placeholder="0xxxxxxxxx (Bắt buộc)"
            />
          </div>

          <div className="h-px bg-outline-variant/10"></div>

          {/* OTP Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-3">Gửi mã xác thực về Email</label>
              <button 
                onClick={handleSendOtp}
                disabled={countdown > 0 || loading || !formData.phone}
                className="text-primary font-bold text-sm hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `Gửi lại sau ${countdown}s` : 'Gửi mã'}
              </button>
            </div>
            
            <input 
              className="w-full bg-surface-container rounded-2xl border-2 border-transparent focus:border-primary/20 focus:bg-white px-4 py-3 outline-none transition-all font-black tracking-[0.5em] text-center text-on-surface text-xl"
              value={formData.otp}
              onChange={e => setFormData({...formData, otp: e.target.value.replace(/\D/g, '').slice(0, 6)})}
              placeholder="•••••"
              disabled={!isOtpSent}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-4">
             <button 
              onClick={handleConfirm}
              disabled={loading || !formData.otp}
              className="flex-1 bg-primary text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={20} className="animate-spin" />}
              {loading ? 'Đang hoàn tất...' : 'HOÀN TẤT ĐĂNG KÝ'}
            </button>
          </div>

           <button 
            onClick={onClose}
            className="w-full py-2 text-on-surface-variant text-sm font-bold hover:text-primary transition-colors"
          >
            Hủy và thoát
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileCompletionModal;
