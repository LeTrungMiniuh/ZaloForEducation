import React, { useRef, useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Keyboard, ScrollView, Image, ActivityIndicator, Platform } from 'react-native';
import { Colors } from '../../constants/Theme';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Alert from '../../utils/Alert';
import { apiRequest } from '../../utils/api';

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
    '❤️': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20Heart/3D/red_heart_3d.png',
    '👍': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Thumbs%20Up/3D/thumbs_up_3d.png',
    '😄': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png',
    '😮': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png',
    '😭': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png',
    '😡': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Enraged%20Face/3D/enraged_face_3d.png',
};

export default function ChatInput({ onSendMessage, replyTarget, onClearReply, onTyping }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendImageAsHD, setSendImageAsHD] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const inputRef = useRef(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // TODO: typing timeout logic inside here
  const handleTextChange = (t) => {
    setText(t);
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
          uri: url,
          isSticker: true
      };
      
      processFiles([stickerFile]);
      setShowStickers(false);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <View style={styles.container}>
      {/* Reply Preview */}
      {replyTarget && (
        <View style={styles.replyPreview}>
          <View style={styles.replyPreviewIconWrapper}>
            <Text style={styles.replyPreviewIcon}>reply</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyPreviewTitle}>Đang trả lời {replyTarget.senderId}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>{replyTarget.content || "Đính kèm"}</Text>
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
          <View style={styles.stickerPicker}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stickerScroll}>
                  {Object.keys(FLUENT_EMOJI_MAP).map(emoji => (
                      <TouchableOpacity key={emoji} style={styles.stickerOption} onPress={() => handleSelectSticker(emoji)}>
                          <Image source={{ uri: FLUENT_EMOJI_MAP[emoji].replace(/ /g, '%20') }} style={styles.stickerImg} />
                      </TouchableOpacity>
                  ))}
              </ScrollView>
          </View>
      )}

      {/* Main Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.actionTools}>
          <TouchableOpacity style={styles.actionBtn} onPress={pickImages}>
            <Text style={styles.actionIcon}>image</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.hdBtn, sendImageAsHD && styles.hdBtnActive]} 
            onPress={() => setSendImageAsHD(!sendImageAsHD)}
          >
            <Text style={[styles.hdBtnText, sendImageAsHD && styles.hdBtnTextActive]}>HD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={pickFiles}>
            <Text style={styles.actionIcon}>attach_file</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.textInputWrapper}>
          <TextInput
            ref={inputRef}
            autoFocus={true}
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
  }
});
