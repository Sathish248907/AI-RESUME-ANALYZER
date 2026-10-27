/**
 * Jooble — official API. Requires JOOBLE_API_KEY (request one at
 * https://jooble.org/api/about). The key goes in the URL path, so it is built
 * by the registry and never logged.
 *
 * Jooble returns `updated` as a date string but salary as free text and the
 * posting age sometimes as a relative phrase. Accordingly:
 *   - `reliableDates: false` — the date is stored but never used for freshness
 *     ranking or date filtering, because it is the *update* time, not the
 *     publication time.
 *   - salary is passed through `parseSalary`, which keeps a figure only when it
 *     can read real numbers out of the field and otherwise reports nothing.
 */
const SALARY_RX = /(\d[\d\s,.]*)\s*(?:-|–|to)\s*(\d[\d\s,.]*)/;
const CURRENCY_RX = /\b(USD|EUR|GBP|INR|CAD|AUD|PLN|UAH)\b/i;
const PERIOD_RX = /\bper\s+(year|month|week|day|hour)\b|\b(year|month|week|day|hour)ly\b|\bp\/?(a|m|h)\b/i;

/** Jooble's salary field is prose; only a clean numeric range is accepted. */
function salaryFromText(text) {
  if (typeof text !== "string" || !text.trim()) return {};
  const range = SALARY_RX.exec(text);
  const clean = (s) => Number(String(s).replace(/[^\d.]/g, ""));
  const period = PERIOD_RX.exec(text);
  const periodWord = period ? (period[1] ?? period[2] ?? { a: "year", m: "month", h: "hour" }[period[3]]) : null;
  const currency = CURRENCY_RX.exec(text)?.[1]?.toUpperCase() ?? null;
  if (range) return { min: clean(range[1]), max: clean(range[2]), currency, period: periodWord };
  const single = /(\d[\d\s,.]{2,})/.exec(text);
  if (single) return { min: clean(single[1]), max: null, currency, period: periodWord };
  return {};
}

export const jooble = {
  slug: "jooble",
  displayName: "Jooble",
  attribution: "Job listings provided by Jooble (jooble.org)",
  termsUrl: "https://jooble.org/api/about",
  docsUrl: "https://jooble.org/api/about",
  requiresCredentials: true,
  credentialKeys: ["JOOBLE_API_KEY"],
  configured: (env) => Boolean(env.JOOBLE_API_KEY),
  supports: {
    freeTextQuery: true,
    location: true,
    remoteFilter: false,
    employmentType: false,
    salary: true,
    reliableDates: false,
    pagination: true,
  },

  buildRequest(query, env) {
    return {
      url: `https://jooble.org/api/${encodeURIComponent(env.JOOBLE_API_KEY)}`,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keywords: query.q ?? "",
        location: query.location ?? "",
        page: String(Math.min(Math.max(query.page ?? 1, 1), 20)),
      }),
    };
  },

  parse(payload) {
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    return jobs.map((j) => ({
      externalId: String(j.id ?? ""),
      title: j.title,
      companyName: j.company,
      location: j.location || null,
      descriptionHtml: j.snippet,
      employmentTypeRaw: j.type ?? "",
      postedAt: j.updated,
      postedAtReliable: false,
      sourceUrl: j.link,
      applyUrl: j.link,
      tags: [],
      salary: salaryFromText(j.salary),
    }));
  },
};
