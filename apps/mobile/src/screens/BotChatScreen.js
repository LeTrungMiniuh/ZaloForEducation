import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Colors, Typography } from '../constants/Theme';
import { BOT_EMAIL, BOT_AVATAR } from '../constants/bot';
import { apiRequest } from '../utils/api';
import SocketService from '../utils/socket';
import { useAuth } from '../context/AuthContext';

const TypingDots = () => {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (node: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(node, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(node, { toValue: 0.3, duration: 200, useNativeDriver: true }),
        ]),
      );

    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 150);
    const a3 = animate(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.typingDot, { opacity: dot }]}
        />
      ))}
    </View>
  );
};

const normalizeApiPayload = (res) => {
  if (!res || typeof res !== 'object') return res;
  if (Object.prototype.hasOwnProperty.call(res, 'data')) return res.data;
  const payload = { ...res };
  delete payload.ok;
  delete payload.status;
  return payload;
};

const normalizeApiResponse = (res) => ({
  ...res,
  data: normalizeApiPayload(res),
});

const chatGet = async (path) => {
  let res = await apiRequest(`/chat${path}`);
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`);
  }
  return normalizeApiResponse(res);
};

const chatPost = async (path, body) => {
  let res = await apiRequest(`/chat${path}`, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
  if (!res?.ok && res?.status === 404) {
    res = await apiRequest(`/api/chat${path}`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }
  return normalizeApiResponse(res);
};

export default function BotChatScreen() {
  const { user } = useAuth();
  const [botMessages, setBotMessages] = useState([]);
  const [botInput, setBotInput] = useState('');
  const [botSending, setBotSending] = useState(false);
  const [botConvId, setBotConvId] = useState(null);
  const botScrollRef = useRef(null);

  // Create bot conversation on mount
  useEffect(() => {
    const initBot = async () => {
      try {
        const res = await apiRequest('/bot/conversation', { method: 'POST', body: JSON.stringify({}) });
        if (res?.convId) {
          setBotConvId(res.convId);
          const msgRes = await chatGet(`/conversations/${encodeURIComponent(res.convId)}/messages`);
          const loaded = msgRes?.messages || msgRes?.data?.messages || [];
          setBotMessages(loaded);
        }
      } catch (err) {
        console.error('Failed to init bot', err);
      }
    };
    if (user?.email) initBot();
  }, [user?.email]);

  // Listen for bot messages via socket
  useEffect(() => {
    const socket = SocketService.socket;
    if (!socket || !botConvId) return;

    const handleBotMessage = (msg) => {
      if (!msg?.id) return;
      const incomingConvId = msg.conversationId || msg.convId;
      if (incomingConvId !== botConvId) return;

      setBotMessages((prev) => {
        const existed = prev.some((item) => item.id === msg.id);
        return existed ? prev.map((item) => (item.id === msg.id ? msg : item)) : [...prev, msg];
      });
      // Only stop typing when bot replies, not when user's own message echoes back
      if (msg.senderId === BOT_EMAIL) {
        setBotSending(false);
      }
    };

    socket.on('receiveMessage', handleBotMessage);
    return () => socket.off('receiveMessage', handleBotMessage);
  }, [botConvId]);

  // Auto join bot room
  useEffect(() => {
    if (SocketService.socket && botConvId) {
      SocketService.socket.emit('join_room', { convId: botConvId });
    }
  }, [botConvId]);

  // Auto scroll
  useEffect(() => {
    if (botScrollRef.current) {
      setTimeout(() => botScrollRef.current?.scrollToEnd?.({ animated: true }), 60);
    }
  }, [botMessages]);

  const sendBotMessage = async () => {
    if (!botInput.trim() || !botConvId || botSending) return;
    const text = botInput.trim();
    setBotInput('');
    setBotSending(true);

    try {
      const res = await chatPost(`/conversations/${encodeURIComponent(botConvId)}/messages`, { content: text });
      const created = res?.data || res;
      if (created?.id) {
        setBotMessages((prev) => {
          const existed = prev.some((item) => item.id === created.id);
          return existed ? prev : [...prev, created];
        });
        if (SocketService.socket) {
          SocketService.socket.emit('sendMessage', { convId: botConvId, message: { ...created, conversationId: botConvId } });
        }
      }
    } catch (err) {
      console.error('Send bot message failed', err);
      setBotSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={{ uri: BOT_AVATAR }} style={styles.headerAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>ZaloEdu AI</Text>
          <Text style={styles.headerSub}>{botSending ? 'Đang soạn tin...' : 'Trợ lý giáo dục'}</Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView ref={botScrollRef} style={styles.messagesContainer} contentContainerStyle={{ padding: 12, gap: 10 }}>
        {botMessages.length === 0 && (
          <View style={styles.welcome}>
            <Text style={styles.welcomeIcon}>smart_toy</Text>
            <Text style={styles.welcomeTitle}>Chào bạn! Tôi là ZaloEdu AI</Text>
            <Text style={styles.welcomeText}>
              Hỏi tôi về thông tin tài khoản, bạn bè, hoặc bất kỳ câu hỏi giáo dục nào!
            </Text>
          </View>
        )}
        {botMessages.map((msg) => {
          const isMe = msg.senderId === user?.email;
          return (
            <View key={msg.id} style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowBot]}>
              {!isMe && <Image source={{ uri: BOT_AVATAR }} style={styles.msgAvatar} />}
              <View style={[styles.messageBubble, isMe ? styles.bubbleMe : styles.bubbleBot]}>
                <Text style={styles.messageText}>{msg.content}</Text>
              </View>
            </View>
          );
        })}
        {botSending && (
          <View style={[styles.messageRow, styles.messageRowBot]}>
            <Image source={{ uri: BOT_AVATAR }} style={styles.msgAvatar} />
            <View style={[styles.messageBubble, styles.bubbleBot]}>
              <TypingDots />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={styles.composer}>
        <TextInput
          value={botInput}
          onChangeText={setBotInput}
          placeholder="Hỏi tôi bất cứ điều gì..."
          placeholderTextColor="#8a9099"
          style={styles.composerInput}
          multiline
          onSubmitEditing={sendBotMessage}
        />
        <TouchableOpacity
          onPress={sendBotMessage}
          style={[styles.sendButton, botSending && { opacity: 0.6 }]}
          disabled={botSending}
        >
          {botSending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendButtonText}>send</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f9fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ecf0',
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerName: { ...Typography.heading, fontSize: 16, color: '#191c1e' },
  headerSub: { ...Typography.body, fontSize: 12, color: '#727784' },
  messagesContainer: { flex: 1 },
  welcome: { alignItems: 'center', paddingVertical: 40 },
  welcomeIcon: { fontFamily: 'Material Symbols Outlined', fontSize: 60, color: '#00418f', marginBottom: 12 },
  welcomeTitle: { ...Typography.heading, fontSize: 18, color: '#191c1e', marginBottom: 8 },
  welcomeText: { ...Typography.body, fontSize: 14, color: '#727784', textAlign: 'center', paddingHorizontal: 30 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  messageRowMe: { justifyContent: 'flex-end' },
  messageRowBot: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  messageBubble: { maxWidth: '78%', borderRadius: 16, padding: 10, borderWidth: 1 },
  bubbleMe: { backgroundColor: '#dfefff', borderColor: '#c8dcff' },
  bubbleBot: { backgroundColor: '#fff', borderColor: '#e3e8f0' },
  messageText: { ...Typography.body, fontSize: 14, color: '#1f2631' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5eaf2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 14 : 8,
  },
  composerInput: {
    flex: 1,
    maxHeight: 80,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#dfe5ef',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    ...Typography.body,
    fontSize: 14,
    color: '#1f2631',
    backgroundColor: '#fff',
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0058bc',
  },
  sendButtonText: { fontFamily: 'Material Symbols Outlined', fontSize: 20, color: '#fff' },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#727784',
    opacity: 0.4,
  },
});
