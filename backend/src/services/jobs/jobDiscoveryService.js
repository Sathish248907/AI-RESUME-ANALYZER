/**
 * jobDiscoveryService.js — the search itself (`job-discovery-1.0`).
 *
 * Responsibilities, in order: decide whether providers need to be called, read
 * the cache, fold in the user's own saved job descriptions, match each result
 * against a resume version, rank, then page. Everything it returns is either a
 * real provider response, a row the user saved, or an explicit statement that
 * there is nothing — there is no sample data path.
 *
 * Caching: provider results are cached for JOB_CACHE_TTL_MINUTES. A search whose
 * filters already have fresh cached rows is served from the cache; otherwise one
 * provider round happens first. `refresh` forces a round, still subject to the
 * registry's per-provider rate limit, so a user holding the refresh button
 * cannot burn a shared quota.
 */
import { extractJobRequirements, matchResumeToJob } from "./jobMatchService.js";
import { rankJobs, resolveWeights } from "./jobRankingService.js";

export const DISCOVERY_METHOD = "job-discovery-1.0";

const norm = (s) => String(s ?? "").toLowerCase().trim();

/** Shape a saved JobDescription like a normalized listing so one pipeline fits both. */
export function jobDescriptionAsListing(jd) {
  return {
    id: `jd:${jd.id}`,
    sourceKind: "own",
    jobDescriptionId: jd.id,
    providerSlug: "manual",
    providerName: "Entered by you",
    externalId: jd.id,
    title: jd.jobTitle,
    companyName: jd.companyName ?? "Not provided",
    companyLogoUrl: null,
    location: null,
    isRemote: false,
    workArrangement: "unknown",
    employmentType: "unknown",
    experienceLevel: "unknown",
    description: jd.description ?? "",
    salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null, salaryIsEstimate: false,
    isSponsored: false,
    postedAt: jd.createdAt ?? null,
    // The date a user saved a description is not a publication date.
    postedAtReliable: false,
    sourceUrl: jd.sourceUrl ?? null,
    applyUrl: jd.sourceUrl ?? null,
    tags: [],
    listingStatus: "open",
    targetRole: jd.targetRole ?? null,
    parsedSkills: Array.isArray(jd.extractedRequirements?.skills) ? jd.extractedRequirements.skills : [],
  };
}

/** Shape a cached ExternalJob row for the API. */
export function externalJobAsListing(row) {
  return {
    id: row.id,
    sourceKind: "provider",
    jobDescriptionId: null,
    providerSlug: row.providerSlug,
    externalId: row.externalId,
    title: row.title,
    companyName: row.companyName,
    companyLogoUrl: row.companyLogoUrl,
    location: row.location,
    isRemote: row.isRemote,
    workArrangement: row.workArrangement,
    employmentType: row.employmentType,
    experienceLevel: row.experienceLevel,
    description: row.description,
    salaryMin: row.salaryMin, salaryMax: row.salaryMax, salaryCurrency: row.salaryCurrency,
    salaryPeriod: row.salaryPeriod, salaryIsEstimate: row.salaryIsEstimate,
    isSponsored: row.isSponsored,
    postedAt: row.postedAt,
    postedAtReliable: row.postedAtReliable,
    sourceUrl: row.sourceUrl,
    applyUrl: row.applyUrl,
    tags: Array.isArray(row.tags) ? row.tags : [],
    listingStatus: row.listingStatus,
    fetchedAt: row.fetchedAt,
    targetRole: null,
    parsedSkills: [],
  };
}

/** Fields the source did not supply, named so the UI can say "not provided". */
export function missingFields(listing) {
  const missing = [];
  if (!listing.location && listing.workArrangement !== "remote") missing.push("location");
  if (listing.workArrangement === "unknown") missing.push("work arrangement");
  if (listing.employmentType === "unknown") missing.push("employment type");
  if (listing.experienceLevel === "unknown") missing.push("experience level");
  if (!listing.salaryMin && !listing.salaryMax) missing.push("salary");
  if (!listing.postedAt || !listing.postedAtReliable) missing.push("posting date");
  return missing;
}

/**
 * @param {{ repo: object, registry: object, env: object, logger?: object }} deps
 */
