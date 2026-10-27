/**
 * env.js — loads and validates environment variables at startup.
 * The process refuses to start when a required variable is missing or malformed,
 * so misconfiguration surfaces immediately instead of at the first request.
 */
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  FRONTEND_URL: z.string().min(1, "FRONTEND_URL is required (CORS origin)"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  LLM_PROVIDER: z.enum(["anthropic", "gemini"]).default("anthropic"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5000).max(600000).default(90000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  ANALYSIS_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  // Sign-in and registration attempts per 15 minutes per IP.
  AUTH_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  // Bearer token for GET /api/health/details. Unset means the route 404s, so a
  // deployment that never configured one exposes nothing extra.
  HEALTH_TOKEN: z.string().default(""),
  STORE_RESUME_TEXT: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  // Original resume files: "none" discards them after text extraction (default);
  // "local" keeps them under STORAGE_LOCAL_DIR with opaque names (owner-only download).
  STORAGE_DRIVER: z.enum(["none", "local"]).default("none"),
  STORAGE_LOCAL_DIR: z.string().default("uploads/private"),

  // ── Job providers (Phase 12) ──
  // Comma-separated adapter slugs to enable, e.g. "remotive,arbeitnow,adzuna".
  // Empty (the default) means no external provider: discovery then serves only
  // the user's own manually entered jobs and explains how to configure one.
  JOB_PROVIDERS: z.string().default(""),
  JOB_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(8000),
  // How long a cached provider listing may be served before it is refetched.
  JOB_CACHE_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  // Cached third-party listings older than this are deleted (provider retention terms).
  JOB_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // Outbound calls allowed per provider per minute, enforced before the request.
  JOB_PROVIDER_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(600).default(20),
  ADZUNA_APP_ID: z.string().default(""),
  ADZUNA_APP_KEY: z.string().default(""),
  ADZUNA_COUNTRY: z.string().default("gb"),
  JOOBLE_API_KEY: z.string().default(""),

  // ── External integrations (Phase 14) ──
  // Public base URL of this backend, used to build OAuth redirect URIs. It must
  // match the redirect URI registered with the provider exactly.
  APP_BASE_URL: z.string().default("http://localhost:4000"),
  // 32 bytes, base64. Without it no OAuth token can be stored, so connecting is
  // refused rather than tokens being written in the clear.
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  INTEGRATION_ENCRYPTION_KEY: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  // log  = record what would be sent, deliver nothing (default, honest)
  // smtp = requires a transport module to be installed and configured
  EMAIL_TRANSPORT: z.enum(["log", "smtp"]).default("log"),
  EMAIL_FROM: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
});

const DEFAULT_MODELS = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-flash-latest",
};

/**
 * Values that appear in `.env.example`. A deployment running on one of these is
 * misconfigured, not configured — in production that is a refusal, not a
 * warning, because a predictable JWT secret forges every session.
 */
const PLACEHOLDERS = [
  "replace-with-a-long-random-secret",
  "replace-with-a-random-secret",
  "generate-a-secure-random-secret-key-at-least-32-chars",
  "your-api-key",
  "change-me",
];

const isPlaceholder = (v) => PLACEHOLDERS.some((p) => v?.toLowerCase().includes(p));
const isLocal = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(u.trim());

/**
 * Checks that only matter once NODE_ENV is "production". They are kept apart
 * from the schema so development stays convenient (plain http on localhost) and
 * production stays safe.
 *
 * @param {object} env a parsed config
 * @returns {string[]} problems; empty when the config is fit to deploy
 */
export function productionProblems(env) {
  const problems = [];

  if (isPlaceholder(env.JWT_SECRET)) {
    problems.push("JWT_SECRET is still the example value. Generate a real one: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"");
  }
  for (const origin of env.FRONTEND_ORIGINS) {
    if (!origin.startsWith("https://") && !isLocal(origin)) {
      problems.push(`FRONTEND_URL origin "${origin}" is not https. Browsers send the bearer token on every request; plain http exposes it.`);
    }
  }
  if (!env.APP_BASE_URL.startsWith("https://") && !isLocal(env.APP_BASE_URL)) {
    problems.push(`APP_BASE_URL "${env.APP_BASE_URL}" is not https. It is the OAuth redirect URI, which providers require to be https.`);
  }
  if (env.FRONTEND_ORIGINS.some(isLocal)) {
    problems.push("FRONTEND_URL still contains a localhost origin. Remove it so production CORS does not accept a developer machine.");
  }
  if (env.INTEGRATION_ENCRYPTION_KEY && Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "base64").length !== 32) {
    problems.push("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes of base64.");
  }
  if (env.EMAIL_TRANSPORT === "smtp" && !(env.SMTP_HOST && env.EMAIL_FROM)) {
    problems.push("EMAIL_TRANSPORT is \"smtp\" but SMTP_HOST or EMAIL_FROM is missing, so nothing would be delivered.");
  }
  return problems;
}

/**
 * Parse process.env (or a supplied object) into a validated config.
 * @param {NodeJS.ProcessEnv} [source]
 */
export function loadEnv(source = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  if (!env.LLM_MODEL) env.LLM_MODEL = DEFAULT_MODELS[env.LLM_PROVIDER];
  env.FRONTEND_ORIGINS = env.FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean);
  env.LLM_CONFIGURED = env.LLM_API_KEY.length > 0;
  env.JOB_PROVIDERS_ENABLED = env.JOB_PROVIDERS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  // A credential set is "configured" only when every part of it is present;
  // a half-filled one is a setup error, not a working integration.
  env.INTEGRATION_VAULT_READY = env.INTEGRATION_ENCRYPTION_KEY.length > 0;
  env.GOOGLE_CONFIGURED = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  env.EMAIL_CONFIGURED = env.EMAIL_TRANSPORT === "smtp" && Boolean(env.SMTP_HOST && env.EMAIL_FROM);

  // In production a misconfiguration is refused at boot. Everywhere else the
  // same findings are printed so they are fixed before the deploy, not during.
  const problems = productionProblems(env);
  if (problems.length) {
    const report = problems.map((p) => `  - ${p}`).join("\n");
    if (env.NODE_ENV === "production") {
      throw new Error(`Refusing to start in production with this configuration:\n${report}`);
    }
    if (env.NODE_ENV !== "test") {
      console.warn(`[env] ${problems.length} setting(s) would block a production start:\n${report}`);
    }
  }
  return env;
}

let cached = null;
/** Lazily loaded singleton so tests can construct their own config. */
export function getEnv() {
  if (!cached) cached = loadEnv();
  return cached;
}

export function resetEnvCache() {
  cached = null;
}
