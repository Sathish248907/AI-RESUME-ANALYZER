/**
 * providers/index.js — the job-provider adapters.
 *
 * An adapter is a plain object:
 *
 *   {
 *     slug, displayName, attribution, termsUrl, docsUrl,
 *     requiresCredentials: boolean,
 *     credentialKeys: string[],          // env vars that must be set
 *     configured(env): boolean,
 *     supports: { freeTextQuery, location, remoteFilter, employmentType, salary, reliableDates, pagination },
 *     buildRequest(query, env): { url, headers?, method?, body? },
 *     parse(payload): rawJob[]           // adapter-shaped, before normalizeJob()
 *   }
 *
 * Adapters never touch the database, never read process.env directly and never
 * do their own HTTP: the registry performs the request so timeouts, rate limits
 * and error handling are identical for every provider. Adding a provider means
 * adding one file here and listing its slug in JOB_PROVIDERS.
 *
 * Only official, documented endpoints are used. Nothing here scrapes HTML.
 */
import { remotive } from "./remotive.js";
import { arbeitnow } from "./arbeitnow.js";
import { adzuna } from "./adzuna.js";
import { jooble } from "./jooble.js";

/** Every adapter the build knows about, whether or not it is enabled. */
export const ALL_PROVIDERS = [remotive, arbeitnow, adzuna, jooble];

export function findProvider(slug) {
  return ALL_PROVIDERS.find((p) => p.slug === String(slug ?? "").toLowerCase()) ?? null;
}

export { remotive, arbeitnow, adzuna, jooble };
