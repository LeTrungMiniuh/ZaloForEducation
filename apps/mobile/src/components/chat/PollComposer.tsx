import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from "react-native";
import { Colors } from "../../constants/Theme";

interface PollOption {
  id: string;
  text: string;
}

interface PollComposerProps {
  visible?: boolean;
  onClose: () => void;
  onCreate: (poll: {
    topic: string;
    options: string[];
    allowMultiple?: boolean;
    allowAddOption?: boolean;
  }) => void;
}

export default function PollComposer({ onClose, onCreate }: PollComposerProps) {
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState<PollOption[]>([
    { id: String(Date.now()) + "a", text: "" },
    { id: String(Date.now()) + "b", text: "" },
    { id: String(Date.now()) + "c", text: "" },
  ]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [allowAddOption, setAllowAddOption] = useState(false);

  const updateOptionText = (id: string, text: string) => {
    setOptions((s) => s.map((o) => (o.id === id ? { ...o, text } : o)));
  };

  const addOption = () =>
    setOptions((s) => [
      ...s,
      {
        id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
        text: "",
      },
    ]);
  const removeOption = (id: string) =>
    setOptions((s) => s.filter((o) => o.id !== id));

  const handleCreate = () => {
    const opts = options.map((o) => o.text.trim()).filter(Boolean);
    if (!topic.trim() || opts.length < 2) return;
    onCreate({
      topic: topic.trim(),
      options: opts,
      allowMultiple,
      allowAddOption,
    });
    onClose();
  };

  return (
    <View style={styles.card}>
      <ScrollView>
        <Text style={styles.title}>Tạo bình chọn mới</Text>

        <Text style={styles.label}>Đặt câu hỏi bình chọn</Text>
        <TextInput
          style={styles.input}
          placeholder="Nhập nội dung bình chọn"
          value={topic}
          onChangeText={setTopic}
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Các phương án</Text>
        {options.map((o, i) => (
          <View key={o.id} style={styles.optionRow}>
            <TextInput
              style={styles.optionInput}
              value={o.text}
              placeholder={`Phương án ${i + 1}`}
              placeholderTextColor="#94a3b8"
              onChangeText={(t) => updateOptionText(o.id, t)}
            />
            <TouchableOpacity
              onPress={() => removeOption(o.id)}
              style={styles.removeBtn}
            >
              <Text style={styles.removeText}>X</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity onPress={addOption} style={styles.addOptionBtn}>
          <Text style={styles.addOptionText}>Thêm phương án</Text>
        </TouchableOpacity>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Chọn nhiều phương án</Text>
          <Switch value={allowMultiple} onValueChange={setAllowMultiple} />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Cho phép thêm phương án</Text>
          <Switch value={allowAddOption} onValueChange={setAllowAddOption} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
          <Text style={styles.btnSecondaryText}>Hủy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleCreate}>
          <Text style={styles.btnPrimaryText}>Tạo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    maxHeight: 520,
  },
  title: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  label: { fontSize: 13, color: "#64748b", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
  },
  optionRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff",
  },
  removeBtn: {
    marginLeft: 8,
    padding: 8,
    backgroundColor: "#ef4444",
    borderRadius: 6,
  },
  removeText: { color: "#fff", fontWeight: "700" },
  addOptionBtn: { paddingVertical: 10 },
  addOptionText: { color: Colors.primary, fontWeight: "700" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  footer: { flexDirection: "row", gap: 12, marginTop: 8 },
  btnSecondary: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnSecondaryText: { color: Colors.primary, fontWeight: "700" },
  btnPrimary: {
    flex: 1.2,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
});
