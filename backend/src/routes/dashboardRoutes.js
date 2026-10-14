import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { activityQuerySchema, analyticsQuerySchema } from "../validators/dashboardSchemas.js";
import { createDashboardController } from "../controllers/dashboardController.js";

export function createDashboardRoutes({ authService, dashboardRepo }) {
  const router = Router();
  const controller = createDashboardController({ dashboardRepo });
  const auth = requireAuth(authService);

  router.get("/overview", auth, controller.overview);
  router.get("/activity", auth, validate(activityQuerySchema, "query"), controller.activity);
  router.get("/analytics", auth, validate(analyticsQuerySchema, "query"), controller.analytics);
  return router;
}
