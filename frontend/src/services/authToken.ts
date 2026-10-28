/**
 * authToken.ts — where the bearer token lives in the browser.
 *
 * Split out of api.ts so a page that only needs to read the token does not pull
 * axios into its bundle. `/history` and `/analyze` are plain `fetch` callers;
 * importing them from api.ts added ~22 kB of JavaScript to each for the sake of
 * one localStorage read.
 *
 * Every access is wrapped: localStorage throws in a private window with site
 * data blocked, and a page that cannot read a token should render signed-out,
 * not crash.
 */
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
    // A browser that refuses storage still gets a usable, signed-out page.
  }
}

/** Authorization header for a plain `fetch`, or nothing when signed out. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
