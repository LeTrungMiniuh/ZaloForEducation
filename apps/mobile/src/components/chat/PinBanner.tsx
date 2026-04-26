import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import styles from '../../screens/main/style/ChatScreen.styles';
import { getMessagePreview } from '../../utils/chatUtils';

interface PinBannerProps {
  activePinnedMessages: any[];
  isPinsExpanded: boolean;
  setIsPinsExpanded: (val: boolean) => void;
  onJumpToMessage: (id: string) => void;
  onUnpin: (id: string) => void;
}

export const PinBanner: React.FC<PinBannerProps> = ({
  activePinnedMessages,
  isPinsExpanded,
  setIsPinsExpanded,
  onJumpToMessage,
  onUnpin,
}) => {
  if (activePinnedMessages.length === 0) return null;

  return (
    <View style={styles.pinBannerContainer}>
      <View style={styles.pinBanner}>
        <TouchableOpacity 
          style={styles.pinBannerMain}
          onPress={() => isPinsExpanded ? setIsPinsExpanded(false) : onJumpToMessage(activePinnedMessages[0].id)}
        >
          <View style={styles.pinBannerIconBox}>
            <Text style={styles.pinBannerIcon}>push_pin</Text>
          </View>
          <View style={styles.pinBannerContent}>
            {activePinnedMessages.length > 1 && !isPinsExpanded ? (
              <Text style={styles.pinBannerCount}>{activePinnedMessages.length} tin nhắn ghim</Text>
            ) : (
              <>
                <Text style={styles.pinBannerLabel}>TIN NHẮN ĐÃ GHIM</Text>
                <Text style={styles.pinBannerText} numberOfLines={1}>
                  {activePinnedMessages[0].isPlaceholder ? "Đang tải tin nhắn..." : getMessagePreview(activePinnedMessages[0])}
                </Text>
              </>
            )}
          </View>
          {activePinnedMessages.length > 1 && (
            <TouchableOpacity onPress={() => setIsPinsExpanded(!isPinsExpanded)} style={styles.pinBannerToggle}>
              <Text style={styles.pinBannerToggleIcon}>
                {isPinsExpanded ? "expand_less" : "expand_more"}
              </Text>
            </TouchableOpacity>
          )}
          {activePinnedMessages.length === 1 && (
            <TouchableOpacity onPress={() => onUnpin(activePinnedMessages[0].id)} style={styles.pinBannerToggle}>
              <Text style={styles.pinBannerToggleIcon}>close</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {isPinsExpanded && activePinnedMessages.length > 1 && (
          <View style={styles.pinExpandedList}>
            {activePinnedMessages.map((m, idx) => (
              <View key={`pin-item-${m.id}`} style={styles.pinExpandedItem}>
                <Text style={styles.pinExpandedIdx}>{idx + 1}</Text>
                <TouchableOpacity 
                  style={styles.pinExpandedContent}
                  onPress={() => {
                    onJumpToMessage(m.id);
                    setIsPinsExpanded(false);
                  }}
                >
                  <Text style={styles.pinExpandedText} numberOfLines={1}>
                    {m.isPlaceholder ? "Đang tải..." : getMessagePreview(m)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onUnpin(m.id)} style={styles.pinExpandedUnpin}>
                  <Text style={styles.pinExpandedUnpinIcon}>close</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};
