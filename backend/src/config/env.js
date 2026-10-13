/**
 * env.js — loads and validates environment variables at startup.
 * The process refuses to start when a required variable is missing or malformed,
 * so misconfiguration surfaces immediately instead of at the first request.
 */
import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
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
});

const DEFAULT_MODELS = {
  anthropic: "claude-opus-5-5",
  gemini: "gemini-1.5-flash",
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
