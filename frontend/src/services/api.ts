/**
 * api.ts — axios client for the Express backend.
 *
 * The base URL comes from NEXT_PUBLIC_API_URL (default http://localhost:4000).
 * The JWT is kept in localStorage and attached as a Bearer header. No LLM keys
 * ever live in the browser — the backend talks to the provider.
 */
import axios, { AxiosError } from "axios";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const TOKEN_KEY = "resumeai_auth_token_v1";
export const AUTH_CHANGED_EVENT = "resumeai:auth-changed";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  } catch {
    // ignore storage errors
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 130_000, // slightly above the backend's 120s request timeout
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Normalised error surfaced to the UI. */
export class ApiClientError extends Error {
  status: number | null;
  code: string;
  retryable: boolean;
  details?: { field: string; message: string }[];
  /** True when the backend itself could not be reached (down, CORS, DNS). */
  network: boolean;

  constructor(message: string, opts: { status?: number | null; code?: string; retryable?: boolean; details?: ApiClientError["details"]; network?: boolean }) {
    super(message);
    this.name = "ApiClientError";
    this.status = opts.status ?? null;
    this.code = opts.code ?? "UNKNOWN";
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
    this.network = opts.network ?? false;
  }

  get isAuthError() {
    return this.status === 401;
  }

  /** Whether the UI should offer demo mode as an explicit alternative. */
  get suggestsDemoMode() {
    return this.network || this.status === 503 || this.status === 502 || this.status === 504 || this.status === 429;
  }
}

export function toApiClientError(err: unknown): ApiClientError {
  if (err instanceof ApiClientError) return err;
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<{ error?: { code?: string; message?: string; retryable?: boolean; details?: ApiClientError["details"] } }>;
    if (!e.response) {
      const timedOut = e.code === "ECONNABORTED";
      return new ApiClientError(
        timedOut ? "The analysis server took too long to respond." : "Could not reach the analysis server. Is the backend running?",
        { status: null, code: timedOut ? "TIMEOUT" : "NETWORK", retryable: true, network: true }
      );
    }
    const body = e.response.data?.error;
    return new ApiClientError(body?.message ?? `Request failed with status ${e.response.status}.`, {
      status: e.response.status,
      code: body?.code ?? "HTTP_ERROR",
      retryable: body?.retryable ?? e.response.status >= 500,
      details: body?.details,
    });
  }
  return new ApiClientError(err instanceof Error ? err.message : "Unexpected error.", { status: null, code: "UNKNOWN" });
}

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const normalised = toApiClientError(err);
    if (normalised.isAuthError) setToken(null); // expired / invalid session
    return Promise.reject(normalised);
  }
);
