import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	StyleSheet,
	ScrollView,
	TouchableOpacity,
	StatusBar,
	RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Typography } from "../constants/Theme";
import Alert from "../utils/Alert";
import SocketService from "../utils/socket";
import {
	clearSecurityAlerts,
	getSecurityAlerts,
	markAllSecurityAlertsRead,
	pushSecurityAlert,
} from "../utils/securityAlerts";

const formatAlertTime = (value) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("vi-VN", {
		hour: "2-digit",
		minute: "2-digit",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
};

const typeToLabel = (type) => {
	if (type === "NEW_DEVICE_LOGIN") return "Đăng nhập thiết bị lạ";
	if (type === "PASSWORD_CHANGED") return "Mật khẩu vừa thay đổi";
	return "Cảnh báo bảo mật";
};

export default function NotificationScreen({ onNavigate, goBack }) {
	const [alerts, setAlerts] = useState([]);
	const [refreshing, setRefreshing] = useState(false);

	const unreadCount = useMemo(
		() => alerts.filter((item) => !item.read).length,
		[alerts],
	);

	const loadAlerts = useCallback(async () => {
		const next = await getSecurityAlerts();
		setAlerts(next);
	}, []);

	useEffect(() => {
		loadAlerts();
	}, [loadAlerts]);

	useEffect(() => {
		const onSecurityAlert = async (payload) => {
			const next = await pushSecurityAlert(payload);
			setAlerts(next);
		};

		SocketService.on("security_alert", onSecurityAlert);
		return () => {
			SocketService.off("security_alert", onSecurityAlert);
		};
	}, []);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await loadAlerts();
		setRefreshing(false);
	}, [loadAlerts]);

	const handleMarkAllRead = useCallback(async () => {
		const next = await markAllSecurityAlertsRead();
		setAlerts(next);
	}, []);

	const handleClearAll = useCallback(() => {
		Alert.alert(
			"Xóa tất cả thông báo?",
			"Bạn có chắc chắn muốn xóa toàn bộ cảnh báo bảo mật?",
			[
				{ text: "Hủy", style: "cancel" },
				{
					text: "Xóa",
					style: "destructive",
					onPress: async () => {
						const next = await clearSecurityAlerts();
						setAlerts(next);
					},
				},
			],
		);
	}, []);

	return (
		<SafeAreaView style={styles.safeArea}>
			<StatusBar barStyle="dark-content" />

			<View style={styles.header}>
				<TouchableOpacity
					onPress={() => (goBack ? goBack() : onNavigate("home", "chat"))}
					style={styles.backBtn}
				>
					<Text style={styles.headerIcon}>arrow_back</Text>
				</TouchableOpacity>
				<View style={{ flex: 1 }}>
					<Text style={styles.headerTitle}>Thông báo bảo mật</Text>
					<Text style={styles.headerSubTitle}>{unreadCount} chưa đọc</Text>
				</View>
			</View>

			<View style={styles.actionsRow}>
				<TouchableOpacity style={styles.actionBtn} onPress={handleMarkAllRead}>
					<Text style={styles.actionText}>Đánh dấu đã đọc</Text>
				</TouchableOpacity>
				<TouchableOpacity
					style={[styles.actionBtn, styles.actionDangerBtn]}
					onPress={handleClearAll}
				>
					<Text style={[styles.actionText, styles.actionDangerText]}>Xóa tất cả</Text>
				</TouchableOpacity>
			</View>

			<ScrollView
				style={styles.scrollContainer}
				contentContainerStyle={styles.scrollContent}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{alerts.length === 0 ? (
					<View style={styles.emptyBox}>
						<Text style={styles.emptyIcon}>notifications</Text>
						<Text style={styles.emptyTitle}>Chưa có cảnh báo bảo mật</Text>
						<Text style={styles.emptySubTitle}>
							Khi có đăng nhập thiết bị lạ hoặc thay đổi mật khẩu, bạn sẽ thấy tại
							đây.
						</Text>
					</View>
				) : (
					alerts.map((item) => (
						<View
							key={item.id}
							style={[styles.card, !item.read ? styles.cardUnread : null]}
						>
							<View style={styles.cardHeadRow}>
								<Text style={styles.cardType}>{typeToLabel(item.type)}</Text>
								{!item.read && <View style={styles.unreadDot} />}
							</View>
							<Text style={styles.cardTitle}>{item.title}</Text>
							<Text style={styles.cardMessage}>{item.message}</Text>
							<Text style={styles.cardTime}>{formatAlertTime(item.at)}</Text>
						</View>
					))
				)}
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: Colors.surface },
	header: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 10,
		backgroundColor: Colors.surfaceContainerLowest,
		borderBottomWidth: 1,
		borderBottomColor: Colors.surfaceContainer,
		gap: 10,
	},
	backBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	headerIcon: {
		fontFamily: "Material Symbols Outlined",
		fontSize: 22,
		color: Colors.primary,
	},
	headerTitle: {
		...Typography.heading,
		fontSize: 18,
		color: Colors.onSurface,
	},
	headerSubTitle: {
		...Typography.body,
		fontSize: 12,
		color: Colors.outline,
		marginTop: 2,
	},
	actionsRow: {
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	actionBtn: {
		flex: 1,
		height: 38,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: "#cfe0ff",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#edf4ff",
	},
	actionDangerBtn: {
		borderColor: "#ffd5d5",
		backgroundColor: "#fff1f1",
	},
	actionText: {
		...Typography.label,
		fontSize: 12,
		color: Colors.primary,
	},
	actionDangerText: {
		color: Colors.error,
	},
	scrollContainer: { flex: 1 },
	scrollContent: {
		paddingHorizontal: 14,
		paddingBottom: 24,
		gap: 10,
	},
	emptyBox: {
		marginTop: 80,
		alignItems: "center",
		paddingHorizontal: 20,
	},
	emptyIcon: {
		fontFamily: "Material Symbols Outlined",
		fontSize: 72,
		color: "#95a0b2",
		marginBottom: 8,
	},
	emptyTitle: {
		...Typography.heading,
		fontSize: 19,
		color: Colors.onSurface,
		marginBottom: 4,
		textAlign: "center",
	},
	emptySubTitle: {
		...Typography.body,
		fontSize: 13,
		color: Colors.outline,
		textAlign: "center",
		lineHeight: 20,
	},
	card: {
		borderRadius: 14,
		backgroundColor: Colors.surfaceContainerLowest,
		borderWidth: 1,
		borderColor: "#e6ebf3",
		paddingVertical: 12,
		paddingHorizontal: 12,
	},
	cardUnread: {
		borderColor: "#b9d4ff",
		backgroundColor: "#f2f8ff",
	},
	cardHeadRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},
	cardType: {
		...Typography.label,
		fontSize: 11,
		color: Colors.primary,
	},
	unreadDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: Colors.primary,
	},
	cardTitle: {
		...Typography.heading,
		fontSize: 14,
		color: Colors.onSurface,
		marginBottom: 2,
	},
	cardMessage: {
		...Typography.body,
		fontSize: 13,
		color: Colors.onSurfaceVariant,
		lineHeight: 20,
	},
	cardTime: {
		...Typography.body,
		fontSize: 11,
		color: Colors.outline,
		marginTop: 8,
	},
});
