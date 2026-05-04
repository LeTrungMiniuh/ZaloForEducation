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
  Platform,
  Modal,
  ScrollView
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
  const [filterSender, setFilterSender] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const galleryData = useMemo(() => {
    const media: any[] = [];
    const files: any[] = [];
    const links: any[] = [];
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    // Filter messages for this conversation
    const convMessages = messages.filter(m => m.conversationId === conversationId || m.convId === conversationId);

    // Get unique senders
    const senders = new Set<string>();
    convMessages.forEach(m => {
      if (m.senderId) senders.add(m.senderId);
    });

    // Apply filter logic
    const applyFilters = (items: any[]) => {
      return items.filter((item: any) => {
        if (filterSender && item.senderId !== filterSender) return false;
        const itemDate = new Date(item.createdAt);
        if (dateFrom && itemDate < dateFrom) return false;
        if (dateTo) {
          const nextDay = new Date(dateTo);
          nextDay.setDate(nextDay.getDate() + 1);
          if (itemDate >= nextDay) return false;
        }
        return true;
      });
    };

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
      media: applyFilters(media.reverse()),
      files: applyFilters(files.reverse()),
      links: applyFilters(links.reverse()),
      senders: Array.from(senders)
    };
  }, [messages, conversationId, filterSender, dateFrom, dateTo]);

  const renderMediaItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.mediaItem}
      onPress={() => navigation.navigate('MediaDetail', { 
        mediaUrl: item.dataUrl || item.url,
        mimeType: item.mimeType
      })}
    >
      <Image source={{ uri: item.dataUrl || item.url }} style={styles.mediaThumb} />
      <View style={styles.mediaOverlay}>
        {item.mimeType?.startsWith('video/') && (
          <View style={styles.playIconOverlay}>
            <Text style={styles.playIcon}>play_circle</Text>
          </View>
        )}
        <View style={styles.mediaMetadata}>
          <Text style={styles.mediaDate}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</Text>
          {item.senderId && galleryData.senders.length > 1 && (
            <Text style={styles.mediaSender}>{getSenderName(item.senderId)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const getFileIcon = (filename: string, mimeType: string) => {
    const ext = filename?.split('.')?.pop()?.toLowerCase() || '';
    const mime = mimeType?.toLowerCase() || '';
    
    if (mime.includes('pdf')) return 'picture_as_pdf';
    if (mime.includes('word') || ext === 'doc' || ext === 'docx') return 'description';
    if (mime.includes('sheet') || ext === 'xls' || ext === 'xlsx') return 'table_chart';
    if (mime.includes('powerpoint') || ext === 'ppt' || ext === 'pptx') return 'slideshow';
    if (mime.includes('zip') || mime.includes('rar') || ext === 'zip' || ext === 'rar') return 'folder_zip';
    if (mime.includes('image')) return 'image';
    if (mime.includes('video')) return 'videocam';
    if (mime.includes('audio')) return 'audio_file';
    return 'description';
  };

  const renderFileItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.fileItem}
      onPress={() => Linking.openURL(item.dataUrl || item.url)}
    >
      <View style={styles.fileIconBox}>
        <Text style={styles.fileIcon}>{getFileIcon(item.name, item.mimeType)}</Text>
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>{item.name || 'Tệp tin'}</Text>
        <Text style={styles.fileSize}>
          {((item.size || 0) / 1024 / 1024).toFixed(2)} MB • {new Date(item.createdAt).toLocaleDateString('vi-VN')}
        </Text>
        {item.senderId && galleryData.senders.length > 1 && (
          <Text style={styles.fileSender}>{getSenderName(item.senderId)}</Text>
        )}
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
        <Text style={styles.linkDate}>
          {new Date(item.createdAt).toLocaleDateString('vi-VN')}
          {item.senderId && galleryData.senders.length > 1 ? ` • ${userProfiles[item.senderId]?.nickname || userProfiles[item.senderId]?.fullName || item.senderId}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const getSenderName = (senderId: string) => {
    return userProfiles[senderId]?.nickname || userProfiles[senderId]?.fullName || userProfiles[senderId]?.fullname || senderId;
  };

  const getFilterLabel = () => {
    let label = '';
    if (filterSender) label += `Từ: ${getSenderName(filterSender)}`;
    if (dateFrom) {
      if (label) label += ' • ';
      label += `Từ: ${dateFrom.toLocaleDateString('vi-VN')}`;
    }
    if (dateTo) {
      if (label) label += ' • ';
      label += `Đến: ${dateTo.toLocaleDateString('vi-VN')}`;
    }
    return label;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.headerIcon}>arrow_back_ios</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kho lưu trữ</Text>
        <TouchableOpacity onPress={() => setShowFilterMenu(!showFilterMenu)} style={styles.filterBtn}>
          <Text style={styles.headerIcon}>tune</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Display */}
      {getFilterLabel() && (
        <View style={styles.filterDisplay}>
          <Text style={styles.filterText}>{getFilterLabel()}</Text>
          <TouchableOpacity onPress={() => {
            setFilterSender(null);
            setDateFrom(null);
            setDateTo(null);
          }}>
            <Text style={styles.clearFilterText}>Xóa bộ lọc</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* Filter Menu Modal */}
      <Modal
        visible={showFilterMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterMenu(false)}
      >
        <View style={styles.filterMenuOverlay}>
          <View style={styles.filterMenuContent}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Bộ lọc</Text>
              <TouchableOpacity onPress={() => setShowFilterMenu(false)}>
                <Text style={styles.filterMenuClose}>close</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.filterMenuScroll}>
              {/* Sender Filter */}
              {galleryData.senders.length > 0 && (
                <View style={styles.filterSection}>
                  <Text style={styles.filterSectionTitle}>Lọc theo người gửi</Text>
                  <TouchableOpacity 
                    style={[styles.filterOption, !filterSender && styles.filterOptionActive]}
                    onPress={() => setFilterSender(null)}
                  >
                    <Text style={[styles.filterOptionText, !filterSender && styles.filterOptionTextActive]}>Tất cả</Text>
                  </TouchableOpacity>
                  {galleryData.senders.map((senderId: string) => (
                    <TouchableOpacity 
                      key={senderId}
                      style={[styles.filterOption, filterSender === senderId && styles.filterOptionActive]}
                      onPress={() => setFilterSender(senderId)}
                    >
                      <Text style={[styles.filterOptionText, filterSender === senderId && styles.filterOptionTextActive]}>
                        {getSenderName(senderId)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              {/* Date Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Lọc theo ngày</Text>
                <TouchableOpacity 
                  style={styles.datePickerBtn}
                  onPress={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 7);
                    setDateFrom(d);
                  }}
                >
                  <Text style={styles.datePickerText}>
                    {dateFrom ? `Từ: ${dateFrom.toLocaleDateString('vi-VN')}` : 'Chọn ngày từ'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.datePickerBtn}
                  onPress={() => setDateTo(new Date())}
                >
                  <Text style={styles.datePickerText}>
                    {dateTo ? `Đến: ${dateTo.toLocaleDateString('vi-VN')}` : 'Chọn ngày đến'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  filterBtn: {
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
    flex: 1,
    textAlign: 'center',
  },
  filterDisplay: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterText: {
    fontSize: 12,
    color: '#0369a1',
    flex: 1,
  },
  clearFilterText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },
  filterMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterMenuContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    marginTop: 'auto',
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterMenuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2631',
  },
  filterMenuClose: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#1f2631',
  },
  filterMenuScroll: {
    padding: 16,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1f2631',
    marginBottom: 10,
  },
  filterOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f1f5f9',
  },
  filterOptionActive: {
    backgroundColor: Colors.primary,
  },
  filterOptionText: {
    fontSize: 13,
    color: '#1f2631',
  },
  filterOptionTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  datePickerBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  datePickerText: {
    fontSize: 13,
    color: '#1f2631',
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
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  playIconOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 32,
    color: '#fff',
  },
  mediaMetadata: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  mediaDate: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '500',
  },
  mediaSender: {
    fontSize: 9,
    color: '#cbd5e1',
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
  fileSender: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
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
