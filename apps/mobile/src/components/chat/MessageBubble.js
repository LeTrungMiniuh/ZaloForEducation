import React from 'react';
import { View, Text, Image, Pressable, TouchableOpacity, Linking, Platform, StyleSheet } from 'react-native';

const FLUENT_EMOJI_MAP = {
  '👍': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Thumbs%20Up/3D/thumbs_up_3d.png',
  '❤️': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Red%20Heart/3D/red_heart_3d.png',
  '😄': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Grinning%20Face%20with%20Big%20Eyes/3D/grinning_face_with_big_eyes_3d.png',
  '😮': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Face%20with%20Open%20Mouth/3D/face_with_open_mouth_3d.png',
  '😭': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Loudly%20Crying%20Face/3D/loudly_crying_face_3d.png',
  '😡': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Enraged%20Face/3D/enraged_face_3d.png',
  '😂': 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/Face%20with%20Tears%20of%20Joy/3D/face_with_tears_of_joy_3d.png',
};

const getDisplayAvatar = () => "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

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

const isAudioAttachment = (item) => {
  const mime = String(item?.mimeType || item?.fileType || '').toLowerCase();
  const name = String(item?.name || item?.fileName || item?.url || item?.dataUrl || '').toLowerCase();
  return mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)(\\?.*)?$/.test(name);
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

