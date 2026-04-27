import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, TouchableOpacity, Linking, ActivityIndicator, Animated, PanResponder, Dimensions, Platform } from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import Alert from '../../utils/Alert';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';
import MediaViewerModal from './MediaViewerModal';
import { downloadAndOpenFile } from '../../utils/fileHelper';
import FluentEmoji from '../common/FluentEmoji';
import { FLUENT_EMOJI_MAP } from '../../constants/Emojis';
import { useNavigation } from '@react-navigation/native';

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

const AudioPlayer = ({ url, isMe }: { url: string; isMe: boolean }) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
      }
    } else if (status.error) {
      console.error(`Playback Error: ${status.error}`);
    }
  };

  const playPause = async () => {
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
        } else {
          await sound.playAsync();
        }
      } else {
        setIsLoading(true);
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          onPlaybackStatusUpdate
        );
        setSound(newSound);
        setIsLoading(false);
      }
    } catch (e) {
      console.warn('Audio play error', e);
      setIsLoading(false);
    }
  };

  const handleSeek = async (e: any) => {
    if (!sound || duration <= 0 || trackWidth <= 0) return;
    const { locationX } = e.nativeEvent;
    const percentage = locationX / trackWidth;
    const seekPosition = percentage * duration;
    try {
      await sound.setPositionAsync(seekPosition);
      setPosition(seekPosition);
    } catch (err) {
      console.warn("Seek error", err);
    }
  };

  React.useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const formatTime = (ms: number) => {
    if (!ms || ms <= 0) return '0:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.audioPlayer, isMe && styles.audioPlayerMe]}>
      <TouchableOpacity onPress={playPause} style={styles.audioPlayBtn} disabled={isLoading}>
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.audioPlayIcon, isMe && styles.audioPlayIconMe]}>
            {isPlaying ? 'pause' : 'play_arrow'}
          </Text>
        )}
      </TouchableOpacity>
      <View style={styles.audioProgress}>
        <View style={styles.audioHeader}>
          <Text style={[styles.audioLabel, isMe && styles.audioLabelMe]}>Tin nhắn thoại</Text>
          <Text style={[styles.audioTime, isMe && styles.audioTimeMe]}>
             {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>
        <Pressable 
          style={styles.audioTrack} 
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          onPress={handleSeek}
        >
          <View 
            style={[
              styles.audioFill, 
              { width: duration > 0 ? `${(position / duration) * 100}%` : '0%' }, 
              isMe && styles.audioFillMe
            ]} 
          />
          <View style={[styles.audioKnob, { left: duration > 0 ? `${(position / duration) * 100}%` : '0%' }, isMe && styles.audioKnobMe]} />
        </Pressable>
        <Text style={[styles.audioPos, isMe && styles.audioPosMe]}>
          {formatTime(position)}
        </Text>
      </View>
    </View>
  );
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
  highlightKeyword,
  userProfiles,
  onReplyPress,
  showAvatar,
  groupPosition,
  isSeen,
  onNavigate
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
  userProfiles?: Record<string, any>;
  onReplyPress?: (messageId: string) => void;
  showAvatar?: boolean;
  groupPosition?: 'first' | 'middle' | 'last' | 'single';
  isSeen?: boolean;
  onNavigate?: (screen: string, params?: any) => void;
}) {
  const isMediaOnly = (() => {
    if (message.audioUrl || message.contactCard || message.location) return true;
    if (!message.content) return true;
    const placeholders = ['[Hình ảnh]', '[Tin nhắn thoại]', '[Ghi âm]', '[Tệp tin]', '[Sticker]', '[Ảnh/Video]', '[Danh thiếp]', '[Vị trí]'];
    if (placeholders.some(p => message.content.startsWith(p))) {
      return (message.media && message.media.length > 0) || (message.files && message.files.length > 0) || !!message.audioUrl || !!message.contactCard || !!message.location;
    }
    return false;
  })();

  const isSticker = (() => {
    if (message.media && message.media.length === 1) {
      return isStickerMedia(message.media[0]);
    }
    return false;
  })();

  const shouldHideBubble = isMediaOnly || isSticker || !!message.contactCard || !!message.location || !!message.audioUrl;

  const navigate = useNavigation();

  const { user }: any = useAuth();

  // SWIPE TO REPLY LOGIC
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeThreshold = 60;
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) { // Swipe right to reply
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > swipeThreshold) {
          onReply({ 
          ...message, 
          senderName: (() => {
            const replySender = String(message.senderId || "").trim().toLowerCase();
            if (replySender === String(user?.email || "").trim().toLowerCase()) return "Bạn";
            const p = userProfiles?.[replySender];
            return p?.nickname || p?.fullName || p?.fullname || replySender;
          })()
        });
        }
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 12,
        }).start();
      },
    })
  ).current;

  const replyIconOpacity = translateX.interpolate({
    inputRange: [0, swipeThreshold],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const replyIconScale = translateX.interpolate({
    inputRange: [0, swipeThreshold],
    outputRange: [0.5, 1.2],
    extrapolate: 'clamp',
  });

  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;

  const handleImagePress = (item: any) => {
    console.log('[MessageBubble] Image/Video pressed:', item.name);
    if (isRecalled) return;
    if (onNavigate) {
      onNavigate('MediaDetail', {
        url: item.url || item.dataUrl,
        name: item.name,
        mimeType: item.mimeType || item.fileType
      });
    }
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
        <TouchableOpacity 
          activeOpacity={0.8}
          onPress={() => onReplyPress && onReplyPress(message.replyTo.id)}
          style={[styles.replyBox, isMe && styles.replyBoxMe]}
        >
          <View style={styles.replyContentRow}>
            <View style={styles.replyTextColumn}>
              <Text style={[styles.replyHeader, isMe && styles.replyHeaderTextMe]} numberOfLines={1}>
                {(() => {
                  const replySender = String(message.replyTo.senderId || "").trim().toLowerCase();
                  if (replySender === String(user?.email || "").trim().toLowerCase()) return "Bạn";
                  const p = userProfiles?.[replySender];
                  return p?.nickname || p?.fullName || p?.fullname || replySender || "Người dùng";
                })()}
              </Text>
              <Text style={[styles.replyContent, isMe && styles.replyContentTextMe]} numberOfLines={1}>
                {message.replyTo.content || (message.replyTo.media?.length ? "[Hình ảnh]" : message.replyTo.files?.length ? "[Tệp tin]" : "Tin nhắn")}
              </Text>
            </View>
            {(message.replyTo.media && message.replyTo.media.length > 0) && (
              <Image 
                source={{ uri: message.replyTo.media[0].url || message.replyTo.media[0].dataUrl }} 
                style={styles.replyImagePreview}
              />
            )}
          </View>
        </TouchableOpacity>
      )}

      {isRecalled ? (
        <Text style={[styles.messageText, styles.recalledText, isMe && styles.messageTextMe]}>
          Tin nhắn đã được thu hồi
        </Text>
      ) : (
        <>
          {message.content && !isMediaOnly ? (
            <HighlightText 
              text={message.content} 
              keyword={highlightKeyword} 
              style={[styles.messageText, isMe ? styles.messageTextMe : styles.messageTextOther]} 
            />
          ) : null}

          {message.media && message.media.length > 0 && (
            <View style={styles.mediaContainer}>
              {(() => {
                const videos = message.media.filter(isVideoAttachment);
                const images = message.media.filter((m: any) => !isVideoAttachment(m));
                
                return (
                  <>
                    {videos.length > 0 && (
                      <View style={[styles.videoGrid, images.length > 0 && { marginBottom: 8 }]}>
                        {videos.map((item: any, idx: number) => (
                          <TouchableOpacity 
                            key={`vid-${idx}`} 
                            style={[styles.videoBox, videos.length === 1 && styles.singleVideoBox]}
                            onPress={() => handleImagePress(item)}
                          >
                            <Image 
                              source={(item.url || item.dataUrl) ? { uri: item.url || item.dataUrl } : DEFAULT_AVATAR} 
                              style={styles.mediaImage} 
                              resizeMode="cover"
                            />
                            <View style={styles.videoOverlay}>
                              <View style={styles.playButtonCircle}>
                                <Text style={styles.playIcon}>play_arrow</Text>
                              </View>
                              <View style={styles.videoBadge}>
                                <Text style={styles.videoBadgeText}>VIDEO</Text>
                              </View>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {images.length > 0 && (
                      <View style={[
                        styles.imageGrid,
                        images.length === 1 && styles.singleMediaGrid,
                        (images.length === 2 || images.length === 4) && styles.twoColumnGrid
                      ]}>
                        {images.map((item: any, idx: number) => {
                          const isSticker = isStickerMedia(item);
                          return (
                            <TouchableOpacity 
                              key={`img-${idx}`} 
                              style={[
                                styles.imageBox,
                                images.length === 1 && styles.singleImageBox
                              ]}
                              onPress={() => handleImagePress(item)}
                            >
                              <Image 
                                source={(item.url || item.dataUrl) ? { uri: item.url || item.dataUrl } : DEFAULT_AVATAR} 
                                style={[
                                  styles.mediaImage, 
                                  isSticker && styles.stickerImage,
                                  images.length === 1 && styles.singleMediaImage
                                ]} 
                                resizeMode={isSticker ? "contain" : "cover"}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </>
                );
              })()}
            </View>
          )}

          {/* 1. Special Cards (Location/Contact) */}
          {message.location && (
            <View style={styles.fileList}>
              <TouchableOpacity 
                style={[styles.specialCard, isMe && styles.specialCardMe]}
                onPress={() => {
                  const url = Platform.select({
                    ios: `maps:0,0?q=${message.location.latitude},${message.location.longitude}`,
                    android: `geo:0,0?q=${message.location.latitude},${message.location.longitude}`
                  });
                  if (url) Linking.openURL(url);
                }}
              >
                <View style={[styles.specialIconBox, { backgroundColor: '#fff1f2' }]}>
                  <Text style={[styles.specialIcon, { color: '#f43f5e' }]}>location_on</Text>
                </View>
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, isMe && styles.fileNameMe]}>Vị trí hiện tại</Text>
                  <Text style={[styles.fileSize, isMe && styles.fileSizeMe]}>{message.location.label || 'Nhấn để xem bản đồ'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {message.contactCard && (
            <View style={styles.fileList}>
              <TouchableOpacity 
                style={[styles.specialCard, isMe && styles.specialCardMe]}
                onPress={() => {
                  if (onNavigate) onNavigate('Profile', { userId: message.contactCard.email });
                }}
              >
                <View style={[styles.specialIconBox, { backgroundColor: '#f5f3ff' }]}>
                  <Image source={{ uri: message.contactCard.avatarUrl || 'https://via.placeholder.com/150' }} style={styles.specialAvatar} />
                </View>
                <View style={styles.fileInfo}>
                  <Text style={[styles.fileName, isMe && styles.fileNameMe]}>{message.contactCard.fullName || "Danh thiếp"}</Text>
                  <Text style={[styles.fileSize, isMe && styles.fileSizeMe]}>Nhấn để xem trang cá nhân</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* 2. Audio Player */}
          {message.audioUrl && (
            <View style={styles.fileList}>
              <AudioPlayer url={message.audioUrl} isMe={isMe} />
            </View>
          )}

          {/* 3. Standard Files */}
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
    <View style={[
      styles.container, 
      isMe ? styles.containerMe : styles.containerOther,
      groupPosition === 'middle' || groupPosition === 'last' ? { marginBottom: 2 } : { marginBottom: 8 }
    ]}>
      {/* Swipe Reply Icon Indicator */}
      <Animated.View style={[
        styles.replySwipeIndicator,
        {
          opacity: replyIconOpacity,
          transform: [{ scale: replyIconScale }, { translateX: -20 }]
        }
      ]}>
        <Text style={styles.replySwipeIcon}>reply</Text>
      </Animated.View>

      <Animated.View 
        {...panResponder.panHandlers}
        style={[
          { flexDirection: 'row', flex: 1, alignItems: 'flex-end', justifyContent: isMe ? 'flex-end' : 'flex-start' },
          { transform: [{ translateX }] }
        ]}
      >
        {!isMe && (
        <View style={styles.avatarSpace}>
          {showAvatar ? (
            <Image 
              source={userProfile?.avatarUrl ? { uri: userProfile.avatarUrl } : DEFAULT_AVATAR} 
              style={styles.avatar} 
            />
          ) : null}
        </View>
      )}
      
      <View style={[styles.bubbleWrapper, isMe ? styles.bubbleWrapperMe : styles.bubbleWrapperOther]}>
        {/* Name and Pin Header - Only show if pinned */}
        {isPinned && (
          <View style={styles.headerRow}>
            <View style={styles.pinBadge}>
              <Text style={styles.pinIcon}>push_pin</Text>
              <Text style={styles.pinText}>Đã ghim</Text>
            </View>
          </View>
        )}

        <Pressable 
          onLongPress={() => onLongPress(message)}
          delayLongPress={300}
        >
          {shouldHideBubble ? (
            <View style={[
              styles.noBubble,
              isHighlighted && styles.bubbleHighlighted
            ]}>
              <RenderBubbleContent />
            </View>
          ) : isMe ? (
            <LinearGradient
              colors={isMe ? ['#e3f2fd', '#bbdefb'] : ['#ffffff', '#ffffff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.bubble,
                isMe ? styles.bubbleMe : styles.bubbleOther,
                groupPosition === 'first' && (isMe ? styles.firstMe : styles.firstOther),
                groupPosition === 'middle' && (isMe ? styles.middleMe : styles.middleOther),
                groupPosition === 'last' && (isMe ? styles.lastMe : styles.lastOther),
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
                groupPosition === 'first' && styles.firstOther,
                groupPosition === 'middle' && styles.middleOther,
                groupPosition === 'last' && styles.lastOther,
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
                <FluentEmoji emoji={emoji} style={styles.reactionEmojiIcon} />
                <Text style={styles.reactionCount}>{users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {(groupPosition === 'last' || groupPosition === 'single' || (isMe && message.status)) && (
          <View style={[styles.footerRow, isMe && styles.footerRowMe]}>
            {(groupPosition === 'last' || groupPosition === 'single') && (
              <Text style={styles.timeText}>
                {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            
            {isMe && (
              <View style={styles.statusWrapper}>
                {isSeen ? (
                  <Image source={userProfile?.avatarUrl ? { uri: userProfile.avatarUrl } : DEFAULT_AVATAR} style={styles.seenAvatar} />
                ) : message.status === 'sending' ? (
                  <View style={styles.statusCircle} />
                ) : message.status === 'error' ? (
                  <View style={[styles.statusCircle, { borderColor: '#ef4444' }]}>
                    <Text style={[styles.statusCheck, { color: '#ef4444' }]}>!</Text>
                  </View>
                ) : (
                  <View style={[styles.statusCircle, styles.statusSent]}>
                    <Text style={styles.statusCheck}>✓</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  </View>
);
}

const styles = StyleSheet.create({
  noBubble: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    marginBottom: 4,
    alignItems: 'flex-end',
    paddingHorizontal: 8,
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
    flexShrink: 1,
  },
  bubbleWrapperMe: {
    alignItems: 'flex-end',
    maxWidth: '75%',
  },
  bubbleWrapperOther: {
    alignItems: 'flex-start',
    maxWidth: '75%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 4,
  },
  bubble: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 22,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minHeight: 48,
    justifyContent: 'center',
  },
  bubbleHighlighted: {
    backgroundColor: '#fff9c4',
    borderColor: '#ffd600',
    borderWidth: 2,
    elevation: 4,
    shadowOpacity: 0.3,
  },
  bubbleMe: {
    borderRadius: 18,
    alignSelf: 'flex-end',
    backgroundColor: '#e3f2fd',
  },
  bubbleOther: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    alignSelf: 'flex-start',
  },
  firstMe: { borderBottomRightRadius: 4 },
  middleMe: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  lastMe: { borderTopRightRadius: 4 },
  firstOther: { borderBottomLeftRadius: 4 },
  middleOther: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  lastOther: { borderTopLeftRadius: 4 },
  messageText: {
    ...Typography.body,
    fontSize: 17,
    lineHeight: 24,
    color: '#000000',
    fontWeight: '400',
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
    backgroundColor: 'rgba(0, 104, 255, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#0068ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
    minWidth: 140,
  },
  replyContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  replyTextColumn: {
    flex: 1,
  },
  replyImagePreview: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#eee',
  },
  replyBoxMe: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderLeftColor: Colors.primary,
  },
  replyHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  replyHeaderTextMe: {
    color: Colors.primary,
    opacity: 0.9,
  },
  replyContent: {
    ...Typography.body,
    fontSize: 13,
    color: '#666',
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
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  videoBox: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  singleVideoBox: {
    maxWidth: 300,
  },
  playButtonCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  playIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
    marginLeft: 4,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 48,
    color: '#fff',
    opacity: 0.9,
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
    color: '#555',
  },
  specialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    minWidth: 200,
    marginTop: 4,
  },
  specialCardMe: {
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  specialIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  specialIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
  },
  specialAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  reactionSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 2,
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
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 24,
    gap: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  reactionEmojiIcon: {
    width: 18,
    height: 18,
  },
  reactionCount: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  footerRowMe: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#9ba3b2',
  },
  statusWrapper: {
    marginLeft: 4,
  },
  statusCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#0084ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusSent: {
    backgroundColor: '#0084ff',
  },
  statusCheck: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  seenAvatar: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  avatarSpace: {
    width: 28,
    marginRight: 6,
    justifyContent: 'flex-end',
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
    fontFamily: 'Material Symbols Outlined',
    fontSize: 12,
    color: '#f57f17',
    marginRight: 4,
  },
  pinText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f57f17',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 20,
    width: 250,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  audioPlayerMe: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  audioPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  audioPlayIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: '#fff',
  },
  audioPlayIconMe: {
    color: '#fff',
  },
  audioProgress: {
    flex: 1,
  },
  audioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  audioLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  audioLabelMe: {
    color: Colors.primary,
  },
  audioTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    position: 'relative',
    marginVertical: 4,
  },
  audioFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  audioFillMe: {
    backgroundColor: Colors.primary,
  },
  audioKnob: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
  },
  audioKnobMe: {
    backgroundColor: Colors.primary,
  },
  audioTime: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '700',
  },
  audioTimeMe: {
    color: '#5a6781',
  },
  audioPos: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '600',
  },
  audioPosMe: {
    color: '#94a3b8',
  },
  replySwipeIndicator: {
    position: 'absolute',
    left: -40,
    top: '30%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1,
  },
  replySwipeIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#666',
  }
});
