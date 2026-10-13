import { Router } from "express";
import multer from "multer";
import { ApiError } from "../utils/errors.js";
import { resumeController } from "../controllers/resumeController.js";
import { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } from "../services/resume/resumeParserService.js";

// Memory storage: the buffer is parsed and discarded; nothing touches the filesystem.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new ApiError(415, "Only PDF and DOCX files are supported.", { code: "UNSUPPORTED_FILE_TYPE" }));
  },
});

/** Translate multer's own errors into ApiErrors. */
function handleUpload(req, res, next) {
  upload.single("resume")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err?.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, "File size must be under 5 MB.", { code: "FILE_TOO_LARGE" }));
    if (err?.code === "LIMIT_UNEXPECTED_FILE") return next(new ApiError(400, "Send exactly one file in the `resume` field.", { code: "BAD_UPLOAD" }));
    next(new ApiError(400, "Invalid upload.", { code: "BAD_UPLOAD" }));
  });
}

export function createResumeRoutes() {
  const router = Router();
  // Parsing does not require sign-in so the demo flow keeps working without an account.
  router.post("/parse", handleUpload, resumeController.parse);
  return router;
}
