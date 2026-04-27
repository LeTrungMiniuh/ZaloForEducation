import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Image, TouchableOpacity, ActivityIndicator, FlatList, Dimensions } from 'react-native';
import { Colors } from '../../constants/Theme';

const TENOR_API_KEY = 'LIVDSRZULELA';
const { width } = Dimensions.get('window');

interface StickerItem {
  id: string;
  url: string;
  name: string;
}

interface StickerPickerProps {
  onSelect: (sticker: StickerItem) => void;
}

type StickerLibrary = 'cute' | 'meme' | 'anime' | 'vn';

const LIBRARY_TABS: Array<{ id: StickerLibrary; label: string }> = [
  { id: 'cute', label: 'Cute' },
  { id: 'meme', label: 'Meme' },
  { id: 'anime', label: 'Anime' },
  { id: 'vn', label: 'VN' },
];

const LIBRARY_PRESET_QUERY: Record<StickerLibrary, string> = {
  cute: 'cute sticker',
  meme: 'meme sticker',
  anime: 'anime sticker',
  vn: 'viet nam sticker',
};

export default function StickerPicker({ onSelect, onClose }: { onSelect: (sticker: StickerItem) => void; onClose?: () => void }) {
  const [activeLibrary, setActiveLibrary] = useState<StickerLibrary>('cute');
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchStickers = async () => {
      setLoading(true);
      try {
        const effectiveQuery = query.trim() || LIBRARY_PRESET_QUERY[activeLibrary];
        const url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(effectiveQuery)}&key=${TENOR_API_KEY}&limit=40&searchfilter=sticker`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (isMounted) {
          const normalized: StickerItem[] = (data?.results || [])
            .map((item: any) => {
              const media = item?.media?.[0];
              const stickerUrl = media?.tinygif?.url || media?.gif?.url || media?.nanogif?.url;
              if (!stickerUrl) return null;
              return {
                id: String(item.id || Math.random()),
                name: String(item.content_description || item.title || 'Sticker'),
                url: stickerUrl,
              };
            })
            .filter(Boolean) as StickerItem[];
          setStickers(normalized);
        }
      } catch (e) {
        console.error('Failed to fetch Stickers:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchStickers, 400);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [activeLibrary, query]);

  const renderSticker = ({ item }: { item: StickerItem }) => (
    <TouchableOpacity 
      style={styles.stickerBox} 
      onPress={() => onSelect(item)}
    >
      <Image 
        source={{ uri: item.url }} 
        style={styles.stickerImage} 
        resizeMode="contain"
      />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 }}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>search</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm sticker..."
              placeholderTextColor="#94a3b8"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeIcon}>close</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {LIBRARY_TABS.map((tab) => (
            <TouchableOpacity 
              key={tab.id}
              style={[styles.tab, activeLibrary === tab.id && styles.activeTab]}
              onPress={() => setActiveLibrary(tab.id)}
            >
              <Text style={[styles.tabText, activeLibrary === tab.id && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Đang tải sticker...</Text>
        </View>
      ) : (
        <FlatList
          data={stickers}
          renderItem={renderSticker}
          keyExtractor={(item) => item.id}
          numColumns={4}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Không tìm thấy sticker nào</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 350,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  header: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 40,
  },
  closeBtn: {
    padding: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  closeIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#64748b',
  },
  searchIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    color: '#64748b',
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    padding: 0,
  },
  tabs: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeTab: {
    backgroundColor: '#e0f2fe',
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: Colors.primary,
  },
  list: {
    padding: 6,
  },
  stickerBox: {
    width: (width - 12) / 4 - 8,
    height: 80,
    margin: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  stickerImage: {
    width: 60,
    height: 60,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
  }
});
