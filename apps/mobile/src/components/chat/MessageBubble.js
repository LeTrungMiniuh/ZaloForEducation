import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';

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

const DEFAULT_AVATAR = require('../../../assets/logo_blue.png');

const getDisplayAvatar = (userId) => {
  return DEFAULT_AVATAR;
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

const HighlightText = ({ text, keyword, style }) => {
  if (!text || !keyword?.trim()) return <Text style={style}>{text}</Text>;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <Text key={i} style={{ backgroundColor: '#fff59d', fontWeight: 'bold' }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
};

export default function MessageBubble({ 
  message, 
  isMe, 
  userProfile, 
  onLongPress, 
  onReaction, 
  onReply,
  isHighlighted,
  highlightKeyword 
}) {
  const { user } = useAuth();
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

  const RenderBubbleContent = () => (
    <>
      {message.replyTo && (
        <View style={[styles.replyBox, isMe && styles.replyBoxMe]}>
          <Text style={[styles.replyHeader, isMe && styles.replyHeaderTextMe]}>
            {String(message.replyTo.senderId || "").trim().toLowerCase() === String(user?.email || "").trim().toLowerCase() ? "Bạn" : "Người dùng"}
          </Text>
          <Text style={[styles.replyContent, isMe && styles.replyContentTextMe]} numberOfLines={2}>
            {message.replyTo.content || "Đính kèm"}
          </Text>
        </View>
      )}

      {isRecalled ? (
        <Text style={[styles.messageText, styles.recalledText, isMe && styles.messageTextMe]}>
          Tin nhắn đã được thu hồi
        </Text>
      ) : (
        <>
          {message.content ? (
            <HighlightText 
              text={message.content} 
              keyword={highlightKeyword} 
              style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]} 
            />
          ) : null}

          {message.media && message.media.length > 0 && (
            <View style={styles.mediaContainer}>
              <View style={styles.imageGrid}>
                {message.media.map((item, idx) => {
                  const mediaSource = (item.url || item.dataUrl) ? { uri: item.url || item.dataUrl } : DEFAULT_AVATAR;
                  return (
                    <TouchableOpacity key={idx} style={styles.imageBox}>
                      <Image 
                        source={mediaSource} 
                        style={[styles.mediaImage, isStickerMedia(item) && styles.stickerImage]} 
                        resizeMode={isStickerMedia(item) ? "contain" : "cover"}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {message.files && message.files.length > 0 && (
            <View style={styles.fileList}>
              {message.files.map((file, idx) => {
                const f = normalizeAttachment(file);
                return (
                  <View key={idx} style={[styles.fileCard, isMe && styles.fileCardMe]}>
                    <View style={styles.fileIconBox}>
                      <Text style={styles.fileIcon}>{getFileIcon(f.mimeType, f.name)}</Text>
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, isMe && styles.fileNameMe]} numberOfLines={1}>{f.name}</Text>
                      <Text style={[styles.fileSize, isMe && styles.fileSizeMe]}>{formatFileSize(f.size)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </>
  );

  return (
    <View style={[styles.container, isMe ? styles.containerMe : styles.containerOther]}>
      {!isMe && (
        <Image 
          source={userProfile?.avatarUrl ? { uri: userProfile.avatarUrl } : DEFAULT_AVATAR} 
          style={styles.avatar} 
        />
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

        <Pressable onLongPress={() => onLongPress(message)}>
          {isMe ? (
            <LinearGradient
              colors={['#e3f2fd', '#bbdefb']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.bubble,
                styles.bubbleMe,
                isHighlighted && styles.bubbleHighlighted
              ]}
            >
              <RenderBubbleContent />
            </LinearGradient>
          ) : (
            <View
              style={[
                styles.bubble,
                styles.bubbleOther,
                isHighlighted && styles.bubbleHighlighted
              ]}
            >
              <RenderBubbleContent />
            </View>
          )}
        </Pressable>

        {message.reactions && reactionSummary.length > 0 && (
          <View style={[styles.reactionSummary, isMe ? styles.reactionSummaryMe : styles.reactionSummaryOther]}>
            {reactionSummary.map(([emoji, users], idx) => (
              <TouchableOpacity key={idx} style={styles.reactionBadge} onPress={() => onReaction(message, emoji)}>
                <Image source={{ uri: FLUENT_EMOJI_MAP[emoji] }} style={styles.reactionEmojiIcon} />
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
            <View style={styles.statusWrapper}>
              {message.status === 'sending' ? (
                <ActivityIndicator size={8} color={Colors.primary} />
              ) : message.status === 'error' ? (
                <Text style={[styles.statusIcon, { color: '#ef4444' }]}>error</Text>
              ) : (
                <Text style={styles.statusIcon}>check_circle</Text>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
  },
  containerMe: {
    justifyContent: 'flex-end',
  },
  containerOther: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 2,
  },
  bubbleWrapper: {
    maxWidth: '85%',
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
    marginBottom: 2,
    gap: 4,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleHighlighted: {
    backgroundColor: '#fff9c4',
    borderColor: '#ffd600',
    borderWidth: 2,
    elevation: 4,
    shadowOpacity: 0.3,
  },
  bubbleMe: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  messageText: {
    ...Typography.body,
    fontSize: 16,
    lineHeight: 22,
    color: '#000000',
    fontWeight: '500',
  },
  messageTextMe: {
    color: '#000000',
  },
  messageTextOther: {
    color: '#000000',
  },
  recalledText: {
    fontStyle: 'italic',
    opacity: 0.6,
  },
  replyBox: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  replyBoxMe: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderLeftColor: Colors.primary,
  },
  replyHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 2,
  },
  replyHeaderTextMe: {
    color: Colors.primary,
    opacity: 0.9,
  },
  replyContent: {
    ...Typography.body,
    fontSize: 13,
    color: '#333',
    fontStyle: 'italic',
  },
  replyContentTextMe: {
    color: '#333',
    opacity: 0.8,
  },
  mediaContainer: {
    marginTop: 4,
    gap: 4,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  imageBox: {
    width: 130,
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  stickerImage: {
    backgroundColor: 'transparent',
  },
  fileList: {
    gap: 6,
    marginTop: 4,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    padding: 8,
    borderRadius: 12,
    width: 220,
  },
  fileCardMe: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  fileIconBox: {
    width: 32,
    height: 32,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  fileIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: Colors.primary,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2631',
  },
  fileNameMe: {
    color: '#1f2631',
  },
  fileSize: {
    fontSize: 10,
    color: '#6b7280',
  },
  fileSizeMe: {
    color: '#6b7280',
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
    marginRight: 4,
  },
  reactionSummaryOther: {
    alignSelf: 'flex-start',
    marginLeft: 4,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
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
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  footerRowMe: {
    justifyContent: 'flex-end',
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9ba3b2',
  },
  statusWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 11,
    color: Colors.primary,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  systemBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  systemText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5a6781',
  },
  systemTime: {
    fontSize: 9,
    color: '#9ba3b2',
    marginTop: 2,
  }
});
