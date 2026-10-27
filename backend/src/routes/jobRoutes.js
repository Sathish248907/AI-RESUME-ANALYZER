/**
 * jobRoutes.js — Phase 12 routes.
 *
 * Rate limits reflect what each route costs someone else:
 *   - `providerLimiter` guards anything that can trigger an outbound provider
 *     call (discover with `refresh`, the refresh endpoint, running an alert),
 *     because that spends a shared third-party quota. The registry enforces a
 *     second, per-provider limit underneath.
 *   - `searchLimiter` is generous: a cached search and a deterministic match
 *     cost only local CPU.
 *   - Saved jobs, preferences and alert CRUD are ordinary writes.
 *
 * No route here calls an LLM, so none of them needs the AI request budget.
 * Resume tailoring hands over to the Phase 8 endpoints, which already do.
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  discoverQuerySchema, refreshSchema, jobParams, matchSchema, matchReportQuerySchema,
  savedJobParams, savedJobListQuerySchema, saveJobSchema, updateSavedJobSchema, startApplicationSchema,
  preferenceSchema, alertParams, alertCreateSchema, alertUpdateSchema, tailorSchema,
} from "../validators/jobSchemas.js";
import { createJobController } from "../controllers/jobController.js";

/**
 * @param {{ authService, repo, careerRepo, applicationRepo, jobDescriptionRepo, progressRepo,
 *           registry, discovery, alerts, env, analysisRateLimit: number }} deps
 */
export function createJobRoutes({ authService, repo, careerRepo, applicationRepo, jobDescriptionRepo, progressRepo, registry, discovery, alerts, env, analysisRateLimit }) {
  const router = Router();
  const c = createJobController({ repo, careerRepo, applicationRepo, jobDescriptionRepo, progressRepo, registry, discovery, alerts });
  const auth = requireAuth(authService);
  const providerLimiter = createAnalysisLimiter(Math.max(analysisRateLimit, 10));
  const searchLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 20, 120));

  // Make env available to handlers that describe infrastructure limits.
  router.use((req, _res, next) => { req.env = env; next(); });

  // ── Discovery ──
  router.get("/jobs/discover", auth, searchLimiter, validate(discoverQuerySchema, "query"), c.discover);
  router.get("/jobs/providers", auth, c.providers);
  router.post("/jobs/refresh", auth, providerLimiter, validate(refreshSchema), c.refresh);
  // Specific paths before the `:jobId` parameter so they are not shadowed.
  router.get("/jobs/:jobId", auth, validate(jobParams, "params"), c.detail);
  router.post("/jobs/:jobId/match", auth, searchLimiter, validate(jobParams, "params"), validate(matchSchema), c.match);
  router.get("/jobs/:jobId/match-report", auth, validate(jobParams, "params"), validate(matchReportQuerySchema, "query"), c.matchReport);
  router.get("/jobs/:jobId/interview-preparation", auth, validate(jobParams, "params"), c.interviewPreparation);
  router.post("/jobs/:jobId/tailor-resume", auth, searchLimiter, validate(jobParams, "params"), validate(tailorSchema), c.tailorResume);

  // ── Saved jobs (the application record itself stays in /api/applications) ──
  router.get("/saved-jobs", auth, validate(savedJobListQuerySchema, "query"), c.listSaved);
  router.post("/saved-jobs", auth, validate(saveJobSchema), c.save);
  router.patch("/saved-jobs/:savedJobId", auth, validate(savedJobParams, "params"), validate(updateSavedJobSchema), c.updateSaved);
  router.delete("/saved-jobs/:savedJobId", auth, validate(savedJobParams, "params"), c.deleteSaved);
  router.post("/saved-jobs/:savedJobId/application", auth, validate(savedJobParams, "params"), validate(startApplicationSchema), c.startApplication);

  // ── Search preferences ──
  router.get("/job-preferences", auth, c.getPreferences);
  router.put("/job-preferences", auth, validate(preferenceSchema), c.putPreferences);

  // ── Alerts ──
  router.get("/job-alerts", auth, c.listAlerts);
  router.post("/job-alerts", auth, validate(alertCreateSchema), c.createAlert);
  router.patch("/job-alerts/:alertId", auth, validate(alertParams, "params"), validate(alertUpdateSchema), c.updateAlert);
  router.delete("/job-alerts/:alertId", auth, validate(alertParams, "params"), c.deleteAlert);
  router.post("/job-alerts/:alertId/run", auth, providerLimiter, validate(alertParams, "params"), c.runAlert);

  return router;
}
