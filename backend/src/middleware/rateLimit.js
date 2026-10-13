import rateLimit from "express-rate-limit";

const message = (what) => ({
  error: { code: "RATE_LIMITED", message: `Too many ${what}. Please wait and try again.`, retryable: true },
});

/** Global limiter — generous, protects against runaway clients. */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("requests"),
});

/** Auth limiter — slows credential stuffing. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("sign-in attempts"),
});

/** Analysis limiter — AI calls are expensive; limit per IP and configurable. */
export function createAnalysisLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: message("analysis requests"),
    keyGenerator: (req) => req.user?.id ?? req.ip,
  });
}
