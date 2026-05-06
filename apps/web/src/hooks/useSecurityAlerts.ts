import { useState, useEffect } from "react";
import type { SecurityAlertItem } from "../utils/securityAlerts";
import {
  getSecurityAlerts,
  markAllSecurityAlertsRead,
  clearSecurityAlerts,
} from "../utils/securityAlerts";

export const useSecurityAlerts = () => {
  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([]);

  useEffect(() => {
    // Initial fetch
    setAlerts(getSecurityAlerts());

    // Listen for custom event
    const handleUpdate = () => {
      setAlerts(getSecurityAlerts());
    };

    window.addEventListener("security-alerts-updated", handleUpdate);
    return () => {
      window.removeEventListener("security-alerts-updated", handleUpdate);
    };
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;

  return {
    alerts,
    unreadCount,
    markAllRead: markAllSecurityAlertsRead,
    clearAll: clearSecurityAlerts,
  };
};
