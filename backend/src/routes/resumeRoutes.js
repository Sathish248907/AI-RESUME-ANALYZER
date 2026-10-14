import { Router } from "express";
import multer from "multer";
import { ApiError } from "../utils/errors.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { createResumeController } from "../controllers/resumeController.js";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "../services/resume/resumeParserService.js";
import { idParam } from "../validators/common.js";
import { resumeListQuerySchema, resumeUpdateSchema, resumeUploadFieldsSchema } from "../validators/resumeSchemas.js";

// Memory storage: the buffer is parsed (and optionally handed to the storage driver); nothing is written by multer.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new ApiError(415, "Only PDF and DOCX files are supported.", { code: "UNSUPPORTED_FILE_TYPE" }));
  },
});

/** Translate multer's own errors into ApiErrors. */
export function handleUpload(req, res, next) {
  upload.single("resume")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err?.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, "File size must be under 5 MB.", { code: "FILE_TOO_LARGE" }));
    if (err?.code === "LIMIT_UNEXPECTED_FILE") return next(new ApiError(400, "Send exactly one file in the `resume` field.", { code: "BAD_UPLOAD" }));
    next(new ApiError(400, "Invalid upload.", { code: "BAD_UPLOAD" }));
  });
}

/** Stateless parsing (used by demo mode, no account required): POST /api/resume/parse */
export function createResumeParseRoutes(deps) {
  const router = Router();
  const controller = createResumeController(deps);
  router.post("/parse", handleUpload, controller.parse);
  return router;
}

/** Stored resumes for the signed-in user: /api/resumes */
export function createResumeRoutes(deps) {
  const router = Router();
  const controller = createResumeController(deps);
  const auth = requireAuth(deps.authService);

  router.post("/", auth, handleUpload, validate(resumeUploadFieldsSchema), controller.upload);
  router.get("/", auth, validate(resumeListQuerySchema, "query"), controller.list);
  router.get("/:id", auth, validate(idParam, "params"), controller.getOne);
  router.get("/:id/download", auth, validate(idParam, "params"), controller.download);
  router.patch("/:id", auth, validate(idParam, "params"), validate(resumeUpdateSchema), controller.update);
  router.delete("/:id", auth, validate(idParam, "params"), controller.remove);
  return router;
}
