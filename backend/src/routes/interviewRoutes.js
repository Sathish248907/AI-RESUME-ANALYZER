import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import { idParam } from "../validators/common.js";
import {
  answerDraftSchema, answerEvaluateSchema, interviewCompleteSchema, interviewCreateSchema, interviewListQuerySchema, interviewUpdateSchema,
  practiceLogSchema, sessionParams, sessionQuestionParams,
} from "../validators/interviewSchemas.js";
import { createInterviewController } from "../controllers/interviewController.js";

/**
 * @param {{ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createInterviewRoutes({ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm, analysisRateLimit }) {
  const router = Router();
  const controller = createInterviewController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm });
  const auth = requireAuth(authService);
  // AI-backed endpoints share the analysis limiter budget (per user).
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 3, 30));

  // Sessions
  router.get("/history", auth, validate(interviewListQuerySchema, "query"), controller.history);
  router.get("/recommendations", auth, controller.recommendations);
  router.post("/", auth, aiLimiter, validate(interviewCreateSchema), controller.create);
  router.post("/practice-log", auth, validate(practiceLogSchema), controller.createPracticeLog);
  router.get("/:sessionId", auth, validate(sessionParams, "params"), controller.getOne);
  router.patch("/:sessionId", auth, validate(sessionParams, "params"), validate(interviewUpdateSchema), controller.update);
  router.post("/:sessionId/complete", auth, validate(sessionParams, "params"), validate(interviewCompleteSchema), controller.complete);
  router.delete("/:sessionId", auth, validate(sessionParams, "params"), controller.remove);
  router.get("/:sessionId/report", auth, validate(sessionParams, "params"), controller.report);

  // Answers
  router.put("/:sessionId/answers/:questionId", auth, validate(sessionQuestionParams, "params"), validate(answerDraftSchema), controller.saveDraft);
  router.get("/:sessionId/answers/:questionId", auth, validate(sessionQuestionParams, "params"), controller.getAnswer);
  router.post("/:sessionId/answers/:questionId/evaluate", auth, aiLimiter, validate(sessionQuestionParams, "params"), validate(answerEvaluateSchema), controller.evaluate);

  return router;
}

export { idParam };
