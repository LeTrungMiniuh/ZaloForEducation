import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, TouchableOpacity, Linking } from 'react-native';
import { Colors, Typography } from '../../constants/Theme';

const FLUENT_EMOJI_MAP = {
  '👍': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Thumbs%20Up/3D/thumbs_up_3d.png',
  '❤️': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Red%20Heart/3D/red_heart_3d.png',
  '😄': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png',
  '😮': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png',
  '😭': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png',
  '😡': 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/Enraged%20Face/3D/enraged_face_3d.png',
};

// URL-encode spaces for all links
Object.keys(FLUENT_EMOJI_MAP).forEach(key => {
  FLUENT_EMOJI_MAP[key] = FLUENT_EMOJI_MAP[key].replace(/ /g, '%20');
});

const getDisplayAvatar = (userId) => {
  return "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png"; // Fallback, pass from props if available
};

const normalizeAttachment = (attachment) => {
  if (!attachment || typeof attachment !== 'object') return {};
  return {
    ...attachment,
    url: attachment.url || attachment.fileUrl || attachment.dataUrl || '',
    dataUrl: attachment.dataUrl || attachment.fileUrl || attachment.url || '',
    name: attachment.name || attachment.fileName || 'Unknown File',
    mimeType: attachment.mimeType || attachment.fileType || 'application/octet-stream',
    size: attachment.size || 0
  };
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

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

const isVideoAttachment = (item) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  const name = String(item?.name || item?.fileName || item?.url || item?.dataUrl || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name);
};

const isStickerMedia = (item) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  return mime.includes('sticker') || item?.isSticker === true;
};

