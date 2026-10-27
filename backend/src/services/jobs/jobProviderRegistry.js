/**
 * jobProviderRegistry.js — owns every outbound call to a job provider.
 *
 * Adapters describe *what* to request and how to read the answer; this module
 * does the requesting, so one implementation of timeouts, rate limiting, error
 * classification and normalisation covers all of them. Consequences:
 *
 *   - A provider that times out, 429s or returns garbage degrades that provider
 *     only: `search` always resolves, reporting per-provider status, and the
 *     caller shows "3 of 4 sources responded" rather than inventing listings.
 *   - A provider is used only when it is both *enabled* (listed in
 *     JOB_PROVIDERS) and *configured* (its credentials are present). Listing a
 *     keyed provider without its key is reported as a setup problem, not
 *     silently ignored.
 *   - Credentials come from the validated env object and are never logged: only
 *     the provider slug, HTTP status and duration are.
 */
import { ALL_PROVIDERS, findProvider } from "./providers/index.js";
import { dedupeJobs, normalizeJob } from "./jobNormalizer.js";

export const REGISTRY_METHOD = "job-providers-1.0";

/** Per-provider sliding window, so one busy user cannot burn a shared quota. */
function createRateLimiter(perMinute) {
  const hits = new Map();
  return {
    take(slug, now) {
      const windowStart = now - 60_000;
      const times = (hits.get(slug) ?? []).filter((t) => t > windowStart);
      if (times.length >= perMinute) {
        hits.set(slug, times);
        return { allowed: false, retryAfterMs: Math.max(0, times[0] + 60_000 - now) };
      }
      times.push(now);
      hits.set(slug, times);
      return { allowed: true, retryAfterMs: 0 };
    },
    reset() { hits.clear(); },
  };
}

/**
 * @param {{ env: object, fetchImpl?: typeof fetch, logger?: { info: Function, warn: Function } }} deps
 */
