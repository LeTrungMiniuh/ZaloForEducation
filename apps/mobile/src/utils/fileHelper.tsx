import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Alert from './Alert';

/**
 * Download a file from a URL and optionally open/share it
 */
export const downloadAndOpenFile = async (url: string, fileName: string, mimeType: string) => {
  if (!url) return;

  try {
    const fileUri = `${(FileSystem as any).cacheDirectory}${fileName}`;
    
    // Check if file exists in cache already
    const info = await FileSystem.getInfoAsync(fileUri);
    
    let finalUri = fileUri;
    if (!info.exists) {
      console.log('[FileHelper] Downloading:', url);
      const { uri } = await FileSystem.downloadAsync(url, fileUri);
      finalUri = uri;
    }

    if (Platform.OS === 'ios') {
      await Sharing.shareAsync(finalUri);
    } else {
      // Android: Try to open with intent launcher first, fallback to sharing
      try {
        const contentUri = await FileSystem.getContentUriAsync(finalUri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1,
          type: mimeType,
        });
      } catch (e) {
        console.warn('[FileHelper] IntentLauncher failed, falling back to Sharing', e);
        await Sharing.shareAsync(finalUri);
      }
    }
  } catch (error) {
    console.error('[FileHelper] Error:', error);
    Alert.alert('Lỗi', 'Không thể mở tệp tin này.');
  }
};

/**
 * Save an image to the gallery (Simplified using sharing as fallback)
 */
export const saveImageToGallery = async (url: string, fileName: string) => {
  try {
    const fileUri = `${(FileSystem as any).cacheDirectory}${fileName}`;
    const { uri } = await FileSystem.downloadAsync(url, fileUri);
    await Sharing.shareAsync(uri);
  } catch (error) {
    console.error('[FileHelper] Save error:', error);
    Alert.alert('Lỗi', 'Không thể tải xuống hình ảnh.');
  }
};
