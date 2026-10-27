/**
 * healthRoutes.js — liveness, readiness and an operator-only detail view.
 *
 * The split matters in production. A load balancer needs an unauthenticated
 * endpoint, but an unauthenticated endpoint must not describe the inside of the
 * system: which AI provider is configured, which model, which storage driver
 * and which integrations exist are all reconnaissance. So:
 *
 *   GET /api/health        public  — is this process alive? Nothing else.
 *   GET /api/health/ready  public  — can it serve traffic? One word per check.
 *   GET /api/health/details gated  — the full picture, behind HEALTH_TOKEN.
 *
 * Readiness deliberately reports only `ok` / `unavailable` per dependency, with
 * no driver names, versions or error text, because the platform only needs to
 * know whether to route traffic here.
 */
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { aiRequestBudgetMs } from "../app-meta.js";
import { logger } from "../utils/logger.js";

/** Longest a readiness probe may wait on the database before calling it down. */
const PROBE_TIMEOUT_MS = 3000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("probe timed out")), ms).unref?.()),
  ]);
}

function tokenMatches(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {{ env: object, prisma: object, storage: { name: string, enabled: boolean } }} deps
 */
export function createHealthRoutes({ env, prisma, storage }) {
  const router = Router();
  const startedAt = Date.now();

  /** Liveness. Says nothing about configuration. */
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  /** Readiness. The database is the only hard dependency for serving traffic. */
  router.get("/health/ready", async (req, res) => {
    const checks = { database: "unavailable" };
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
      checks.database = "ok";
    } catch (err) {
      logger.warn("readiness probe failed", { meta: { check: "database", requestId: req.id } });
    }

    const ready = Object.values(checks).every((v) => v === "ok");
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks });
  });

  /**
   * Operator detail. Returns 404 rather than 401 when HEALTH_TOKEN is unset, so
   * a deployment that never configured it does not advertise the route at all.
   */
  router.get("/health/details", async (req, res) => {
    if (!env.HEALTH_TOKEN) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found." } });
    }
    const header = req.headers.authorization ?? "";
    const [scheme, provided] = header.split(" ");
    if (scheme !== "Bearer" || !tokenMatches(provided, env.HEALTH_TOKEN)) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "A valid health token is required." } });
    }

    let database = "unavailable";
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, PROBE_TIMEOUT_MS);
      database = "ok";
    } catch { /* reported as unavailable */ }

    res.json({
      status: database === "ok" ? "ready" : "not_ready",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      nodeEnv: env.NODE_ENV,
      checks: { database },
      ai: {
        configured: env.LLM_CONFIGURED,
        provider: env.LLM_PROVIDER,
        model: env.LLM_MODEL,
        requestBudgetMs: aiRequestBudgetMs(env),
      },
      storage: { driver: storage.name, retainsOriginals: storage.enabled },
      integrations: {
        tokenVault: env.INTEGRATION_VAULT_READY,
        google: env.GOOGLE_CONFIGURED,
        emailTransport: env.EMAIL_TRANSPORT,
        emailDelivers: env.EMAIL_CONFIGURED,
        jobProviders: env.JOB_PROVIDERS_ENABLED,
      },
      time: new Date().toISOString(),
    });
  });

  return router;
}
