import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import { Colors } from "../../constants/Theme";
import Alert from "../../utils/Alert";
import {
  formatReminderDateTime,
  ReminderRepeatType,
} from "../../utils/reminderNotifications";

interface ReminderComposerProps {
  onClose: () => void;
  onCreate: (reminder: {
    title: string;
    date: string;
    time: string;
    repeatType: ReminderRepeatType;
    audience: "self" | "group";
  }) => void;
}

const pad2 = (value: number) => String(value).padStart(2, "0");

const getDefaultDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const getDefaultTime = () => {
  const nextSlot = new Date(Date.now() + 30 * 60 * 1000);
  nextSlot.setMinutes(nextSlot.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (nextSlot.getMinutes() === 0) nextSlot.setHours(nextSlot.getHours() + 1);
  return `${pad2(nextSlot.getHours())}:${pad2(nextSlot.getMinutes())}`;
};

const repeatOptions: Array<{ key: ReminderRepeatType; label: string }> = [
  { key: "none", label: "Không lặp" },
  { key: "daily", label: "Hàng ngày" },
  { key: "weekly", label: "Hàng tuần" },
  { key: "monthly", label: "Hàng tháng" },
];

const audienceOptions = [
  { key: "self" as const, label: "Chỉ mình tôi" },
  { key: "group" as const, label: "Cả nhóm" },
];

const dateToKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const timeToLabel = (value: string) => value;

const buildDateLabel = (date: Date) => {
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - start.getTime()) / 86400000);

  if (diffDays === 0)
    return `Hôm nay, ${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  if (diffDays === 1)
    return `Ngày mai, ${date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  return date.toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
};

const buildDateOptions = (count = 14) => {
  const options: Array<{ key: string; label: string }> = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    options.push({ key: dateToKey(date), label: buildDateLabel(date) });
  }
  return options;
};

const buildTimeOptions = () => {
  const options: Array<{ key: string; label: string }> = [];
  for (let hour = 6; hour <= 22; hour++) {
    for (const minute of [0, 30]) {
      if (hour === 22 && minute === 30) continue;
      const value = `${pad2(hour)}:${pad2(minute)}`;
      options.push({ key: value, label: value });
    }
  }
  return options;
};

