import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, SafeAreaView, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { saveImageToGallery } from '../../utils/fileHelper';

const { width, height } = Dimensions.get('window');

const MediaDetailScreen = ({ params, goBack }: any) => {
  const { url, name, mimeType } = params || {};
  const [loading, setLoading] = useState(true);

  const isVideo = String(mimeType || "").toLowerCase().startsWith("video/") || 
                  /\.(mp4|mov|avi|wmv|webm|mkv|3gp|flv|m4v)(\?.*)?$/.test(String(url || name).toLowerCase());

  const player = isVideo ? useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  }) : null;

  useEffect(() => {
    if (!isVideo) {
      setLoading(false);
    }
  }, [isVideo]);

  const handleDownload = () => {
    saveImageToGallery(url, name || (isVideo ? `video_${Date.now()}.mp4` : `image_${Date.now()}.jpg`));
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.closeBtn}>
          <Text style={styles.iconText}>close</Text>
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{name || 'Media'}</Text>
        </View>

        <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn}>
          <Text style={styles.iconText}>download</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <View style={styles.content}>
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>Đang tải...</Text>
          </View>
        )}

        {isVideo ? (
          <VideoView
            player={player!}
            style={styles.fullMedia}
            contentFit="contain"
            onLayout={() => setLoading(false)}
          />
        ) : (
          <Image
            source={{ uri: url }}
            style={styles.fullMedia}
            resizeMode="contain"
            onLoad={() => setLoading(false)}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    zIndex: 10,
    height: 100,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    marginHorizontal: 16,
    alignItems: 'center',
  },
  fileName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  iconText: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullMedia: {
    width: width,
    height: height * 0.85,
  },
  loadingContainer: {
    position: 'absolute',
    zIndex: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 14,
  },
});

export default MediaDetailScreen;
