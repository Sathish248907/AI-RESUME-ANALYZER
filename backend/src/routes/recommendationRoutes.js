/**
 * recommendationRoutes.js — Phase 16.
 *
 * A neutral home for the cross-feature recommendation surface. The engine is
 * the Phase 9 one; what changes is that it is no longer reachable only through
 * `/api/career/*`, where the dashboard was never going to look for it.
 *
 * `/api/career/recommendations` keeps working exactly as before. Nothing is
 * moved or renamed, because other pages already call it.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createAnalysisLimiter } from "../middleware/rateLimit.js";
import { recommendationParams, recommendationUpdateSchema } from "../validators/careerSchemas.js";
import { z } from "zod";

const listQuerySchema = z.object({
  /** Recompute from the user's records rather than reading the stored list. */
  refresh: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

/**
 * @param {{ authService: object, service: object, analysisRateLimit?: number }} deps
 */
export function createRecommendationRoutes({ authService, service, analysisRateLimit = 10 }) {
  const router = Router();
  const auth = requireAuth(authService);
  // A refresh walks the whole career snapshot, so it is limited like any other
  // compute-heavy read rather than being free to hammer.
  const computeLimiter = createAnalysisLimiter(Math.max(analysisRateLimit * 6, 60));

  router.get("/recommendations", auth, computeLimiter, validate(listQuerySchema, "query"), async (req, res, next) => {
    try {
      res.json(await service.list(req.user.id, { limit: req.query.limit, refresh: req.query.refresh }));
    } catch (err) { next(err); }
  });

  router.patch(
    "/recommendations/:id",
    auth,
    validate(recommendationParams, "params"),
    validate(recommendationUpdateSchema),
    async (req, res, next) => {
      try {
        res.json({ recommendation: await service.update(req.user.id, req.params.id, req.body.status) });
      } catch (err) { next(err); }
    }
  );

  return router;
}