export function createJobDiscoveryService({ repo, registry, env, logger = { info() {}, warn() {} } }) {
  const ttlMs = (env.JOB_CACHE_TTL_MINUTES ?? 30) * 60_000;

  /**
   * Which resume version to match against. An explicit choice wins; otherwise
   * the best editable version by recorded quality, else the original. Returns
   * null when the user has no resume version at all — in which case jobs are
   * still listed, with the match reported as "not assessed".
   */
  async function pickResumeVersion(userId, requestedId) {
    const versions = await repo.listResumeVersions(userId);
    if (!versions.length) return { version: null, versions: [] };
    if (requestedId) {
      const chosen = versions.find((v) => v.id === requestedId);
      if (chosen) return { version: chosen, versions };
    }
    const editable = versions.filter((v) => !v.isOriginal);
    const pool = editable.length ? editable : versions;
    const best = [...pool].sort((a, b) => (b.lastQualityScore ?? -1) - (a.lastQualityScore ?? -1) || new Date(b.updatedAt) - new Date(a.updatedAt))[0];
    return { version: best, versions };
  }

  /** Does this search already have fresh cached rows? */
  async function hasFreshCache(filters) {
    const rows = await repo.searchCachedJobs({ ...filters, freshOnly: new Date(Date.now() - ttlMs) });
    return rows.length > 0;
  }

  /**
   * Call providers and persist what comes back. Returns the provider report and
   * how many listings were new, which is what alerts and the refresh endpoint
   * report to the user.
   */
  async function refreshFromProviders(query) {
    const result = await registry.search(query);

    // Provider rows first: ExternalJob.providerSlug is a foreign key to
    // JobProvider.slug, so the listings cannot be stored until the provider
    // exists. This also records each provider's outcome for the setup screen.
    for (const p of result.providers) {
      const adapter = registry.listProviders().find((x) => x.slug === p.slug);
      await repo.recordProviderResult(p.slug, {
        displayName: adapter?.displayName ?? p.slug,
        attribution: adapter?.attribution ?? null,
        termsUrl: adapter?.termsUrl ?? null,
        status: p.status,
        error: p.error,
        jobCount: p.count,
      }).catch(() => null);
    }

    let created = 0;
    let updated = 0;
    if (result.jobs.length) {
      const stored = await repo.upsertJobs(result.jobs);
      created = stored.created;
      updated = stored.updated;
    }
    return { ...result, created, updated };
  }

  /**
   * The discovery query.
   *
   * @param {string} userId
   * @param {object} q validated query (see jobSchemas.discoverQuerySchema)
   */
  async function discover(userId, q = {}) {
    const [preferenceRow, hiddenIds, savedMap, reportMap, ownDescriptions] = await Promise.all([
      repo.getPreference(userId),
      repo.hiddenJobIds(userId),
      repo.savedStateMap(userId),
      repo.matchReportMap(userId),
      repo.listJobDescriptions(userId),
    ]);
    const preferences = preferenceRow ?? {};

    // A filter the caller gave wins; otherwise the saved preference applies.
    const text = q.q ?? preferences.keywords ?? null;
    const workArrangements = q.workArrangement ? [q.workArrangement] : (preferences.workArrangements ?? []);
    const employmentTypes = q.employmentType ? [q.employmentType] : (preferences.employmentTypes ?? []);
    const experienceLevels = q.experienceLevel ? [q.experienceLevel] : (preferences.experienceLevel ? [preferences.experienceLevel] : []);
    const location = q.location ?? null;
    const minSalary = q.minSalary ?? preferences.minSalary ?? null;

    const filters = {
      text,
      location,
      workArrangements,
      employmentTypes,
      experienceLevels,
      minSalary,
      postedWithinDays: q.postedWithinDays ?? null,
      excludeCompanies: preferences.excludedCompanies ?? [],
      excludeJobIds: q.includeHidden ? [] : hiddenIds,
    };

    // Providers: only when asked to refresh, or when nothing fresh is cached.
    let providerReport = { providers: [], misconfigured: registry.misconfiguredProviders(), unknown: registry.unknownProviders(), partial: false, configured: registry.activeProviders().length > 0, created: 0, updated: 0 };
    const wantProviders = providerReport.configured;
    if (wantProviders && (q.refresh || !(await hasFreshCache(filters)))) {
      providerReport = await refreshFromProviders({
        q: text ?? undefined,
        location: location ?? undefined,
        page: 1,
        limit: 50,
        minSalary: minSalary ?? undefined,
        employmentType: employmentTypes[0],
      });
    }

    const cached = await repo.searchCachedJobs(filters);
    const providerListings = cached.map(externalJobAsListing);

    // The user's own descriptions are filtered in memory (there are few of them).
    const ownListings = ownDescriptions.map(jobDescriptionAsListing).filter((l) => {
      if (text && !(`${l.title} ${l.companyName} ${l.description}`.toLowerCase().includes(norm(text)))) return false;
      if (q.workArrangement || q.employmentType || q.experienceLevel || q.postedWithinDays || minSalary) return false; // these are unknown for manual entries
      return true;
    });

    const listings = q.source === "provider" ? providerListings : q.source === "own" ? ownListings : [...providerListings, ...ownListings];

    // Match each listing against the chosen resume version.
    const { version, versions } = await pickResumeVersion(userId, q.resumeVersionId);
    let content = null;
    if (version) {
      const full = await repo.findResumeVersion(version.id, userId);
      content = full?.content ?? null;
    }

    const items = listings.map((listing) => {
      const requirements = extractJobRequirements(listing);
      const match = content
        ? matchResumeToJob({ content, job: listing, requirements, preferences })
        : null;
      return { job: listing, match };
    });

    const ranked = rankJobs(items, preferences, { sort: q.sort ?? "relevance", weights: q.weights ?? {} });

    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const total = ranked.length;
    const slice = ranked.slice((page - 1) * limit, page * limit);

    const providers = registry.listProviders();
    const attribution = providers.filter((p) => p.enabled && p.configured && p.attribution).map((p) => p.attribution);

    return {
      method: DISCOVERY_METHOD,
      items: slice.map(({ job, match, ranking }) => ({
        job: { ...job, missingFields: missingFields(job), providerName: providers.find((p) => p.slug === job.providerSlug)?.displayName ?? job.providerName ?? job.providerSlug },
        match: match
          ? { matchScore: match.matchScore, label: match.label, assessed: match.assessed, notAssessedReason: match.notAssessedReason, requiredDemonstrated: match.skills.requiredDemonstrated, requiredNotFound: match.skills.requiredNotFound, needingEvidence: match.skills.needingEvidence, mismatchCount: match.mismatches.length }
          : { matchScore: null, label: "Not assessed", assessed: false, notAssessedReason: "You have no resume version yet, so nothing can be compared.", requiredDemonstrated: [], requiredNotFound: [], needingEvidence: [], mismatchCount: 0 },
        ranking,
        savedState: savedMap.get(job.id)?.state ?? null,
        savedJobId: savedMap.get(job.id)?.id ?? null,
        storedMatch: reportMap.get(job.id) ?? null,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: page * limit < total,
      sort: q.sort ?? "relevance",
      filtersApplied: {
        q: text, location, workArrangements, employmentTypes, experienceLevels, minSalary,
        postedWithinDays: q.postedWithinDays ?? null, source: q.source ?? "all",
        hiddenExcluded: q.includeHidden ? 0 : hiddenIds.length,
      },
      resumeVersion: version ? { id: version.id, name: version.name, kind: version.kind, isOriginal: version.isOriginal, lastQualityScore: version.lastQualityScore } : null,
      availableResumeVersions: versions.map((v) => ({ id: v.id, name: v.name, kind: v.kind, isOriginal: v.isOriginal, lastQualityScore: v.lastQualityScore })),
      providerStatus: {
        configured: providerReport.configured,
        enabled: providers.filter((p) => p.enabled).map((p) => p.slug),
        results: providerReport.providers,
        misconfigured: providerReport.misconfigured,
        unknown: providerReport.unknown,
        partial: providerReport.partial,
        created: providerReport.created ?? 0,
        updated: providerReport.updated ?? 0,
        cacheTtlMinutes: env.JOB_CACHE_TTL_MINUTES ?? 30,
        attribution,
      },
      setup: providerReport.configured ? null : setupGuide(providers),
      rankingWeights: resolveWeights({ ...(preferences.rankingWeights ?? {}), ...(q.weights ?? {}) }),
      notes: notesFor({ providerReport, ownCount: ownListings.length, matched: Boolean(content) }),
    };
  }

  /** What to tell the user when no provider is configured. Never sample data. */
  function setupGuide(providers) {
    return {
      message: "No job provider is configured, so no live vacancies can be shown. Job discovery is searching only the job descriptions you have entered yourself.",
      howTo: "Set JOB_PROVIDERS in the backend environment to a comma-separated list of providers, then restart the backend.",
      envVar: "JOB_PROVIDERS",
      available: providers.map((p) => ({
        slug: p.slug,
        displayName: p.displayName,
        requiresCredentials: p.requiresCredentials,
        credentialKeys: p.credentialKeys,
        missingCredentials: p.missingCredentials,
        docsUrl: p.docsUrl,
        termsUrl: p.termsUrl,
        attribution: p.attribution,
        note: p.requiresCredentials
          ? `Needs ${p.credentialKeys.join(" and ")} in the backend environment.`
          : "Works without credentials.",
      })),
      manualEntry: { message: "You can add a job description by hand at any time and get the same matching, tailoring and interview preparation.", href: "/dashboard/job-descriptions" },
    };
  }

  function notesFor({ providerReport, ownCount, matched }) {
    const notes = [];
    if (!providerReport.configured) notes.push("No external job provider is configured; these results are the job descriptions you entered yourself.");
    if (providerReport.partial) notes.push("At least one provider did not respond, so these results are incomplete. Nothing has been substituted for the missing listings.");
    for (const m of providerReport.misconfigured ?? []) notes.push(`Provider “${m.slug}” is enabled but missing ${m.missingCredentials.join(", ")}, so it was skipped.`);
    for (const u of providerReport.unknown ?? []) notes.push(`JOB_PROVIDERS lists “${u}”, which this build has no adapter for.`);
    if (!matched) notes.push("No resume version is available, so match scores are reported as not assessed rather than guessed.");
    if (ownCount > 0) notes.push(`${ownCount} of these are job descriptions you entered yourself; provider-only fields such as salary and posting date are unknown for them.`);
    return notes;
  }

  /** Retention sweep; safe to call on any request path. */
  async function purgeExpired() {
    const cutoff = new Date(Date.now() - (env.JOB_RETENTION_DAYS ?? 30) * 86_400_000);
    const removed = await repo.purgeExpiredJobs(cutoff);
    if (removed) logger.info?.("expired job listings purged", { meta: { removed, retentionDays: env.JOB_RETENTION_DAYS } });
    return removed;
  }

  return { method: DISCOVERY_METHOD, discover, refreshFromProviders, pickResumeVersion, purgeExpired, setupGuide };
}
