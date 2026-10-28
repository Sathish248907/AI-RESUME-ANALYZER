/**
 * app.js — builds the Express application. Dependencies (env, prisma, LLM
 * provider, storage) are injected so tests can run the full HTTP stack with fakes.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { globalLimiter } from "./middleware/rateLimit.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createAnalysisRoutes } from "./routes/analysisRoutes.js";
import { createResumeParseRoutes, createResumeRoutes } from "./routes/resumeRoutes.js";
import { createJobDescriptionRoutes } from "./routes/jobDescriptionRoutes.js";
import { createApplicationRoutes } from "./routes/applicationRoutes.js";
import { createInterviewRoutes } from "./routes/interviewRoutes.js";
import { createDashboardRoutes } from "./routes/dashboardRoutes.js";
import { createLearningRoutes } from "./routes/learningRoutes.js";
import { createResumeBuilderRoutes } from "./routes/resumeBuilderRoutes.js";
import { createCareerRoutes } from "./routes/careerRoutes.js";
import { createProgressRoutes } from "./routes/progressRoutes.js";
import { createJobRoutes } from "./routes/jobRoutes.js";
import { createApplicationWorkspaceRoutes } from "./routes/applicationWorkspaceRoutes.js";
import { createIntegrationRoutes } from "./routes/integrationRoutes.js";
import { createHealthRoutes } from "./routes/healthRoutes.js";
import { createRecommendationRoutes } from "./routes/recommendationRoutes.js";
import { createOnboardingRoutes } from "./routes/onboardingRoutes.js";
import { createAuthService } from "./services/authService.js";
import { createAnalysisRepository } from "./models/analysisRepository.js";
import { createResumeRepository } from "./models/resumeRepository.js";
import { createJobDescriptionRepository } from "./models/jobDescriptionRepository.js";
import { createApplicationRepository } from "./models/applicationRepository.js";
import { createInterviewRepository } from "./models/interviewRepository.js";
import { createDashboardRepository } from "./models/dashboardRepository.js";
import { createLearningRepository } from "./models/learningRepository.js";
import { createResumeBuilderRepository } from "./models/resumeBuilderRepository.js";
import { createCareerRepository } from "./models/careerRepository.js";
import { createProgressRepository } from "./models/progressRepository.js";
import { createJobRepository } from "./models/jobRepository.js";
import { createApplicationWorkspaceRepository } from "./models/applicationWorkspaceRepository.js";
import { createIntegrationRepository } from "./models/integrationRepository.js";
import { createOnboardingRepository } from "./models/onboardingRepository.js";
import { createLlmProvider, providerConfigFromEnv } from "./services/ai/llmProvider.js";
import { createJobProviderRegistry } from "./services/jobs/jobProviderRegistry.js";
import { createJobDiscoveryService } from "./services/jobs/jobDiscoveryService.js";
import { createJobAlertService } from "./services/jobs/jobAlertService.js";
import { createTokenVault } from "./services/integrations/tokenVault.js";
import { createOAuthService } from "./services/integrations/oauthService.js";
import { createGoogleCalendarService } from "./services/integrations/googleCalendarService.js";
import { createGoogleDriveService } from "./services/integrations/googleDriveService.js";
import { createEmailService } from "./services/integrations/emailService.js";
import { createAutomationEngine } from "./services/automation/automationEngine.js";
import { createRecommendationService } from "./services/recommendations/recommendationService.js";
import { createOnboardingService } from "./services/onboarding/onboardingService.js";
import { renderResumePdf } from "./services/resumeBuilder/resumePdfService.js";
import { renderCoverLetterPdf } from "./services/applications/coverLetterPdfService.js";
import { createStorage } from "./services/storage/storageService.js";
import { logger } from "./utils/logger.js";
import { aiRequestBudgetMs } from "./app-meta.js";

export { aiRequestBudgetMs };

const REQUEST_TIMEOUT_MS = 120_000;
/** Routes that call the LLM: timeout must exceed LLM_TIMEOUT_MS × (retries + 1). */
const AI_ROUTE = /^\/api\/(analysis\/resume|analysis\/[a-z0-9]+\/regenerate|interviews|interviews\/[a-z0-9]+\/answers\/[a-z0-9]+\/evaluate|learning\/roadmaps|learning\/roadmaps\/[a-z0-9]+\/regenerate|resume-builder\/versions|resume-builder\/[a-z0-9]+\/versions|resume-builder\/versions\/[a-z0-9]+\/(improve|tailor|assistant)|resume-builder\/versions\/[a-z0-9]+\/improvements\/[a-z0-9]+\/regenerate|career\/coach\/conversations|career\/coach\/conversations\/[a-z0-9]+\/messages|progress-reports\/generate|applications\/[a-z0-9]+\/cover-letters|cover-letters\/[a-z0-9]+\/regenerate-paragraph)$/i;



