/**
 * requireUser.ts — identify the caller of a Next.js route handler.
 *
 * These handlers (`/api/analyze`, `/api/history`) predate the Express backend
 * and still talk to their own `legacy` schema. They must not invent a second
 * authentication system: the JWT is minted and verified by the backend, so the
 * token is simply forwarded to `GET /api/auth/me` and the backend's answer is
 * the authority. That keeps `JWT_SECRET` out of the web tier entirely — the
 * frontend never verifies a signature and never needs the key.
 *
 * The identity returned here is the *only* acceptable source of a user id for a
 * query or a write. A `userId` sent in a request body or query string is
 * attacker-controlled and is never trusted.
 */
export interface CallerIdentity {
  id: string;
  email: string;
}

/** Server-side base URL of the Express backend. */
function backendBaseUrl(): string {
  const url =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:4000";
  return url.replace(/\/+$/, "");
}

function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/**
 * Resolve the caller, or null when the request carries no usable token.
 *
 * A backend that is unreachable yields null rather than an identity, so a
 * failure to verify can never be mistaken for a successful one.
 */
export async function getCaller(request: Request): Promise<CallerIdentity | null> {
  const token = bearerFrom(request);
  if (!token) return null;

  try {
    const res = await fetch(`${backendBaseUrl()}/api/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { id?: string; email?: string } };
    if (!data.user?.id) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch {
    return null;
  }
}

/** The 401 body these routes return, in the shape the backend already uses. */
export const UNAUTHENTICATED = {
  error: "Sign in to use this. Your saved analyses are visible only to you.",
} as const;
