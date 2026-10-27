/**
 * jobRankingService.js — personalised ordering of job results (`job-ranking-1.0`).
 * Pure, no AI.
 *
 * Ranking answers "which of these should I look at first", which is a different
 * question from the match score's "how much of this listing do I evidence".
 * Three separations are deliberate:
 *
 *   1. **Fit vs. preference.** The match score covers skills, experience and
 *      level. Location, work arrangement and salary are *preferences* and live
 *      here, so changing where you want to work never changes how qualified you
 *      are.
 *   2. **Relevance vs. freshness.** `relevanceScore` excludes posting age
 *      entirely; `rankScore` adds freshness as its own factor, and only when the
 *      provider supplies a timestamp we trust. Both are returned, so a UI can
 *      sort by either without conflating "good for me" with "posted recently".
 *   3. **Missing data vs. bad data.** A factor the listing cannot answer is
 *      excluded and the remaining weights are re-normalised. A job with no
 *      stated salary is never ranked below one that states a poor salary.
 *
 * Sponsored listings are flagged and never boosted: `isSponsored` adds a note
 * and nothing else.
 */
export const RANKING_METHOD = "job-ranking-1.0";

export const DEFAULT_RANKING_WEIGHTS = Object.freeze({
  match: 40,
  targetRole: 15,
  skills: 15,
  location: 10,
  arrangement: 10,
  salary: 5,
  freshness: 5,
});

export const RANKING_FACTOR_LABELS = Object.freeze({
  match: "Resume match",
  targetRole: "Target-role alignment",
  skills: "Skills you have demonstrated",
  location: "Preferred location",
  arrangement: "Preferred work arrangement",
  salary: "Salary preference",
  freshness: "Posting freshness (urgency, not fit)",
});

/** Freshness is urgency; it is reported apart from relevance for that reason. */
const FRESHNESS_KEY = "freshness";

const norm = (s) => String(s ?? "").toLowerCase().trim();
const DAY = 86_400_000;

/** Only non-negative numbers override a default weight. */
export function resolveWeights(overrides = {}) {
  const clean = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([k, v]) => k in DEFAULT_RANKING_WEIGHTS && typeof v === "number" && Number.isFinite(v) && v >= 0)
  );
  return { ...DEFAULT_RANKING_WEIGHTS, ...clean };
}

/**
 * Rank one job.
 *
 * @param {object} input
 * @param {object} input.job          normalized job (or saved job description shaped the same way)
 * @param {object|null} input.match   match report from jobMatchService, or null when not computed
 * @param {object} input.preferences  JobSearchPreference row (plain object)
 * @param {object} [opts]
 * @param {Partial<typeof DEFAULT_RANKING_WEIGHTS>} [opts.weights]
 * @param {Date} [opts.now]
 */
