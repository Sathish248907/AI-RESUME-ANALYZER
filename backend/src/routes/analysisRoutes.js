import { Router } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import { analysisRequestSchema, idParamSchema, listQuerySchema } from "../validators/analysisSchemas.js";
import { MAX_RESUME_CHARS } from "../utils/sanitize.js";
import { createAnalysisController } from "../controllers/analysisController.js";

const regenerateBodySchema = z.object({
  resumeText: z.string().trim().min(200).max(MAX_RESUME_CHARS).optional(),
});

/**
 * @param {{ authService: any, repo: any, getLlm: Function, storeResumeText: boolean, analysisRateLimit: number }} deps
 */
export function createAnalysisRoutes({ authService, repo, getLlm, storeResumeText, analysisRateLimit }) {
  const router = Router();
  const controller = createAnalysisController({ repo, getLlm, storeResumeText });
  const auth = requireAuth(authService);
  const aiLimiter = createAnalysisLimiter(analysisRateLimit);

  router.post("/resume", auth, aiLimiter, validate(analysisRequestSchema), controller.analyze);
  router.get("/", auth, validate(listQuerySchema, "query"), controller.list);
  router.get("/:id", auth, validate(idParamSchema, "params"), controller.getOne);
  router.delete("/:id", auth, validate(idParamSchema, "params"), controller.remove);
  router.post("/:id/regenerate", auth, aiLimiter, validate(idParamSchema, "params"), validate(regenerateBodySchema), controller.regenerate);

  return router;
}