export default function ReminderComposer({
  onClose,
  onCreate,
}: ReminderComposerProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(getDefaultDate());
  const [time, setTime] = useState(getDefaultTime());
  const [repeatType, setRepeatType] = useState<ReminderRepeatType>("none");
  const [audience, setAudience] = useState<"self" | "group">("self");
  const [activePicker, setActivePicker] = useState<"date" | "time" | null>(
    null,
  );
  const [manualMode, setManualMode] = useState(false);
  const [tempHour, setTempHour] = useState<number>(
    Number(getDefaultTime().split(":")[0]),
  );
  const [tempMinute, setTempMinute] = useState<number>(
    Number(getDefaultTime().split(":")[1]),
  );

  const preview = useMemo(
    () => formatReminderDateTime(date, time),
    [date, time],
  );
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const timeOptions = useMemo(() => buildTimeOptions(), []);

  const selectedDateLabel = useMemo(() => {
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return date;
    return buildDateLabel(new Date(year, month - 1, day));
  }, [date]);

  const selectedTimeLabel = useMemo(() => timeToLabel(time), [time]);

  const handleCreate = () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      Alert.alert("Lỗi", "Vui lòng nhập tiêu đề nhắc hẹn");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert("Lỗi", "Ngày không hợp lệ. Dùng định dạng YYYY-MM-DD");
      return;
    }

    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      Alert.alert("Lỗi", "Giờ không hợp lệ. Dùng định dạng HH:mm");
      return;
    }

    onCreate({
      title: normalizedTitle,
      date,
      time,
      repeatType,
      audience,
    });
    onClose();
  };

  return (
    <View style={styles.card}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Thêm nhắc hẹn</Text>

        <Text style={styles.label}>Tiêu đề</Text>
        <TextInput
          style={styles.input}
          placeholder="Nhập tiêu đề nhắc hẹn..."
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#94a3b8"
        />

        <View style={styles.rowGap}>
          <View style={styles.halfCol}>
            <Text style={styles.label}>Ngày</Text>
            {!manualMode ? (
              <TouchableOpacity
                style={styles.pickerBox}
                onPress={() => setActivePicker("date")}
              >
                <Text style={styles.pickerValue}>{selectedDateLabel}</Text>
                <Text style={styles.pickerHint}>Chạm để chọn ngày</Text>
              </TouchableOpacity>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={date}
                onChangeText={setDate}
                placeholderTextColor="#94a3b8"
              />
            )}
          </View>
          <View style={styles.halfCol}>
            <Text style={styles.label}>Giờ</Text>
            {!manualMode ? (
              <TouchableOpacity
                style={styles.pickerBox}
                onPress={() => {
                  const [h, m] = time.split(":").map(Number);
                  setTempHour(Number.isFinite(h) ? h : 0);
                  setTempMinute(Number.isFinite(m) ? m : 0);
                  setActivePicker("time");
                }}
              >
                <Text style={styles.pickerValue}>{selectedTimeLabel}</Text>
                <Text style={styles.pickerHint}>Chạm để chọn giờ</Text>
              </TouchableOpacity>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="HH:mm"
                value={time}
                onChangeText={setTime}
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
              />
            )}
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <TouchableOpacity onPress={() => setManualMode((m) => !m)}>
            <Text style={{ color: Colors.primary, fontWeight: "700" }}>
              {manualMode ? "Sử dụng bộ chọn" : "Nhập thủ công"}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>Kiểu lặp lại</Text>
        <View style={styles.pillsWrap}>
          {repeatOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => setRepeatType(option.key)}
              style={[
                styles.pill,
                repeatType === option.key && styles.pillActive,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  repeatType === option.key && styles.pillTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>Nhắc cho</Text>
        <View style={styles.pillsWrap}>
          {audienceOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              onPress={() => setAudience(option.key)}
              style={[
                styles.pill,
                audience === option.key && styles.pillActive,
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  audience === option.key && styles.pillTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!preview && (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Sẽ nhắc lúc</Text>
            <Text style={styles.previewValue}>{preview}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
          <Text style={styles.btnSecondaryText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleCreate}>
          <Text style={styles.btnPrimaryText}>Tạo nhắc hẹn</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setActivePicker(null)}
        >
          <Pressable
            style={styles.pickerCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.pickerTitle}>
              {activePicker === "date"
                ? "Chọn ngày nhắc hẹn"
                : "Chọn giờ nhắc hẹn"}
            </Text>

            {activePicker === "date" ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.pickerGrid}>
                  {dateOptions.map((option) => {
                    const isSelected = option.key === date;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.pickerChip,
                          isSelected && styles.pickerChipActive,
                        ]}
                        onPress={() => {
                          setDate(option.key);
                          setActivePicker(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.pickerChipText,
                            isSelected && styles.pickerChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontWeight: "800", fontSize: 16, marginBottom: 8 }}
                  >
                    Chọn giờ: {pad2(tempHour)}:{pad2(tempMinute)}
                  </Text>
                  <View style={{ flexDirection: "row" }}>
                    <ScrollView style={{ flex: 1, maxHeight: 300 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {Array.from({ length: 24 }).map((_, i) => {
                          const hour = i;
                          const isSelected = hour === tempHour;
                          return (
                            <TouchableOpacity
                              key={`h-${hour}`}
                              style={[
                                styles.pickerChip,
                                isSelected && styles.pickerChipActive,
                                { marginRight: 6, marginBottom: 6 },
                              ]}
                              onPress={() => setTempHour(hour)}
                            >
                              <Text
                                style={[
                                  styles.pickerChipText,
                                  isSelected && styles.pickerChipTextActive,
                                ]}
                              >
                                {pad2(hour)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                    <ScrollView style={{ flex: 1, maxHeight: 300 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {Array.from({ length: 60 }).map((_, i) => {
                          const minute = i;
                          const isSelected = minute === tempMinute;
                          return (
                            <TouchableOpacity
                              key={`m-${minute}`}
                              style={[
                                styles.pickerChip,
                                isSelected && styles.pickerChipActive,
                                { marginRight: 6, marginBottom: 6 },
                              ]}
                              onPress={() => setTempMinute(minute)}
                            >
                              <Text
                                style={[
                                  styles.pickerChipText,
                                  isSelected && styles.pickerChipTextActive,
                                ]}
                              >
                                {pad2(minute)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.pickerDoneBtn}
              onPress={() => {
                if (activePicker === "time") {
                  setTime(`${pad2(tempHour)}:${pad2(tempMinute)}`);
                }
                setActivePicker(null);
              }}
            >
              <Text style={styles.pickerDoneText}>Xong</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 16,
    maxHeight: 560,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
  },
  pickerBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#f8fafc",
    minHeight: 72,
    justifyContent: "center",
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },
  pickerHint: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
  },
  rowGap: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  halfCol: {
    flex: 1,
  },
  pillsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  pillTextActive: {
    color: "#fff",
  },
  previewBox: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: "#eff6ff",
    padding: 12,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  btnSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnSecondaryText: {
    color: Colors.primary,
    fontWeight: "800",
  },
  btnPrimary: {
    flex: 1.2,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimaryText: {
    color: "#fff",
    fontWeight: "800",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    padding: 16,
  },
  pickerCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    maxHeight: "80%",
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
  },
  pickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pickerChip: {
    borderWidth: 1,
    borderColor: "#dbe3ee",
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  pickerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  pickerChipTextActive: {
    color: "#fff",
  },
  pickerDoneBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  pickerDoneText: {
    color: "#fff",
    fontWeight: "800",
  },
});
