/**
 * app.js — builds the Express application. Dependencies (env, prisma, LLM
 * provider, storage) are injected so tests can run the full HTTP stack with fakes.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createAnalysisRoutes } from "./routes/analysisRoutes.js";
import { createResumeParseRoutes, createResumeRoutes } from "./routes/resumeRoutes.js";
import { createJobDescriptionRoutes } from "./routes/jobDescriptionRoutes.js";
import { createApplicationRoutes } from "./routes/applicationRoutes.js";
import { createInterviewRoutes } from "./routes/interviewRoutes.js";
import { createDashboardRoutes } from "./routes/dashboardRoutes.js";
import { createAuthService } from "./services/authService.js";
import { createAnalysisRepository } from "./models/analysisRepository.js";
import { createResumeRepository } from "./models/resumeRepository.js";
import { createJobDescriptionRepository } from "./models/jobDescriptionRepository.js";
import { createApplicationRepository } from "./models/applicationRepository.js";
import { createInterviewRepository } from "./models/interviewRepository.js";
import { createDashboardRepository } from "./models/dashboardRepository.js";
import { createLlmProvider, providerConfigFromEnv } from "./services/ai/llmProvider.js";
import { createStorage } from "./services/storage/storageService.js";
import { logger } from "./utils/logger.js";

const REQUEST_TIMEOUT_MS = 120_000;

/**
 * @param {{ env: ReturnType<import("./config/env.js").loadEnv>, prisma: import("@prisma/client").PrismaClient,
 *           llm?: any, authService?: any, storage?: any }} deps
 */
export function createApp({ env, prisma, llm, authService, storage }) {
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
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
  const files = storage ?? createStorage(env);

  const repos = {
    analysis: createAnalysisRepository(prisma),
    resume: createResumeRepository(prisma),
    jobDescription: createJobDescriptionRepository(prisma),
    application: createApplicationRepository(prisma),
    interview: createInterviewRepository(prisma),
    dashboard: createDashboardRepository(prisma),
  };

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
      storage: { driver: files.name, retainsOriginals: files.enabled },
      time: new Date().toISOString(),
    });
  });

  app.use("/api/auth", createAuthRoutes(auth));
  app.use("/api/resume", createResumeParseRoutes({ resumeRepo: repos.resume, analysisRepo: repos.analysis, storage: files }));
  app.use("/api/resumes", createResumeRoutes({ authService: auth, resumeRepo: repos.resume, analysisRepo: repos.analysis, storage: files }));
  app.use(
    "/api/analysis",
    createAnalysisRoutes({
      authService: auth,
      repo: repos.analysis,
      resumeRepo: repos.resume,
      jobDescriptionRepo: repos.jobDescription,
      getLlm,
      storeResumeText: env.STORE_RESUME_TEXT,
      analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
    })
  );
  app.use("/api/job-descriptions", createJobDescriptionRoutes({ authService: auth, repo: repos.jobDescription }));
  app.use("/api/applications", createApplicationRoutes({ authService: auth, repo: repos.application }));
  app.use("/api/interviews", createInterviewRoutes({ authService: auth, repo: repos.interview }));
  app.use("/api/dashboard", createDashboardRoutes({ authService: auth, dashboardRepo: repos.dashboard }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
