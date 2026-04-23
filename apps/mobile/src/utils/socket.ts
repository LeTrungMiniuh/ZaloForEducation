import { io, Socket } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "./api";

class SocketService {
  socket: Socket | null = null;
  currentEmail: string | null = null;
  listeners: Record<string, any[]> = {
    force_logout: [],
    sessions_update: [],
    profile_update: [],
    "call:invite": [],
    "call:incoming": [],
    "call:offer": [],
    "call:answer_sdp": [],
    "call:ice_candidate": [],
    "call:accept": [],
    "call:reject": [],
    "call:dismiss": [],
    "call:hangup": [],
    "call:timeout": [],
    "call:peer_joined": [],
    "call:upgrade_request": [],
    "call:upgrade_accepted": [],
    "call:upgrade_declined": [],
  };

  async connect(email: string, deviceId: string, tokenOverride?: string) {
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
      if (this.currentEmail && this.socket) {
        this.socket.emit("join_identity", {
          email: this.currentEmail,
          deviceId: deviceId,
          platform: 'mobile',
        });
      }
    });

    this.socket.on("force_logout", (data: any) => {
      console.warn("Force logout event received", data);
      // Pass data to AuthContext listeners (they do their own targetDeviceId check)
      this.listeners.force_logout.forEach((cb) => cb(data));
    });

    this.socket.on(`force_logout_${email}`, (data: any) => {
      console.log("Legacy force logout event received", data);
      this.listeners.force_logout.forEach((cb) => cb(data));
    });

    this.socket.on("sessions_update", (data: any) => {
      console.log("Sessions update event received", data);
      this.listeners.sessions_update.forEach((cb) => cb(data));
    });

    this.socket.on("profile_update", (data: any) => {
      console.log("Profile update event received", data);
      this.listeners.profile_update.forEach((cb) => cb(data));
    });

    // Register all pre-defined or dynamic listeners
    Object.keys(this.listeners).forEach((eventName) => {
      if (this.socket) {
        this.socket.on(eventName, (data: any) => {
          if (this.listeners[eventName]) {
            this.listeners[eventName].forEach((cb) => cb(data));
          }
        });
      }
    });

    this.socket.on("disconnect", (reason: string) => {
      console.log("Mobile disconnected:", reason);
    });

    this.socket.on("reconnect", (attempt: number) => {
      console.log("Mobile reconnected after", attempt, "attempts");
    });
  }

  // Đăng ký listener (có kiểm tra trùng lặp)
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
      // Nếu socket đã kết nối, đăng ký sự kiện mới với socket server ngay lập tức
      if (this.socket) {
        this.socket.on(event, (data: any) => {
          this.listeners[event].forEach((cb) => cb(data));
        });
      }
    }
    
    if (!this.listeners[event].includes(callback)) {
      this.listeners[event].push(callback);
    }
  }

  // Phương thức để gỡ bỏ listener
  off(event: string, callback?: Function) {
    if (this.listeners[event]) {
      if (callback) {
        this.listeners[event] = this.listeners[event].filter(
          (cb) => cb !== callback,
        );
      } else {
        this.listeners[event] = [];
      }
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
