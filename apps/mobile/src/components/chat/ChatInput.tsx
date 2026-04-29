import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard, ScrollView, Image, ActivityIndicator, Platform, Modal, Pressable } from 'react-native';
import { Colors } from '../../constants/Theme';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import Alert from '../../utils/Alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const getFileIcon = (mimeType: string, fileName: string) => {
  const mime = String(mimeType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return "image";
  if (mime.startsWith("video/") || /\.(mp4|mov|avi|wmv)$/i.test(name)) return "movie";
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a)$/i.test(name)) return "audio_file";
  if (mime.includes("pdf") || /\.pdf$/i.test(name)) return "picture_as_pdf";
  if (/\.(zip|rar|7z|tar|gz)$/i.test(name)) return "folder_zip";
  if (/\.(doc|docx)$/i.test(name)) return "description";
  if (/\.(xls|xlsx|csv)$/i.test(name)) return "table_chart";
  return "draft";
};

import StickerPicker from './StickerPicker';

import * as Location from 'expo-location';
import { useChatStore } from '../../store/chatStore';
import { useContacts } from '../../hooks/queries/useContacts';
import { friendEmailOf } from '../../utils/contactUtils';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: any[]) => Promise<void>;
  replyTarget?: any;
  onClearReply?: () => void;
  onTyping?: () => void;
}

