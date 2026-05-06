import { useState, useEffect, useCallback } from "react";
import { DeviceEventEmitter } from "react-native";
import type { SecurityAlert } from "../utils/securityAlerts";
import {
  getSecurityAlerts,
  markAllSecurityAlertsRead,
  clearSecurityAlerts,
} from "../utils/securityAlerts";

export function useSecurityAlerts() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = useCallback(async () => {
    const data = await getSecurityAlerts();
    setAlerts(data);
    setUnreadCount(data.filter((a) => !a.read).length);
  }, []);

  useEffect(() => {
    fetchAlerts();

    const subscription = DeviceEventEmitter.addListener(
      "security_alerts_updated",
      (updatedAlerts: SecurityAlert[]) => {
        setAlerts(updatedAlerts);
        setUnreadCount(updatedAlerts.filter((a) => !a.read).length);
      }
    );

    return () => {
      subscription.remove();
    };
  }, [fetchAlerts]);

  const markAllRead = useCallback(async () => {
    await markAllSecurityAlertsRead();
  }, []);

  const clearAll = useCallback(async () => {
    await clearSecurityAlerts();
  }, []);

  return {
    alerts,
    unreadCount,
    markAllRead,
    clearAll,
  };
}
