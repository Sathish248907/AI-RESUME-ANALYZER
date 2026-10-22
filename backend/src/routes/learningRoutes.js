import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import {
  roadmapCreateSchema, roadmapUpdateSchema, roadmapRegenerateSchema, roadmapListQuerySchema, taskListQuerySchema, taskUpdateSchema, taskCompleteSchema,
  checkpointSubmitSchema, skillGapUpdateSchema, recommendationsQuerySchema, taskParams, taskCheckpointParams, roadmapParams, skillGapParams, recommendationParams,
} from "../validators/learningSchemas.js";
import { createLearningController } from "../controllers/learningController.js";

/**
 * /api/learning/* — Phase 7 learning roadmaps, tasks, skill gaps and recommendations.
 * @param {{ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, interviewRepo, getLlm: Function, analysisRateLimit: number }} deps
 */
export function createLearningRoutes({ authService, repo, resumeRepo, jobDescriptionRepo, analysisRepo, interviewRepo, getLlm, analysisRateLimit }) {
  const router = Router();
  const c = createLearningController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, interviewRepo, getLlm });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 2, 20));

  // Roadmaps
  router.post("/roadmaps", auth, aiLimiter, validate(roadmapCreateSchema), c.create);
  router.get("/roadmaps", auth, validate(roadmapListQuerySchema, "query"), c.list);
  router.get("/roadmaps/:id", auth, validate(roadmapParams, "params"), c.getOne);
  router.patch("/roadmaps/:id", auth, validate(roadmapParams, "params"), validate(roadmapUpdateSchema), c.update);
  router.delete("/roadmaps/:id", auth, validate(roadmapParams, "params"), c.remove);
  router.post("/roadmaps/:id/regenerate", auth, aiLimiter, validate(roadmapParams, "params"), validate(roadmapRegenerateSchema), c.regenerate);
  router.get("/roadmaps/:id/progress", auth, validate(roadmapParams, "params"), validate(recommendationsQuerySchema, "query"), c.progress);
  router.get("/roadmaps/:id/tasks", auth, validate(roadmapParams, "params"), validate(taskListQuerySchema, "query"), c.listTasks);

  // Tasks
  router.patch("/tasks/:taskId", auth, validate(taskParams, "params"), validate(taskUpdateSchema), c.updateTask);
  router.post("/tasks/:taskId/complete", auth, validate(taskParams, "params"), validate(taskCompleteSchema), c.completeTask);
  router.post("/tasks/:taskId/reopen", auth, validate(taskParams, "params"), c.reopenTask);
  router.get("/tasks/:taskId/resources", auth, validate(taskParams, "params"), c.taskResources);
  router.post("/tasks/:taskId/checkpoints/:checkpointId/submit", auth, validate(taskCheckpointParams, "params"), validate(checkpointSubmitSchema), c.submitCheckpoint);

  // Skill gaps
  router.get("/skill-gaps", auth, c.skillGaps);
  router.patch("/skill-gaps/:id", auth, validate(skillGapParams, "params"), validate(skillGapUpdateSchema), c.updateSkillGap);

  // Recommendations
  router.get("/recommendations", auth, validate(recommendationsQuerySchema, "query"), c.recommendations);
  router.post("/recommendations/:id/dismiss", auth, validate(recommendationParams, "params"), c.dismissRecommendation);

  return router;
}
