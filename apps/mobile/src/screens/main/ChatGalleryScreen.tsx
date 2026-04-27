import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  Linking,
  Platform
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../context/AuthContext';
import { normalizeAttachment } from '../../store/chatHelpers';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_SIZE = (width - 32 - 16) / COLUMN_COUNT;

const ChatGalleryScreen = ({ route, navigation }: any) => {
  const { conversationId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { messages, userProfiles } = useChatStore();
  
  const [activeTab, setActiveTab] = useState<'media' | 'files' | 'links'>('media');

  const galleryData = useMemo(() => {
    const media: any[] = [];
    const files: any[] = [];
    const links: any[] = [];
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Filter messages for this conversation
    const convMessages = messages.filter(m => m.conversationId === conversationId || m.convId === conversationId);

    convMessages.forEach(m => {
      // 1. Media (Images/Videos)
      if (Array.isArray(m.media)) {
        m.media.forEach((item: any) => {
          const normalized = normalizeAttachment(item);
          if (normalized.mimeType?.startsWith('image/') || normalized.mimeType?.startsWith('video/')) {
            media.push({ ...normalized, messageId: m.id, createdAt: m.createdAt, senderId: m.senderId });
          }
        });
      }

      // 2. Files
      if (Array.isArray(m.files)) {
        m.files.forEach((item: any) => {
          const normalized = normalizeAttachment(item);
          const fileName = (normalized.name || '').toLowerCase();
          const mimeType = (normalized.mimeType || '').toLowerCase();
          
          // Exclude contact.json, location.json and audio recordings
          const isSystemFile = fileName === 'contact.json' || fileName === 'location.json';
          const isAudioRecording = mimeType.startsWith('audio/');
          
          if (!isSystemFile && !isAudioRecording) {
            files.push({ ...normalized, messageId: m.id, createdAt: m.createdAt, senderId: m.senderId });
          }
        });
      }

      // 3. Links
      const content = typeof m.content === 'string' ? m.content : '';
      const matches = content.match(urlRegex);
      if (matches) {
        matches.forEach((url: string) => {
          links.push({ url, createdAt: m.createdAt, senderId: m.senderId });
        });
      }
    });

    return {
      media: media.reverse(),
      files: files.reverse(),
      links: links.reverse()
    };
  }, [messages, conversationId]);

  const renderMediaItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.mediaItem}
      onPress={() => navigation.navigate('MediaDetail', { 
        mediaUrl: item.dataUrl || item.url,
        mimeType: item.mimeType
      })}
    >
      <Image source={{ uri: item.dataUrl || item.url }} style={styles.mediaThumb} />
      {item.mimeType?.startsWith('video/') && (
        <View style={styles.playIconOverlay}>
          <Text style={styles.playIcon}>play_circle</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderFileItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.fileItem}
      onPress={() => Linking.openURL(item.dataUrl || item.url)}
    >
      <View style={styles.fileIconBox}>
        <Text style={styles.fileIcon}>description</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name || 'Tệp tin'}</Text>
        <Text style={styles.fileSize}>
          {((item.size || 0) / 1024 / 1024).toFixed(2)} MB • {new Date(item.createdAt).toLocaleDateString('vi-VN')}
        </Text>
      </View>
      <Text style={styles.downloadIcon}>download</Text>
    </TouchableOpacity>
  );

  const renderLinkItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.linkItem}
      onPress={() => Linking.openURL(item.url)}
    >
      <View style={styles.linkIconBox}>
        <Text style={styles.linkIcon}>link</Text>
      </View>
      <View style={styles.linkInfo}>
        <Text style={styles.linkUrl} numberOfLines={1}>{item.url}</Text>
        <Text style={styles.linkDate}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.headerIcon}>arrow_back_ios</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kho lưu trữ</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'media' && styles.activeTab]} 
          onPress={() => setActiveTab('media')}
        >
          <Text style={[styles.tabText, activeTab === 'media' && styles.activeTabText]}>ẢNH/VIDEO</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'files' && styles.activeTab]} 
          onPress={() => setActiveTab('files')}
        >
          <Text style={[styles.tabText, activeTab === 'files' && styles.activeTabText]}>FILE</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'links' && styles.activeTab]} 
          onPress={() => setActiveTab('links')}
        >
          <Text style={[styles.tabText, activeTab === 'links' && styles.activeTabText]}>LINK</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'media' && (
          <FlatList
            data={galleryData.media}
            renderItem={renderMediaItem}
            keyExtractor={(item, index) => `media-${index}`}
            numColumns={COLUMN_COUNT}
            contentContainerStyle={styles.mediaGrid}
            ListEmptyComponent={<Text style={styles.emptyText}>Chưa có ảnh hoặc video</Text>}
          />
        )}
        {activeTab === 'files' && (
          <FlatList
            data={galleryData.files}
            renderItem={renderFileItem}
            keyExtractor={(item, index) => `file-${index}`}
            contentContainerStyle={styles.listPadding}
            ListEmptyComponent={<Text style={styles.emptyText}>Chưa có tệp tin nào</Text>}
          />
        )}
        {activeTab === 'links' && (
          <FlatList
            data={galleryData.links}
            renderItem={renderLinkItem}
            keyExtractor={(item, index) => `link-${index}`}
            contentContainerStyle={styles.listPadding}
            ListEmptyComponent={<Text style={styles.emptyText}>Chưa có đường dẫn nào</Text>}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.primary,
  },
  backBtn: {
    padding: 8,
  },
  headerIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748b',
  },
  activeTabText: {
    color: Colors.primary,
  },
  content: {
    flex: 1,
  },
  mediaGrid: {
    padding: 16,
    gap: 8,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  mediaThumb: {
    width: '100%',
    height: '100%',
  },
  playIconOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  listPadding: {
    padding: 16,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  fileIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#3b82f6',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: '#64748b',
  },
  downloadIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#94a3b8',
    marginLeft: 8,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  linkIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  linkIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#475569',
  },
  linkInfo: {
    flex: 1,
  },
  linkUrl: {
    fontSize: 15,
    color: '#3b82f6',
    marginBottom: 4,
  },
  linkDate: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#94a3b8',
    fontSize: 14,
  }
});

export default ChatGalleryScreen;
