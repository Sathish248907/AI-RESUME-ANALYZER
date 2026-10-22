import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  resumeParams, versionParams, improvementParams, versionCreateSchema, versionListQuerySchema, versionUpdateSchema, duplicateSchema, improveSchema, tailorSchema,
  improvementResolveSchema, improvementListQuerySchema, compareSchema, restoreSchema, qualityQuerySchema, exportSchema, preferenceSchema,
} from "../validators/resumeBuilderSchemas.js";
import { createResumeBuilderController } from "../controllers/resumeBuilderController.js";

/**
 * /api/resume-builder/* — Phase 8 resume versions, AI improvement, tailoring, quality, compare, PDF export.
 * @param {{ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createResumeBuilderRoutes({ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm, analysisRateLimit }) {
  const router = Router();
  const c = createResumeBuilderController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 3, 30));
  const exportLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 10, 60));

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
  router.post("/versions/:versionId/compare", auth, validate(versionParams, "params"), validate(compareSchema), c.compare);
  router.get("/versions/:versionId/quality-check", auth, validate(versionParams, "params"), validate(qualityQuerySchema, "query"), c.qualityCheck);
  router.post("/versions/:versionId/export/pdf", auth, exportLimiter, validate(versionParams, "params"), validate(exportSchema), c.exportPdf);
  router.get("/versions/:versionId/plain-text", auth, validate(versionParams, "params"), c.plainText);

  // Per uploaded resume
  router.get("/:resumeId", auth, validate(resumeParams, "params"), c.getEditable);
  router.get("/:resumeId/versions", auth, validate(resumeParams, "params"), validate(versionListQuerySchema, "query"), (req, res, next) => { req.query.resumeId = req.params.resumeId; c.listVersions(req, res, next); });
  router.post("/:resumeId/versions", auth, aiLimiter, validate(resumeParams, "params"), validate(versionCreateSchema), c.createVersion);

  return router;
}
