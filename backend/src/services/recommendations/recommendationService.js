/**
 * recommendationService.js — one cross-feature recommendation surface
 * (`recommendations-1.0`).
 *
 * Phase 16 found three places that told a user what to do next, and they did
 * not agree:
 *
 *   1. `dashboardService.recommendedActions()` (Phase 5) — rule-based, never
 *      persisted, not dismissible, and unaware of everything built in Phases
 *      8–14. It still pointed at the old analyser pages.
 *   2. `careerRecommendationService.buildCareerRecommendations()` (Phase 9) —
 *      evidence-backed, explainable, persisted and dismissible, but reachable
 *      only under `/api/career/*` and framed as part of a career assessment.
 *   3. `learningRecommendationService.buildLearningRecommendations()`
 *      (Phase 7) — roadmap-task granularity, with its own dismissal table.
 *
 * This module does not write a fourth engine. (2) is already the best one and
 * already covers every feature area, so it stays the single generator; this
 * service gives it a neutral home, and reconciles the two dismissal stores so
 * that dismissing something in the learning page also silences the equivalent
 * item on the dashboard.
 *
 * What it deliberately does not do: merge (3)'s items in. Those are "which
 * roadmap task next", a different granularity that only makes sense inside a
 * roadmap, and flattening them here would produce two entries for one idea.
 * Their *dismissals* are honoured; their items stay on the learning page.
 */
import { buildCareerRecommendations } from "../career/careerRecommendationService.js";

export const RECOMMENDATION_METHOD = "recommendations-1.0";

/** Every type the generator can emit, in the order the UI should group them. */
export const RECOMMENDATION_TYPES = Object.freeze([
  "profile",
  "resume",
  "skill",
  "learning",
  "interview",
  "application",
  "project",
]);

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * Translate a Phase 7 learning dismissal key into the career keyspace.
 *
 * The two engines named the same idea differently, so a user who dismissed
 * "learn React" on the learning page kept seeing it on the dashboard. Returns
 * every career key the learning key should silence.
 *
 * @param {string} key a `RecommendationDismissal.recommendationKey`
 * @returns {string[]}
 */
export function careerKeysForLearningKey(key) {
  const k = norm(key);
  const [kind, ...rest] = k.split(":");
  const value = rest.join(":");
  if (!value) return [];
  switch (kind) {
    case "gap":
      return [`skill:${value}`];
    case "weak":
      return [`interview:weak:${value}`, `interview:confirm:${value}`];
    // Both of these name a roadmap task by id.
    case "resume":
    case "project":
      return [`learning:task:${value}`];
    default:
      return [];
  }
}

/**
 * The set of career keys suppressed by dismissals in either store.
 *
 * @param {string[]} learningDismissedKeys from `RecommendationDismissal`
 * @param {Array<{ key: string, status: string }>} storedRecommendations
 */
export function suppressedKeys(learningDismissedKeys = [], storedRecommendations = []) {
  const out = new Set();
  for (const key of learningDismissedKeys) {
    for (const mapped of careerKeysForLearningKey(key)) out.add(mapped);
  }
  for (const row of storedRecommendations) {
    if (row.status === "dismissed") out.add(row.key);
  }
  return out;
}

/**
 * Sort for display: priority first, then the smaller job, then stable by key.
 * A five-minute high-priority task should sit above a four-hour one.
 */
