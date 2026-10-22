import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  profileSchema, assessmentCreateSchema, assessmentListQuerySchema, assessmentParams, recommendationUpdateSchema, recommendationParams, recommendationsQuerySchema, dashboardQuerySchema, interviewPrepQuerySchema,
  jobPriorityQuerySchema, planGenerateSchema, taskParams, taskUpdateSchema, taskCreateSchema, conversationCreateSchema, conversationParams, messageSchema, conversationRenameSchema,
} from "../validators/careerSchemas.js";
import { createCareerController } from "../controllers/careerController.js";

/**
 * /api/career/* — Phase 9 career coach.
 * @param {{ authService, repo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createCareerRoutes({ authService, repo, getLlm, analysisRateLimit }) {
  const router = Router();
  const c = createCareerController({ repo, getLlm });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 4, 40)); // chat messages
  const computeLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 6, 60)); // assessments / plans (no AI, but heavy reads)

  router.get("/profile", auth, c.getProfile);
  router.put("/profile", auth, validate(profileSchema), c.putProfile);

  router.post("/assessments", auth, computeLimiter, validate(assessmentCreateSchema), c.createAssessment);
  router.get("/assessments", auth, validate(assessmentListQuerySchema, "query"), c.listAssessments);
  router.get("/assessments/:assessmentId", auth, validate(assessmentParams, "params"), c.getAssessment);

  router.get("/recommendations", auth, validate(recommendationsQuerySchema, "query"), c.recommendations);
  router.patch("/recommendations/:id", auth, validate(recommendationParams, "params"), validate(recommendationUpdateSchema), c.updateRecommendation);

  router.get("/dashboard", auth, validate(dashboardQuerySchema, "query"), c.dashboard);
  router.get("/job-priorities", auth, validate(jobPriorityQuerySchema, "query"), c.jobPriorities);
  router.get("/interview-prep", auth, validate(interviewPrepQuerySchema, "query"), c.interviewPrep);

  router.post("/action-plans/generate", auth, computeLimiter, validate(planGenerateSchema), c.generatePlan);
  router.get("/action-plans/current", auth, c.currentPlan);
  router.post("/action-tasks", auth, validate(taskCreateSchema), c.addTask);
  router.patch("/action-tasks/:taskId", auth, validate(taskParams, "params"), validate(taskUpdateSchema), c.updateTask);
  router.delete("/action-tasks/:taskId", auth, validate(taskParams, "params"), c.deleteTask);

  router.post("/coach/conversations", auth, aiLimiter, validate(conversationCreateSchema), (req, res, next) => c.createConversation(req, res, next));
  router.get("/coach/conversations", auth, c.listConversations);
  router.get("/coach/conversations/:id", auth, validate(conversationParams, "params"), c.getConversation);
  router.post("/coach/conversations/:id/messages", auth, aiLimiter, validate(conversationParams, "params"), validate(messageSchema), (req, res, next) => c.sendMessage(req, res, next));
  router.patch("/coach/conversations/:id", auth, validate(conversationParams, "params"), validate(conversationRenameSchema), c.renameConversation);
  router.delete("/coach/conversations/:id", auth, validate(conversationParams, "params"), c.deleteConversation);

  return router;
}
