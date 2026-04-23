import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

interface SystemNotificationItemProps {
  message: any;
  onJump?: (id: string) => void;
}

const SystemNotificationItem = ({ message, onJump }: SystemNotificationItemProps) => {
  const isReaction = message.metadata?.type === 'reaction_notification';
  const targetId = message.metadata?.targetMessageId;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.bubble} 
        onPress={() => targetId && onJump?.(targetId)}
        disabled={!targetId}
      >
        <Text style={styles.text}>{message.content}</Text>
        {targetId && <Text style={styles.hint}>Nhấn để xem tin nhắn</Text>}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 12,
    paddingHorizontal: 30,
  },
  bubble: {
    backgroundColor: '#f1f2f4',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: '#65676b',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  hint: {
    fontSize: 10,
    color: '#0084ff',
    marginTop: 2,
    fontWeight: '600',
  }
});

export default SystemNotificationItem;
