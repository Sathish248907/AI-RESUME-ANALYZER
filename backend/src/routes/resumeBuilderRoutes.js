import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  resumeParams, versionParams, improvementParams, versionCreateSchema, versionListQuerySchema, versionUpdateSchema, duplicateSchema, improveSchema, tailorSchema,
  improvementResolveSchema, improvementListQuerySchema, compareSchema, restoreSchema, qualityQuerySchema, exportSchema, preferenceSchema,
  atsCheckSchema, atsHistoryQuerySchema, validateQuerySchema, applyFixSchema, roleRecommendationSchema, selectRoleSchema, assistantSchema, regenerateSchema,
} from "../validators/resumeBuilderSchemas.js";
import { createResumeBuilderController } from "../controllers/resumeBuilderController.js";

/**
 * /api/resume-builder/* — resume versions, AI improvement, tailoring, quality,
 * compare and PDF export (Phase 8), plus ATS readiness scoring, validation and
 * safe fixes, role recommendations and the writing assistant (Phase 11).
 *
 * Rate limits: the deterministic endpoints (ats-check, validate, apply-fix,
 * role-recommendations) call no model, so they sit under the generous
 * `checkLimiter`; only the endpoints that reach the LLM use `aiLimiter`.
 *
 * @param {{ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, careerRepo, learningRepo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createResumeBuilderRoutes({ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, careerRepo, learningRepo, getLlm, analysisRateLimit }) {
  const router = Router();
  const c = createResumeBuilderController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, careerRepo, learningRepo, getLlm });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 3, 30));
  const exportLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 10, 60));
  const checkLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 20, 120));

  router.get("/templates", auth, c.templates);
  router.get("/preferences", auth, c.preference);
  router.put("/preferences", auth, validate(preferenceSchema), c.savePreference);

  // Versions (collection)
  router.get("/versions", auth, validate(versionListQuerySchema, "query"), c.listVersions);
  router.post("/versions", auth, aiLimiter, validate(versionCreateSchema), c.createVersion); // blank / from another version (no upload)
  router.get("/versions/:versionId", auth, validate(versionParams, "params"), c.getVersion);
  router.patch("/versions/:versionId", auth, validate(versionParams, "params"), validate(versionUpdateSchema), c.updateVersion);
  router.delete("/versions/:versionId", auth, validate(versionParams, "params"), c.deleteVersion);
  router.post("/versions/:versionId/duplicate", auth, validate(versionParams, "params"), validate(duplicateSchema), c.duplicateVersion);
  router.post("/versions/:versionId/restore", auth, validate(versionParams, "params"), validate(restoreSchema), c.restoreVersion);
  router.post("/versions/:versionId/improve", auth, aiLimiter, validate(versionParams, "params"), validate(improveSchema), c.improve);
  router.post("/versions/:versionId/tailor", auth, aiLimiter, validate(versionParams, "params"), validate(tailorSchema), c.tailor);
  router.get("/versions/:versionId/improvements", auth, validate(versionParams, "params"), validate(improvementListQuerySchema, "query"), c.listImprovements);
  router.post("/versions/:versionId/improvements/:improvementId", auth, validate(improvementParams, "params"), validate(improvementResolveSchema), c.resolveImprovement);
  router.post("/versions/:versionId/improvements/:improvementId/regenerate", auth, aiLimiter, validate(improvementParams, "params"), validate(regenerateSchema), c.regenerate);
  router.post("/versions/:versionId/compare", auth, validate(versionParams, "params"), validate(compareSchema), c.compare);
  router.get("/versions/:versionId/quality-check", auth, validate(versionParams, "params"), validate(qualityQuerySchema, "query"), c.qualityCheck);

  // ── ATS readiness, validation, roles, assistant ──
  router.post("/versions/:versionId/ats-check", auth, checkLimiter, validate(versionParams, "params"), validate(atsCheckSchema), c.atsCheck);
  router.get("/versions/:versionId/ats-history", auth, validate(versionParams, "params"), validate(atsHistoryQuerySchema, "query"), c.atsHistory);
  router.post("/versions/:versionId/validate", auth, checkLimiter, validate(versionParams, "params"), validate(validateQuerySchema), c.validate);
  router.post("/versions/:versionId/apply-fix", auth, checkLimiter, validate(versionParams, "params"), validate(applyFixSchema), c.applyFix);
  router.post("/versions/:versionId/role-recommendations", auth, checkLimiter, validate(versionParams, "params"), validate(roleRecommendationSchema), c.roleRecommendations);
  router.post("/versions/:versionId/target-role", auth, validate(versionParams, "params"), validate(selectRoleSchema), c.selectTargetRole);
  router.post("/versions/:versionId/assistant", auth, aiLimiter, validate(versionParams, "params"), validate(assistantSchema), c.assistant);
  router.post("/versions/:versionId/export/pdf", auth, exportLimiter, validate(versionParams, "params"), validate(exportSchema), c.exportPdf);
  router.get("/versions/:versionId/plain-text", auth, validate(versionParams, "params"), c.plainText);

  // Per uploaded resume
  router.get("/:resumeId", auth, validate(resumeParams, "params"), c.getEditable);
  router.get("/:resumeId/versions", auth, validate(resumeParams, "params"), validate(versionListQuerySchema, "query"), (req, res, next) => { req.query.resumeId = req.params.resumeId; c.listVersions(req, res, next); });
  router.post("/:resumeId/versions", auth, aiLimiter, validate(resumeParams, "params"), validate(versionCreateSchema), c.createVersion);

  return router;
}
