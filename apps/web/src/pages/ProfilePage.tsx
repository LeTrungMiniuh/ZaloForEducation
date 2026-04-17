import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import { Edit3, User, Cake, Phone, MapPin, Mail, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

type ProfileState = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  dataOfBirth: string;
  gender: boolean;
  avatarUrl: string;
  backgroundUrl: string;
};

const COVER_IMAGE = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80';

const emptyProfile = (): ProfileState => ({
  fullName: '',
  email: '',
  phone: '',
  address: '',
  bio: '',
  dataOfBirth: '',
  gender: true,
  avatarUrl: '',
  backgroundUrl: '',
});

const normalizeProfile = (data: any, fallbackEmail = ''): ProfileState => ({
  fullName: data?.fullName || data?.fullname || '',
  email: data?.email || fallbackEmail || '',
  phone: data?.phone || '',
  address: data?.address || '',
  bio: data?.bio || '',
  dataOfBirth: data?.dataOfBirth || '',
  gender: typeof data?.gender === 'boolean' ? data.gender : true,
  avatarUrl: data?.avatarUrl || data?.urlAvatar || '',
  backgroundUrl: data?.backgroundUrl || data?.urlBackground || '',
});

const toDateParts = (value: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { day: '', month: '', year: '' };
  }
  const [year, month, day] = value.split('-');
  return { day, month, year };
};

