import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { createAuthLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { loginSchema, registerSchema } from "../validators/authSchemas.js";
import { createAuthController } from "../controllers/authController.js";

export function createAuthRoutes(authService, { limit } = {}) {
  const authLimiter = createAuthLimiter(limit);
  const router = Router();
  const controller = createAuthController(authService);

  router.post("/register", authLimiter, validate(registerSchema), controller.register);
  router.post("/login", authLimiter, validate(loginSchema), controller.login);
  router.get("/me", requireAuth(authService), controller.me);

  return router;
}
