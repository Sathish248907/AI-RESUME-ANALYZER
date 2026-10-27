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
});

const DEFAULT_MODELS = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-flash-latest",
};

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