export default function ChatInput({ onSendMessage, replyTarget, onClearReply, onTyping }: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendImageAsHD, setSendImageAsHD] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showExtraTools, setShowExtraTools] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactSearchText, setContactSearchText] = useState("");
  const { conversations, userProfiles, currentUserEmail, loadUserProfile } = useChatStore();
  const { data: contactsData } = useContacts();
  const inputRef = useRef<TextInput>(null);

  // Audio Recording State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingTimer = useRef<any>(null);

  const handleTextChange = (t: string) => {
    setText(t);
    if (onTyping) onTyping();
  };

  const handleSend = async () => {
    if (!text.trim() && attachments.length === 0) return;
    const currentText = text;
    const currentAttachments = [...attachments];

    // Clear input immediately for better UX
    setText('');
    setAttachments([]);
    setSendImageAsHD(false);
    setShowStickers(false);
    setShowExtraTools(false);
    if (onTyping) onTyping();
    if (onClearReply) onClearReply();

    setIsUploading(true);
    try {
      await onSendMessage(currentText, currentAttachments);
    } catch (err) {
      console.error("Failed to send message", err);
      Alert.alert("Lỗi", "Không thể gửi tin nhắn.");
    } finally {
      setIsUploading(false);
    }
  };

  const pickImages = async () => {
    Alert.alert(
      "Gửi hình ảnh/video",
      "Chọn nguồn ảnh hoặc video",
      [
        { text: "Chụp ảnh", onPress: takePhoto },
        { text: "Quay video", onPress: recordVideo },
        { text: "Thư viện", onPress: async () => {
          try {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsMultipleSelection: true,
              selectionLimit: 10,
              quality: sendImageAsHD ? 1 : 0.8,
            });

            if (!result.canceled) {
              processFiles(result.assets.map(asset => ({
                uri: asset.uri,
                type: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
                name: asset.fileName || `media_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
                size: asset.fileSize || 1024,
                isHD: sendImageAsHD
              })));
              setShowExtraTools(false);
            }
          } catch (e) {
            Alert.alert("Lỗi", "Không thể truy cập thư viện ảnh");
          }
        }},
        { text: "Hủy", style: "cancel" }
      ]
    );
  };

  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true
      });
      if (!result.canceled) {
        processFiles(result.assets.map(asset => ({
          uri: asset.uri,
          type: asset.mimeType || 'application/octet-stream',
          name: asset.name,
          size: asset.size || 1024,
        })));
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể chọn tệp');
    }
  };

  const processFiles = (newFiles: any[]) => {
    if (attachments.length + newFiles.length > 30) {
      Alert.alert('Quá giới hạn', 'Bạn chỉ được gửi tối đa 30 tệp cùng lúc.');
      return;
    }
    const formatted = newFiles.map(f => ({
      file: f,
      name: f.name,
      mimeType: f.type,
      size: f.size,
      dataUrl: f.uri,
      isHD: f.isHD,
      isSticker: f.isSticker,
    }));
    setAttachments(prev => [...prev, ...formatted]);
  };

  const handleSelectSticker = async (sticker: any) => {
    setShowStickers(false);

    const stickerAttachment = {
      name: `sticker-${Date.now()}.png`,
      mimeType: 'image/sticker',
      size: 1024,
      dataUrl: sticker.url,
      isSticker: true
    };

    try {
      await onSendMessage('[Sticker]', [stickerAttachment]);
    } catch (err) {
      console.error("Failed to send sticker", err);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền camera để chụp ảnh.');

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: sendImageAsHD ? 1 : 0.8,
      });

      if (!result.canceled) {
        processFiles([{
          uri: result.assets[0].uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
          size: result.assets[0].fileSize || 0,
        }]);
        setShowExtraTools(false);
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể khởi động camera');
    }
  };

  const recordVideo = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      const micStatus = await Audio.requestPermissionsAsync();
      if (status !== 'granted' || micStatus.status !== 'granted') {
        return Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền camera và mic để quay video.');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        quality: 1,
      });

      if (!result.canceled) {
        processFiles([{
          uri: result.assets[0].uri,
          type: 'video/mp4',
          name: `video_${Date.now()}.mp4`,
          size: result.assets[0].fileSize || 0,
        }]);
        setShowExtraTools(false);
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể khởi động camera quay video');
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền mic để ghi âm.');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimer.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Lỗi', 'Không thể bắt đầu ghi âm');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setRecording(null);
    if (recordingTimer.current) clearInterval(recordingTimer.current);

    try {
      await recording.stopAndUnloadAsync();
      let uri = recording.getURI();
      if (uri && !uri.startsWith('file://')) {
        uri = `file://${uri}`;
      }
      
      if (uri) {
        setText('[Tin nhắn thoại]'); // Requirement: Set text to [Tin nhắn thoại]
        processFiles([{
          uri,
          type: 'audio/m4a',
          name: `audio_${Date.now()}.m4a`,
          size: 0,
        }]);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setRecording(null);
    if (recordingTimer.current) clearInterval(recordingTimer.current);
    try {
      await recording.stopAndUnloadAsync();
    } catch (err) {}
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleLocationSend = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Quyền bị từ chối', 'Ứng dụng cần quyền vị trí để thực hiện chức năng này.');

      const location = await Location.getCurrentPositionAsync({});
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        label: 'Vị trí hiện tại'
      };

      await onSendMessage(`[Vị trí] ${locationData.label}`, [{
        name: 'location.json',
        mimeType: 'application/location',
        size: 0,
        dataUrl: JSON.stringify(locationData)
      }]);
      setShowExtraTools(false);
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại');
    }
  };

  const handleContactSend = (contact: any) => {
    onSendMessage(`[Danh thiếp] ${contact.fullName || contact.nickname || contact.email}`, [{
      name: 'contact.json',
      mimeType: 'application/contact',
      size: 0,
      dataUrl: JSON.stringify({
        email: contact.email,
        fullName: contact.fullName || contact.nickname || contact.fullname,
        avatarUrl: contact.avatarUrl || contact.urlAvatar
      })
    }]);
    setShowContactPicker(false);
    setShowExtraTools(false);
    setContactSearchText("");
  };

  const friendList = useMemo(() => {
    if (!contactsData?.friendships || !currentUserEmail) return [];
    return contactsData.friendships
      .filter((f: any) => f.status === 'accepted')
      .map((f: any) => {
        const email = friendEmailOf(f, currentUserEmail);
        const profile = userProfiles[email] || { email };
        return {
          ...profile,
          email,
          displayName: f.nickname || profile.fullName || profile.fullname || email,
        };
      });
  }, [contactsData, currentUserEmail, userProfiles]);

  const filteredFriends = useMemo(() => {
    const q = contactSearchText.toLowerCase().trim();
    if (!q) return friendList;
    return friendList.filter((f: any) =>
      f.displayName.toLowerCase().includes(q) ||
      f.email.toLowerCase().includes(q)
    );
  }, [friendList, contactSearchText]);

  useEffect(() => {
    if (showContactPicker && friendList.length > 0) {
      friendList.forEach((f: any) => {
        if (!userProfiles[f.email]?.fullName) {
          loadUserProfile(f.email);
        }
      });
    }
  }, [showContactPicker, friendList, loadUserProfile, userProfiles]);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Reply Preview */}
      {replyTarget && (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewIconWrapper}>
            <Text style={styles.replyPreviewIcon}>reply</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyPreviewTitle}>
              Đang trả lời {replyTarget.senderName || replyTarget.senderId || "tin nhắn"}
            </Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {replyTarget.content || (replyTarget.media?.length ? "[Hình ảnh]" : replyTarget.files?.length ? "[Tệp tin]" : "Tin nhắn")}
            </Text>
          </View>
          <TouchableOpacity style={styles.replyPreviewCloseBtn} onPress={onClearReply}>
            <Text style={styles.replyPreviewCloseIcon}>close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <View style={styles.attachmentStripWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentStrip}>
            {attachments.map((a, i) => {
              const isImage = a.mimeType.startsWith('image/');
              return (
                <View key={i} style={styles.attachmentItem}>
                  {isImage ? (
                    <Image source={{ uri: a.dataUrl }} style={styles.attachmentThumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.attachmentFileBox}>
                      <Text style={styles.attachmentFileIcon}>{getFileIcon(a.mimeType, a.name)}</Text>
                      <Text style={styles.attachmentFileExt}>{a.name.split('.').pop()}</Text>
                    </View>
                  )}
                  {(a.isHD || a.isSticker) && (
                    <View style={styles.aBadgeBg}>
                      <Text style={styles.aBadgeText}>{a.isSticker ? "STK" : "HD"}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.attachmentRemoveBtn} onPress={() => removeAttachment(i)}>
                    <Text style={styles.attachmentRemoveIcon}>close</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Sticker Picker */}
      {showStickers && (
        <StickerPicker onSelect={handleSelectSticker} onClose={() => setShowStickers(false)} />
      )}

      {/* Extra Tools Menu */}
      {showExtraTools && (
        <View style={styles.extraToolsMenu}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.extraToolsScroll}>
            <TouchableOpacity style={styles.toolItem} onPress={startRecording}>
              <View style={[styles.toolIconBox, { backgroundColor: '#fdf2f8' }]}>
                <Text style={[styles.toolIcon, { color: '#db2777' }]}>mic</Text>
              </View>
              <Text style={styles.toolLabel}>Ghi âm</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolItem} onPress={pickImages}>
              <View style={[styles.toolIconBox, { backgroundColor: '#e0f2fe' }]}>
                <Text style={[styles.toolIcon, { color: '#0ea5e9' }]}>image</Text>
              </View>
              <Text style={styles.toolLabel}>Hình ảnh</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolItem} onPress={pickFiles}>
              <View style={[styles.toolIconBox, { backgroundColor: '#f0fdf4' }]}>
                <Text style={[styles.toolIcon, { color: '#22c55e' }]}>folder</Text>
              </View>
              <Text style={styles.toolLabel}>Tệp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolItem} onPress={handleLocationSend}>
              <View style={[styles.toolIconBox, { backgroundColor: '#fff1f2' }]}>
                <Text style={[styles.toolIcon, { color: '#f43f5e' }]}>location_on</Text>
              </View>
              <Text style={styles.toolLabel}>Vị trí</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolItem} onPress={() => setShowContactPicker(true)}>
              <View style={[styles.toolIconBox, { backgroundColor: '#f5f3ff' }]}>
                <Text style={[styles.toolIcon, { color: '#8b5cf6' }]}>contact_page</Text>
              </View>
              <Text style={styles.toolLabel}>Danh thiếp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolItem} onPress={() => setShowExtraTools(false)}>
              <View style={[styles.toolIconBox, { backgroundColor: '#f1f5f9' }]}>
                <Text style={[styles.toolIcon, { color: '#64748b' }]}>close</Text>
              </View>
              <Text style={styles.toolLabel}>Đóng</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Contact Picker Modal */}
      <Modal visible={showContactPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => { setShowContactPicker(false); setContactSearchText(""); }}>
          <View style={styles.contactPickerCard}>
            <Text style={styles.modalTitle}>Gửi danh thiếp</Text>

            <View style={styles.searchBarWrapper}>
              <TextInput
                style={styles.searchBar}
                placeholder="Tìm kiếm bạn bè..."
                value={contactSearchText}
                onChangeText={setContactSearchText}
              />
            </View>

            <ScrollView style={{ maxHeight: 400 }}>
              {filteredFriends.length === 0 ? (
                <Text style={{ textAlign: 'center', marginTop: 20, color: '#64748b' }}>Không tìm thấy bạn bè</Text>
              ) : (
                filteredFriends.map((f: any) => (
                  <TouchableOpacity
                    key={f.email}
                    style={styles.contactItem}
                    onPress={() => handleContactSend(f)}
                  >
                    <Image
                      source={{ uri: f.avatarUrl || f.urlAvatar || 'https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png' }}
                      style={styles.contactAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactName}>{f.displayName}</Text>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>{f.email}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowContactPicker(false); setContactSearchText(""); }}>
              <Text style={styles.cancelBtnText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Main Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.actionTools}>
          <TouchableOpacity
            style={[styles.actionBtn, showExtraTools && { backgroundColor: 'rgba(0,104,255,0.1)' }]}
            onPress={() => {
              setShowExtraTools(!showExtraTools);
              if (showStickers) setShowStickers(false);
            }}
          >
            <Text style={[styles.actionIcon, showExtraTools && { color: Colors.primary }]}>
              {showExtraTools ? 'close' : 'add_circle'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.textInputWrapper}>
          {isRecording ? (
            <View style={styles.recordingOverlay}>
              <View style={styles.recordingPulse} />
              <Text style={styles.recordingTime}>Đang ghi âm: {formatDuration(recordingDuration)}</Text>
              <TouchableOpacity onPress={cancelRecording} style={styles.recordingCancel}>
                <Text style={styles.recordingCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={stopRecording} style={styles.recordingDone}>
                <Text style={styles.recordingDoneText}>Xong</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={handleTextChange}
                placeholder="Nhập tin nhắn..."
                placeholderTextColor="#8a9099"
                style={styles.textInput}
                multiline
                maxLength={2000}
                blurOnSubmit={false}
              />
              <TouchableOpacity style={styles.stickerBtn} onPress={() => setShowStickers(!showStickers)}>
                <Text style={[styles.stickerIcon, showStickers && { color: Colors.primary }]}>mood</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() && attachments.length === 0) ? styles.sendBtnDisabled : null]}
          disabled={!text.trim() && attachments.length === 0 || isUploading}
          onPress={handleSend}
        >
          {isUploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendIcon}>send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,65,143,0.05)',
    padding: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    marginBottom: 8,
    marginHorizontal: 4,
  },
  replyPreviewIconWrapper: {
    marginRight: 8,
  },
  replyPreviewIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: Colors.primary,
  },
  replyPreviewTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  replyPreviewText: {
    fontSize: 13,
    color: '#1f2631',
    fontStyle: 'italic',
  },
  replyPreviewCloseBtn: {
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
  },
  replyPreviewCloseIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 16,
    color: '#5a6781',
  },
  attachmentStripWrapper: {
    marginBottom: 8,
  },
  attachmentStrip: {
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  attachmentItem: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  attachmentThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  attachmentFileBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentFileIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: Colors.primary,
  },
  attachmentFileExt: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5a6781',
    textTransform: 'uppercase',
  },
  aBadgeBg: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#fff',
  },
  attachmentRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  attachmentRemoveIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 12,
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,65,143,0.15)',
  },
  actionTools: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  actionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#7a8391',
  },
  hdBtn: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  hdBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  hdBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#7a8391',
  },
  hdBtnTextActive: {
    color: '#fff',
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    borderRadius: 20,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 40,
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 4,
    fontSize: 14,
    color: '#1f2631',
  },
  recordingOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  recordingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 8,
  },
  recordingTime: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  recordingCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recordingCancelText: {
    color: '#64748b',
    fontWeight: '600',
  },
  recordingDone: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  recordingDoneText: {
    color: '#fff',
    fontWeight: '700',
  },
  stickerBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
    marginBottom: 2,
  },
  stickerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#10b981', // emerald
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: '#e2e8f0',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#fff',
    marginLeft: 4,
  },
  stickerPicker: {
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 16,
  },
  stickerScroll: {
    paddingHorizontal: 12,
    gap: 16,
  },
  stickerOption: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  stickerImg: {
    width: 36,
    height: 36,
  },
  extraToolsMenu: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  extraToolsScroll: {
    paddingHorizontal: 16,
    gap: 20,
  },
  toolItem: {
    alignItems: 'center',
    width: 60,
  },
  toolIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  toolIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
  },
  toolLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contactPickerCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2631',
  },
  cancelBtn: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748b',
  },
  searchBarWrapper: {
    marginBottom: 16,
  },
  searchBar: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2631',
  }
});
