/**
 * app.js — builds the Express application. Dependencies (env, prisma, LLM
 * provider) are injected so tests can run the full HTTP stack with fakes.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createAnalysisRoutes } from "./routes/analysisRoutes.js";
import { createResumeRoutes } from "./routes/resumeRoutes.js";
import { createAuthService } from "./services/authService.js";
import { createAnalysisRepository } from "./models/analysisRepository.js";
import { createLlmProvider, providerConfigFromEnv } from "./services/ai/llmProvider.js";
import { logger } from "./utils/logger.js";

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * @param {{ env: ReturnType<import("./config/env.js").loadEnv>, prisma: import("@prisma/client").PrismaClient,
 *           llm?: any, repo?: any, authService?: any }} deps
 */
export function createApp({ env, prisma, llm, repo, authService }) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin / server-to-server requests without an Origin header.
        if (!origin || env.FRONTEND_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: "512kb" }));
  app.use(globalLimiter);

  // Per-request timeout so a hung provider call cannot pin a connection forever.
  app.use((req, res, next) => {
    res.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent) {
        res.status(504).json({ error: { code: "REQUEST_TIMEOUT", message: "The request took too long to complete.", retryable: true } });
      }
    });
    next();
  });

  // Minimal request log — method, path, status, duration. Never bodies.
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (env.NODE_ENV !== "test") logger.info("request", { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
    });
    next();
  });

  const auth = authService ?? createAuthService(prisma, env);
  const analysisRepo = repo ?? createAnalysisRepository(prisma);

  // Lazy provider construction: a missing key yields a 503 at request time, not a crash at boot.
  let cachedLlm = llm ?? null;
  const getLlm = () => {
    if (!cachedLlm) cachedLlm = createLlmProvider(providerConfigFromEnv(env));
    return cachedLlm;
  };

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      ai: { configured: env.LLM_CONFIGURED, provider: env.LLM_PROVIDER, model: env.LLM_MODEL },
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRoutes(auth));
  app.use("/api/resume", createResumeRoutes());
  app.use(
    "/api/analysis",
    createAnalysisRoutes({
      authService: auth,
      repo: analysisRepo,
      getLlm,
      storeResumeText: env.STORE_RESUME_TEXT,
      analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
