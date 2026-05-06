import { Audio } from 'expo-av';
import { Platform } from 'react-native';

class SoundService {
  private ringtoneSound: Audio.Sound | null = null;
  private ringbackSound: Audio.Sound | null = null;

  async playRingtone() {
    try {
      if (this.ringtoneSound) return;
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        require('../assets/audio_sound/ringtone.mp3'),
        { shouldPlay: true, isLooping: true }
      );
      this.ringtoneSound = sound;
    } catch (error) {
      console.log('[SoundService] playRingtone error:', error);
    }
  }

  async stopRingtone() {
    if (this.ringtoneSound) {
      try {
        await this.ringtoneSound.stopAsync();
        await this.ringtoneSound.unloadAsync();
      } catch (e) {}
      this.ringtoneSound = null;
    }
  }

  async playRingback() {
    try {
      if (this.ringbackSound) return;

      const { sound } = await Audio.Sound.createAsync(
        require('../assets/audio_sound/ringback.mp3'),
        { shouldPlay: true, isLooping: true }
      );
      this.ringbackSound = sound;
    } catch (error) {
      console.log('[SoundService] playRingback error:', error);
    }
  }

  async stopRingback() {
    if (this.ringbackSound) {
      try {
        await this.ringbackSound.stopAsync();
        await this.ringbackSound.unloadAsync();
      } catch (e) {}
      this.ringbackSound = null;
    }
  }

  async stopAll() {
    await this.stopRingtone();
    await this.stopRingback();
  }
}

export default new SoundService();
