/**
 * useAuth — React hook exposing the signed-in user from the Express backend JWT session.
 * Implementation lives with the auth API calls in services/authService.ts; this module
 * is the conventional import path for components.
 */
export { useAuth } from "@/services/authService";
export type { AuthUser } from "@/services/authService";
