import axios, { AxiosRequestConfig } from 'axios';
import { AuthResponse, PanelUser, SessionUser } from './types';

const ACCESS_TOKEN_KEY = 'access_token';
const PANEL_USER_KEY = 'panel_user';
const SESSION_EXPIRES_AT_KEY = 'session_expires_at';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PHOTO_CACHE_PREFIX = 'photo_cache:';
const PHOTO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
  withCredentials: true,
});

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  const expiresAt = Number(window.localStorage.getItem(SESSION_EXPIRES_AT_KEY) || 0);
  if (!expiresAt || expiresAt <= Date.now()) {
    clearSession();
    return null;
  }
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredUser() {
  if (typeof window === 'undefined') return null;
  const rawUser = window.localStorage.getItem(PANEL_USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(auth: AuthResponse) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, auth.access_token);
  window.localStorage.setItem(PANEL_USER_KEY, JSON.stringify(auth.user));
  window.localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_TTL_MS));
}

export function syncStoredUser(user: Pick<PanelUser, 'id' | 'username' | 'email' | 'role'>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PANEL_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(PANEL_USER_KEY);
  window.localStorage.removeItem(SESSION_EXPIRES_AT_KEY);
}

export async function apiRequest<T = unknown>(config: AxiosRequestConfig) {
  const token = getStoredToken();
  return api.request<T>({
    ...config,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(config.headers || {}),
    },
  });
}

export async function fetchCurrentUser() {
  const response = await apiRequest<PanelUser>({
    url: '/auth/me',
    method: 'GET',
  });
  syncStoredUser(response.data);
  return response.data;
}

export async function fetchProtectedPhoto(url: string) {
  if (typeof window !== 'undefined') {
    const rawCache = window.localStorage.getItem(`${PHOTO_CACHE_PREFIX}${url}`);
    if (rawCache) {
      try {
        const cached = JSON.parse(rawCache) as { dataUrl: string | null; expiresAt: number };
        if (cached.expiresAt > Date.now()) {
          return cached.dataUrl;
        }
      } catch {
        window.localStorage.removeItem(`${PHOTO_CACHE_PREFIX}${url}`);
      }
    }
  }

  const response = await apiRequest<{ dataUrl: string | null }>({
    url,
    method: 'GET',
  });

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      `${PHOTO_CACHE_PREFIX}${url}`,
      JSON.stringify({ dataUrl: response.data.dataUrl, expiresAt: Date.now() + PHOTO_CACHE_TTL_MS }),
    );
  }

  return response.data.dataUrl;
}

export function getApiError(error: unknown, fallback = 'Erro inesperado') {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const message = error.response?.data?.message;
  if (Array.isArray(message)) {
    return message.join(', ');
  }
  if (typeof message === 'string') {
    return message;
  }

  return error.message || fallback;
}
