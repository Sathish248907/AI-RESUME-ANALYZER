/**
 * authService.ts — email/password auth against the Express backend (JWT).
 */
import { useEffect, useState } from "react";
import { api, AUTH_CHANGED_EVENT, getToken, setToken } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  createdAt?: string;
}

interface AuthResponse {
  user: AuthUser;
  token: string;
}

const USER_KEY = "resumeai_auth_user_v1";

function cacheUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export function getCachedUser(): AuthUser | null {
  if (typeof window === "undefined" || !getToken()) return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export async function register(input: { email: string; password: string; name?: string }): Promise<AuthUser> {
  const { data } = await api.post<AuthResponse>("/api/auth/register", input);
  setToken(data.token);
  cacheUser(data.user);
  return data.user;
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const { data } = await api.post<AuthResponse>("/api/auth/login", input);
  setToken(data.token);
  cacheUser(data.user);
  return data.user;
}

export function logout(): void {
  cacheUser(null);
  setToken(null);
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const { data } = await api.get<{ user: AuthUser }>("/api/auth/me");
    cacheUser(data.user);
    return data.user;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/** React hook: current user (from cache, refreshed from the server) and auth state changes. */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      setUser(getCachedUser());
      if (getToken()) {
        fetchCurrentUser().then((u) => {
          if (!cancelled) setUser(u);
        });
      }
    };
    sync();
    setReady(true);
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_CHANGED_EVENT, sync);
    };
  }, []);

  return { user, ready, isAuthenticated: Boolean(user), logout };
}