/**
 * @param {{ env: ReturnType<import("./config/env.js").loadEnv>, prisma: import("@prisma/client").PrismaClient,
 *           llm?: any, authService?: any, storage?: any, jobFetch?: typeof fetch,
 *           integrationFetch?: typeof fetch }} deps
 */
export function createApp({ env, prisma, llm, authService, storage, jobFetch, integrationFetch }) {
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
  app.use(requestId);
  app.use(express.json({ limit: "512kb" }));
  app.use(globalLimiter);

  // Per-request timeout so a hung provider call cannot pin a connection forever.
  // AI routes get a longer budget so the client never gives up before the server does.
  const aiBudget = aiRequestBudgetMs(env);
  app.use((req, res, next) => {
    const isAi = req.method === "POST" && AI_ROUTE.test(req.path);
    res.setTimeout(isAi ? aiBudget : REQUEST_TIMEOUT_MS, () => {
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
      if (env.NODE_ENV !== "test") logger.info("request", { requestId: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start });
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
    learning: createLearningRepository(prisma),
    resumeBuilder: createResumeBuilderRepository(prisma),
    career: createCareerRepository(prisma),
    progress: createProgressRepository(prisma),
    jobs: createJobRepository(prisma),
    applicationWorkspace: createApplicationWorkspaceRepository(prisma),
    integrations: createIntegrationRepository(prisma),
    onboarding: createOnboardingRepository(prisma),
  };

  // Phase 14. `integrationFetch` is injectable so OAuth and provider calls are
  // testable without the network; the vault refuses to store a token at all
  // when INTEGRATION_ENCRYPTION_KEY is unset.
  const tokenVault = createTokenVault(env);
  const oauthService = createOAuthService({ env, repo: repos.integrations, vault: tokenVault, fetchImpl: integrationFetch, logger });
  const calendarService = createGoogleCalendarService({ oauth: oauthService, repo: repos.integrations, fetchImpl: integrationFetch, logger });
  const driveService = createGoogleDriveService({ oauth: oauthService, repo: repos.integrations, fetchImpl: integrationFetch, logger });
  const emailService = createEmailService({ env, repo: repos.integrations, logger });
  const automationEngine = createAutomationEngine({
    repo: repos.integrations,
    progressRepo: repos.progress,
    workspaceRepo: repos.applicationWorkspace,
    calendar: calendarService,
    email: emailService,
    logger,
  });

  // Phase 12: provider adapters do no I/O of their own; the registry performs
  // every outbound call so timeouts and rate limits are uniform. `fetchImpl` is
  // injectable so tests drive providers without touching the network.
  const jobRegistry = createJobProviderRegistry({ env, fetchImpl: jobFetch, logger });
  const jobDiscovery = createJobDiscoveryService({ repo: repos.jobs, registry: jobRegistry, env, logger });
  const jobAlerts = createJobAlertService({ repo: repos.jobs, discovery: jobDiscovery, progressRepo: repos.progress, env, logger });

  // Lazy provider construction: a missing key yields a 503 at request time, not a crash at boot.
  let cachedLlm = llm ?? null;
  const getLlm = () => {
    if (!cachedLlm) cachedLlm = createLlmProvider(providerConfigFromEnv(env));
    return cachedLlm;
  };

  // Liveness is public; anything that describes the deployment is gated.
  app.use("/api", createHealthRoutes({ env, prisma, storage: files }));

  app.use("/api/auth", createAuthRoutes(auth, { limit: env.AUTH_RATE_LIMIT }));
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
  app.use("/api/applications", createApplicationRoutes({ authService: auth, repo: repos.application, workspaceRepo: repos.applicationWorkspace }));
  app.use(
    "/api/interviews",
    createInterviewRoutes({
      authService: auth,
      repo: repos.interview,
      resumeRepo: repos.resume,
      jobDescriptionRepo: repos.jobDescription,
      analysisRepo: repos.analysis,
      getLlm,
      analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
    })
  );
  app.use("/api/dashboard", createDashboardRoutes({ authService: auth, dashboardRepo: repos.dashboard }));
  app.use(
    "/api/learning",
    createLearningRoutes({
      authService: auth,
      repo: repos.learning,
      resumeRepo: repos.resume,
      jobDescriptionRepo: repos.jobDescription,
      analysisRepo: repos.analysis,
      interviewRepo: repos.interview,
      getLlm,
      analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
    })
  );

  app.use(
    "/api/resume-builder",
    createResumeBuilderRoutes({
      authService: auth,
      repo: repos.resumeBuilder,
      resumeRepo: repos.resume,
      jobDescriptionRepo: repos.jobDescription,
      analysisRepo: repos.analysis,
      // Role recommendations read career preferences and in-progress learning;
      // adopting a target role writes it back to the career profile.
      careerRepo: repos.career,
      learningRepo: repos.learning,
      getLlm,
      analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
    })
  );

  app.use("/api/career", createCareerRoutes({ authService: auth, repo: repos.career, getLlm, analysisRateLimit: env.ANALYSIS_RATE_LIMIT }));

  // Phase 16: one cross-feature recommendation surface. The engine is the
  // Phase 9 one; this only gives it a home the dashboard can reach, and
  // reconciles the two dismissal stores so one "no thanks" is honoured in both.
  const recommendationService = createRecommendationService({ careerRepo: repos.career, learningRepo: repos.learning, logger });
  app.use("/api", createRecommendationRoutes({ authService: auth, service: recommendationService, analysisRateLimit: env.ANALYSIS_RATE_LIMIT }));

  // Phase 16: first-run setup. It tracks progress only — every answer is saved
  // by the feature that owns it, so there is one writer per record.
  const onboardingService = createOnboardingService({ repo: repos.onboarding, careerRepo: repos.career, recommendations: recommendationService, logger });
  app.use("/api", createOnboardingRoutes({ authService: auth, service: onboardingService }));

  const progress = createProgressRoutes({ authService: auth, repo: repos.progress, getLlm, analysisRateLimit: env.ANALYSIS_RATE_LIMIT });
  app.use("/api/analytics", progress.analytics);
  app.use("/api/gamification", progress.gamification);
  app.use("/api/goals", progress.goals);
  app.use("/api/progress-reports", progress.reports);
  app.use("/api/notifications", progress.notifications);

  app.use("/api", createApplicationWorkspaceRoutes({
    authService: auth,
    repo: repos.applicationWorkspace,
    applicationRepo: repos.application,
    progressRepo: repos.progress,
    storage: files,
    getLlm,
    analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
  }));

  app.use("/api", createIntegrationRoutes({
    authService: auth,
    repo: repos.integrations,
    env,
    vault: tokenVault,
    oauth: oauthService,
    calendar: calendarService,
    drive: driveService,
    email: emailService,
    engine: automationEngine,
    jobRegistry,
    resumeBuilderRepo: repos.resumeBuilder,
    renderResumePdf,
    renderCoverLetterPdf,
    analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
  }));

  app.use("/api", createJobRoutes({
    authService: auth,
    repo: repos.jobs,
    careerRepo: repos.career,
    applicationRepo: repos.application,
    jobDescriptionRepo: repos.jobDescription,
    progressRepo: repos.progress,
    registry: jobRegistry,
    discovery: jobDiscovery,
    alerts: jobAlerts,
    env,
    analysisRateLimit: env.ANALYSIS_RATE_LIMIT,
  }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
