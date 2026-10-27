/**
 * Arbeitnow — public job-board API, no credentials.
 * Docs: https://documenter.getpostman.com/view/18545278/UVJbJdKh
 *
 * The endpoint returns a paginated feed and has no server-side text search, so
 * `freeTextQuery` is false: the registry fetches pages and the discovery service
 * filters them locally. Remote status comes from an explicit boolean field.
 */
export const arbeitnow = {
  slug: "arbeitnow",
  displayName: "Arbeitnow",
  attribution: "Job listings provided by Arbeitnow (arbeitnow.com)",
  termsUrl: "https://www.arbeitnow.com/terms",
  docsUrl: "https://documenter.getpostman.com/view/18545278/UVJbJdKh",
  requiresCredentials: false,
  credentialKeys: [],
  configured: () => true,
  supports: {
    freeTextQuery: false,
    location: false,
    remoteFilter: true,
    employmentType: false,
    salary: false,
    reliableDates: true,
    pagination: true,
  },

  buildRequest(query) {
    const url = new URL("https://www.arbeitnow.com/api/job-board-api");
    url.searchParams.set("page", String(Math.min(Math.max(query.page ?? 1, 1), 20)));
    return { url: url.toString() };
  },

  parse(payload) {
    const jobs = Array.isArray(payload?.data) ? payload.data : [];
    return jobs.map((j) => ({
      externalId: String(j.slug ?? ""),
      title: j.title,
      companyName: j.company_name,
      location: j.location || null,
      isRemote: j.remote === true,
      descriptionHtml: j.description,
      // `created_at` is a unix timestamp in seconds.
      postedAt: Number.isFinite(Number(j.created_at)) ? new Date(Number(j.created_at) * 1000) : null,
      postedAtReliable: true,
      sourceUrl: j.url,
      applyUrl: j.url,
      tags: [...(Array.isArray(j.tags) ? j.tags : []), ...(Array.isArray(j.job_types) ? j.job_types : [])],
      employmentTypeRaw: Array.isArray(j.job_types) ? j.job_types.join(" ") : "",
      salary: {},
    }));
  },
};
