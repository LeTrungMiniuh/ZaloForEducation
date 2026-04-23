import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import styles from '../../screens/main/style/ContactsScreen.styles';

interface SectionTabsProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const TABS = [
  { key: "friends", label: "Bạn bè" },
  { key: "groups", label: "Nhóm" },
  { key: "blocked", label: "Đã chặn" },
  { key: "oa", label: "OA" },
];

export const SectionTabs: React.FC<SectionTabsProps> = ({
  activeSection,
  setActiveSection,
}) => {
  return (
    <View style={styles.sectionTabs}>
      {TABS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[
            styles.sectionTabItem,
            activeSection === item.key && styles.sectionTabActive,
          ]}
          onPress={() => setActiveSection(item.key)}
        >
          <Text
            style={[
              styles.sectionTabText,
              activeSection === item.key && styles.sectionTabActiveText,
            ]}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
