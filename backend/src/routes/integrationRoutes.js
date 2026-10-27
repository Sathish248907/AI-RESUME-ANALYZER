/**
 * integrationRoutes.js — Phase 14 routes.
 *
 * The OAuth callback is the only route in this product without `requireAuth`,
 * because the provider's browser redirect carries no Bearer token. Its
 * authentication is the single-use `state` value, validated in the service. It
 * is rate limited on its own, since it is the one externally-reachable
 * endpoint here.
 *
 * Anything that can call a provider sits behind `providerLimiter`: those
 * requests spend a third-party quota and, for Drive, upload bytes.
 */
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  providerParams, oauthProviderParams, ruleParams, executionParams,
  connectSchema, callbackQuerySchema, syncQuerySchema, calendarSyncSchema,
  calendarPreferencesSchema, emailPreferencesSchema, driveExportSchema,
  ruleUpsertSchema, ruleUpdateSchema, ruleRunSchema, executionsQuerySchema,
} from "../validators/integrationSchemas.js";
import { createIntegrationController } from "../controllers/integrationController.js";

export function createIntegrationRoutes(deps) {
  const router = Router();
  const c = createIntegrationController(deps);
  const auth = requireAuth(deps.authService);
  const rate = deps.analysisRateLimit ?? 10;
  const providerLimiter = createAnalysisLimiter(Math.max(rate, 10));
  const callbackLimiter = createAnalysisLimiter(Math.max(rate * 3, 30));
  const readLimiter = createAnalysisLimiter(Math.max(rate * 20, 120));

  // ── Dashboard ──
  router.get("/integrations", auth, readLimiter, c.list);

  // ── OAuth callback: no Bearer token by necessity; `state` authenticates it ──
  router.get("/integrations/callback", callbackLimiter, validate(callbackQuerySchema, "query"), c.callback);

  // ── Per provider ──
  router.get("/integrations/:provider/status", auth, validate(providerParams, "params"), c.status);
  router.post("/integrations/:provider/connect", auth, providerLimiter, validate(oauthProviderParams, "params"), validate(connectSchema), c.connect);
  router.post("/integrations/:provider/disconnect", auth, providerLimiter, validate(oauthProviderParams, "params"), c.disconnect);
  router.post("/integrations/:provider/sync", auth, providerLimiter, validate(oauthProviderParams, "params"), validate(calendarSyncSchema), c.sync);
  router.get("/integrations/:provider/sync-history", auth, readLimiter, validate(providerParams, "params"), validate(syncQuerySchema, "query"), c.syncHistory);

  // Preferences: the calendar and email shapes differ, so they validate apart.
  router.put("/integrations/google_calendar/preferences", auth, validate(calendarPreferencesSchema), (req, res, next) => {
    req.params.provider = "google_calendar";
    c.updatePreferences(req, res, next);
  });
  router.put("/integrations/email/preferences", auth, validate(emailPreferencesSchema), (req, res, next) => {
    req.params.provider = "email";
    c.updatePreferences(req, res, next);
  });

  // ── Drive ──
  router.get("/integrations/google_drive/folders", auth, providerLimiter, c.driveFolders);
  router.post("/integrations/google_drive/export", auth, providerLimiter, validate(driveExportSchema), c.driveExport);

  // ── Email ──
  router.get("/integrations/email/history", auth, readLimiter, validate(syncQuerySchema, "query"), c.emailHistory);

  // ── Automation ──
  router.get("/automation/rules", auth, readLimiter, c.listRules);
  router.post("/automation/rules", auth, validate(ruleUpsertSchema), c.upsertRule);
  router.patch("/automation/rules/:ruleId", auth, validate(ruleParams, "params"), validate(ruleUpdateSchema), c.updateRule);
  router.delete("/automation/rules/:ruleId", auth, validate(ruleParams, "params"), c.deleteRule);
  router.post("/automation/pause-all", auth, c.pauseAll);
  router.get("/automation/rules/:ruleId/preview", auth, readLimiter, validate(ruleParams, "params"), c.previewRule);
  router.post("/automation/rules/:ruleId/run", auth, providerLimiter, validate(ruleParams, "params"), validate(ruleRunSchema), c.runRule);
  router.get("/automation/executions", auth, readLimiter, validate(executionsQuerySchema, "query"), c.listExecutions);
  router.post("/automation/executions/:executionId/retry", auth, providerLimiter, validate(executionParams, "params"), c.retryExecution);

  return router;
}
