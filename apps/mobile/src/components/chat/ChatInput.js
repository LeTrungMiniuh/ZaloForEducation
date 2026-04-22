import { View, TextInput, TouchableOpacity, Text, Keyboard, ScrollView, Image, ActivityIndicator, Platform, StyleSheet } from 'react-native';
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

export default function ChatInput({ onSendMessage, replyTarget, onClearReply, onTyping, onShareLocation, onShareContact }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendImageAsHD, setSendImageAsHD] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
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

  return (
    <View style={styles.composerContainer}>
      {replyTarget && (
        <View className="flex-row items-center bg-blue-50/50 p-2 rounded-xl border-l-[4px] border-blue-600 mb-2 mx-1">
          <View className="mr-2">
            <Text className="font-material text-[20px] text-blue-600">reply</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[10px] font-black text-blue-600 uppercase">Đang trả lời {replyTarget.senderId}</Text>
            <Text className="text-[13px] text-slate-800 italic" numberOfLines={1}>{replyTarget.content || "Đính kèm"}</Text>
          </View>
          <TouchableOpacity className="p-1" onPress={onClearReply}>
            <Text className="font-material text-[18px] text-slate-400">close</Text>
          </TouchableOpacity>
        </View>
      )}

      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[40px] mb-2">
          {attachments.map((a, i) => (
            <View key={i} className="flex-row items-center bg-slate-100 rounded-full px-2.5 py-1 mr-2 border border-slate-200">
              <Text className="font-material text-[16px] text-slate-500 mr-1">{getFileIcon(a.mimeType, a.name)}</Text>
              <Text className="text-[12px] max-w-[100px] text-slate-800 mr-1" numberOfLines={1}>{a.name}</Text>
              <TouchableOpacity onPress={() => removeAttachment(i)}>
                <Text className="font-material text-[16px] text-slate-400">close</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {showStickers && (
          <View className="h-[180px] bg-white border-t border-slate-100 py-2">
              <View className="flex-row px-4 pb-2 border-b border-slate-50 mb-2 gap-4">
                <TouchableOpacity 
                  className={`flex-row items-center py-1.5 px-3 rounded-xl gap-1.5 ${pickerTab === 'stickers' ? "bg-blue-600/10" : ""}`}
                  onPress={() => setPickerTab('stickers')}
                >
                   <Text className={`font-material text-[20px] ${pickerTab === 'stickers' ? "text-[#0058bc]" : "text-slate-500"}`}>mood</Text>
                   <Text className={`text-[13px] font-bold ${pickerTab === 'stickers' ? "text-[#0058bc]" : "text-slate-500"}`}>Sticker</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-row items-center py-1.5 px-3 rounded-xl gap-1.5 ${pickerTab === 'gifs' ? "bg-blue-600/10" : ""}`}
                  onPress={() => setPickerTab('gifs')}
                >
                   <Text className={`font-material text-[20px] ${pickerTab === 'gifs' ? "text-[#0058bc]" : "text-slate-500"}`}>gif_box</Text>
                   <Text className={`text-[13px] font-bold ${pickerTab === 'gifs' ? "text-[#0058bc]" : "text-slate-500"}`}>Meme</Text>
                </TouchableOpacity>
              </View>

              {pickerTab === 'stickers' ? (
                <View className="flex-1">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center', gap: 12 }}>
                      {Object.keys(FLUENT_EMOJI_MAP).map(emoji => (
                          <TouchableOpacity key={emoji} className="w-[70px] h-[70px] rounded-2xl bg-slate-50 items-center justify-center border border-slate-100 shadow-sm" onPress={() => handleSelectSticker(emoji)}>
                              <Image source={{ uri: FLUENT_EMOJI_MAP[emoji] }} className="w-[50px] h-[50px]" resizeMode="contain" />
                          </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              ) : (
                <GifPicker onSelect={handleSelectGif} />
              )}
          </View>
      )}

      <View className="flex-row items-center mb-2 px-1">
        <TouchableOpacity className="w-9 h-9 rounded-full bg-slate-50 items-center justify-center mr-2.5" onPress={pickImages}>
          <Text className="font-material text-[22px] text-slate-700">image</Text>
        </TouchableOpacity>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-slate-50 items-center justify-center mr-2.5" onPress={pickFiles}>
          <Text className="font-material text-[22px] text-slate-700">attach_file</Text>
        </TouchableOpacity>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-slate-50 items-center justify-center mr-2.5" onPress={onShareLocation}>
          <Text className="font-material text-[22px] text-slate-700">location_on</Text>
        </TouchableOpacity>
        <TouchableOpacity className="w-9 h-9 rounded-full bg-slate-50 items-center justify-center mr-2.5" onPress={onShareContact}>
          <Text className="font-material text-[22px] text-slate-700">contact_page</Text>
        </TouchableOpacity>
        <View className="flex-1 flex-row justify-end">
           <TouchableOpacity 
             className={`px-2 py-1 rounded-md border ${sendImageAsHD ? "bg-[#0058bc] border-[#0058bc]" : "bg-slate-100 border-slate-200"}`}
             onPress={() => setSendImageAsHD(!sendImageAsHD)}
           >
             <Text className={`text-[10px] font-bold ${sendImageAsHD ? "text-white" : "text-slate-500"}`}>HD</Text>
           </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={styles.inputOuterContainer}>
          <TextInput
            ref={inputRef}
            multiline
            placeholder="Nhập tin nhắn..."
            placeholderTextColor="#8a9099"
            value={text}
            onChangeText={handleTextChange}
            style={styles.textInput}
            maxLength={2000}
            blurOnSubmit={false}
          />
          <TouchableOpacity className="p-0.5 ml-1" onPress={() => setShowStickers(!showStickers)}>
            <Text className={`font-material text-[24px] ${showStickers ? "text-[#0058bc]" : "text-slate-500"}`}>mood</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[
            styles.sendButton,
            (!text.trim() && attachments.length === 0) && { backgroundColor: "#cbd5e1" }
          ]}
          disabled={(!text.trim() && attachments.length === 0) || isUploading}
          onPress={handleSend}
        >
          {isUploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composerContainer: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5eaf2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: Platform.OS === "ios" ? 14 : 8,
  },
  inputOuterContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#f1f5fa",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  textInput: {
    flex: 1,
    maxHeight: 110,
    minHeight: 36,
    fontSize: 15,
    color: "#1f2631",
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0058bc",
  },
  sendButtonText: {
    fontFamily: "Material Symbols Outlined",
    fontSize: 22,
    color: "#fff",
  },
});
