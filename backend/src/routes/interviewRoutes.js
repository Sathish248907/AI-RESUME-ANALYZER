import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { idParam } from "../validators/common.js";
import { interviewCreateSchema, interviewListQuerySchema, interviewUpdateSchema } from "../validators/interviewSchemas.js";
import { createInterviewController } from "../controllers/interviewController.js";

export function createInterviewRoutes({ authService, repo }) {
  const router = Router();
  const controller = createInterviewController({ repo });
  const auth = requireAuth(authService);

  router.get("/history", auth, validate(interviewListQuerySchema, "query"), controller.history);
  router.post("/", auth, validate(interviewCreateSchema), controller.create);
  router.patch("/:id", auth, validate(idParam, "params"), validate(interviewUpdateSchema), controller.update);
  router.delete("/:id", auth, validate(idParam, "params"), controller.remove);
  return router;
}
