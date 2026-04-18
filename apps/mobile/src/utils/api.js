import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";

const resolveApiUrl = () => {
  const configured = String(process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (configured) return configured;

  const scriptURL = NativeModules?.SourceCode?.scriptURL || "";
  const match = scriptURL.match(/https?:\/\/([^/:]+)/i);
  const host = match?.[1];
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:3000`;
  }

  return "http://localhost:3000";
};

export const API_URL = resolveApiUrl();
const DEFAULT_TIMEOUT_MS = 12000;

/**
 * Robust API request wrapper with 401 SESSION_INVALIDATED interception.
 */
export async function apiRequest(endpoint, options = {}) {
  const token = await AsyncStorage.getItem("token");
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      timeoutMs: undefined,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for 401 Unauthorized
    if (response.status === 401) {
      let data = {};
      try {
        data = await response.json();
      } catch (e) {
        console.warn("[API] Non-JSON 401 response");
      }

      if (data.message === "SESSION_INVALIDATED") {
        console.error(
          "[API] Session invalidated detected. Triggering force logout.",
        );
        if (typeof global !== "undefined" && global.handleForceLogout) {
          global.handleForceLogout();
        }
        throw new Error("SESSION_INVALIDATED");
      }

      return { ok: false, status: 401, ...data };
    }

    let data = {};
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.warn("[API] Response is not JSON:", text.substring(0, 100));
      data = { message: text };
    }

    return { ok: response.ok, status: response.status, ...data };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`REQUEST_TIMEOUT_${timeoutMs}MS`);
      timeoutError.name = "RequestTimeoutError";
      console.error(`[API] Timeout on ${endpoint} after ${timeoutMs}ms`);
      throw timeoutError;
    }
    console.error(`[API] Error on ${endpoint}:`, error);
    throw error;
  }
}
