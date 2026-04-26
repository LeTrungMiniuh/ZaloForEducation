import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';
import MediaViewerModal from './MediaViewerModal';
import { downloadAndOpenFile } from '../../utils/fileHelper';
import FluentEmoji from '../common/FluentEmoji';
import { FLUENT_EMOJI_MAP } from '../../constants/Emojis';

const DEFAULT_AVATAR = require('../../../assets/logo_blue.png');

const getDisplayAvatar = (userId: string) => {
  return DEFAULT_AVATAR;
};



interface Attachment {
  url: string;
  fileUrl?: string;
  dataUrl: string;
  name: string;
  fileName?: string;
  mimeType: string;
  fileType?: string;
  size: number;
  isSticker?: boolean;
}

const normalizeAttachment = (attachment: any): Attachment => {
  if (!attachment || typeof attachment !== 'object') return {
    url: '',
    dataUrl: '',
    name: 'Unknown File',
    mimeType: 'application/octet-stream',
    size: 0
  };
  return {
    ...attachment,
    url: attachment.url || attachment.fileUrl || attachment.dataUrl || '',
    dataUrl: attachment.dataUrl || attachment.fileUrl || attachment.url || '',
    name: attachment.name || attachment.fileName || 'Unknown File',
    mimeType: attachment.mimeType || attachment.fileType || 'application/octet-stream',
    size: attachment.size || 0
  };
};

const formatFileSize = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

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

const isVideoAttachment = (item: any) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  const name = String(item?.name || item?.fileName || item?.url || item?.dataUrl || '').toLowerCase();
  return mime.startsWith('video/') || /\.(mp4|mov|avi|wmv|webm|mkv)(\?.*)?$/.test(name);
};

const isStickerMedia = (item: any) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  return mime.includes('sticker') || item?.isSticker === true;
};

const HighlightText = ({ text, keyword, style }: { text: string; keyword?: string; style: any }) => {
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
  onSystemMessagePress,
  isHighlighted,
  highlightKeyword 
}: {
  message: any;
  isMe: boolean;
  userProfile?: any;
  onLongPress: (message: any) => void;
  onReaction: (message: any, emoji: string) => void;
  onReply: (message: any) => void;
  onSystemMessagePress?: (targetId: string) => void;
  isHighlighted?: boolean;
  highlightKeyword?: string;
}) {
  const { user }: any = useAuth();
  const [viewingMedia, setViewingMedia] = useState<{ url: string; name: string } | null>(null);

  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;

  const handleImagePress = (item: any) => {
    console.log('[MessageBubble] Image pressed:', item.name);
    if (isRecalled) return;
    setViewingMedia({
      url: item.url || item.dataUrl,
      name: item.name
    });
  };

  const handleFilePress = (file: any) => {
    console.log('[MessageBubble] File pressed:', file.name);
    if (isRecalled) return;
    downloadAndOpenFile(file.url || file.dataUrl, file.name, file.mimeType);
  };

  const reactionSummary: [string, any][] = [];
  if (message.reactions) {
    Object.entries(message.reactions).forEach(([emoji, users]) => {
      if (users && (users as any).length > 0) {
        reactionSummary.push([emoji, users]);
      }
    });
  }

  // System Message
  if (message.type === 'system') {
    const targetId = message.metadata?.targetMessageId;
    return (
      <View style={styles.systemContainer}>
        <TouchableOpacity 
          activeOpacity={targetId ? 0.7 : 1}
          onPress={() => targetId && onSystemMessagePress && onSystemMessagePress(targetId)}
          style={[styles.systemBadge, targetId && { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.1)' }]}
        >
          <Text style={styles.systemText}>{message.content}</Text>
        </TouchableOpacity>
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
              <View style={[
                styles.imageGrid,
                message.media.length === 1 && styles.singleMediaGrid,
                (message.media.length === 2 || message.media.length === 4) && styles.twoColumnGrid
              ]}>
                {message.media.map((item: any, idx: number) => {
                  const mediaSource = (item.url || item.dataUrl) ? { uri: item.url || item.dataUrl } : DEFAULT_AVATAR;
                  const isVideo = isVideoAttachment(item);
                  const isSticker = isStickerMedia(item);
                  
                  return (
                    <TouchableOpacity 
                      key={idx} 
                      style={[
                        styles.imageBox,
                        message.media.length === 1 && styles.singleImageBox
                      ]}
                      onPress={() => handleImagePress(item)}
                    >
                      <Image 
                        source={mediaSource} 
                        style={[
                          styles.mediaImage, 
                          isSticker && styles.stickerImage,
                          message.media.length === 1 && styles.singleMediaImage
                        ]} 
                        resizeMode={isSticker ? "contain" : "cover"}
                      />
                      {isVideo && (
                        <View style={styles.videoOverlay}>
                          <Text style={styles.videoIcon}>play_circle</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {message.files && message.files.length > 0 && (
            <View style={styles.fileList}>
              {message.files.map((file: any, idx: number) => {
                const f = normalizeAttachment(file);
                return (
                  <TouchableOpacity 
                    key={idx} 
                    style={[styles.fileCard, isMe && styles.fileCardMe]}
                    onPress={() => handleFilePress(f)}
                  >
                    <View style={styles.fileIconBox}>
                      <Text style={styles.fileIcon}>{getFileIcon(f.mimeType, f.name)}</Text>
                    </View>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, isMe && styles.fileNameMe]} numberOfLines={1}>{f.name}</Text>
                      <Text style={[styles.fileSize, isMe && styles.fileSizeMe]}>{formatFileSize(f.size)}</Text>
                    </View>
                  </TouchableOpacity>
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

        <Pressable 
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
        >
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

        <MediaViewerModal
          visible={!!viewingMedia}
          mediaUrl={viewingMedia?.url}
          fileName={viewingMedia?.name}
          onClose={() => setViewingMedia(null)}
        />

        {message.reactions && reactionSummary.length > 0 && (
          <View style={[styles.reactionSummary, isMe ? styles.reactionSummaryMe : styles.reactionSummaryOther]}>
            {reactionSummary.map(([emoji, users], idx) => (
              <TouchableOpacity key={idx} style={styles.reactionBadge} onPress={() => onReaction(message, emoji)}>
                <FluentEmoji emoji={emoji} style={styles.reactionEmojiIcon} />
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
  singleMediaGrid: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
  },
  twoColumnGrid: {
    width: 270,
  },
  imageBox: {
    width: 84,
    height: 84,
    borderRadius: 8,
    overflow: 'hidden',
  },
  singleImageBox: {
    width: 220,
    height: 220,
    borderRadius: 16,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  singleMediaImage: {
    borderRadius: 16,
  },
  stickerImage: {
    backgroundColor: 'transparent',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 48,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
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
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff9c4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ffd600',
    marginBottom: 4,
  },
  pinIcon: {
    fontSize: 12,
    color: '#f57f17',
    marginRight: 4,
  },
  pinText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f57f17',
  }
});
