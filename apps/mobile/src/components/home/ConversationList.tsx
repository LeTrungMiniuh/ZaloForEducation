import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import styles from '../../screens/main/style/HomeScreen.styles';
import { Colors } from '../../constants/Theme';
import { Conversation } from '../../store/types';
import { useSecurityAlerts } from '../../hooks/useSecurityAlerts';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  currentUserEmail: string;
  userProfiles: Record<string, any>;
  onSelectChat: (chat: Conversation) => void;
  getDisplayName: (email: string) => string;
  getDisplayAvatar: (email?: string) => any;
  getConversationPreview: (conv: Conversation) => string;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  loading,
  currentUserEmail,
  userProfiles,
  onSelectChat,
  getDisplayName,
  getDisplayAvatar,
  getConversationPreview,
}) => {
  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centeredView}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.aiSubtitle}>Đang tải hội thoại...</Text>
      </View>
    );
  }

  const { alerts, unreadCount: systemUnreadCount } = useSecurityAlerts();
  const filteredConversations = [...conversations];

  if (alerts.length > 0) {
    const systemConv = {
      id: "CONV#SYSTEM",
      name: "Cảnh báo bảo mật",
      type: "system",
      avatar: { uri: "https://ui-avatars.com/api/?name=!&background=ba1a1a&color=fff&rounded=true&bold=true&font-size=0.6" },
      lastMessageContent: alerts[0].title,
      updatedAt: alerts[0].at,
      unreadCount: systemUnreadCount,
    };
    filteredConversations.unshift(systemConv as any);
  }

  return (
    <ScrollView key="conversations-list-scroll" style={styles.scrollContainer}>
      <View style={styles.chatList}>
        {filteredConversations.map((chat) => {
          const partnerEmail =
            chat.type === "direct"
              ? chat.partner ||
                (Array.isArray(chat.members)
                  ? chat.members.find((member: string) => member !== currentUserEmail)
                  : undefined)
              : undefined;
          
          const chatName =
            (chat as any).type === "system"
              ? chat.name
              : chat.type === "direct"
              ? getDisplayName(partnerEmail || '')
              : chat.name || chat.id.slice(0, 6);
          
          const chatAvatar =
            (chat as any).type === "system"
              ? (chat as any).avatar
              : chat.type === "direct"
              ? getDisplayAvatar(partnerEmail)
              : chat.avatar ? { uri: chat.avatar } : getDisplayAvatar();
          
          const isUnread = (chat.unreadCount || 0) > 0;
          const partnerProfile = partnerEmail ? userProfiles[partnerEmail] : null;
          const isOnline = partnerProfile?.status === 'online';

          return (
            <TouchableOpacity
              key={chat.id}
              style={styles.chatItem}
              onPress={() => onSelectChat(chat)}
            >
              <View style={styles.avatarContainer}>
                <Image source={chatAvatar} style={styles.avatar} />
                {isOnline && <View style={styles.onlineBadge} />}
                {chat.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text
                    style={[styles.chatName, isUnread && { fontWeight: '700', color: '#000' }]}
                    numberOfLines={1}
                  >
                    {chatName}
                  </Text>
                  <Text style={[styles.chatTime, isUnread && { color: Colors.primary, fontWeight: '600' }]}>
                    {chat.updatedAt
                      ? new Date(chat.updatedAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--"}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.lastMsg,
                    chat.unreadCount > 0 && { color: '#000', fontWeight: '700', fontSize: 14 }
                  ]}
                  numberOfLines={1}
                >
                  {(chat as any).type === "system" ? (chat as any).lastMessageContent : getConversationPreview(chat)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};