export function createJobProviderRegistry({ env, fetchImpl, logger = { info() {}, warn() {} } } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const limiter = createRateLimiter(env.JOB_PROVIDER_RATE_LIMIT_PER_MIN ?? 20);
  const requestCounts = new Map();

  /** Every known adapter with its configuration state, for the setup UI. */
  function listProviders() {
    const enabledSlugs = new Set(env.JOB_PROVIDERS_ENABLED ?? []);
    return ALL_PROVIDERS.map((p) => {
      const missingCredentials = p.credentialKeys.filter((k) => !env[k]);
      return {
        slug: p.slug,
        displayName: p.displayName,
        enabled: enabledSlugs.has(p.slug),
        configured: p.configured(env),
        requiresCredentials: p.requiresCredentials,
        credentialKeys: p.credentialKeys,
        missingCredentials,
        attribution: p.attribution,
        termsUrl: p.termsUrl,
        docsUrl: p.docsUrl,
        supports: p.supports,
        requestCount: requestCounts.get(p.slug) ?? 0,
      };
    });
  }

  /** Adapters that will actually be called. */
  function activeProviders() {
    const enabledSlugs = new Set(env.JOB_PROVIDERS_ENABLED ?? []);
    return ALL_PROVIDERS.filter((p) => enabledSlugs.has(p.slug) && p.configured(env));
  }

  /** Enabled in config but unusable — surfaced so misconfiguration is visible. */
  function misconfiguredProviders() {
    const enabledSlugs = new Set(env.JOB_PROVIDERS_ENABLED ?? []);
    return ALL_PROVIDERS.filter((p) => enabledSlugs.has(p.slug) && !p.configured(env))
      .map((p) => ({ slug: p.slug, displayName: p.displayName, missingCredentials: p.credentialKeys.filter((k) => !env[k]) }));
  }

  /** Slugs listed in JOB_PROVIDERS that no adapter implements. */
  function unknownProviders() {
    return (env.JOB_PROVIDERS_ENABLED ?? []).filter((slug) => !findProvider(slug));
  }

  /**
   * Call one provider. Never throws: the outcome is always a status object.
   * @param {object} provider adapter
   * @param {object} query    { q, location, page, limit, minSalary, employmentType }
   */
  async function fetchFromProvider(provider, query) {
    const started = Date.now();
    const gate = limiter.take(provider.slug, started);
    if (!gate.allowed) {
      return { slug: provider.slug, status: "rate_limited", count: 0, ms: 0, jobs: [], error: `Local rate limit reached for ${provider.displayName}; try again in ${Math.ceil(gate.retryAfterMs / 1000)}s.` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.JOB_PROVIDER_TIMEOUT_MS ?? 8000);
    try {
      const req = provider.buildRequest(query, env);
      requestCounts.set(provider.slug, (requestCounts.get(provider.slug) ?? 0) + 1);
      const res = await doFetch(req.url, {
        method: req.method ?? "GET",
        headers: { accept: "application/json", "user-agent": "ai-resume-analyzer/1.0 (job discovery)", ...(req.headers ?? {}) },
        body: req.body,
        signal: controller.signal,
      });
      const ms = Date.now() - started;

      if (res.status === 429) {
        return { slug: provider.slug, status: "rate_limited", count: 0, ms, jobs: [], error: `${provider.displayName} rejected the request with 429 (rate limit). Its results are missing from this search.` };
      }
      if (!res.ok) {
        return { slug: provider.slug, status: "error", count: 0, ms, jobs: [], error: `${provider.displayName} returned HTTP ${res.status}. Its results are missing from this search.` };
      }

      let payload;
      try { payload = await res.json(); }
      catch { return { slug: provider.slug, status: "error", count: 0, ms, jobs: [], error: `${provider.displayName} returned a response that is not JSON.` }; }

      const raw = provider.parse(payload) ?? [];
      const jobs = [];
      let dropped = 0;
      for (const item of raw) {
        const job = normalizeJob(item, provider.slug);
        if (job) jobs.push(job); else dropped += 1;
      }
      logger.info?.("job provider fetched", { meta: { provider: provider.slug, http: res.status, ms, received: raw.length, usable: jobs.length, dropped } });
      return { slug: provider.slug, status: "ok", count: jobs.length, dropped, ms, jobs, error: null };
    } catch (err) {
      const ms = Date.now() - started;
      const aborted = err?.name === "AbortError";
      const message = aborted
        ? `${provider.displayName} did not respond within ${env.JOB_PROVIDER_TIMEOUT_MS ?? 8000}ms. Its results are missing from this search.`
        : `${provider.displayName} could not be reached. Its results are missing from this search.`;
      logger.warn?.("job provider failed", { meta: { provider: provider.slug, aborted, ms } });
      return { slug: provider.slug, status: aborted ? "timeout" : "error", count: 0, ms, jobs: [], error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Query every active provider in parallel and return de-duplicated listings
   * plus a per-provider report. `partial` is true when any provider failed, so
   * the caller can say so instead of presenting the result as complete.
   * @param {object} query
   */
  async function search(query = {}) {
    const providers = activeProviders();
    if (providers.length === 0) {
      return {
        jobs: [],
        providers: [],
        misconfigured: misconfiguredProviders(),
        unknown: unknownProviders(),
        partial: false,
        configured: false,
      };
    }
    const results = await Promise.all(providers.map((p) => fetchFromProvider(p, query)));
    const jobs = dedupeJobs(results.flatMap((r) => r.jobs));
    return {
      jobs,
      providers: results.map(({ jobs: _jobs, ...rest }) => rest),
      misconfigured: misconfiguredProviders(),
      unknown: unknownProviders(),
      partial: results.some((r) => r.status !== "ok"),
      configured: true,
    };
  }

  return {
    method: REGISTRY_METHOD,
    listProviders,
    activeProviders,
    misconfiguredProviders,
    unknownProviders,
    fetchFromProvider,
    search,
    /** Exposed for tests: clears the sliding window. */
    resetLimits: () => limiter.reset(),
  };
}
