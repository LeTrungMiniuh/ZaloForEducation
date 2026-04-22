/**
 * ProfileScreen.js
 *
 * Màn hình thông tin cá nhân đã được tích hợp và chuẩn hóa:
 *  - Alert: dùng utils/Alert (không có sweetalert2)
 *  - Avatar: chỉ cho phép upload ảnh qua S3 (expo-image-picker)
 *  - Icons: Material Symbols Outlined đã được load trong App.js
 *  - Date: đọc/ghi theo DD-MM-YYYY (khớp với backend)
 *  - DynamoDB: chỉ dùng avatarUrl, fullName (không dùng urlAvatar, fullname)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows, Typography } from '../../constants/Theme';
import Alert from '../../utils/Alert';
import { useAuth } from '../../context/AuthContext';
import { toDateParts, formatDisplayDate } from '../../utils/date';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const COVER_URL =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80';

const EMPTY_PROFILE = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  bio: '',
  dataOfBirth: '',   // DD-MM-YYYY
  gender: true,
  avatarUrl: '',
  backgroundUrl: '',
};

// helpers removed - now using src/utils/date.js

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProfileScreen({ onNavigate, onLogout, goBack }) {
  const { user: authUser, updateUser, profileVersion } = useAuth();
  
  const [profile, setProfile]   = useState(() => ({
    ...EMPTY_PROFILE,
    ...(authUser || {}),
  }));
  const [draft,   setDraft]     = useState(() => ({
    ...EMPTY_PROFILE,
    ...(authUser || {}),
  }));
  
  const [loading, setLoading]   = useState(!authUser);
  const [saving,  setSaving]    = useState(false);
  const [editing, setEditing]   = useState(false);
  const [uploading, setUploading] = useState(false);

  const authHeaders = async () => {
    const token = await AsyncStorage.getItem('token');
    return token
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  };

  // ── Normalize: chỉ dùng fullName và avatarUrl ────────────────────────────────

  const normalizeProfile = (source = {}) => ({
    ...EMPTY_PROFILE,
    ...source,
    fullName:  source.fullName  || '',
    avatarUrl:      source.avatarUrl || '',
    backgroundUrl:  source.backgroundUrl || '',
    gender:         typeof source.gender === 'boolean' ? source.gender : true,
  });

  // ── Persist user vào AsyncStorage ───────────────────────────────────────────

  const persistUser = async (nextProfile) => {
    const savedUser    = await AsyncStorage.getItem('user');
    const currentUser  = savedUser ? JSON.parse(savedUser) : {};
    const mergedUser   = {
      ...currentUser,
      ...nextProfile,
      fullName:  nextProfile.fullName  || currentUser.fullName  || '',
      avatarUrl:     nextProfile.avatarUrl     || currentUser.avatarUrl     || '',
      backgroundUrl: nextProfile.backgroundUrl || currentUser.backgroundUrl || '',
    };
    await AsyncStorage.setItem('user', JSON.stringify(mergedUser));
  };

  // ── Load profile ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Since we initialize from authUser prop, we can skip storage read here
        // and just fetch the latest from API
        const response = await fetch(`${API_URL}/users/profile`, {
          headers: await authHeaders(),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Không thể tải hồ sơ.');

        const apiProfile = normalizeProfile(data.profile || data);
        setProfile(apiProfile);
        setDraft(apiProfile);
        await persistUser(apiProfile);
      } catch (error) {
        console.error('[ProfileScreen] Load profile error', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  // Sync local profile when context user (e.g. from socket) updates
  useEffect(() => {
    if (authUser) {
      setProfile(prev => ({ ...prev, ...authUser }));
    }
  }, [authUser]);

  const tokenLookup = async () => {
    return await AsyncStorage.getItem('token');
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────────

  const handleChange = (field, value) =>
    setDraft((cur) => ({ ...cur, [field]: value }));

  const startEditing  = () => { 
    const dateParts = toDateParts(profile.dataOfBirth);
    setDraft({
      ...profile,
      dayInput: dateParts.day || '',
      monthInput: dateParts.month || '',
      yearInput: dateParts.year || ''
    }); 
    setEditing(true);  
  };
  const cancelEditing = () => { setDraft(profile); setEditing(false); };

  // ── Upload avatar qua S3 (expo-image-picker) ──────────────────────────────────

  const handlePickAvatar = async () => {
    try {
      // Lazy-import để không crash nếu thư viện không được cài
      const ImagePicker = await import('expo-image-picker');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Quyền truy cập', 'Ứng dụng cần quyền truy cập thư viện ảnh.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setUploading(true);

      console.log('[ProfileScreen] Asset for upload:', asset);

      // Tạo FormData để upload
      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        // Trên WEB: Cần chuyển URI thành Blob/File thật
        console.log('[ProfileScreen] Web detected, fetching blob...');
        const fetchRes = await fetch(asset.uri);
        const blob = await fetchRes.blob();
        formData.append('file', blob, asset.fileName || `avatar_${Date.now()}.jpg`);
      } else {
        // Trên NATIVE (Android/iOS): Dùng object { uri, name, type }
        const fileToUpload = {
          uri: Platform.OS === 'android' ? asset.uri : asset.uri.replace('file://', ''),
          name: asset.fileName || `avatar_${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        };
        console.log('[ProfileScreen] Native detected, appending file object:', fileToUpload);
        formData.append('file', fileToUpload);
      }

      const token = await AsyncStorage.getItem('token');
      const uploadResponse = await fetch(`${API_URL}/users/avatar/upload`, {
        method:  'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Accept': 'application/json',
        },
        body:    formData,
      });

      console.log('[ProfileScreen] Server Response Status:', uploadResponse.status);

      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) {
        console.error('[ProfileScreen] Upload failed data:', uploadData);
        throw new Error(uploadData.message || 'Không thể upload ảnh đại diện.');
      }

      const newAvatarUrl = uploadData.profile?.avatarUrl || '';
      const updated = normalizeProfile({ ...profile, avatarUrl: newAvatarUrl });
      setProfile(updated);
      setDraft(updated);
      
      // Update global context
      if (updateUser) await updateUser(updated);
      
      await persistUser(updated);

      Alert.alert('Thành công', 'Ảnh đại diện đã được cập nhật.');
    } catch (error) {
      console.error('[ProfileScreen] Upload avatar error', error);
      Alert.alert('Lỗi', error.message || 'Không thể upload ảnh đại diện.');
    } finally {
      setUploading(false);
    }
  };

  // ── Save profile ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const headers = await authHeaders();
      
      // ⚡ CHUẨN HÓA MẠNH MẼ: Đảm bảo có đủ 3 phần và đệm số 0 theo chuẩn DD/MM/YYYY
      const dd = String(draft.dayInput || '').padStart(2, '0');
      const mm = String(draft.monthInput || '').padStart(2, '0');
      const yyyy = String(draft.yearInput || '');

      // Gom lại thành chuỗi DD-MM-YYYY để gửi lên backend
      const nextBirthDate = (dd.length === 2 && mm.length === 2 && yyyy.length === 4 && dd !== '00' && mm !== '00') 
        ? `${dd}-${mm}-${yyyy}` 
        : profile.dataOfBirth;

      const profileResponse = await fetch(`${API_URL}/users/profile`, {
        method:  'PUT',
        headers,
        body: JSON.stringify({
          fullName:    draft.fullName,
          phone:       draft.phone,
          address:     draft.address,
          bio:         draft.bio,
          dataOfBirth: nextBirthDate,
          gender:      draft.gender,
        }),
      });

      const profileData = await profileResponse.json();
      if (!profileResponse.ok) {
        throw new Error(profileData.message || 'Không thể lưu hồ sơ.');
      }

      const normalizedNext = normalizeProfile({
        ...(profileData.profile || profileData),
        dataOfBirth: nextBirthDate, // Đảm bảo UI cập nhật đúng ngày vừa lưu
      });
      const finalProfile = { ...draft, ...normalizedNext };

      setProfile(finalProfile);
      setDraft(finalProfile);
      setEditing(false);
      
      // Sync globally via Context (triggers sockets)
      if (updateUser) await updateUser(finalProfile);

      await persistUser(finalProfile);
      Alert.alert('Thành công', 'Hồ sơ đã được cập nhật.');
    } catch (error) {
      console.error('[ProfileScreen] Save profile error', error);
      Alert.alert('Lỗi', error.message || 'Không thể lưu hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────────

  const displayName = profile.fullName || 'Người dùng';
  const avatarUrl   = profile.avatarUrl
    ? `${profile.avatarUrl}?v=${profileVersion}`
    : '';
  const parts       = toDateParts(draft.dataOfBirth);
  const dayValue    = draft.dayInput   !== undefined ? draft.dayInput   : parts.day;
  const monthValue  = draft.monthInput !== undefined ? draft.monthInput : parts.month;
  const yearValue   = draft.yearInput  !== undefined ? draft.yearInput  : parts.year;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Đang tải hồ sơ...</Text>
            </View>

          ) : editing ? (
            /* ─── EDIT MODE ─── */
            <View style={styles.sheetWrap}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity style={styles.headerIconButton} onPress={cancelEditing}>
                  <Text style={styles.headerIcon}>arrow_back</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>Cập nhật thông tin cá nhân</Text>
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={cancelEditing}
                >
                  <Text style={styles.headerIcon}>close</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.editBody}>
                <Text style={styles.fieldLabel}>Tên hiển thị</Text>
                <TextInput
                  style={styles.editInput}
                  value={draft.fullName}
                  onChangeText={(v) => handleChange('fullName', v)}
                  placeholder="Nhập tên hiển thị"
                  placeholderTextColor={Colors.outline}
                />

                <Text style={styles.sectionHeading}>Thông tin cá nhân</Text>

                {/* Giới tính */}
                <View style={styles.genderRowEdit}>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => handleChange('gender', true)}
                  >
                    <View style={[styles.radioOuter, draft.gender && styles.radioOuterActive]}>
                      {draft.gender && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.radioText}>Nam</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => handleChange('gender', false)}
                  >
                    <View style={[styles.radioOuter, !draft.gender && styles.radioOuterActive]}>
                      {!draft.gender && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.radioText}>Nữ</Text>
                  </TouchableOpacity>
                </View>

                {/* Ngày sinh — DD / MM / YYYY */}
                <Text style={styles.fieldLabel}>Ngày sinh (DD / MM / YYYY)</Text>
                <View style={styles.birthRow}>
                  <TextInput
                    style={styles.birthInput}
                    value={dayValue}
                    onChangeText={(v) =>
                      handleChange('dayInput', v.replace(/[^0-9]/g, '').slice(0, 2))
                    }
                    placeholder="24"
                    placeholderTextColor={Colors.outline}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.birthInput}
                    value={monthValue}
                    onChangeText={(v) =>
                      handleChange('monthInput', v.replace(/[^0-9]/g, '').slice(0, 2))
                    }
                    placeholder="06"
                    placeholderTextColor={Colors.outline}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={styles.birthInput}
                    value={yearValue}
                    onChangeText={(v) =>
                      handleChange('yearInput', v.replace(/[^0-9]/g, '').slice(0, 4))
                    }
                    placeholder="2004"
                    placeholderTextColor={Colors.outline}
                    keyboardType="number-pad"
                  />
                </View>

                {/* Số điện thoại */}
                <Text style={styles.fieldLabel}>Số điện thoại</Text>
                <TextInput
                  style={styles.editInput}
                  value={draft.phone}
                  onChangeText={(v) => handleChange('phone', v)}
                  placeholder="Nhập số điện thoại"
                  placeholderTextColor={Colors.outline}
                  keyboardType="phone-pad"
                />

                {/* Địa chỉ */}
                <Text style={styles.fieldLabel}>Địa chỉ</Text>
                <TextInput
                  style={styles.editInput}
                  value={draft.address}
                  onChangeText={(v) => handleChange('address', v)}
                  placeholder="Nhập địa chỉ"
                  placeholderTextColor={Colors.outline}
                />

                {/* Bio */}
                <Text style={styles.fieldLabel}>Giới thiệu bản thân</Text>
                <TextInput
                  style={[styles.editInput, styles.bioInput]}
                  value={draft.bio}
                  onChangeText={(v) => handleChange('bio', v)}
                  placeholder="Viết gì đó về bạn..."
                  placeholderTextColor={Colors.outline}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.bottomActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={cancelEditing}>
                  <Text style={styles.cancelText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.updateButton, saving && styles.updateButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.updateText}>{saving ? 'Đang lưu...' : 'Cập nhật'}</Text>
                </TouchableOpacity>
              </View>
            </View>

          ) : (
            /* ─── VIEW MODE ─── */
            <View style={styles.sheetWrap}>
              <View style={styles.sheetHeader}>
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => goBack ? goBack() : onNavigate('home', 'profile')}
                >
                  <Text style={styles.headerIcon}>arrow_back</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>Thông tin tài khoản</Text>
                <TouchableOpacity
                  style={styles.headerIconButton}
                  onPress={() => goBack ? goBack() : onNavigate('home', 'profile')}
                >
                  <Text style={styles.headerIcon}>close</Text>
                </TouchableOpacity>
              </View>

              {/* Cover */}
              <Image 
                source={{ uri: profile.backgroundUrl || COVER_URL }} 
                style={styles.coverImage} 
              />

              {/* Avatar + tên */}
              <View style={styles.profileBlock}>
                <View style={styles.avatarWrapperLarge}>
                  {avatarUrl ? (
                    <Image 
                      key={`avatar-${profileVersion}`}
                      source={{ uri: avatarUrl, cache: 'reload' }} 
                      style={styles.avatarLarge} 
                    />
                  ) : (
                    <View style={styles.avatarFallbackLarge}>
                      <Text style={styles.avatarInitial}>
                        {displayName ? displayName[0].toUpperCase() : 'U'}
                      </Text>
                    </View>
                  )}

                  {/* Nút camera — mở picker để upload qua S3 */}
                  <TouchableOpacity
                    style={styles.cameraButton}
                    onPress={handlePickAvatar}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.cameraIcon}>photo_camera</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.nameRow}>
                  <Text style={styles.nameTitle}>{displayName}</Text>
                  <TouchableOpacity onPress={startEditing}>
                    <Text style={styles.editIcon}>edit</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Thông tin cá nhân */}
              <View style={styles.infoSection}>
                <Text style={styles.infoTitle}>Thông tin cá nhân</Text>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Giới tính</Text>
                  <Text style={styles.infoValue}>{profile.gender ? 'Nam' : 'Nữ'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Ngày sinh</Text>
                  <Text style={styles.infoValue}>{formatDisplayDate(profile.dataOfBirth)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Điện thoại</Text>
                  <Text style={styles.infoValue}>{profile.phone || 'Chưa cập nhật'}</Text>
                </View>
                {!!profile.address && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Địa chỉ</Text>
                    <Text style={styles.infoValue}>{profile.address}</Text>
                  </View>
                )}
                {!!profile.bio && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Giới thiệu</Text>
                    <Text style={styles.infoValue}>{profile.bio}</Text>
                  </View>
                )}

                <Text style={styles.privacyNote}>
                  Chỉ bạn bè có lưu số của bạn trong danh bạ máy xem được số này
                </Text>

                <TouchableOpacity style={styles.updateInlineButton} onPress={startEditing}>
                  <Text style={styles.updateInlineIcon}>edit</Text>
                  <Text style={styles.updateInlineText}>Cập nhật thông tin</Text>
                </TouchableOpacity>
              </View>

              {/* Quick actions */}
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => onNavigate && onNavigate('profile-more')}
                >
                  <Text style={styles.quickActionIcon}>more_horiz</Text>
                  <Text style={styles.quickActionText}>Thêm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => onNavigate && onNavigate('settings')}
                >
                  <Text style={styles.quickActionIcon}>settings</Text>
                  <Text style={styles.quickActionText}>Cài đặt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => onNavigate && onNavigate('sessions')}
                >
                  <Text style={styles.quickActionIcon}>devices</Text>
                  <Text style={styles.quickActionText}>Thiết bị</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionButton} onPress={onLogout}>
                  <Text style={styles.quickActionIcon}>logout</Text>
                  <Text style={styles.quickActionText}>Đăng xuất</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: '#e7eaef' },
  flex:        { flex: 1 },
  scrollContent: { padding: 6, paddingBottom: 18 },

  loadingBox: {
    minHeight: 500,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { ...Typography.body, fontSize: 15, color: Colors.onSurfaceVariant },

  sheetWrap: {
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d7dbe3',
    ...Shadows.soft,
  },
  sheetHeader: {
    minHeight: 58,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#d9dde4',
    backgroundColor: '#fff',
  },
  sheetTitle: {
    ...Typography.heading,
    color: '#1e2f4d',
    fontSize: 18,
    flex: 1,
    marginLeft: 6,
  },
  headerIconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 26, color: '#1e2f4d' },

  coverImage:   { width: '100%', height: 210, backgroundColor: '#d9dde4' },
  profileBlock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 8,
    borderBottomColor: '#eef1f5',
  },
  avatarWrapperLarge: {
    marginTop: -54,
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  avatarLarge:         { width: '100%', height: '100%', borderRadius: 52 },
  avatarFallbackLarge: {
    width: '100%',
    height: '100%',
    borderRadius: 52,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 38, color: '#fff', fontWeight: '800' },
  cameraButton: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#eef1f6',
    borderWidth: 1,
    borderColor: '#c9d0da',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 19, color: '#1e2f4d' },
  nameRow:    { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameTitle:  { ...Typography.heading, color: '#1e2f4d', fontSize: 19, flex: 1 },
  editIcon:   { fontFamily: 'Material Symbols Outlined', fontSize: 23, color: '#1e2f4d' },

  infoSection: { padding: 16 },
  infoTitle:   { ...Typography.heading, color: '#1e2f4d', fontSize: 17, marginBottom: 16 },
  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  infoLabel:   { ...Typography.body, color: '#60708a', fontSize: 15, width: 100 },
  infoValue:   { ...Typography.body, color: '#1e2f4d', fontSize: 15, flex: 1 },
  privacyNote: {
    ...Typography.body,
    color: '#5f6f88',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 14,
  },
  updateInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e1e5ec',
    paddingTop: 14,
  },
  updateInlineIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 22, color: '#1e2f4d' },
  updateInlineText: { ...Typography.heading, fontSize: 17, color: '#1e2f4d' },

  quickActions: { paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', gap: 10 },
  quickActionButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#eef2f8',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  quickActionIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: '#1e2f4d' },
  quickActionText: { ...Typography.label, fontSize: 14, color: '#1e2f4d' },

  // Edit form
  editBody:     { padding: 16, backgroundColor: '#fff' },
  fieldLabel:   { ...Typography.body, fontSize: 15, color: '#1e2f4d', marginBottom: 8 },
  editInput: {
    borderWidth: 1,
    borderColor: '#d3d9e2',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    ...Typography.body,
    fontSize: 15,
    color: '#1e2f4d',
    backgroundColor: '#fff',
  },
  bioInput:     { minHeight: 80, textAlignVertical: 'top' },
  sectionHeading: {
    ...Typography.heading,
    color: '#1e2f4d',
    fontSize: 17,
    marginTop: 8,
    marginBottom: 10,
  },
  genderRowEdit: { flexDirection: 'row', alignItems: 'center', gap: 24, marginBottom: 14 },
  radioOption:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radioOuter: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#a8b2c2',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#0b72ff' },
  radioInner:       { width: 12, height: 12, borderRadius: 6, backgroundColor: '#0b72ff' },
  radioText:        { ...Typography.body, fontSize: 15, color: '#1e2f4d' },
  birthRow:         { flexDirection: 'row', gap: 10, marginBottom: 14 },
  birthInput: {
    flex: 1,
    borderWidth: 1, borderColor: '#d3d9e2', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    ...Typography.body, fontSize: 15, color: '#1e2f4d',
    backgroundColor: '#fff', textAlign: 'center',
  },
  bottomActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
    borderTopWidth: 1, borderTopColor: '#d9dde4',
    backgroundColor: '#f3f4f6', padding: 12,
  },
  cancelButton:        { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8, backgroundColor: '#dee2e8' },
  cancelText:          { ...Typography.heading, fontSize: 16, color: '#1e2f4d' },
  updateButton:        { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8, backgroundColor: Colors.primary },
  updateButtonDisabled: { opacity: 0.7 },
  updateText:          { ...Typography.heading, fontSize: 16, color: '#fff' },
});
