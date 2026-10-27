/**
 * Adzuna — official developer API. Requires ADZUNA_APP_ID and ADZUNA_APP_KEY
 * (free developer tier) and a country endpoint (ADZUNA_COUNTRY).
 * Docs: https://developer.adzuna.com/overview
 *
 * Adzuna's terms require attribution and prohibit storing their data
 * indefinitely; JOB_RETENTION_DAYS enforces the second part. Salary figures may
 * be *predicted* rather than advertised — `salary_is_predicted` is carried
 * through to `salaryIsEstimate` so the UI can label the number instead of
 * presenting a model's guess as the employer's offer.
 */
export const adzuna = {
  slug: "adzuna",
  displayName: "Adzuna",
  attribution: "Job listings powered by Adzuna (adzuna.com)",
  termsUrl: "https://developer.adzuna.com/termsandconditions",
  docsUrl: "https://developer.adzuna.com/overview",
  requiresCredentials: true,
  credentialKeys: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  configured: (env) => Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
  supports: {
    freeTextQuery: true,
    location: true,
    remoteFilter: false,
    employmentType: true,
    salary: true,
    reliableDates: true,
    pagination: true,
  },

  buildRequest(query, env) {
    const country = String(env.ADZUNA_COUNTRY || "gb").toLowerCase().replace(/[^a-z]/g, "") || "gb";
    const page = Math.min(Math.max(query.page ?? 1, 1), 20);
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`);
    url.searchParams.set("app_id", env.ADZUNA_APP_ID);
    url.searchParams.set("app_key", env.ADZUNA_APP_KEY);
    url.searchParams.set("results_per_page", String(Math.min(Math.max(query.limit ?? 50, 1), 50)));
    url.searchParams.set("content-type", "application/json");
    if (query.q) url.searchParams.set("what", query.q);
    if (query.location) url.searchParams.set("where", query.location);
    if (query.minSalary) url.searchParams.set("salary_min", String(query.minSalary));
    if (query.employmentType === "full_time") url.searchParams.set("full_time", "1");
    if (query.employmentType === "part_time") url.searchParams.set("part_time", "1");
    if (query.employmentType === "contract") url.searchParams.set("contract", "1");
    if (query.employmentType === "temporary") url.searchParams.set("permanent", "0");
    return { url: url.toString() };
  },

  parse(payload) {
    const jobs = Array.isArray(payload?.results) ? payload.results : [];
    return jobs.map((j) => ({
      externalId: String(j.id ?? ""),
      title: j.title,
      companyName: j.company?.display_name,
      location: j.location?.display_name || null,
      descriptionHtml: j.description,
      employmentTypeRaw: j.contract_time ?? j.contract_type ?? "",
      postedAt: j.created,
      postedAtReliable: true,
      sourceUrl: j.redirect_url,
      applyUrl: j.redirect_url,
      tags: j.category?.label ? [j.category.label] : [],
      salary: {
        min: j.salary_min,
        max: j.salary_max,
        // The country endpoint fixes the currency; Adzuna does not return it per result.
        currency: j.salary_currency ?? null,
        period: "year",
        isEstimate: j.salary_is_predicted === "1" || j.salary_is_predicted === 1 || j.salary_is_predicted === true,
      },
    }));
  },
};
