import { Alert as RNAlert, Platform } from 'react-native';

/**
 * Alert utility chuẩn hóa cho cả Native và Web.
 *
 * - Native (iOS / Android): dùng RNAlert.alert() tiêu chuẩn.
 * - Web: dùng window.confirm() / window.alert() thuần — không phụ thuộc sweetalert2.
 */
const Alert = {
  alert: (title: string, message?: string, buttons?: { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }[]) => {
    if (Platform.OS === 'web') {
      const hasMultipleButtons = buttons && buttons.length >= 2;

      if (hasMultipleButtons) {
        // Lấy nút confirm (cuối cùng) và cancel (đầu tiên)
        const cancelButton  = buttons[0];
        const confirmButton = buttons[buttons.length - 1];

        const confirmed = window.confirm(
          message ? `${title}\n\n${message}` : title,
        );

        if (confirmed && confirmButton?.onPress) {
          confirmButton.onPress();
        } else if (!confirmed && cancelButton?.onPress) {
          cancelButton.onPress();
        }
      } else {
        // Chỉ một nút — dùng alert thường
        window.alert(message ? `${title}\n\n${message}` : title);
        const singleButton = buttons && buttons[0];
        if (singleButton?.onPress) {
          singleButton.onPress();
        }
      }
    } else {
      RNAlert.alert(title, message, buttons);
    }
  },
};

export default Alert;
