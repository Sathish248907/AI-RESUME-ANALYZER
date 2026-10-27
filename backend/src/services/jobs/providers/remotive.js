/**
 * Remotive — public remote-jobs API, no credentials.
 * Docs: https://github.com/remotive-com/remote-jobs-api
 *
 * Remotive asks that results link back to the Remotive listing and that the
 * source is credited; `attribution` is surfaced in the UI next to the results
 * and `applyUrl` always points at their listing page rather than a scraped
 * employer URL.
 *
 * The API has no page parameter — `limit` is the only control — so pagination
 * is reported as unsupported and the registry fetches one capped batch.
 */
export const remotive = {
  slug: "remotive",
  displayName: "Remotive",
  attribution: "Remote job listings provided by Remotive (remotive.com)",
  termsUrl: "https://remotive.com/terms",
  docsUrl: "https://github.com/remotive-com/remote-jobs-api",
  requiresCredentials: false,
  credentialKeys: [],
  configured: () => true,
  supports: {
    freeTextQuery: true,
    location: false,
    remoteFilter: true,
    employmentType: false,
    salary: false,
    reliableDates: true,
    pagination: false,
  },

  buildRequest(query) {
    const url = new URL("https://remotive.com/api/remote-jobs");
    if (query.q) url.searchParams.set("search", query.q);
    url.searchParams.set("limit", String(Math.min(Math.max(query.limit ?? 50, 1), 100)));
    return { url: url.toString() };
  },

  parse(payload) {
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
    return jobs.map((j) => ({
      externalId: String(j.id ?? ""),
      title: j.title,
      companyName: j.company_name,
      companyLogoUrl: j.company_logo || j.company_logo_url || null,
      location: j.candidate_required_location || null,
      isRemote: true,
      employmentTypeRaw: j.job_type,
      descriptionHtml: j.description,
      // Remotive publishes an ISO publication timestamp, so it may drive freshness.
      postedAt: j.publication_date,
      postedAtReliable: true,
      sourceUrl: j.url,
      applyUrl: j.url,
      tags: Array.isArray(j.tags) ? j.tags : [],
      // Remotive exposes no salary numbers, only an optional free-text string,
      // so no figure is reported rather than one being parsed out of prose.
      salary: {},
    }));
  },
};
