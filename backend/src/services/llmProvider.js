/**
 * llmProvider.js — provider-agnostic structured generation.
 *
 * Supported providers (selected with LLM_PROVIDER):
 *   - anthropic: Claude via @anthropic-ai/sdk using native structured outputs
 *                (`messages.parse` + `zodOutputFormat`), so the response is
 *                guaranteed to match the Zod schema.
 *   - gemini:    Google Gemini via @google/generative-ai with JSON response mode;
 *                the JSON is then validated against the same Zod schema.
 *
 * Both paths return `{ data, usage, provider, model }` where `data` has ALREADY
 * been validated by Zod. Transient errors (429 / 5xx / network / timeout) are
 * retried with exponential backoff; everything else fails fast as an ApiError.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApiError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

/**
 * @typedef {Object} ProviderConfig
 * @property {"anthropic"|"gemini"} provider
 * @property {string} apiKey
 * @property {string} model
 * @property {number} timeoutMs
 * @property {number} maxRetries
 */

/**
 * @typedef {Object} StructuredRequest
 * @property {string} system
 * @property {string} user
 * @property {import("zod").ZodTypeAny} schema
 * @property {string} schemaName
 * @property {string} [formatDescription]  JSON shape description for providers without native schemas
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  if (err instanceof Anthropic.RateLimitError) return true;
  if (err instanceof Anthropic.InternalServerError) return true;
  if (err instanceof Anthropic.APIConnectionError) return true; // includes timeouts
  if (err instanceof Anthropic.APIError) return err.status === 408 || err.status === 409 || err.status === 529;
  const status = err?.status ?? err?.response?.status;
  if (typeof status === "number") return status === 429 || status === 408 || status >= 500;
  const msg = String(err?.message ?? "");
  return /timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|overloaded|503|429/i.test(msg);
}

function toApiError(err, provider) {
  if (err instanceof ApiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err?.status === 401 || err?.status === 403) {
    return new ApiError(503, "The AI provider rejected the server's credentials. Check LLM_API_KEY.", { code: "LLM_AUTH" });
  }
  if (err instanceof Anthropic.RateLimitError || err?.status === 429) {
    return new ApiError(429, "The AI provider is rate-limiting requests right now. Please try again in a minute.", { code: "LLM_RATE_LIMIT", retryable: true });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError || /timeout|timed out/i.test(String(err?.message))) {
    return new ApiError(504, "The AI provider took too long to respond. Please try again.", { code: "LLM_TIMEOUT", retryable: true });
  }
  if (err instanceof Anthropic.BadRequestError || err?.status === 400) {
    logger.error("LLM bad request", { provider, message: err.message });
    return new ApiError(502, "The AI provider rejected the request. The input may be too long for the configured model.", { code: "LLM_BAD_REQUEST" });
  }
  if (isTransient(err)) {
    return new ApiError(503, "The AI provider is temporarily unavailable. Please try again.", { code: "LLM_UNAVAILABLE", retryable: true });
  }
  logger.error("LLM unexpected error", { provider, message: err?.message, name: err?.name });
  return new ApiError(502, "The AI provider returned an unexpected error.", { code: "LLM_ERROR" });
}

async function withRetries(fn, { maxRetries, provider }) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (err) {
      const transient = isTransient(err);
      if (!transient || attempt >= maxRetries) throw toApiError(err, provider);
      const delay = Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      logger.warn("LLM transient error, retrying", { provider, attempt: attempt + 1, delay, message: err?.message });
      await sleep(delay);
      attempt += 1;
    }
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(504, `${label} timed out after ${Math.round(ms / 1000)}s. Please try again.`, { code: "LLM_TIMEOUT", retryable: true })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

function createAnthropicProvider(config) {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeoutMs,
    maxRetries: 0, // we handle retries ourselves so the timeout budget is predictable
  });

  return {
    name: "anthropic",
    model: config.model,
    /** @param {StructuredRequest} req */
    async generateStructured(req) {
      return withRetries(
        async () => {
          const response = await client.messages.parse({
            model: config.model,
            max_tokens: 16000,
            output_config: { format: zodOutputFormat(req.schema, req.schemaName), effort: "medium" },
            system: req.system,
            messages: [{ role: "user", content: req.user }],
          });

          if (response.stop_reason === "refusal") {
            throw new ApiError(422, "The AI provider declined to analyze this content.", { code: "LLM_REFUSAL" });
          }
          if (response.stop_reason === "max_tokens") {
            throw new ApiError(502, "The AI response was cut off before completion. Try a shorter resume or job description.", { code: "LLM_TRUNCATED" });
          }
          if (!response.parsed_output) {
            throw new ApiError(502, "The AI provider returned output that did not match the required structure.", { code: "LLM_INVALID_OUTPUT", retryable: true });
          }
          return {
            data: response.parsed_output,
            usage: { inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null },
            provider: "anthropic",
            model: response.model ?? config.model,
          };
        },
        { maxRetries: config.maxRetries, provider: "anthropic" }
      );
    },
  };
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

function stripCodeFences(text) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function createGeminiProvider(config) {
  const genAI = new GoogleGenerativeAI(config.apiKey);

  return {
    name: "gemini",
    model: config.model,
    /** @param {StructuredRequest} req */
    async generateStructured(req) {
      const model = genAI.getGenerativeModel({
        model: config.model,
        systemInstruction: req.system,
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 },
      });

      return withRetries(
        async (attempt) => {
          const prompt = `${req.user}\n\nReturn ONLY a JSON object with exactly this shape (no markdown):\n${req.formatDescription ?? ""}`;
          const result = await withTimeout(model.generateContent(prompt), config.timeoutMs, "Gemini request");
          const text = result.response.text();
          let raw;
          try {
            raw = JSON.parse(stripCodeFences(text));
          } catch {
            // Malformed JSON is treated as transient once: the model is non-deterministic.
            const err = new Error("Gemini returned non-JSON output");
            err.status = attempt < config.maxRetries ? 503 : 502;
            throw err;
          }
          const parsed = req.schema.safeParse(raw);
          if (!parsed.success) {
            const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
            logger.warn("Gemini output failed schema validation", { issues, attempt });
            const err = new Error("Gemini output failed schema validation");
            err.status = attempt < config.maxRetries ? 503 : 502;
            err.issues = issues;
            throw err;
          }
          const usage = result.response.usageMetadata ?? {};
          return {
            data: parsed.data,
            usage: { inputTokens: usage.promptTokenCount ?? null, outputTokens: usage.candidatesTokenCount ?? null },
            provider: "gemini",
            model: config.model,
          };
        },
        { maxRetries: config.maxRetries, provider: "gemini" }
      );
    },
  };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** @param {ProviderConfig} config */
export function createLlmProvider(config) {
  if (!config.apiKey) {
    throw new ApiError(503, "AI analysis is not configured on the server (LLM_API_KEY is missing). Demo mode is still available.", { code: "LLM_NOT_CONFIGURED" });
  }
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "gemini":
      return createGeminiProvider(config);
    default:
      throw new ApiError(503, `Unsupported LLM provider "${config.provider}".`, { code: "LLM_UNSUPPORTED_PROVIDER" });
  }
}

/** @param {import("../config/env.js").loadEnv extends (...a: any) => infer R ? R : never} env */
export function providerConfigFromEnv(env) {
  return {
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
  };
}
