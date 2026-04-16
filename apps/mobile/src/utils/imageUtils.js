import * as ImageManipulator from 'expo-image-manipulator';

/**
 * COMPRESS IMAGE ON MOBILE (EXPO)
 */
export const compressImage = async (uri, maxWidth = 1024, quality = 0.7) => {
  try {
    const actions = [
      {
        resize: { width: maxWidth },
      },
    ];

    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    return result; // Result contains uri, width, height
  } catch (error) {
    console.error('Error compressing image:', error);
    throw error;
  }
};
