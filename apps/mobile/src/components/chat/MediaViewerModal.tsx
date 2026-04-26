import React from 'react';
import { Modal, View, Image, StyleSheet, TouchableOpacity, Text, SafeAreaView, Platform, Dimensions } from 'react-native';
import { saveImageToGallery } from '../../utils/fileHelper';

const { width, height } = Dimensions.get('window');

interface MediaViewerModalProps {
  visible: boolean;
  mediaUrl: string | null | undefined;
  onClose: () => void;
  fileName?: string | null;
}

const MediaViewerModal = ({ visible, mediaUrl, onClose, fileName }: MediaViewerModalProps) => {
  if (!mediaUrl) return null;

  const handleDownload = () => {
    saveImageToGallery(mediaUrl, fileName || `image_${Date.now()}.jpg`);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <SafeAreaView style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.iconText}>close</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn}>
            <Text style={styles.iconText}>download</Text>
          </TouchableOpacity>
        </SafeAreaView>

        <View style={styles.content}>
          <Image
            source={{ uri: mediaUrl }}
            style={styles.fullImage}
            resizeMode="contain"
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
  fullImage: {
    width: width,
    height: height * 0.8,
  },
});

export default MediaViewerModal;
