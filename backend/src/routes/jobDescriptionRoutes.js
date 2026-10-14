import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { idParam } from "../validators/common.js";
import { jobDescriptionCreateSchema, jobDescriptionListQuerySchema, jobDescriptionUpdateSchema } from "../validators/jobDescriptionSchemas.js";
import { createJobDescriptionController } from "../controllers/jobDescriptionController.js";

export function createJobDescriptionRoutes({ authService, repo }) {
  const router = Router();
  const controller = createJobDescriptionController({ repo });
  const auth = requireAuth(authService);

  router.get("/", auth, validate(jobDescriptionListQuerySchema, "query"), controller.list);
  router.post("/", auth, validate(jobDescriptionCreateSchema), controller.create);
  router.get("/:id", auth, validate(idParam, "params"), controller.getOne);
  router.patch("/:id", auth, validate(idParam, "params"), validate(jobDescriptionUpdateSchema), controller.update);
  router.delete("/:id", auth, validate(idParam, "params"), controller.remove);
  return router;
}