export function rankJob({ job, match, preferences = {} }, { weights: weightOverrides = {}, now = new Date() } = {}) {
  const weights = resolveWeights({ ...(preferences?.rankingWeights ?? {}), ...weightOverrides });
  const factors = [];
  const add = (key, score, evidence) => factors.push({ key, label: RANKING_FACTOR_LABELS[key], weight: weights[key], score, applicable: score !== null, evidence });

  // 1. Resume match — the single biggest factor, taken straight from job-match-1.0.
  add("match", typeof match?.matchScore === "number" ? match.matchScore : null,
    typeof match?.matchScore === "number"
      ? `Resume match ${match.matchScore}% (${match.label})`
      : "No resume match computed for this job yet");

  // 2. Target role: does the title match a role the user is aiming at?
  const titles = [...(preferences?.titles ?? [])].map(norm).filter(Boolean);
  if (titles.length === 0) add("targetRole", null, "You have not set any target job titles");
  else {
    const title = norm(job.title);
    const exact = titles.some((t) => title === t);
    const contains = titles.some((t) => t.length >= 3 && (title.includes(t) || t.includes(title)));
    const wordOverlap = titles.some((t) => {
      const want = new Set(t.split(/\s+/).filter((w) => w.length > 2));
      const have = title.split(/\s+/).filter((w) => w.length > 2);
      return want.size > 0 && have.filter((w) => want.has(w)).length >= Math.min(2, want.size);
    });
    const score = exact ? 100 : contains ? 85 : wordOverlap ? 65 : 20;
    add("targetRole", score, exact ? `“${job.title}” matches your target title` : contains || wordOverlap ? `“${job.title}” is close to your target titles` : `“${job.title}” is outside your target titles`);
  }

  // 3. Demonstrated skills the listing asks for.
  const demonstrated = match?.skills?.requiredDemonstrated?.length ?? null;
  const requiredTotal = (match?.skills?.detail ?? []).filter((s) => s.priority === "required").length;
  if (demonstrated === null || requiredTotal === 0) add("skills", null, "No required skills could be read from this listing");
  else add("skills", Math.round((demonstrated / requiredTotal) * 100), `${demonstrated} of ${requiredTotal} required skills are demonstrated in your resume`);

  // 4. Location preference. An unstated location excludes the factor.
  const wantedLocations = (preferences?.locations ?? []).map(norm).filter(Boolean);
  const isRemote = job.workArrangement === "remote";
  if (wantedLocations.length === 0) add("location", null, "You have not set preferred locations");
  else if (isRemote) add("location", 100, "Remote role, so your location preference is satisfied");
  else if (!job.location) add("location", null, "The listing does not state a location");
  else {
    const hay = norm(job.location);
    const hit = wantedLocations.find((l) => hay.includes(l) || l.includes(hay));
    add("location", hit ? 100 : 25, hit ? `Location “${job.location}” matches your preference` : `Location “${job.location}” is not one of your preferred locations`);
  }

  // 5. Work arrangement preference.
  const wantedArrangements = (preferences?.workArrangements ?? []).map(norm).filter(Boolean);
  if (wantedArrangements.length === 0) add("arrangement", null, "You have not set a work-arrangement preference");
  else if (!job.workArrangement || job.workArrangement === "unknown") add("arrangement", null, "The listing does not say whether the role is remote, hybrid or on-site");
  else add("arrangement", wantedArrangements.includes(norm(job.workArrangement)) ? 100 : 30, `Role is ${job.workArrangement}; you prefer ${wantedArrangements.join(" or ")}`);

  // 6. Salary preference — only when the listing publishes a figure.
  const minWanted = Number(preferences?.minSalary) || null;
  const offered = job.salaryMax ?? job.salaryMin ?? null;
  if (!minWanted) add("salary", null, "You have not set a minimum salary");
  else if (!offered) add("salary", null, "The listing does not publish a salary");
  else if (job.salaryCurrency && preferences?.salaryCurrency && norm(job.salaryCurrency) !== norm(preferences.salaryCurrency)) {
    add("salary", null, `The listing is in ${job.salaryCurrency} and your preference is in ${preferences.salaryCurrency}; currencies are not converted, so this is not scored`);
  } else {
    const ratio = offered / minWanted;
    const score = ratio >= 1 ? 100 : ratio >= 0.9 ? 75 : ratio >= 0.75 ? 50 : 20;
    add("salary", score, `${job.salaryIsEstimate ? "Estimated " : ""}salary up to ${offered}${job.salaryCurrency ? ` ${job.salaryCurrency}` : ""} against your minimum of ${minWanted}`);
  }

  // 7. Freshness — urgency, and only from a timestamp the provider stands behind.
  if (!job.postedAt || !job.postedAtReliable) {
    add(FRESHNESS_KEY, null, job.postedAt ? "The source's date is not a reliable publication time, so it is not scored" : "The source does not provide a posting date");
  } else {
    const ageDays = Math.max(0, (now.getTime() - new Date(job.postedAt).getTime()) / DAY);
    const score = ageDays <= 3 ? 100 : ageDays <= 7 ? 85 : ageDays <= 14 ? 65 : ageDays <= 30 ? 40 : 15;
    add(FRESHNESS_KEY, score, `Posted ${Math.round(ageDays)} day${Math.round(ageDays) === 1 ? "" : "s"} ago`);
  }

  const weightedMean = (list) => {
    const applicable = list.filter((f) => f.applicable && f.weight > 0);
    const total = applicable.reduce((s, f) => s + f.weight, 0);
    if (total === 0) return null;
    return Math.round(applicable.reduce((s, f) => s + f.score * f.weight, 0) / total);
  };

  const rankScore = weightedMean(factors);
  const relevanceScore = weightedMean(factors.filter((f) => f.key !== FRESHNESS_KEY));

  // "Why this is recommended": the applicable factors that actually scored well.
  const reasons = factors
    .filter((f) => f.applicable && f.score >= 65 && f.weight > 0)
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 4)
    .map((f) => f.evidence);
  const excluded = factors.filter((f) => !f.applicable).map((f) => ({ key: f.key, label: f.label, reason: f.evidence }));

  const notes = [];
  if (job.isSponsored) notes.push("This listing is marked as promoted by the provider. Promotion does not affect its position here.");
  if (excluded.length) notes.push(`${excluded.length} factor${excluded.length === 1 ? "" : "s"} could not be assessed and ${excluded.length === 1 ? "was" : "were"} excluded rather than counted against this job.`);

  return {
    method: RANKING_METHOD,
    rankScore,
    relevanceScore,
    freshnessScore: factors.find((f) => f.key === FRESHNESS_KEY)?.score ?? null,
    factors,
    excludedFactors: excluded,
    weightsUsed: Object.fromEntries(factors.filter((f) => f.applicable).map((f) => [f.key, f.weight])),
    reasons: reasons.length ? reasons : ["Nothing about this job could be scored against your preferences yet."],
    notes,
    isSponsored: job.isSponsored === true,
  };
}

/**
 * Rank a list and sort it.
 * @param {Array<{ job: object, match: object|null }>} items
 * @param {object} preferences
 * @param {{ sort?: "relevance"|"newest"|"match", weights?: object, now?: Date }} [opts]
 */
export function rankJobs(items, preferences, { sort = "relevance", weights = {}, now = new Date() } = {}) {
  const ranked = items.map(({ job, match }) => ({ job, match, ranking: rankJob({ job, match, preferences }, { weights, now }) }));

  const byRelevance = (a, b) => (b.ranking.relevanceScore ?? -1) - (a.ranking.relevanceScore ?? -1) || (b.ranking.rankScore ?? -1) - (a.ranking.rankScore ?? -1);
  const byMatch = (a, b) => (b.match?.matchScore ?? -1) - (a.match?.matchScore ?? -1) || byRelevance(a, b);
  const byNewest = (a, b) => {
    // Listings without a trustworthy date sort last rather than being guessed at.
    const at = a.job.postedAtReliable && a.job.postedAt ? new Date(a.job.postedAt).getTime() : -1;
    const bt = b.job.postedAtReliable && b.job.postedAt ? new Date(b.job.postedAt).getTime() : -1;
    return bt - at || byRelevance(a, b);
  };

  const sorter = sort === "newest" ? byNewest : sort === "match" ? byMatch : byRelevance;
  return ranked.sort(sorter);
}
