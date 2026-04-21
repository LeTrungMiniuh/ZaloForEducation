import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

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

/**
 * Normalization helpers to keep data structures consistent across services.
 */
export const normalizeApiPayload = (res) => {
  if (!res || typeof res !== "object") return res;
  if (Object.prototype.hasOwnProperty.call(res, "data")) return res.data;

  const numericKeys = Object.keys(res).filter((key) => /^\d+$/.test(key));
  if (numericKeys.length > 0) {
    return numericKeys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => res[key]);
  }

  const payload = { ...res };
  delete payload.ok;
  delete payload.status;
  return payload;
};

export const normalizeApiResponse = (res) => ({
  ...res,
  data: normalizeApiPayload(res),
});

/**
 * Generic API helpers (standard logic, no forced prefix).
 */
const _request = async (method, path, data, options = {}) => {
  const isUpload = data instanceof FormData;
  const config = {
    method,
    ...options,
    headers: {
      ...(!isUpload ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  };

  if (data && !isUpload) {
    config.body = JSON.stringify(data);
  } else if (data && isUpload) {
    config.body = data;
  }

  const res = await apiRequest(path, config);
  return normalizeApiResponse(res);
};

export const apiGet = async (path, query) => {
  const queryString = query
    ? `?${Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")}`
    : "";
  return _request("GET", `${path}${queryString}`);
};

export const apiPost   = async (path, body, options) => _request("POST", path, body, options);
export const apiPut    = async (path, body, options) => _request("PUT", path, body, options);
export const apiPatch  = async (path, body, options) => _request("PATCH", path, body, options);
export const apiDelete = async (path, options)       => _request("DELETE", path, null, options);

export const apiUpload = async (path, file) => {
  if (!file) throw new Error("FILE_REQUIRED");
  const formData = new FormData();
  const fileToUpload = {
    uri: Platform?.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
    name: file.name || file.fileName || `upload_${Date.now()}.jpg`,
    type: file.type || file.mimeType || 'image/jpeg',
  };
  formData.append('file', fileToUpload);
  return _request("POST", path, formData, { timeoutMs: 60000 });
};

/**
 * Chat-specific wrappers (Legacy/Shortcut).
 */
export const chatGet = async (path, query) => {
  let res = await apiGet(`/chat${path}`, query);
  if (!res?.ok && res?.status === 404) {
    res = await apiGet(`/api/chat${path}`, query);
  }
  return res;
};

export const chatPost = async (path, body) => {
  let res = await apiPost(`/chat${path}`, body);
  if (!res?.ok && res?.status === 404) {
    res = await apiPost(`/api/chat${path}`, body);
  }
  return res;
};

export const chatPatch = async (path, body) => {
  let res = await apiPatch(`/chat${path}`, body);
  if (!res?.ok && res?.status === 404) {
    res = await apiPatch(`/api/chat${path}`, body);
  }
  return res;
};

export const chatUpload = async (file) => apiUpload("/chat/uploads", file);
