import React from "react";
import { ShieldAlert, LogOut, Check, Key } from "lucide-react";
import { useSecurityAlerts } from "../../hooks/useSecurityAlerts";
import api from "../../services/api";
import Swal from "sweetalert2";
import { useAuth } from "../../context/AuthContext";
import type { SecurityAlertItem } from "../../utils/securityAlerts";

const SecurityAlertsView: React.FC = () => {
  const { alerts, markAllRead, clearAll } = useSecurityAlerts();
  const { user } = useAuth();

  React.useEffect(() => {
    markAllRead();
  }, []);

  const handleRevokeDevice = async (deviceId: string) => {
    try {
      // Show confirmation
      const res = await Swal.fire({
        title: "Đăng xuất thiết bị",
        text: "Bạn có chắc chắn muốn đăng xuất thiết bị này không?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Đăng xuất",
        cancelButtonText: "Hủy",
      });

      if (!res.isConfirmed) return;

      Swal.showLoading();
      await api.delete(`/auth/sessions/${deviceId}`);

      Swal.fire({
        icon: "success",
        title: "Thành công",
        text: "Thiết bị đã bị đăng xuất.",
        timer: 2000,
        showConfirmButton: false,
      });
      
      // Optionally clear this specific alert or all alerts
      clearAll();
    } catch (error: any) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Lỗi",
        text: error.response?.data?.message || "Không thể đăng xuất thiết bị.",
      });
    }
  };

  const handleChangePassword = () => {
    // Dispatch custom event to open Settings modal to Change Password tab
    window.dispatchEvent(
      new CustomEvent("open-settings", { detail: { tab: "security" } })
    );
  };

  const renderActionButtons = (alert: SecurityAlertItem) => {
    if (alert.type === "NEW_DEVICE_LOGIN") {
      const deviceId = alert.metadata?.deviceId;
      return (
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => handleRevokeDevice(deviceId)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl hover:bg-error hover:text-white transition-colors font-medium text-sm"
          >
            <LogOut size={16} />
            Đăng xuất thiết bị đó
          </button>
          <button
            onClick={clearAll}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-colors font-medium text-sm"
          >
            <Check size={16} />
            Đây là tôi
          </button>
        </div>
      );
    }

    if (alert.type === "PASSWORD_CHANGED") {
      return (
        <div className="flex gap-3 mt-4">
          <button
            onClick={handleChangePassword}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-error/10 text-error rounded-xl hover:bg-error hover:text-white transition-colors font-medium text-sm"
          >
            <Key size={16} />
            Đổi mật khẩu ngay
          </button>
          <button
            onClick={clearAll}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-surface-container-high text-on-surface rounded-xl hover:bg-surface-container-highest transition-colors font-medium text-sm"
          >
            <Check size={16} />
            Đã hiểu
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden">
      {/* Header */}
      <div className="h-[68px] border-b border-outline-variant/30 flex items-center px-6 shrink-0 bg-white dark:bg-surface-container">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center text-error">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-on-surface">Cảnh báo bảo mật</h2>
            <p className="text-xs text-on-surface-variant font-medium">Hệ thống Zalo Education</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-[#f4f7fb] dark:bg-[#0f1115]">
        <div className="max-w-2xl mx-auto space-y-6">
          {alerts.length === 0 ? (
            <div className="text-center mt-20 opacity-50">
              <ShieldAlert size={64} className="mx-auto mb-4 text-on-surface-variant/30" />
              <p className="text-on-surface font-medium">Bạn không có cảnh báo bảo mật nào.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-outline-variant/30 shadow-sm mb-4">
                  <ShieldAlert size={16} className="text-error" />
                  <span className="text-xs font-bold text-on-surface uppercase tracking-wider">Tin nhắn hệ thống</span>
                </div>
                <p className="text-sm text-on-surface-variant">
                  Zalo Education không bao giờ yêu cầu mật khẩu hoặc mã OTP của bạn qua tin nhắn.
                </p>
              </div>

              {alerts.map((alert) => (
                <div key={alert.id} className="bg-white dark:bg-surface-container rounded-2xl shadow-sm border border-outline-variant/20 overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error shrink-0 mt-1">
                        <ShieldAlert size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="text-base font-bold text-on-surface">{alert.title}</h3>
                          <span className="text-xs font-medium text-on-surface-variant shrink-0 ml-4">
                            {new Date(alert.at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                          {alert.message}
                        </p>
                        
                        {alert.metadata && alert.type === 'NEW_DEVICE_LOGIN' && (
                          <div className="mt-4 p-4 rounded-xl bg-[#f8fafe] dark:bg-surface-container-high border border-outline-variant/20">
                            <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3">Thông tin thiết bị</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Tên thiết bị:</span>
                                <span className="font-semibold text-on-surface">{alert.metadata.deviceName || 'Không xác định'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Loại thiết bị:</span>
                                <span className="font-semibold text-on-surface capitalize">{alert.metadata.deviceType || alert.metadata.platform || 'Khác'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-on-surface-variant">Thời gian:</span>
                                <span className="font-semibold text-on-surface">{new Date(alert.at).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {renderActionButtons(alert)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecurityAlertsView;
