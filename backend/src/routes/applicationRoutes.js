import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { idParam } from "../validators/common.js";
import { applicationCreateSchema, applicationListQuerySchema, applicationUpdateSchema } from "../validators/applicationSchemas.js";
import { createApplicationController } from "../controllers/applicationController.js";

export function createApplicationRoutes({ authService, repo }) {
  const router = Router();
  const controller = createApplicationController({ repo });
  const auth = requireAuth(authService);

  router.get("/", auth, validate(applicationListQuerySchema, "query"), controller.list);
  router.get("/pipeline", auth, controller.pipeline);
  router.post("/", auth, validate(applicationCreateSchema), controller.create);
  router.get("/:id", auth, validate(idParam, "params"), controller.getOne);
  router.patch("/:id", auth, validate(idParam, "params"), validate(applicationUpdateSchema), controller.update);
  router.delete("/:id", auth, validate(idParam, "params"), controller.remove);
  return router;
}
