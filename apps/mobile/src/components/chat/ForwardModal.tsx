import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, Image, TextInput, Pressable } from 'react-native';
import styles from '../../screens/main/style/ChatScreen.styles';
import { useChatStore } from '../../store/chatStore';

interface ForwardModalProps {
  visible: boolean;
  onClose: () => void;
  message: any;
  onForward: (conversationId: string) => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  visible,
  onClose,
  message,
  onForward,
}) => {
  const { conversations } = useChatStore();
  const [searchText, setSearchText] = useState("");

  const filtered = useMemo(() => {
    return conversations.filter(c => 
      !searchText || c.name?.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [conversations, searchText]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.forwardCard} onPress={e => e.stopPropagation()}>
          <View style={styles.forwardHeader}>
            <Text style={styles.forwardTitle}>Chuyển tiếp tin nhắn</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.forwardClose}>close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.forwardSearch}>
            <TextInput
              style={styles.forwardSearchInput}
              placeholder="Tìm kiếm hội thoại..."
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={styles.forwardItem}
                onPress={() => {
                  onForward(item.id);
                  onClose();
                }}
              >
                <Image 
                  source={{ uri: item.avatar || "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png" }} 
                  style={styles.forwardAvatar} 
                />
                <Text style={styles.forwardName}>{item.name}</Text>
                <TouchableOpacity style={styles.forwardSendBtn} onPress={() => { onForward(item.id); onClose(); }}>
                  <Text style={styles.forwardSendText}>Gửi</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            style={{ maxHeight: 400 }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
