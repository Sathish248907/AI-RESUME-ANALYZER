import { ApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found.` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  // Body-parser errors
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Request body is not valid JSON." } });
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error("Operational error", { requestId: req.id, code: err.code, message: err.message, path: req.path });
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}), ...(err.retryable ? { retryable: true } : {}) },
    });
  }

  // Prisma connectivity problems surface as 503 so the client can offer demo mode.
  const code = err?.code ?? "";
  if (/^P1\d{3}$/.test(code) || err?.name === "PrismaClientInitializationError") {
    logger.error("Database unavailable", { requestId: req.id, code, message: err.message });
    return res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is unavailable. Please try again later.", retryable: true } });
  }

  logger.error("Unhandled error", { message: err?.message, name: err?.name, stack: process.env.NODE_ENV === "production" ? undefined : err?.stack?.split("\n").slice(0, 4) });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}
