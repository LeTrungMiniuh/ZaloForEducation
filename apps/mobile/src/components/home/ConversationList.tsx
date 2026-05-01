import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import styles from '../../screens/main/style/HomeScreen.styles';
import { Colors } from '../../constants/Theme';
import { Conversation } from '../../store/types';

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
  const visibleConversations = conversations
    .filter((chat) => !chat.hidden)
    .sort((left, right) => {
      const leftPinned = !!left.pinned;
      const rightPinned = !!right.pinned;
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;

      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centeredView}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.aiSubtitle}>Đang tải hội thoại...</Text>
      </View>
    );
  }

  return (
    <ScrollView key="conversations-list-scroll" style={styles.scrollContainer}>
      <View style={styles.chatList}>
        {visibleConversations.map((chat) => {
          const partnerEmail =
            chat.type === "direct"
              ? chat.partner ||
                (Array.isArray(chat.members)
                  ? chat.members.find((member: string) => member !== currentUserEmail)
                  : undefined)
              : undefined;
          
          const chatName =
            chat.type === "direct"
              ? (chat.alias || getDisplayName(partnerEmail || ''))
              : (chat.alias || chat.name || chat.id.slice(0, 6));
          
          const chatAvatar =
            chat.type === "direct"
              ? getDisplayAvatar(partnerEmail)
              : chat.avatar || getDisplayAvatar();
          
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
                  {getConversationPreview(chat)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};
