import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Typography } from '../../constants/Theme';

const TENOR_API_KEY = 'LIVDSRZULELA'; // Using the same key from web

export default function GifPicker({ onSelect }) {
  const [gifs, setGifs] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchGifs = async () => {
      setLoading(true);
      try {
        const searchQ = query.trim() || 'meme';
        const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(searchQ)}&key=${TENOR_API_KEY}&limit=20`);
        const data = await res.json();
        if (isMounted) {
          setGifs(data.results || []);
        }
      } catch (e) {
        console.error('Failed to fetch GIFs:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const timer = setTimeout(fetchGifs, 500);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>search</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm GIF..."
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      
      {loading && gifs.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gifList}>
          {gifs.map((g) => (
            <TouchableOpacity 
              key={g.id} 
              onPress={() => onSelect(g.media[0].gif.url)}
              style={styles.gifItem}
            >
              <Image 
                source={{ uri: g.media[0].tinygif.url }} 
                style={styles.gifImage} 
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 120,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    padding: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
  },
  searchIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#64748b',
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    padding: 0,
  },
  gifList: {
    paddingRight: 20,
  },
  gifItem: {
    marginRight: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  gifImage: {
    width: 100,
    height: 60,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
