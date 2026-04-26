import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from '../../screens/main/style/ChatScreen.styles';

interface ChatHeaderProps {
  insets: { top: number };
  goBack?: () => void;
  selectedChat: any;
  displayName: string;
  displayAvatar: string;
  isOnline: boolean;
  typingText: string;
  onStartCall: (type: 'audio' | 'video') => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  insets,
  goBack,
  selectedChat,
  displayName,
  displayAvatar,
  isOnline,
  typingText,
  onStartCall,
}) => {
  return (
    <LinearGradient colors={["#0058bc", "#00418f"]} style={[styles.header, { paddingTop: insets.top }]}>
      <TouchableOpacity 
        onPress={goBack}
        style={{ paddingRight: 10, paddingVertical: 5 }}
      >
        <Text style={styles.headerBack}>arrow_back</Text>
      </TouchableOpacity>
      <View style={styles.avatarContainer}>
        <Image 
          source={{ uri: displayAvatar }} 
          style={styles.headerAvatar} 
        />
        {isOnline && (
          <View style={styles.onlineBadge} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.headerSub}>{typingText}</Text>
      </View>
      <View style={styles.headerIcons}>
        <TouchableOpacity style={styles.headerIconButton} onPress={() => onStartCall('audio')}>
          <Text style={styles.headerIcon}>call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconButton} onPress={() => onStartCall('video')}>
          <Text style={styles.headerIcon}>videocam</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconButton}>
          <Text style={styles.headerIcon}>list</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};