export function rankRecommendations(items) {
  return [...items].sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (p !== 0) return p;
    const e = (a.effortMinutes ?? 9999) - (b.effortMinutes ?? 9999);
    if (e !== 0) return e;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * Decide what to write, given what the generator produced and what is stored.
 *
 * The persistence itself is `careerRepository.syncRecommendations`, which
 * already upserts by key and closes anything that no longer applies. Two things
 * it cannot know are decided here:
 *
 *   - **Suppressed.** An item dismissed in *either* store must not be written
 *     back as a live row. `syncRecommendations` would refresh its text and
 *     leave the status alone, which is harmless, but passing it through would
 *     also stop it being closed out, so it is filtered first.
 *   - **Reopen.** `syncRecommendations` closes a stale item as `done`. If the
 *     condition later recurs — a resume's quality drops below 75 again — the
 *     row is still `done` and the user would never be told a second time. Any
 *     `done` key the generator emits again is reopened.
 *
 * @returns {{ toSync: object[], reopenIds: string[], closedKeys: string[] }}
 */
export function reconcile(generated, stored, { suppressed = new Set() } = {}) {
  const storedByKey = new Map(stored.map((r) => [r.key, r]));
  const live = generated.filter((item) => {
    if (suppressed.has(item.key)) return false;
    return storedByKey.get(item.key)?.status !== "dismissed";
  });

  const liveKeys = new Set(live.map((r) => r.key));

  const reopenIds = stored
    .filter((r) => r.status === "done" && liveKeys.has(r.key))
    .map((r) => r.id);

  const closedKeys = stored
    .filter((r) => r.status === "open" && !liveKeys.has(r.key))
    .map((r) => r.key);

  return { toSync: live, reopenIds, closedKeys };
}

/**
 * Group for the UI without losing the ranking inside each group.
 * @param {object[]} items already ranked
 */
export function groupByType(items) {
  return RECOMMENDATION_TYPES.map((type) => ({
    type,
    items: items.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);
}

/**
 * @param {{ careerRepo: object, learningRepo: object, logger?: object }} deps
 */
export function createRecommendationService({ careerRepo, learningRepo, logger = { info() {}, warn() {} } }) {
  /**
   * Recompute from the user's current records, reconcile with what is stored,
   * and persist. Returns what the user should see now.
   *
   * @param {string} userId
   * @param {{ limit?: number, now?: Date }} [opts]
   */
  async function refresh(userId, { limit = 12, now = new Date() } = {}) {
    const snapshot = await careerRepo.loadSnapshot(userId);
    const targetRole = snapshot.profile?.targetRoles?.[0] ?? null;

    const [assessment, stored, learningDismissed] = await Promise.all([
      careerRepo.latestAssessment(userId, targetRole),
      careerRepo.listRecommendations(userId),
      // The Phase 7 table is read, never written to, from here on.
      learningRepo.dismissedKeys(userId).catch(() => []),
    ]);

    const generated = buildCareerRecommendations(snapshot, assessment, { now, limit });
    const suppressed = suppressedKeys(learningDismissed, stored);
    const { toSync, reopenIds, closedKeys } = reconcile(generated, stored, { suppressed });

    // The existing Phase 9 writer: upserts by key, closes what no longer applies.
    await careerRepo.syncRecommendations(userId, null, toSync);
    for (const id of reopenIds) {
      await careerRepo.updateRecommendation(id, userId, { status: "open", completedAt: null });
    }

    logger.info?.("recommendations refreshed", {
      meta: { userId, generated: generated.length, written: toSync.length, reopened: reopenIds.length, closed: closedKeys.length, suppressed: suppressed.size },
    });

    // Re-read so every item carries its persisted id, which the UI needs in
    // order to dismiss or complete it.
    return present(await careerRepo.listRecommendations(userId, { status: "open" }), { limit, targetRole, resolvedThisRun: closedKeys.length });
  }

  /** One response shape, whether the list was recomputed or read from store. */
  function present(rows, { limit, targetRole = null, resolvedThisRun = 0 }) {
    const ranked = rankRecommendations(rows).slice(0, limit);
    return {
      method: RECOMMENDATION_METHOD,
      targetRole,
      recommendations: ranked,
      groups: groupByType(ranked),
      counts: {
        open: rows.length,
        high: rows.filter((r) => r.priority === "high").length,
        resolvedThisRun,
      },
      basis: "Derived from your own records: profile, resumes, analyses, skill gaps, roadmap, mock interviews and applications.",
      note: "Every item says why it is here and links to the feature that resolves it. Dismissing one keeps it hidden; completing one lets it return only if the underlying condition recurs.",
    };
  }

  /**
   * Read what is stored, recomputing only when there is nothing to show.
   *
   * Recomputing walks the whole snapshot, so it is not done on every dashboard
   * load; `refresh: true` is how a caller asks for it after the user changed
   * something that would alter the advice.
   */
  async function list(userId, { limit = 12, refresh: force = false, now = new Date() } = {}) {
    if (force) return refresh(userId, { limit, now });
    const rows = await careerRepo.listRecommendations(userId, { status: "open" });
    if (rows.length === 0) return refresh(userId, { limit, now });
    return present(rows, { limit });
  }

  /** Mark one recommendation done or dismissed. */
  async function update(userId, id, status) {
    return careerRepo.updateRecommendation(id, userId, {
      status,
      completedAt: status === "done" ? new Date() : null,
    });
  }

  return { method: RECOMMENDATION_METHOD, refresh, list, update };
}
