/**
 * app-meta.js — small pieces of app configuration that more than one module
 * needs. Kept out of app.js so routes can import them without a cycle
 * (app.js imports the routes).
 */

/**
 * How long an AI-backed request may take end to end: every provider attempt
 * plus a margin, so the HTTP layer never gives up before the provider has.
 * @param {{ LLM_TIMEOUT_MS: number, LLM_MAX_RETRIES: number }} env
 */
export function aiRequestBudgetMs(env) {
  return env.LLM_TIMEOUT_MS * (env.LLM_MAX_RETRIES + 1) + 30_000;
}
