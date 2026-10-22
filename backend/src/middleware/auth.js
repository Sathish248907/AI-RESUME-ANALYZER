import { unauthorized } from "../utils/errors.js";


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
