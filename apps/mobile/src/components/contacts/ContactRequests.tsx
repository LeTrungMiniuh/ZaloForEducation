import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface ContactRequestsProps {
  incomingRequests: any[];
  visibleSuggestions: any[];
  profileMap: Record<string, any>;
  onAccept: (email: string) => void;
  onReject: (email: string) => void;
  onSkipSuggestion: (email: string) => void;
  onSendSuggestionRequest: (email: string) => void;
  sendingRequestMap: Record<string, boolean>;
}

export const ContactRequests: React.FC<ContactRequestsProps> = ({
  incomingRequests,
  visibleSuggestions,
  profileMap,
  onAccept,
  onReject,
  onSkipSuggestion,
  onSendSuggestionRequest,
  sendingRequestMap,
}) => {
  const DEFAULT_AVATAR = "https://fptupload.s3.ap-southeast-1.amazonaws.com/Zalo_Edu_Logo_2e176b6b7f.png";

  return (
    <View>
      {incomingRequests.length > 0 && (
        <View>
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>
              LỜI MỜI KẾT BẠN ({incomingRequests.length})
            </Text>
          </View>
          {incomingRequests.map((req, idx) => {
            const email = req?.sender_id || req?.senderEmail;
            const profile = profileMap[email] || {};
            const name = profile.fullName || profile.fullname || email;
            const avatar = profile.avatarUrl || DEFAULT_AVATAR;

            return (
              <View key={`req-${idx}`} style={styles.requestItem}>
                <Image source={{ uri: avatar }} style={styles.requestAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{name}</Text>
                  <Text style={styles.contactSub}>{email}</Text>
                </View>
                <View style={styles.requestBtnRow}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => onReject(email)}
                  >
                    <Text style={styles.rejectText}>Từ chối</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => onAccept(email)}
                  >
                    <Text style={styles.acceptText}>Đồng ý</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {visibleSuggestions.length > 0 && (
        <View>
          <View style={styles.groupHeader}>
            <Text style={styles.groupHeaderText}>GỢI Ý KẾT BẠN</Text>
          </View>
          {visibleSuggestions.map((item, idx) => {
            const name = item.displayName || item.fullName || item.email;
            const avatar = item.avatarUrl || DEFAULT_AVATAR;
            const isSending = sendingRequestMap[item.email];

            return (
              <View key={`suggest-${idx}`} style={styles.suggestItem}>
                <Image source={{ uri: avatar }} style={styles.requestAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{name}</Text>
                  <Text style={styles.contactSub}>{item.email}</Text>
                </View>
                <View style={styles.requestBtnRow}>
                  <TouchableOpacity
                    style={styles.skipBtn}
                    onPress={() => onSkipSuggestion(item.email)}
                  >
                    <Text style={styles.skipText}>Bỏ qua</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addBtn, isSending && styles.disabledBtn]}
                    onPress={() => onSendSuggestionRequest(item.email)}
                    disabled={isSending}
                  >
                    <Text style={styles.addText}>
                      {isSending ? "Đang gửi" : "Kết bạn"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};
