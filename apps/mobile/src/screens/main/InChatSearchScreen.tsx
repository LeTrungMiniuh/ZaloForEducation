import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatStore } from '../../store/chatStore';
import { Colors } from '../../constants/Theme';
import { useAuth } from '../../context/AuthContext';

const InChatSearchScreen = ({ route, navigation }: any) => {
  const { conversationId, chatName } = route.params;
  const { user } = useAuth();
  const {
    searchMessages,
    localSearchResults,
    isLocalSearching,
    clearLocalSearchResults,
    setActiveConversation,
    userProfiles,
  } = useChatStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Focus input on mount
    setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearLocalSearchResults();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length >= 2) {
      const timer = setTimeout(() => {
        searchMessages(conversationId, q);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      clearLocalSearchResults();
    }
  }, [query]);

  const handleSelectMessage = (messageId: string) => {
    // Navigate back to ChatScreen and scroll to message
    setActiveConversation(conversationId, messageId);
    navigation.navigate('Chat', { conversationId, targetMessageId: messageId });
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.email) return 'Bạn';
    const profile = userProfiles[senderId];
    return profile?.nickname || profile?.fullName || profile?.fullname || senderId;
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleSelectMessage(item.id || item.SK)}
    >
      <View style={styles.resultHeader}>
        <Text style={styles.senderName}>{getSenderName(item.senderId)}</Text>
        <Text style={styles.timestamp}>
          {item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN', { 
            hour: '2-digit', 
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
          }) : ''}
        </Text>
      </View>
      <Text style={styles.messageContent} numberOfLines={2}>
        {item.content}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.iconText}>arrow_back</Text>
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={`Tìm trong ${chatName || 'cuộc trò chuyện'}`}
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#94a3b8"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
              <Text style={styles.clearIcon}>close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        {isLocalSearching ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.infoText}>Đang tìm kiếm...</Text>
          </View>
        ) : query.length < 2 ? (
          <View style={styles.centerBox}>
            <Text style={styles.iconLarge}>search</Text>
            <Text style={styles.infoText}>
              Nhập từ khóa (tối thiểu 2 ký tự) để tìm kiếm tin nhắn trong hội thoại này
            </Text>
          </View>
        ) : localSearchResults.length === 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.iconLarge}>sentiment_dissatisfied</Text>
            <Text style={styles.infoText}>Không tìm thấy kết quả cho "{query}"</Text>
          </View>
        ) : (
          <FlatList
            data={localSearchResults}
            renderItem={renderItem}
            keyExtractor={(item) => item.id || item.SK}
            contentContainerStyle={styles.listContent}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 8,
  },
  iconText: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: '#475569',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: 15,
    color: '#1e293b',
  },
  clearBtn: {
    padding: 4,
  },
  clearIcon: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: '#94a3b8',
  },
  content: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconLarge: {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 64,
    color: '#e2e8f0',
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: 8,
  },
  resultItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#334155',
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  messageContent: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
});

export default InChatSearchScreen;