const buildDate = (day: string, month: string, year: string) => {
  if (!day || !month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const formatBirthDate = (value: string) => {
  const { day, month, year } = toDateParts(value);
  if (!day || !month || !year) return 'Chưa cập nhật';
  return `${Number(day)} tháng ${month}, ${year}`;
};

const ProfilePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();

  const targetEmail = (searchParams.get('email') || '').trim().toLowerCase();
  const currentEmail = (user?.email || '').trim().toLowerCase();
  const isViewingOther = !!targetEmail && targetEmail !== currentEmail;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<ProfileState>(emptyProfile());
  const [draft, setDraft] = useState<ProfileState>(emptyProfile());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        if (isViewingOther) {
          const res = await api.get('/chat/friends/search', { params: { email: targetEmail } });
          if (!res.data?.found || !res.data?.user) {
            setNotFound(true);
            const fallback = normalizeProfile({}, targetEmail);
            setProfile(fallback);
            setDraft(fallback);
            return;
          }

          const nextProfile = normalizeProfile(res.data.user, targetEmail);
          setProfile(nextProfile);
          setDraft(nextProfile);
          return;
        }

        const res = await api.get('/users/profile');
        const nextProfile = normalizeProfile(res.data?.profile || res.data, user?.email || '');
        setProfile(nextProfile);
        setDraft(nextProfile);
      } catch (error) {
        console.error('Load profile error', error);
        const fallback = normalizeProfile({}, isViewingOther ? targetEmail : (user?.email || ''));
        setProfile(fallback);
        setDraft(fallback);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isViewingOther, targetEmail, user?.email]);

  const displayAvatar = profile.avatarUrl || user?.avatarUrl || user?.urlAvatar || '';
  const displayBackground = profile.backgroundUrl || user?.backgroundUrl || user?.urlBackground || COVER_IMAGE;
  const displayName = profile.fullName || user?.fullName || user?.fullname || 'Người dùng';
  const displayInitial = displayName.charAt(0).toUpperCase();
  const dateParts = toDateParts(draft.dataOfBirth);

  const handleStartEdit = () => {
    if (isViewingOther) return;
    setDraft(profile);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(profile);
    setEditing(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isViewingOther) return;

    setSaving(true);
    try {
      const res = await api.put('/users/profile', {
        fullName: draft.fullName,
        phone: draft.phone,
        address: draft.address,
        bio: draft.bio,
        dataOfBirth: draft.dataOfBirth,
        gender: draft.gender,
      });

      const nextProfile = normalizeProfile(res.data?.profile || res.data, user?.email || '');
      setProfile(nextProfile);
      setDraft(nextProfile);
      await refreshUser();

      await Swal.fire({
        icon: 'success',
        title: 'Đã lưu hồ sơ',
        text: 'Thông tin cá nhân đã được cập nhật.',
        timer: 1500,
        showConfirmButton: false,
      });
      setEditing(false);
    } catch (error: any) {
      console.error('Update profile error', error);
      await Swal.fire({
        icon: 'error',
        title: 'Không thể lưu hồ sơ',
        text: error?.response?.data?.message || 'Vui lòng thử lại sau.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isViewingOther) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/users/avatar/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextProfile = normalizeProfile(res.data?.profile || res.data, user?.email || '');
      setProfile((current) => ({ ...current, avatarUrl: nextProfile.avatarUrl }));
      setDraft((current) => ({ ...current, avatarUrl: nextProfile.avatarUrl }));
      await refreshUser();
    } catch (error: any) {
      await Swal.fire({
        icon: 'error',
        title: 'Không thể tải ảnh lên',
        text: error?.response?.data?.message || 'Vui lòng thử lại sau.',
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isViewingOther) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/users/background/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const nextProfile = normalizeProfile(res.data?.profile || res.data, user?.email || '');
      setProfile((current) => ({ ...current, backgroundUrl: nextProfile.backgroundUrl }));
      setDraft((current) => ({ ...current, backgroundUrl: nextProfile.backgroundUrl }));
      await refreshUser();
    } catch (error: any) {
      await Swal.fire({
        icon: 'error',
        title: 'Không thể tải ảnh nền lên',
        text: error?.response?.data?.message || 'Vui lòng thử lại sau.',
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">
      <div className="h-[60px] border-b border-slate-200 px-6 flex items-center justify-between shrink-0 bg-white z-10 sticky top-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/chat" className="w-[38px] h-[38px] rounded-full hover:bg-slate-100 transition-colors inline-flex items-center justify-center text-slate-700">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Trang cá nhân</h1>
        </div>
        {isViewingOther && notFound && <span className="text-sm font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-full">Không tìm thấy</span>}
      </div>

      <div className="flex-1 overflow-y-auto hide-scrollbar bg-white">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={36} className="animate-spin text-primary" />
          </div>
        ) : editing ? (
          <form onSubmit={handleSave} className="w-full max-w-4xl mx-auto py-10 px-6">
            <div className="border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
              <h2 className="text-xl font-bold text-slate-800 mb-6">Cập nhật thông tin</h2>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tên hiển thị</label>
                <input
                  value={draft.fullName}
                  onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  placeholder="Nhập tên hiển thị"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Giới tính</label>
                <div className="flex items-center gap-8">
                  <button type="button" onClick={() => setDraft((current) => ({ ...current, gender: true }))} className="flex items-center gap-3 group">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${draft.gender ? 'border-primary' : 'border-slate-300 group-hover:border-slate-400'}`}>
                      {draft.gender && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="text-base text-slate-700 font-medium">Nam</span>
                  </button>
                  <button type="button" onClick={() => setDraft((current) => ({ ...current, gender: false }))} className="flex items-center gap-3 group">
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${!draft.gender ? 'border-primary' : 'border-slate-300 group-hover:border-slate-400'}`}>
                      {!draft.gender && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="text-base text-slate-700 font-medium">Nữ</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Ngày sinh</label>
                <div className="grid grid-cols-3 gap-4">
                  <input value={dateParts.day} onChange={(event) => setDraft((current) => ({ ...current, dataOfBirth: buildDate(event.target.value.replace(/\D/g, '').slice(0, 2), dateParts.month, dateParts.year) }))} placeholder="Ngày (24)" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  <input value={dateParts.month} onChange={(event) => setDraft((current) => ({ ...current, dataOfBirth: buildDate(dateParts.day, event.target.value.replace(/\D/g, '').slice(0, 2), dateParts.year) }))} placeholder="Tháng (06)" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                  <input value={dateParts.year} onChange={(event) => setDraft((current) => ({ ...current, dataOfBirth: buildDate(dateParts.day, dateParts.month, event.target.value.replace(/\D/g, '').slice(0, 4)) }))} placeholder="Năm (2004)" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Điện thoại</label>
                  <input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Địa chỉ</label>
                  <input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Giới thiệu</label>
                <textarea value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} rows={4} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
              </div>

              <div className="pt-6 flex justify-end gap-3 border-t border-slate-200">
                <button type="button" onClick={handleCancelEdit} className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 transition-colors">Hủy</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-sm font-bold text-white disabled:opacity-70 transition-colors shadow-sm">{saving ? 'Đang lưu' : 'Cập nhật'}</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="w-full pb-16">
            <div className="relative w-full h-[320px] lg:h-[400px]">
              <img src={displayBackground} alt="cover" className="w-full h-full object-cover" />
              {!isViewingOther && (
                <>
                  <button
                    onClick={() => backgroundInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-6 right-6 px-4 py-2.5 rounded-xl bg-black/50 hover:bg-black/70 backdrop-blur-md text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2 transition-all shadow-lg"
                  >
                    <Camera size={16} /> Đổi ảnh bìa
                  </button>
                  <input ref={backgroundInputRef} type="file" accept="image/*" className="hidden" onChange={handleBackgroundUpload} />
                </>
              )}
            </div>

            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <div className="relative flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-16 sm:-mt-20 sm:mb-8 mb-6 sm:gap-6 z-10">
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 w-full sm:w-auto">
                  <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full border-[4px] border-white bg-white shadow-md shrink-0">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt={displayName} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-primary text-white flex items-center justify-center text-5xl font-bold">{displayInitial}</div>
                    )}
                    {!isViewingOther && (
                      <>
                        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors flex items-center justify-center shadow-sm">
                          <Camera size={18} className="text-slate-700" />
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      </>
                    )}
                  </div>

                  <div className="pb-2 text-center sm:text-left flex-1">
                    <h2 className="text-3xl sm:text-4xl leading-tight font-extrabold text-slate-900 tracking-tight">{displayName}</h2>
                    <p className="text-slate-500 font-medium text-base mt-2">{profile.email || targetEmail || user?.email}</p>
                    {notFound && <p className="text-sm text-red-600 mt-2 font-medium bg-red-50 text-center sm:text-left rounded-lg py-1 px-3 inline-block">Không tìm thấy hồ sơ người dùng này.</p>}
                  </div>
                </div>

                {!isViewingOther && (
                  <div className="mt-4 sm:mt-0 pb-2">
                    <button onClick={handleStartEdit} className="w-full sm:w-auto flex items-center justify-center gap-2 text-white bg-primary hover:bg-primary/90 px-6 py-2.5 rounded-xl transition-all text-sm font-bold shadow-sm">
                      <Edit3 size={16} /> Chỉnh sửa
                    </button>
                  </div>
                )}
              </div>

              <div className="w-full pt-4">
                <div className="bg-white border text-left border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                  <h3 className="font-bold text-lg text-slate-800 mb-6 pb-4 border-b border-slate-100">Thông tin cá nhân</h3>
                  
                  <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0"><User size={24} /></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Giới tính</p>
                        <p className="font-bold text-slate-800 text-base">{profile.gender ? 'Nam' : 'Nữ'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0"><Cake size={24} /></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ngày sinh</p>
                        <p className="font-bold text-slate-800 text-base">{profile.dataOfBirth ? formatBirthDate(profile.dataOfBirth) : 'Chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0"><Phone size={24} /></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Điện thoại</p>
                        <p className="font-bold text-slate-800 text-base">{profile.phone || 'Chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0"><MapPin size={24} /></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Địa chỉ</p>
                        <p className="font-bold text-slate-800 text-base">{profile.address || 'Chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4 md:col-span-2">
                      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0"><Mail size={24} /></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Giới thiệu</p>
                        <p className="font-bold text-slate-800 text-base whitespace-pre-wrap">{profile.bio || 'Chưa cập nhật'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                    <span className="material-symbols-outlined text-slate-400">info</span>
                    <p className="text-sm font-medium text-slate-500">Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số này</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
