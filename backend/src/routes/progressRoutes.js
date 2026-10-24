import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  rangeQuerySchema, tzQuerySchema, pointsHistoryQuerySchema, activityQuerySchema, gamificationProfileUpdateSchema,
  goalParams, goalCreateSchema, goalUpdateSchema, goalsQuerySchema, reportGenerateSchema, reportsQuerySchema, reportParams,
  notificationsQuerySchema, notificationParams, notificationPreferencesSchema,
} from "../validators/progressSchemas.js";
import { createProgressController } from "../controllers/progressController.js";

/**
 * Phase 10 routers: /api/analytics, /api/gamification, /api/goals, /api/progress-reports, /api/notifications.
 * @param {{ authService, repo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createProgressRoutes({ authService, repo, getLlm, analysisRateLimit }) {
  const c = createProgressController({ repo, getLlm });
  const auth = requireAuth(authService);
  const computeLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 12, 120)); // reconcile reads (no AI)
  const reportLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 2, 20)); // report generation (may call AI)

  const analytics = Router();
  analytics.get("/overview", auth, computeLimiter, validate(rangeQuerySchema, "query"), c.overview);
  analytics.get("/career-progress", auth, computeLimiter, validate(tzQuerySchema, "query"), c.careerProgress);
  analytics.get("/skills", auth, c.skills);
  analytics.get("/interviews", auth, validate(rangeQuerySchema, "query"), c.interviews);
  analytics.get("/resume", auth, validate(rangeQuerySchema, "query"), c.resume);
  analytics.get("/applications", auth, validate(rangeQuerySchema, "query"), c.applications);

  const gamification = Router();
  gamification.get("/profile", auth, computeLimiter, validate(tzQuerySchema, "query"), c.gamificationProfile);
  gamification.patch("/profile", auth, computeLimiter, validate(gamificationProfileUpdateSchema), c.updateGamificationProfile);
  gamification.get("/points/history", auth, computeLimiter, validate(pointsHistoryQuerySchema, "query"), c.pointsHistory);
  gamification.get("/achievements", auth, computeLimiter, validate(tzQuerySchema, "query"), c.achievements);
  gamification.get("/streaks", auth, computeLimiter, validate(tzQuerySchema, "query"), c.streaks);
  gamification.get("/activity", auth, computeLimiter, validate(activityQuerySchema, "query"), c.activity);
  gamification.get("/rules", auth, c.rules);

  const goals = Router();
  goals.get("/", auth, computeLimiter, validate(goalsQuerySchema, "query"), c.listGoals);
  goals.post("/", auth, validate(goalCreateSchema), c.createGoal);
  goals.patch("/:goalId", auth, validate(goalParams, "params"), validate(goalUpdateSchema), c.updateGoal);
  goals.delete("/:goalId", auth, validate(goalParams, "params"), c.deleteGoal);

  const reports = Router();
  reports.post("/generate", auth, reportLimiter, validate(reportGenerateSchema), c.generateReport);
  reports.get("/", auth, validate(reportsQuerySchema, "query"), c.listReports);
  reports.get("/:reportId", auth, validate(reportParams, "params"), c.getReport);
  reports.get("/:reportId/pdf", auth, validate(reportParams, "params"), c.reportPdf);

  const notifications = Router();
  notifications.get("/", auth, computeLimiter, validate(notificationsQuerySchema, "query"), c.listNotifications);
  notifications.get("/preferences", auth, c.getPreferences);
  notifications.patch("/preferences", auth, validate(notificationPreferencesSchema), c.updatePreferences);
  notifications.patch("/:notificationId/read", auth, validate(notificationParams, "params"), c.markRead);
  notifications.post("/read-all", auth, c.markAllRead);

  return { analytics, gamification, goals, reports, notifications };
}
