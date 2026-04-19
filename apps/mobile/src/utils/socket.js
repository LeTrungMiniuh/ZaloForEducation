import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./api";

class SocketService {
  socket = null;
  currentEmail = null;
  listeners = {
    force_logout: [],
    sessions_update: [],
    profile_update: [],
  };

  async connect(email, deviceId, tokenOverride) {
    if (!email) return;

    const token = tokenOverride || (await AsyncStorage.getItem("token"));
    if (!token) {
      console.log("Socket connect skipped: missing auth token");
      return;
    }

    // Tránh kết nối lại nếu đã kết nối với cùng email và deviceId
    if (this.socket && this.socket.connected && this.currentEmail === email) {
      console.log("Using existing socket connection for", email);
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.currentEmail = email;
    this.socket = io(API_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      auth: { deviceId, token },
      extraHeaders: { Authorization: `Bearer ${token}` },
    });

    this.socket.on("connect", () => {
      console.log("Mobile connected/reconnected to socket server");
      // Luôn re-join identity khi reconnect để đảm bảo không bị rơi khỏi room
      if (this.currentEmail) {
        this.socket.emit("join_identity", {
          email: this.currentEmail,
          deviceId: deviceId,
        });
      }
    });

    this.socket.on("force_logout", (data) => {
      console.warn("Force logout event received", data);
      // Pass data to AuthContext listeners (they do their own targetDeviceId check)
      this.listeners.force_logout.forEach((cb) => cb(data));

      // FIX: KHÔNG gọi global.handleForceLogout trực tiếp ở đây
      // vì nó bỏ qua toàn bộ kiểm tra targetDeviceId trong AuthContext
      // AuthContext.js listener (đã đăng ký qua SocketService.on) sẽ tự xử lý
    });

    this.socket.on(`force_logout_${email}`, (data) => {
      console.log("Legacy force logout event received", data);
      // FIX: chỉ forward tới listeners, KHÔNG tự logout
      // listeners trong AuthContext sẽ tự quyết định có logout không
      this.listeners.force_logout.forEach((cb) => cb(data));
    });

    this.socket.on("sessions_update", (data) => {
      console.log("Sessions update event received", data);
      this.listeners.sessions_update.forEach((cb) => cb(data));
    });

    this.socket.on("profile_update", (data) => {
      console.log("Profile update event received", data);
      this.listeners.profile_update.forEach((cb) => cb(data));
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Mobile disconnected:", reason);
    });

    this.socket.on("reconnect", (attempt) => {
      console.log("Mobile reconnected after", attempt, "attempts");
    });
  }

  // Đăng ký listener (có kiểm tra trùng lặp)
  on(event, callback) {
    if (this.listeners[event]) {
      if (!this.listeners[event].includes(callback)) {
        this.listeners[event].push(callback);
      }
    }
  }

  // Phương thức để gỡ bỏ listener
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(
        (cb) => cb !== callback,
      );
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentEmail = null;
      // Clear listeners
      this.listeners.force_logout = [];
      this.listeners.sessions_update = [];
      this.listeners.profile_update = [];
    }
  }
}

export default new SocketService();