const formatDuration = (seconds) => {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// ── Voice Bubble ─────────────────────────────────────────────
function VoiceBubble({ file, isMe }) {
  const url = file.dataUrl || file.url || '';
  const durationSec = file.durationSec || 0;

  const openAudio = () => { if (url) Linking.openURL(url); };

  return (
    <TouchableOpacity onPress={openAudio} activeOpacity={0.8} style={[styles.voiceBubble, isMe ? styles.voiceBubbleMe : styles.voiceBubbleOther]}>
      <View style={styles.voiceIcon}>
        <Text style={[styles.voiceIconText, { color: isMe ? '#0058bc' : '#fff' }]}>graphic_eq</Text>
      </View>
      <View style={styles.voiceWave}>
        {[3, 5, 7, 5, 8, 4, 6, 8, 5, 3, 7, 5].map((h, i) => (
          <View key={i} style={[styles.voiceBar, { height: h * 2, backgroundColor: isMe ? '#0058bc' : 'rgba(255,255,255,0.7)' }]} />
        ))}
      </View>
      <Text style={[styles.voiceDuration, { color: isMe ? '#0058bc' : '#fff' }]}>
        {durationSec > 0 ? formatDuration(durationSec) : '0:02'}
      </Text>
      <Text style={[styles.voicePlay, { color: isMe ? '#0058bc' : '#fff' }]}>play_arrow</Text>
    </TouchableOpacity>
  );
}

// ── Contact Card ─────────────────────────────────────────────
function ContactCard({ card }) {
  return (
    <View style={styles.contactCard}>
      <View style={styles.contactCardHeader}>
        <Text style={styles.contactCardLabel}>DANH THIẾP LIÊN HỆ</Text>
      </View>
      <View style={styles.contactCardBody}>
        <View style={styles.contactAvatarWrap}>
          <Image
            source={{ uri: card?.avatarUrl || getDisplayAvatar() }}
            style={styles.contactAvatar}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactName} numberOfLines={1}>
            {card?.fullName || card?.fullname || card?.email}
          </Text>
          {!!card?.email && (
            <Text style={styles.contactMeta} numberOfLines={1}>{card.email}</Text>
          )}
          {!!card?.phone && (
            <Text style={styles.contactMeta} numberOfLines={1}>{card.phone}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={styles.contactBtn}
        onPress={() => { if (card?.email) Linking.openURL(`mailto:${card.email}`); }}
      >
        <Text style={styles.contactBtnText}>Nhắn tin</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Location Card ────────────────────────────────────────────
function LocationCard({ message }) {
  const lat = message.latitude || message.location?.latitude;
  const lon = message.longitude || message.location?.longitude;
  const label = message.location?.label || message.content || 'Vị trí hiện tại';
  const isLive = message.location?.isLive;

  const openMap = () => {
    if (!lat || !lon) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lon}`,
      android: `geo:0,0?q=${lat},${lon}`
    });
    Linking.openURL(url);
  };

  const mapThumb = lat && lon
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=15&size=280x100&markers=color:red%7C${lat},${lon}&key=AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY`
    : null;

  return (
    <View style={styles.locationCard}>
      {isLive && (
        <View style={styles.locationLiveBadge}>
          <Text style={styles.locationLiveText}>• TRỰC TIẾP</Text>
        </View>
      )}
      <View style={styles.locationCardHeader}>
        <Text style={styles.locationCardTitle}>{isLive ? 'VỊ TRÍ TRỰC TIẾP' : 'VỊ TRÍ HIỆN TẠI'}</Text>
      </View>
      <View style={styles.locationCardBody}>
        <View style={styles.locationMapPlaceholder}>
          <Text style={styles.locationMapIcon}>location_on</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.locationLabel} numberOfLines={1}>{label}</Text>
          {lat && lon && (
            <Text style={styles.locationCoords}>{Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}</Text>
          )}
        </View>
      </View>
      <TouchableOpacity style={styles.locationBtn} onPress={openMap}>
        <Text style={styles.locationBtnText}>Mở bản đồ</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MessageBubble({ message, isMe, userProfile, onLongPress, onReaction }) {
  const isRecalled = !!message.recalled;
  const isPinned = !!message.pinned;

  const reactionSummary = [];
  if (message.reactions) {
    Object.entries(message.reactions).forEach(([emoji, users]) => {
      if (users && users.length > 0) reactionSummary.push([emoji, users]);
    });
  }

  if (message.type === 'system') {
    return (
      <View className="items-center my-4">
        <View className="bg-black/5 px-4 py-1.5 rounded-full">
          <Text className="text-[11px] font-bold text-slate-500 text-center">{message.content}</Text>
        </View>
        <Text className="text-[10px] text-slate-400 mt-1">
          {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  // Check for contact card
  const isContactCard = message.type === 'contact_card' || !!message.contactCard;
  // Check for location
  const isLocation = message.type === 'location' || (message.location && (message.location.latitude || message.location.longitude)) || (message.latitude && message.longitude);
  // Check for audio files
  const audioFiles = !isRecalled && Array.isArray(message.files)
    ? message.files.filter(isAudioAttachment)
    : [];
  const nonAudioFiles = Array.isArray(message.files)
    ? message.files.filter(f => !isAudioAttachment(f))
    : [];

  return (
    <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]} className="mb-4">
      {!isMe && (
        <Image
          source={{ uri: userProfile?.avatarUrl || getDisplayAvatar() }}
          style={styles.msgAvatar}
          className="mr-2 mb-1"
        />
      )}

      <View style={{ maxWidth: '75%', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {isPinned && (
          <View className="flex-row items-center bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 mb-1 gap-0.5">
            <Text className="font-material text-[10px] text-amber-600">push_pin</Text>
            <Text className="text-[9px] font-extrabold text-amber-600 uppercase">Đã ghim</Text>
          </View>
        )}

        {/* Voice messages render outside the bubble */}
        {!isRecalled && audioFiles.length > 0 && audioFiles.map((file, idx) => (
          <VoiceBubble key={idx} file={normalizeAttachment(file)} isMe={isMe} />
        ))}

        {/* Contact card outside bubble */}
        {!isRecalled && isContactCard && (
          <Pressable onLongPress={() => onLongPress(message)}>
            <ContactCard card={message.contactCard} />
          </Pressable>
        )}

        {/* Location card outside bubble */}
        {!isRecalled && isLocation && (
          <Pressable onLongPress={() => onLongPress(message)}>
            <LocationCard message={message} />
          </Pressable>
        )}

        {/* Main bubble - only if there's text/media/non-audio files */}
        {(!isContactCard && !isLocation && audioFiles.length === 0) || isRecalled || message.content?.trim() || (Array.isArray(message.media) && message.media.length > 0) || nonAudioFiles.length > 0 ? (
          <Pressable
            style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}
            onLongPress={() => onLongPress(message)}
          >
            {message.replyTo && (
              <View className="bg-black/5 border-l-4 border-[#0058bc] p-2 rounded mb-2">
                <Text className="text-[10px] font-extrabold opacity-60 mb-0.5 uppercase">ĐANG TRẢ LỜI</Text>
                <Text className="text-[13px] italic opacity-80" numberOfLines={1}>{message.replyTo.content}</Text>
              </View>
            )}

            {/* Text - don't show placeholder tags */}
            {(() => {
              const txt = isRecalled ? 'Tin nhắn đã được thu hồi' : (message.content || '');
              const hiddenTags = ['[Danh thiếp]', '[Vị trí hiện tại]', '[Vị trí trực tiếp]', '[Ghi âm]'];
              const show = isRecalled || (!hiddenTags.includes(txt.trim()) && !!txt.trim());
              if (!show) return null;
              return (
                <Text className={`text-[15px] leading-[22px] ${isRecalled ? "italic opacity-50" : "text-slate-800"}`}>
                  {txt}
                </Text>
              );
            })()}

            {/* Media */}
            {!isRecalled && Array.isArray(message.media) && message.media.length > 0 && (
              <View className="mt-2 gap-2">
                <View className="flex-row flex-wrap gap-1">
                  {message.media.map((item, index) => {
                    const file = normalizeAttachment(item);
                    const isSticker = isStickerMedia(item);
                    if (isVideoAttachment(item)) {
                      return (
                        <TouchableOpacity key={index} className="w-[110px] h-[110px] rounded-xl overflow-hidden bg-black items-center justify-center" onPress={() => Linking.openURL(file.dataUrl)}>
                          <Image source={{ uri: file.dataUrl }} className="absolute inset-0 opacity-50" blurRadius={10} />
                          <Text className="font-material text-3xl text-white">play_circle</Text>
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <View key={index} className="relative w-[110px] h-[110px] rounded-xl overflow-hidden bg-black/5">
                        <Image source={{ uri: file.dataUrl }} className={`w-full h-full ${isSticker ? "p-2" : ""}`} resizeMode={isSticker ? "contain" : "cover"} />
                        {(isSticker || item?.isHD) && (
                          <View className="absolute bottom-1.5 left-1.5 flex-row gap-1">
                            {isSticker && <View className="bg-emerald-600 px-1.5 py-0.5 rounded-lg"><Text className="text-white text-[8px] font-black">STK</Text></View>}
                            {item?.isHD && <View className="bg-blue-600 px-1.5 py-0.5 rounded-lg"><Text className="text-white text-[8px] font-black">HD</Text></View>}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Non-audio files */}
            {!isRecalled && nonAudioFiles.length > 0 && (
              <View className="gap-1.5 mt-2">
                {nonAudioFiles.map((item, index) => {
                  const file = normalizeAttachment(item);
                  return (
                    <TouchableOpacity key={index} className="flex-row items-center bg-white/70 border border-black/5 p-2 rounded-xl w-[230px]" onPress={() => Linking.openURL(file.dataUrl)}>
                      <View className="w-8 h-8 bg-blue-100 rounded-lg items-center justify-center mr-2">
                        <Text className="font-material text-[18px] text-[#0058bc]">{getFileIcon(file.mimeType, file.name)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="font-bold text-[12px] text-slate-800" numberOfLines={1}>{file.name}</Text>
                        <Text className="text-[10px] text-slate-500">{formatFileSize(file.size)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Pressable>
        ) : null}

        {/* Reactions */}
        {reactionSummary.length > 0 && (
          <View className={`flex-row flex-wrap -mt-2 mb-1 z-10 gap-1 ${isMe ? "self-end mr-2" : "self-start ml-2"}`}>
            {reactionSummary.map(([emoji, users]) => (
              <TouchableOpacity key={emoji} className="flex-row items-center bg-white border border-black/10 rounded-full px-1.5 py-0.5 gap-1 shadow-sm">
                <Image source={{ uri: FLUENT_EMOJI_MAP[emoji] || '' }} className="w-3.5 h-3.5" />
                <Text className="text-[10px] font-black text-slate-600">{users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View className={`flex-row items-center gap-1.5 mt-0.5 px-1 ${isMe ? "justify-end" : "justify-start"}`}>
          <Text className="text-[10px] font-bold text-slate-400">
            {new Date(message.createdAt || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {isMe && (
            <Text className="text-[10px] font-bold text-blue-500">
              {message.status === 'sending' ? 'Đang gửi...' : message.status === 'error' ? 'Lỗi' : 'Đã gửi'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: { flexDirection: "row", alignItems: "flex-end" },
  messageRowMe: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  messageBubble: { maxWidth: "100%", borderRadius: 16, padding: 10, borderWidth: 1 },
  messageBubbleMe: { backgroundColor: "#dfefff", borderColor: "#c8dcff", borderBottomRightRadius: 4 },
  messageBubbleOther: { backgroundColor: "#fff", borderColor: "#e3e8f0", borderBottomLeftRadius: 4 },

  // ── Voice ───────────────────────────────────────────────────
  voiceBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 180,
    maxWidth: 260,
    gap: 8,
    marginBottom: 2,
  },
  voiceBubbleMe: { backgroundColor: '#dceeff', borderWidth: 1, borderColor: '#b8d6ff' },
  voiceBubbleOther: { backgroundColor: '#0058bc' },
  voiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceIconText: { fontFamily: 'Material Symbols Outlined', fontSize: 20 },
  voiceWave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  voiceBar: { width: 3, borderRadius: 2 },
  voiceDuration: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  voicePlay: { fontFamily: 'Material Symbols Outlined', fontSize: 22 },

  // ── Contact Card ────────────────────────────────────────────
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    width: 260,
    borderWidth: 1,
    borderColor: '#e3e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  contactCardHeader: {
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dde9f9',
  },
  contactCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0058bc',
    letterSpacing: 0.5,
  },
  contactCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  contactAvatarWrap: { position: 'relative' },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e8effd',
  },
  contactName: { fontSize: 15, fontWeight: '700', color: '#1a2233', marginBottom: 2 },
  contactMeta: { fontSize: 12, color: '#6b7a90', marginTop: 1 },
  contactBtn: {
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: '#0058bc',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  contactBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Location Card ───────────────────────────────────────────
  locationCard: {
    backgroundColor: '#e8f2ff',
    borderRadius: 16,
    overflow: 'hidden',
    width: 240,
    borderWidth: 1,
    borderColor: '#c5dcf7',
  },
  locationLiveBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
    backgroundColor: '#e53935',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  locationLiveText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  locationCardHeader: {
    backgroundColor: '#d0e8ff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#b8d6f5',
  },
  locationCardTitle: { fontSize: 10, fontWeight: '800', color: '#0058bc', letterSpacing: 0.5 },
  locationCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  locationMapPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c5dcf7',
  },
  locationMapIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 26, color: '#e53935' },
  locationLabel: { fontSize: 13, fontWeight: '700', color: '#1a2233' },
  locationCoords: { fontSize: 11, color: '#5a7090', marginTop: 2 },
  locationBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#0058bc',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  locationBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
