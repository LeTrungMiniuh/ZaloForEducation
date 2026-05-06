import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  FlatList,
  StyleSheet,
} from "react-native";
import { Colors } from "../../constants/Theme";
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from "../../context/AuthContext";

interface PollOption {
  text: string;
  votes: number;
  voters: string[];
}

interface PollMessageProps {
  messageId: string;
  topic: string;
  options: string[];
  votes?: Record<string, string>; // voterEmail -> optionIndex
  senderEmail?: string;
  onVote?: (messageId: string, optionIndex: number) => Promise<void>;
  onClosePoll?: () => Promise<void>;
  isClosed?: boolean;
  userProfiles?: Record<string, any>;
}

const PollMessage: React.FC<PollMessageProps> = ({
  messageId,
  topic,
  options,
  votes = {},
  senderEmail,
  onVote,
  onClosePoll,
  isClosed = false,
  userProfiles = {},
}) => {
  const { user }: any = useAuth();
  const [draftOption, setDraftOption] = useState<number | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showVotersModal, setShowVotersModal] = useState(false);

  const normalizedUserEmail = String(user?.email || "")
    .trim()
    .toLowerCase();

  const getDisplayName = (email: string) => {
    const norm = String(email).trim().toLowerCase();
    if (norm === normalizedUserEmail) return "Bạn";
    const profile = userProfiles[norm];
    return profile?.nickname || profile?.fullName || profile?.fullname || norm.split("@")[0];
  };

  // Find user's current vote
  const votedOptionByCurrentUser = useMemo(() => {
    const entries = Object.entries(votes || {});
    const found = entries.find(
      ([email]) =>
        String(email || "")
          .trim()
          .toLowerCase() === normalizedUserEmail,
    );
    if (!found) return null;
    const parsed = parseInt(String(found[1]), 10);
    return isFinite(parsed) ? parsed : null;
  }, [votes, normalizedUserEmail]);

  // Transform options with vote counts
  const pollOptions = useMemo<PollOption[]>(() => {
    return options.map((text, idx) => {
      const votersForThis = Object.entries(votes || {})
        .filter(([_, optIdx]) => parseInt(String(optIdx), 10) === idx)
        .map(([voterId]) => voterId);

      return {
        text,
        votes: votersForThis.length,
        voters: votersForThis,
      };
    });
  }, [options, votes]);

  const handleVote = async (optionIndex: number) => {
    if (isVoting || !onVote || isClosed) return;

    setIsVoting(true);
    try {
      await onVote(messageId, optionIndex);
      setDraftOption(null);
    } catch (error) {
      console.error("Failed to vote:", error);
    } finally {
      setIsVoting(false);
    }
  };

  const handleClosePoll = async () => {
    if (isClosing || !onClosePoll) return;
    setIsClosing(true);
    try {
      await onClosePoll();
    } catch (error) {
      console.error("Failed to close poll:", error);
    } finally {
      setIsClosing(false);
    }
  };

  const totalVotes = pollOptions.reduce((sum, opt) => sum + opt.votes, 0);
  const selectedOptionIndex = draftOption ?? votedOptionByCurrentUser;
  const canSubmit = draftOption !== null;
  const hasVoted = votedOptionByCurrentUser !== null;
  const isCreator =
    String(senderEmail || "")
      .trim()
      .toLowerCase() === normalizedUserEmail;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.label}>Chọn một phương án</Text>
          <Text style={styles.title}>{topic}</Text>
        </View>
        {isClosed && (
          <View style={styles.closedBadge}>
            <MaterialIcons name="lock" size={12} color="#dc2626" />
            <Text style={styles.closedText}>Đã đóng</Text>
          </View>
        )}
      </View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {pollOptions.map((option, index) => {
          const isSelected = selectedOptionIndex === index;
          const optionVotes = option.votes;
          const totalVotesCount = totalVotes || 1;
          const percentage =
            totalVotesCount > 0
              ? Math.round((optionVotes / totalVotesCount) * 100)
              : 0;
          
          const userVoted = option.voters.some(v => String(v || "").trim().toLowerCase() === normalizedUserEmail);

          return (
            <Pressable
              key={index}
              onPress={() => {
                if (isClosed || isVoting) return;
                setDraftOption(index);
              }}
              disabled={isVoting || isClosed}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                (isClosed || isVoting) && styles.optionDisabled,
                pressed && { opacity: 0.8 }
              ]}
            >
              {/* Vote Progress Bar */}
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${percentage}%`,
                  },
                  isSelected && styles.progressBarSelected,
                ]}
              />

              {/* Option Content */}
              <View style={styles.optionContent}>
                <View style={styles.optionLeft}>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkIcon}>✓</Text>}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                    numberOfLines={2}
                  >
                    {option.text}
                  </Text>
                </View>

                <View style={styles.optionRight}>
                  <Text
                    style={[
                      styles.voteCount,
                      isSelected && styles.voteCountSelected,
                    ]}
                  >
                    {optionVotes}
                  </Text>
                  {userVoted && (
                    <View style={styles.votedBadge}>
                      <Text style={styles.votedBadgeText}>Bạn</Text>
                    </View>
                  )}
                  {isSelected && draftOption !== null && (
                    <View style={styles.selectedBadge}>
                      <Text style={styles.selectedBadgeText}>Đã chọn</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Stats */}
      <Pressable 
        style={styles.stats}
        onPress={() => setShowVotersModal(true)}
      >
        <Text style={styles.statsText}>{totalVotes} phiếu • Xem chi tiết</Text>
      </Pressable>

      {/* Action Buttons */}
      {!isClosed && (
        <View style={styles.actions}>
          {hasVoted ? (
            <>
              <Pressable
                onPress={() => {
                  if (
                    draftOption !== null &&
                    draftOption !== votedOptionByCurrentUser
                  ) {
                    void handleVote(draftOption);
                  }
                }}
                disabled={
                  !canSubmit ||
                  isVoting ||
                  draftOption === votedOptionByCurrentUser
                }
                style={({ pressed }) => [
                  styles.buttonSecondary,
                  (isVoting || draftOption === votedOptionByCurrentUser) &&
                    styles.buttonDisabled,
                  pressed && { opacity: 0.8 }
                ]}
              >
                <Text style={styles.buttonSecondaryText}>
                  {isVoting ? "Đang gửi..." : "Đổi lựa chọn"}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => {
                if (draftOption !== null) {
                  void handleVote(draftOption);
                }
              }}
              disabled={!canSubmit || isVoting}
              style={({ pressed }) => [
                styles.buttonPrimary,
                (!canSubmit || isVoting) && styles.buttonDisabled,
                pressed && { opacity: 0.8 }
              ]}
            >
              {isVoting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonPrimaryText}>Bình chọn</Text>
              )}
            </Pressable>
          )}

          {isCreator && (
            <Pressable
              onPress={() => void handleClosePoll()}
              disabled={isClosing}
              style={({ pressed }) => [
                styles.closeButton,
                isClosing && styles.buttonDisabled,
                pressed && { opacity: 0.8 }
              ]}
            >
              {isClosing ? (
                <ActivityIndicator color="#ef4444" size="small" />
              ) : (
                <MaterialIcons name="close" size={16} color="#ef4444" />
              )}
            </Pressable>
          )}
        </View>
      )}

      {/* Voters Modal */}
      {showVotersModal && (
        <Modal
          visible={showVotersModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowVotersModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Chi tiết bình chọn</Text>
                <Pressable onPress={() => setShowVotersModal(false)} style={styles.modalCloseBtn}>
                  <MaterialIcons name="close" size={24} color="#64748b" />
                </Pressable>
              </View>

              <FlatList
                data={pollOptions}
                keyExtractor={(_, index) => index.toString()}
                contentContainerStyle={styles.votersList}
                renderItem={({ item: option }) => (
                  <View style={styles.voterOptionGroup}>
                    <View style={styles.voterOptionHeader}>
                      <Text style={styles.voterOptionText}>{option.text}</Text>
                      <View style={styles.voterOptionCount}>
                        <Text style={styles.voterOptionCountText}>{option.votes}</Text>
                      </View>
                    </View>
                    <View style={styles.votersBadgeContainer}>
                      {option.voters.length > 0 ? (
                        option.voters.map((email, idx) => (
                          <View key={idx} style={styles.voterNameBadge}>
                            <Text style={styles.voterNameText}>{getDisplayName(email)}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.noVotersText}>Chưa có ai chọn</Text>
                      )}
                    </View>
                  </View>
                )}
              />

              <View style={styles.modalFooter}>
                <Text style={styles.modalFooterText}>Tổng cộng: {totalVotes} phiếu</Text>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dde1ea",
    overflow: "hidden",
    width: '100%',
    marginVertical: 4,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  headerContent: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    lineHeight: 24,
  },
  closedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fee2e2",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  closedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#dc2626",
  },
  optionsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  option: {
    position: "relative",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dde1ea",
    backgroundColor: "#f4f6fa",
    overflow: "hidden",
    minHeight: 52,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },
  optionDisabled: {
    opacity: 0.7,
  },
  progressBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primary + "20",
  },
  progressBarSelected: {
    backgroundColor: Colors.primary + "30",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkIcon: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "700",
  },
  optionText: {
    fontSize: 15,
    color: "#1e293b",
    fontWeight: "500",
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: "700",
    color: "#1e293b",
  },
  voteCount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  voteCountSelected: {
    color: Colors.primary,
    fontWeight: "800",
  },
  votedBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  votedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  selectedBadge: {
    marginLeft: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  stats: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  statsText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.primary,
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
    borderWidth: 1,
    borderColor: "#fecaca",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    minHeight: "40%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#1e293b",
  },
  modalCloseBtn: {
    padding: 6,
  },
  votersList: {
    padding: 20,
  },
  voterOptionGroup: {
    marginBottom: 24,
  },
  voterOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  voterOptionText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
    flex: 1,
    marginRight: 10,
  },
  voterOptionCount: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
  },
  voterOptionCountText: {
    fontSize: 13,
    fontWeight: "800",
    color: Colors.primary,
  },
  votersBadgeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  voterNameBadge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  voterNameText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  noVotersText: {
    fontSize: 13,
    fontStyle: "italic",
    color: "#94a3b8",
  },
  modalFooter: {
    padding: 20,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  modalFooterText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
});

export default PollMessage;
