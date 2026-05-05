import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from "../../constants/Theme";

interface ReminderMessageProps {
  messageId: string;
  content: string;
  time: string;
  date: string;
  repeatType: "none" | "daily" | "weekly" | "monthly";
}

const ReminderMessage: React.FC<ReminderMessageProps> = ({
  messageId,
  content,
  time,
  date,
  repeatType,
}) => {
  if (!date || !time) return null;

  // Parse date and time
  const reminderDate = new Date(date);
  const timeParts = String(time).split(":");
  if (timeParts.length < 2) return null;
  const [hours, minutes] = timeParts.map(Number);
  reminderDate.setHours(hours, minutes, 0);

  const formattedDate = reminderDate.toLocaleDateString("vi-VN", {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const formattedTime = reminderDate.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const repeatLabels: Record<string, string> = {
    none: "Một lần",
    daily: "Hàng ngày",
    weekly: "Hàng tuần",
    monthly: "Hàng tháng",
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MaterialIcons name="notifications-active" size={20} color="#d97706" style={styles.headerIcon} />
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerLabel}>NHẮC HẸN</Text>
          <Text style={styles.contentText} numberOfLines={3}>{content}</Text>
        </View>
      </View>

      <View style={styles.detailsCard}>
        <View style={styles.dateRow}>
          <View style={styles.dateBadge}>
            <Text style={styles.monthText}>{reminderDate.toLocaleDateString("vi-VN", { month: "short" }).toUpperCase()}</Text>
            <Text style={styles.dayText}>{reminderDate.getDate().toString().padStart(2, "0")}</Text>
          </View>
          <View style={styles.dateInfo}>
            <Text style={styles.formattedDate}>{formattedDate}</Text>
            <Text style={styles.repeatText}>
              {repeatType === 'none' ? 'Sắp diễn ra' : `Lặp lại: ${repeatLabels[repeatType]}`}
            </Text>
          </View>
        </View>

        <View style={styles.timeRow}>
          <MaterialIcons name="access-time" size={16} color="#d97706" />
          <Text style={styles.timeLabel}>Thời gian:</Text>
          <Text style={styles.timeValue}>{formattedTime}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Nhắc hẹn sẽ được thông báo tự động</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fef3c7',
    width: '100%',
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerIcon: {
    marginTop: 2,
    marginRight: 10,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#d97706',
    letterSpacing: 1,
    marginBottom: 4,
  },
  contentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  detailsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 12,
    padding: 12,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateBadge: {
    width: 44,
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#d97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  monthText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#d97706',
  },
  dayText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  dateInfo: {
    flex: 1,
  },
  formattedDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  repeatText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timeLabel: {
    fontSize: 12,
    color: '#64748b',
    marginLeft: 6,
    marginRight: 4,
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(217, 119, 6, 0.1)',
    paddingTop: 12,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#92400e',
    opacity: 0.8,
  }
});

export default ReminderMessage;
