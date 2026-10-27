/**
 * applicationWorkspaceRoutes.js — Phase 13 routes.
 *
 * Mounted at `/api` so the brief's paths are kept exactly:
 * `/api/applications/:applicationId/...` for things that belong to one
 * application, and flat `/api/application-documents/:id`,
 * `/api/application-reminders/:id`, `/api/application-interviews/:id`,
 * `/api/cover-letters/:id` for entities addressed directly.
 *
 * `applicationRoutes.js` keeps `/api/applications` itself: status changes, and
 * the rest of application CRUD, stay there.
 *
 * Only the two cover-letter routes that call the model use the AI limiter; the
 * rest are ordinary reads and writes. File uploads are capped by multer before
 * a byte reaches the service.
 */
import { Router } from "express";
import multer from "multer";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import { MAX_DOCUMENT_BYTES } from "../services/applications/applicationDocumentService.js";
import {
  applicationParams, checklistItemParams, coverLetterParams, documentParams, reminderParams, interviewParams,
  workspaceQuerySchema, checklistCreateSchema, checklistUpdateSchema,
  coverLetterCreateSchema, coverLetterUpdateSchema, coverLetterRegenerateSchema,
  documentCreateSchema, documentQuerySchema, activityCreateSchema, activityQuerySchema,
  reminderCreateSchema, reminderUpdateSchema, reminderQuerySchema,
  interviewCreateSchema, interviewUpdateSchema, readinessSchema,
} from "../validators/applicationWorkspaceSchemas.js";
import { createApplicationWorkspaceController } from "../controllers/applicationWorkspaceController.js";

/**
 * @param {{ authService, repo, applicationRepo, progressRepo, storage, getLlm, analysisRateLimit: number }} deps
 */
export function createApplicationWorkspaceRoutes({ authService, repo, applicationRepo, progressRepo, storage, getLlm, analysisRateLimit }) {
  const router = Router();
  const c = createApplicationWorkspaceController({ repo, applicationRepo, progressRepo, storage, getLlm });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 2, 20));
  const writeLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 20, 120));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } });

  // ── Dashboard across all applications ──
  router.get("/application-workspaces", auth, c.dashboard);

  // ── One application's workspace ──
  router.get("/applications/:applicationId/workspace", auth, validate(applicationParams, "params"), validate(workspaceQuerySchema, "query"), c.workspace);

  // ── Checklist ──
  router.get("/applications/:applicationId/checklist", auth, validate(applicationParams, "params"), c.listChecklist);
  router.post("/applications/:applicationId/checklist", auth, writeLimiter, validate(applicationParams, "params"), validate(checklistCreateSchema), c.addChecklistItem);
  router.patch("/applications/:applicationId/checklist/:itemId", auth, writeLimiter, validate(checklistItemParams, "params"), validate(checklistUpdateSchema), c.updateChecklistItem);
  router.delete("/applications/:applicationId/checklist/:itemId", auth, validate(checklistItemParams, "params"), c.deleteChecklistItem);

  // ── Activity ──
  router.get("/applications/:applicationId/activity", auth, validate(applicationParams, "params"), validate(activityQuerySchema, "query"), c.listActivity);
  router.post("/applications/:applicationId/activity", auth, writeLimiter, validate(applicationParams, "params"), validate(activityCreateSchema), c.addActivity);

  // ── Cover letters ──
  router.get("/applications/:applicationId/cover-letters", auth, validate(applicationParams, "params"), c.listCoverLetters);
  router.post("/applications/:applicationId/cover-letters", auth, aiLimiter, validate(applicationParams, "params"), validate(coverLetterCreateSchema), c.createCoverLetter);
  router.patch("/cover-letters/:coverLetterId", auth, validate(coverLetterParams, "params"), validate(coverLetterUpdateSchema), c.updateCoverLetter);
  router.delete("/cover-letters/:coverLetterId", auth, validate(coverLetterParams, "params"), c.deleteCoverLetter);
  router.post("/cover-letters/:coverLetterId/regenerate-paragraph", auth, aiLimiter, validate(coverLetterParams, "params"), validate(coverLetterRegenerateSchema), c.regenerateCoverLetterParagraph);
  router.post("/cover-letters/:coverLetterId/export", auth, writeLimiter, validate(coverLetterParams, "params"), c.exportCoverLetter);

  // ── Documents ──
  router.get("/applications/:applicationId/documents", auth, validate(applicationParams, "params"), c.listDocuments);
  router.post("/applications/:applicationId/documents", auth, writeLimiter, validate(applicationParams, "params"), upload.single("document"), validate(documentCreateSchema), c.addDocument);
  router.get("/application-documents/:documentId/download", auth, validate(documentParams, "params"), validate(documentQuerySchema, "query"), c.downloadDocument);
  router.delete("/application-documents/:documentId", auth, validate(documentParams, "params"), c.deleteDocument);

  // ── Reminders ──
  router.get("/application-reminders", auth, validate(reminderQuerySchema, "query"), c.listReminders);
  router.post("/application-reminders", auth, writeLimiter, validate(reminderCreateSchema), c.createReminder);
  router.patch("/application-reminders/:reminderId", auth, validate(reminderParams, "params"), validate(reminderUpdateSchema), c.updateReminder);
  router.delete("/application-reminders/:reminderId", auth, validate(reminderParams, "params"), c.deleteReminder);

  // ── Interview rounds ──
  router.get("/applications/:applicationId/interviews", auth, validate(applicationParams, "params"), c.listInterviews);
  router.post("/applications/:applicationId/interviews", auth, writeLimiter, validate(applicationParams, "params"), validate(interviewCreateSchema), c.createInterview);
  router.patch("/application-interviews/:interviewId", auth, validate(interviewParams, "params"), validate(interviewUpdateSchema), c.updateInterview);
  router.delete("/application-interviews/:interviewId", auth, validate(interviewParams, "params"), c.deleteInterview);

  // ── Readiness ──
  router.post("/applications/:applicationId/readiness-review", auth, writeLimiter, validate(applicationParams, "params"), validate(readinessSchema), c.readinessReview);

  return router;
}
