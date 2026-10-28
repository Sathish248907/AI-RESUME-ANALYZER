/**
 * onboardingRoutes.js — Phase 16 first-run setup.
 *
 * These endpoints track progress; they never write the user's answers. Each
 * step links to the feature that owns its data, so saving a profile still goes
 * through `PUT /api/career/profile` and uploading a resume still goes through
 * `POST /api/resumes`. That keeps one writer per record.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { STEP_KEYS } from "../services/onboarding/onboardingService.js";

const stepParams = z.object({ step: z.enum(STEP_KEYS) });
const stepBody = z.object({ action: z.enum(["complete", "skip"]).default("complete") });

/** @param {{ authService: object, service: object }} deps */
export function createOnboardingRoutes({ authService, service }) {
  const router = Router();
  const auth = requireAuth(authService);

  router.get("/onboarding", auth, async (req, res, next) => {
    try {
      res.json(await service.getState(req.user.id, { includeRecommendations: true }));
    } catch (err) { next(err); }
  });

  router.post(
    "/onboarding/steps/:step",
    auth,
    validate(stepParams, "params"),
    validate(stepBody),
    async (req, res, next) => {
      try {
        res.json(await service.markStep(req.user.id, req.params.step, req.body.action));
      } catch (err) { next(err); }
    }
  );

  router.post("/onboarding/dismiss", auth, async (req, res, next) => {
    try { res.json(await service.dismiss(req.user.id)); } catch (err) { next(err); }
  });

  router.post("/onboarding/restart", auth, async (req, res, next) => {
    try { res.json(await service.restart(req.user.id)); } catch (err) { next(err); }
  });

  return router;
}
