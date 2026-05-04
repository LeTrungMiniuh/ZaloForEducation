import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules, Platform } from "react-native";

const resolveApiUrl = (): string => {
  const configured = String(process.env.EXPO_PUBLIC_API_URL || "").trim();
  if (configured) return configured;

  const scriptURL = NativeModules?.SourceCode?.scriptURL || "";
  const match = scriptURL.match(/https?:\/\/([^/:]+)/i);
  const host = match?.[1];

  if (host) {
    if (host === "localhost" || host === "127.0.0.1") {
      if (Platform.OS === "android") {
        return "http://10.0.2.2:3000";
      }
      return "http://localhost:3000";
    }
    return `http://${host}:3000`;
  }

  return Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";
};

export const API_URL = resolveApiUrl();
const DEFAULT_TIMEOUT_MS = 12000;

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string;
  [key: string]: any;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: any = {},
): Promise<ApiResponse<T>> {
  const token = await AsyncStorage.getItem("token");
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    ...(!options.headers?.["Content-Type"] &&
    !(options.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
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

    if (response.status === 401) {
      let data: any = {};
      try {
        data = await response.json();
      } catch (e) {
        console.warn("[API] Non-JSON 401 response");
      }

      if (data.message === "SESSION_INVALIDATED") {
        console.error("[API] Session invalidated detected.");
        // handleForceLogout globally if needed
        throw new Error("SESSION_INVALIDATED");
      }

      return { ok: false, status: 401, ...data };
    }

    let data: any = {};
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { message: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      ...data,
      data: data?.data ?? data,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw new Error(`REQUEST_TIMEOUT_${timeoutMs}MS`);
    }
    throw error;
  }
}

export const chatGet = (path: string, query?: any) => {
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : "";
  return apiRequest(`/chat${path}${queryString}`, { method: "GET" });
};

export const chatPost = (path: string, body: any) =>
  apiRequest(`/chat${path}`, { method: "POST", body: JSON.stringify(body) });

export const apiPut = (path: string, body: any) =>
  apiRequest(`${path}`, { method: "PUT", body: JSON.stringify(body) });

export const apiGet = (path: string, query?: any) => {
  const queryString = query ? `?${new URLSearchParams(query).toString()}` : "";
  return apiRequest(`${path}${queryString}`, { method: "GET" });
};

export const apiPost = (path: string, body: any) =>
  apiRequest(`${path}`, { method: "POST", body: JSON.stringify(body) });

export const apiPatch = (path: string, body: any) =>
  apiRequest(`${path}`, { method: "PATCH", body: JSON.stringify(body) });

export const apiDelete = (path: string, body?: any) =>
  apiRequest(`${path}`, {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
  });

export const apiUpload = async (endpoint: string, file: any) => {
  const formData = new FormData();
  // On web, FormData expects a Blob/File; convert URI to Blob first
  if (Platform.OS === "web") {
    try {
      const uri: string = file.uri;
      let blob: Blob;
      if (uri.startsWith("data:")) {
        const res = await fetch(uri);
        blob = await res.blob();
      } else {
        const res = await fetch(uri);
        blob = await res.blob();
      }
      const filename = file.name || `upload_${Date.now()}.jpg`;
      formData.append("file", blob, filename as any);
    } catch (err) {
      formData.append("file", file as any);
    }
  } else {
    formData.append("file", {
      uri:
        Platform.OS === "android" ? file.uri : file.uri.replace("file://", ""),
      name: file.name || `upload_${Date.now()}.jpg`,
      type: file.type || "image/jpeg",
    } as any);
  }

  return apiRequest(endpoint, {
    method: "POST",
    body: formData,
    timeoutMs: 60000,
  });
};

export const chatPatch = (path: string, body: any) =>
  apiRequest(`/chat${path}`, { method: "PATCH", body: JSON.stringify(body) });

export const chatDelete = (path: string, body?: any) =>
  apiRequest(`/chat${path}`, {
    method: "DELETE",
    body: body ? JSON.stringify(body) : undefined,
  });

export const chatUpload = (file: any) => apiUpload("/chat/uploads", file);
