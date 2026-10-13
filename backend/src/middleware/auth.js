import { unauthorized } from "../utils/errors.js";

/**
 * requireAuth — verifies the Bearer token and attaches `req.user = { id }`.
 * The user id is taken from the signed token, never from the request body.
 */
export function requireAuth(authService) {
  return async function requireAuthMiddleware(req, _res, next) {
    try {
      const header = req.headers.authorization ?? "";
      const [scheme, token] = header.split(" ");
      if (scheme !== "Bearer" || !token) throw unauthorized();
      const { userId } = authService.verifyToken(token);
      const user = await authService.getUser(userId);
      if (!user) throw unauthorized("This account no longer exists.");
      req.user = { id: user.id, email: user.email };
      next();
    } catch (err) {
      next(err);
    }
  };
}