export default function MessageBubble({ message, isMe, userProfile, onLongPress, onReaction, onReply }) {
  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;

  const reactionSummary = [];
  if (message.reactions) {
    Object.entries(message.reactions).forEach(([emoji, users]) => {
      if (users && users.length > 0) {
        reactionSummary.push([emoji, users]);
      }
    });
  }

  // System Message
  if (message.type === 'system') {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBadge}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
        <Text style={styles.systemTime}>
          {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', {
            hour: '2-digit', minute: '2-digit'
          })}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerOther]}>
      {!isMe && (
        <Image source={{ uri: userProfile?.avatarUrl || getDisplayAvatar(message.senderId) }} style={styles.avatar} />
      )}
      
      <View style={[styles.bubbleWrapper, isMe ? styles.bubbleWrapperMe : styles.bubbleWrapperOther]}>
        {/* Name and Pin Header */}
        <View style={styles.headerRow}>
          {isPinned && (
            <View style={styles.pinBadge}>
              <Text style={styles.pinIcon}>push_pin</Text>
              <Text style={styles.pinText}>Đã ghim</Text>
            </View>
          )}
        </View>

        <Pressable 
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]} 
          onLongPress={() => onLongPress(message)}
        >
          {message.replyTo && (
            <View style={styles.replyBox}>
              <Text style={styles.replyHeader}>ĐANG TRẢ LỜI</Text>
              <Text style={styles.replyContent} numberOfLines={1}>{message.replyTo.content}</Text>
            </View>
          )}

          <Text style={[styles.messageText, isRecalled && styles.recalledText, !isMe && styles.messageTextOther]}>
            {isRecalled ? "Tin nhắn đã được thu hồi" : message.content}
          </Text>

          {/* Media & Files */}
          {!isRecalled && (Array.isArray(message.media) || Array.isArray(message.files)) && (
            <View style={styles.mediaContainer}>
              {/* Media (Images/Videos) */}
              <View style={styles.imageGrid}>
                {(Array.isArray(message.media) ? message.media : []).map((item, index) => {
                  const file = normalizeAttachment(item);
                  const isVideo = isVideoAttachment(item);
                  const isSticker = isStickerMedia(item);
                  const isHD = item?.isHD === true;
                  
                  if (isVideo) {
                    return (
                      <TouchableOpacity key={index} style={styles.videoBox} onPress={() => Linking.openURL(file.dataUrl)}>
                        <Image source={{ uri: file.dataUrl }} style={styles.mediaImage} blurRadius={10} />
                        <View style={styles.videoOverlay}>
                          <Text style={styles.videoIcon}>play_circle</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <View key={index} style={styles.imageBox}>
                      <Image 
                        source={{ uri: file.dataUrl }} 
                        style={[styles.mediaImage, isSticker && styles.stickerImage]} 
                        resizeMode={isSticker ? "contain" : "cover"} 
                      />
                      {(isSticker || isHD) && (
                        <View style={styles.mediaBadgeRow}>
                          {isSticker && <View style={styles.stkBadge}><Text style={styles.badgeText}>STK</Text></View>}
                          {isHD && <View style={styles.hdBadge}><Text style={styles.badgeText}>HD</Text></View>}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* Files */}
              <View style={styles.fileList}>
                {(Array.isArray(message.files) ? message.files : []).map((item, index) => {
                  const file = normalizeAttachment(item);
                  return (
                    <TouchableOpacity key={index} style={styles.fileCard} onPress={() => Linking.openURL(file.dataUrl)}>
                      <View style={styles.fileIconBox}>
                        <Text style={styles.fileIcon}>{getFileIcon(file.mimeType, file.name)}</Text>
                      </View>
                      <View style={styles.fileInfo}>
                        <Text numberOfLines={1} style={styles.fileName}>{file.name}</Text>
                        <Text style={styles.fileSize}>{formatFileSize(file.size)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </Pressable>

        {/* Reactions Summary */}
        {reactionSummary.length > 0 && (
          <View style={[styles.reactionSummary, isMe ? styles.reactionSummaryMe : styles.reactionSummaryOther]}>
            {reactionSummary.map(([emoji, users]) => (
              <TouchableOpacity key={emoji} style={styles.reactionBadge} onPress={() => onReaction && onReaction(message, emoji)}>
                <Image source={{ uri: FLUENT_EMOJI_MAP[emoji] || '' }} style={styles.reactionEmojiIcon} />
                <Text style={styles.reactionCount}>{users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={[styles.footerRow, isMe && styles.footerRowMe]}>
          <Text style={styles.timeText}>
            {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && (
            <Text style={styles.statusText}>
              {message.status === 'sending' ? 'Đang gửi...' : message.status === 'error' ? 'Lỗi' : 'Đã gửi'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  containerMe: {
    justifyContent: 'flex-end',
  },
  containerOther: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 4,
  },
  bubbleWrapper: {
    maxWidth: '75%',
  },
  bubbleWrapperMe: {
    alignItems: 'flex-end',
  },
  bubbleWrapperOther: {
    alignItems: 'flex-start',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  senderName: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: '800',
    color: '#7a8391',
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb', // amber-50
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a', // amber-200
  },
  pinIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 10,
    color: '#d97706',
    marginRight: 2,
  },
  pinText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#d97706',
    textTransform: 'uppercase',
  },
  bubble: {
    padding: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleMe: {
    backgroundColor: '#e6f0fa', // Primary/10
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  messageText: {
    ...Typography.body,
    fontSize: 15,
    color: '#1f2631',
    lineHeight: 22,
  },
  messageTextOther: {
    color: '#1f2631',
  },
  recalledText: {
    fontStyle: 'italic',
    opacity: 0.5,
  },
  replyBox: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  replyHeader: {
    fontSize: 10,
    fontWeight: '800',
    opacity: 0.6,
    marginBottom: 2,
  },
  replyContent: {
    ...Typography.body,
    fontSize: 13,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  mediaContainer: {
    marginTop: 8,
    gap: 8,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  imageBox: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  stickerImage: {
    backgroundColor: 'transparent',
  },
  videoBox: {
    width: 120,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  mediaBadgeRow: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    gap: 4,
  },
  stkBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  hdBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#fff',
  },
  fileList: {
    gap: 6,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    padding: 8,
    borderRadius: 12,
    width: 240,
  },
  fileIconBox: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(0,65,143,0.1)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  fileIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: Colors.primary,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    ...Typography.body,
    fontSize: 13,
    fontWeight: '700',
  },
  fileSize: {
    fontSize: 10,
    color: '#7a8391',
    marginTop: 2,
  },
  reactionSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: -8,
    marginBottom: 4,
    zIndex: 10,
    gap: 4,
  },
  reactionSummaryMe: {
    alignSelf: 'flex-end',
    marginRight: 10,
  },
  reactionSummaryOther: {
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  reactionEmojiIcon: {
    width: 14,
    height: 14,
  },
  reactionCount: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5a6781',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  footerRowMe: {
    justifyContent: 'flex-end',
  },
  timeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9ba3b2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  systemBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  systemText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5a6781',
  },
  systemTime: {
    fontSize: 10,
    color: '#9ba3b2',
    marginTop: 4,
  }
});
