import React, { useState, useRef } from 'react';
import { View, TextInput, TouchableOpacity, Text, Keyboard, ScrollView, Image, ActivityIndicator, Platform, StyleSheet, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Alert from '../../utils/Alert';
import GifPicker from './GifPicker';

const getFileIcon = (mimeType, fileName) => {
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

const FLUENT_EMOJI_MAP = {
    '❤️': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Red%20Heart/3D/red_heart_3d.png',
    '👍': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Thumbs%20Up/3D/thumbs_up_3d.png',
    '😄': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png',
    '😮': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png',
    '😭': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png',
    '😡': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Enraged%20Face/3D/enraged_face_3d.png',
    '😂': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Face%20with%20Tears%20of%20Joy/3D/face_with_tears_of_joy_3d.png',
};

export default function ChatInput({ onSendMessage, replyTarget, onClearReply, onTyping, onShareLocation, onShareContact, onStartLiveLocation, onStopLiveLocation, isLiveSharing, onStartRecording, isRecording, recordingSeconds, onStopRecording }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendImageAsHD, setSendImageAsHD] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [pickerTab, setPickerTab] = useState('stickers'); 
  const inputRef = useRef(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleTextChange = (t) => {
    setText(t);
    if (showMoreMenu) setShowMoreMenu(false);
    if (onTyping) onTyping();
  };

  const handleSend = async () => {
    if (!text.trim() && attachments.length === 0) return;
    const currentText = text;
    const currentAttachments = [...attachments];
    setText('');
    setAttachments([]);
    await onSendMessage(currentText, currentAttachments);
  };

  const pickImages = async () => {
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
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh');
    }
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

  const processFiles = (newFiles) => {
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
    }));
    setAttachments(prev => [...prev, ...formatted]);
  };

  const handleSelectSticker = (emoji) => {
      const url = FLUENT_EMOJI_MAP[emoji];
      if (!url) return;
      const stickerFile = {
          name: `sticker-${Date.now()}.png`,
          mimeType: 'image/sticker',
          size: 1024,
          dataUrl: url,
          uri: url,
          isSticker: true
      };
      
      onSendMessage("", [stickerFile]);
      setShowStickers(false);
  };

  const handleSelectGif = (url) => {
    if (!url) return;
    const gifFile = { name: `gif-${Date.now()}.gif`, mimeType: 'image/gif', size: 1024, dataUrl: url, uri: url };
    onSendMessage("", [gifFile]);
    setShowStickers(false);
  }

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <View style={styles.composerContainer}>
      {/* Reply bar */}
      {replyTarget && (
        <View style={styles.replyBar}>
          <View style={styles.replyBarLeft}>
            <Text style={styles.replyBarIcon}>reply</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBarTitle}>Đang trả lời {replyTarget.senderId}</Text>
            <Text style={styles.replyBarContent} numberOfLines={1}>{replyTarget.content || "Đính kèm"}</Text>
          </View>
          <TouchableOpacity style={styles.replyBarClose} onPress={onClearReply}>
            <Text style={styles.replyBarCloseIcon}>close</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Attachment strip */}
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachStrip} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {attachments.map((a, i) => (
            <View key={i} style={styles.attachChip}>
              <Text style={styles.attachChipIcon}>{getFileIcon(a.mimeType, a.name)}</Text>
              <Text style={styles.attachChipName} numberOfLines={1}>{a.name}</Text>
              <TouchableOpacity onPress={() => removeAttachment(i)}>
                <Text style={styles.attachChipClose}>close</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Sticker/GIF picker panel */}
      {showStickers && (
        <View style={styles.stickerPanel}>
          <View style={styles.stickerTabs}>
            <TouchableOpacity 
              style={[styles.stickerTab, pickerTab === 'stickers' && styles.stickerTabActive]}
              onPress={() => setPickerTab('stickers')}
            >
              <Text style={[styles.stickerTabIcon, pickerTab === 'stickers' && styles.stickerTabIconActive]}>mood</Text>
              <Text style={[styles.stickerTabText, pickerTab === 'stickers' && styles.stickerTabTextActive]}>Sticker</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.stickerTab, pickerTab === 'gifs' && styles.stickerTabActive]}
              onPress={() => setPickerTab('gifs')}
            >
              <Text style={[styles.stickerTabIcon, pickerTab === 'gifs' && styles.stickerTabIconActive]}>gif_box</Text>
              <Text style={[styles.stickerTabText, pickerTab === 'gifs' && styles.stickerTabTextActive]}>Meme</Text>
            </TouchableOpacity>
          </View>

          {pickerTab === 'stickers' ? (
            <View style={{ flex: 1 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 12 }}>
                {Object.keys(FLUENT_EMOJI_MAP).map(emoji => (
                  <TouchableOpacity key={emoji} style={styles.stickerItem} onPress={() => handleSelectSticker(emoji)}>
                    <Image source={{ uri: FLUENT_EMOJI_MAP[emoji] }} style={styles.stickerImage} resizeMode="contain" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <GifPicker onSelect={handleSelectGif} />
          )}
        </View>
      )}

      {/* ── Zalo-style bottom input bar ── */}
      {/* Layout: 😊 | [Message] | ••• | 🎤 | 📷/Send */}
      <View style={styles.inputRow}>
        {/* Sticker/Emoji button */}
        <TouchableOpacity 
          style={styles.inputAction}
          onPress={() => { setShowStickers(!showStickers); setShowMoreMenu(false); }}
        >
          <Text style={[styles.inputActionIcon, showStickers && { color: '#0068e0' }]}>emoji_emotions</Text>
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          ref={inputRef}
          multiline
          placeholder="Message"
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={handleTextChange}
          style={styles.textInput}
          maxLength={2000}
          blurOnSubmit={false}
        />

        {/* ••• More menu */}
        <TouchableOpacity 
          style={styles.inputAction}
          onPress={() => { setShowMoreMenu(!showMoreMenu); setShowStickers(false); }}
        >
          <Text style={[styles.inputActionIcon, showMoreMenu && { color: '#0068e0' }]}>more_horiz</Text>
        </TouchableOpacity>

        {/* Mic / Recording */}
        {isRecording ? (
          <View style={styles.recordingInline}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTimer}>
              {Math.floor((recordingSeconds || 0) / 60).toString().padStart(2,'0')}:{((recordingSeconds || 0) % 60).toString().padStart(2,'0')}
            </Text>
            <TouchableOpacity onPress={onStopRecording} style={styles.recordingStopBtn}>
              <Text style={styles.recordingStopIcon}>stop_circle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.inputAction}
            onPress={onStartRecording}
          >
            <Text style={styles.inputActionIcon}>mic</Text>
          </TouchableOpacity>
        )}

        {/* Send or Image picker */}
        {hasContent ? (
          <TouchableOpacity 
            style={[styles.sendButton, isUploading && { opacity: 0.6 }]}
            disabled={isUploading}
            onPress={handleSend}
          >
            {isUploading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>send</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={styles.inputAction}
            onPress={pickImages}
          >
            <Text style={styles.inputActionIcon}>image</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Zalo-style ••• grid menu ── */}
      {showMoreMenu && (
        <View style={styles.moreMenuGrid}>
          {/* Row 1 */}
          <View style={styles.moreMenuRow}>
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); onShareLocation && onShareLocation(); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#ef4444' }]}>
                <Text style={styles.moreMenuIcon}>location_on</Text>
              </View>
              <Text style={styles.moreMenuLabel}>Location</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); pickFiles(); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#f59e0b' }]}>
                <Text style={styles.moreMenuIcon}>description</Text>
              </View>
              <Text style={styles.moreMenuLabel}>Document</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); onShareContact && onShareContact(); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#10b981' }]}>
                <Text style={styles.moreMenuIcon}>contact_page</Text>
              </View>
              <Text style={styles.moreMenuLabel}>Name card</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); setShowStickers(true); setPickerTab('gifs'); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#3b82f6' }]}>
                <Text style={styles.moreMenuIcon}>gif_box</Text>
              </View>
              <Text style={styles.moreMenuLabel}>@GIF</Text>
            </TouchableOpacity>
          </View>

          {/* Row 2 */}
          <View style={styles.moreMenuRow}>
            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); onStartLiveLocation && onStartLiveLocation(); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#8b5cf6' }]}>
                <Text style={styles.moreMenuIcon}>share_location</Text>
              </View>
              <Text style={styles.moreMenuLabel}>Live Loc.</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreMenuItem} onPress={() => setSendImageAsHD(!sendImageAsHD)}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: sendImageAsHD ? '#0058bc' : '#64748b' }]}>
                <Text style={[styles.moreMenuIcon, { fontSize: 18, fontWeight: 'bold', fontFamily: undefined }]}>HD</Text>
              </View>
              <Text style={styles.moreMenuLabel}>{sendImageAsHD ? 'HD On' : 'HD Off'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); setShowStickers(true); setPickerTab('stickers'); }}>
              <View style={[styles.moreMenuIconCircle, { backgroundColor: '#ec4899' }]}>
                <Text style={styles.moreMenuIcon}>emoji_emotions</Text>
              </View>
              <Text style={styles.moreMenuLabel}>Sticker</Text>
            </TouchableOpacity>

            {isLiveSharing && (
              <TouchableOpacity style={styles.moreMenuItem} onPress={() => { setShowMoreMenu(false); onStopLiveLocation && onStopLiveLocation(); }}>
                <View style={[styles.moreMenuIconCircle, { backgroundColor: '#e53935' }]}>
                  <Text style={styles.moreMenuIcon}>stop_circle</Text>
                </View>
                <Text style={[styles.moreMenuLabel, { color: '#e53935' }]}>Stop Live</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  composerContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
  },

  // ── Reply Bar ─────────────────────────────────────────────────
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0058bc',
    marginHorizontal: 8,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  replyBarLeft: {},
  replyBarIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: '#0058bc' },
  replyBarTitle: { fontSize: 10, fontWeight: '800', color: '#0058bc', textTransform: 'uppercase' },
  replyBarContent: { fontSize: 13, color: '#475569', fontStyle: 'italic' },
  replyBarClose: { padding: 2 },
  replyBarCloseIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 18, color: '#94a3b8' },

  // ── Attachment Strip ──────────────────────────────────────────
  attachStrip: { maxHeight: 44, paddingVertical: 6 },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attachChipIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 16, color: '#64748b' },
  attachChipName: { fontSize: 12, color: '#334155', maxWidth: 100 },
  attachChipClose: { fontFamily: 'Material Symbols Outlined', fontSize: 16, color: '#94a3b8' },

  // ── Sticker Panel ─────────────────────────────────────────────
  stickerPanel: {
    height: 180,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingVertical: 8,
  },
  stickerTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 8,
    gap: 16,
  },
  stickerTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
  },
  stickerTabActive: { backgroundColor: 'rgba(0,88,188,0.1)' },
  stickerTabIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: '#94a3b8' },
  stickerTabIconActive: { color: '#0058bc' },
  stickerTabText: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  stickerTabTextActive: { color: '#0058bc' },
  stickerItem: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  stickerImage: { width: 50, height: 50 },

  // ── Main Input Row (Zalo-style) ───────────────────────────────
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 14 : 6,
    gap: 2,
  },
  inputAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputActionIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 26,
    color: '#6b7280',
  },
  textInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 36,
    fontSize: 16,
    color: '#1f2937',
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },

  // ── Send Button ───────────────────────────────────────────────
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0068e0',
  },
  sendButtonText: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: '#fff',
  },

  // ── Recording Inline ─────────────────────────────────────────
  recordingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recordingTimer: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
    minWidth: 34,
  },
  recordingStopBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingStopIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#ef4444',
  },

  // ── More Menu Grid (Zalo-style) ──────────────────────────────
  moreMenuGrid: {
    backgroundColor: '#f8fafc',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5eaf2',
  },
  moreMenuRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  moreMenuItem: {
    width: '25%',
    alignItems: 'center',
    gap: 6,
  },
  moreMenuIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreMenuIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 26,
    color: '#fff',
  },
  moreMenuLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
  },
});
