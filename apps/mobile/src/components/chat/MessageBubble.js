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

const getDisplayAvatar = (userId) => {
  return "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png"; 
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

  return (
    <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]} className="mb-4">
      {!isMe && (
        <Image 
          source={{ uri: userProfile?.avatarUrl || getDisplayAvatar(message.senderId) }} 
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

        <Pressable 
          style={[
            styles.messageBubble,
            isMe ? styles.messageBubbleMe : styles.messageBubbleOther
          ]}
          onLongPress={() => onLongPress(message)}
        >
          {message.replyTo && (
            <View className="bg-black/5 border-l-4 border-[#0058bc] p-2 rounded mb-2">
              <Text className="text-[10px] font-extrabold opacity-60 mb-0.5 uppercase">ĐANG TRẢ LỜI</Text>
              <Text className="text-[13px] italic opacity-80" numberOfLines={1}>{message.replyTo.content}</Text>
            </View>
          )}

          <Text className={`text-[15px] leading-[22px] ${isRecalled ? "italic opacity-50" : "text-slate-800"}`}>
            {isRecalled ? "Tin nhắn đã được thu hồi" : message.content}
          </Text>

          {/* Contact Card */}
          {!isRecalled && (message.type === 'contact_card' || message.contactCard) && (
            <View className="bg-white rounded-2xl p-4 mt-2 border border-black/5 w-[240px] shadow-lg">
              <View className="flex-row items-center mb-4">
                <View className="relative mr-3">
                  <Image 
                    source={{ uri: message.contactCard?.avatarUrl || getDisplayAvatar(message.contactCard?.email) }} 
                    className="w-12 h-12 rounded-full border-2 border-slate-50" 
                  />
                  <View className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
                </View>
                <View className="flex-1">
                  <Text className="font-bold text-[15px] text-slate-800" numberOfLines={1}>
                    {message.contactCard?.fullName || message.contactCard?.fullname || message.contactCard?.email}
                  </Text>
                  <Text className="text-[12px] text-slate-500" numberOfLines={1}>{message.contactCard?.email}</Text>
                </View>
              </View>
              <View className="flex-row gap-2">
                <TouchableOpacity 
                   className="flex-[4] flex-row items-center justify-center bg-[#0058bc] py-2.5 rounded-xl gap-1.5"
                   onPress={() => { if (message.contactCard?.email) Linking.openURL(`mailto:${message.contactCard.email}`); }}
                >
                  <Text className="font-material text-[18px] text-white">chat</Text>
                  <Text className="text-[13px] font-bold text-white">Nhắn tin</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-slate-100 items-center justify-center rounded-xl">
                  <Text className="font-material text-[18px] text-slate-500">person_add</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Location */}
          {!isRecalled && (message.type === 'location' || (message.latitude && message.longitude)) && (
            <TouchableOpacity 
              className="flex-row items-center bg-white rounded-xl p-3 mt-2 border border-black/5 w-[220px]"
              onPress={() => {
                const lat = message.latitude;
                const lon = message.longitude;
                const url = Platform.select({ ios: `maps:0,0?q=${lat},${lon}`, android: `geo:0,0?q=${lat},${lon}` });
                Linking.openURL(url);
              }}
            >
              <View className="w-10 h-10 rounded-lg bg-red-50 items-center justify-center mr-3">
                <Text className="font-material text-2xl text-red-500">location_on</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-slate-800" numberOfLines={1}>{message.content || "Vị trí hiện tại"}</Text>
                <Text className="text-[11px] text-slate-500">Mở trên bản đồ</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Media & Files */}
          {!isRecalled && (Array.isArray(message.media) || Array.isArray(message.files)) && message.type !== 'contact_card' && (
            <View className="mt-2 gap-2">
              <View className="flex-row flex-wrap gap-1">
                {(Array.isArray(message.media) ? message.media : []).map((item, index) => {
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
                      <Image 
                        source={{ uri: file.dataUrl }} 
                        className={`w-full h-full ${isSticker ? "p-2" : ""}`}
                        resizeMode={isSticker ? "contain" : "cover"} 
                      />
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

              <View className="gap-1.5">
                {(Array.isArray(message.files) ? message.files : []).map((item, index) => {
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
            </View>
          )}
        </Pressable>

        {/* Reactions Summary */}
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
  messageBubble: {
    maxWidth: "100%",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
  },
  messageBubbleMe: { 
    backgroundColor: "#dfefff", 
    borderColor: "#c8dcff",
    borderBottomRightRadius: 4 
  },
  messageBubbleOther: { 
    backgroundColor: "#fff", 
    borderColor: "#e3e8f0",
    borderBottomLeftRadius: 4 
  },
});
