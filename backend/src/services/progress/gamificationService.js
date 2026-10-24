/**
 * gamificationService.js — pure ledger logic: levels, award/reversal planning and
 * achievement evaluation. The repository persists what this module decides.
 *
 * Ledger rules
 *  - One award per eventKey per cycle. An event that disappears (task reopened, session
 *    deleted, application moved back) is reversed with a negative transaction of the same
 *    size; if it becomes valid again a new cycle is awarded. Toggling therefore nets to
 *    exactly one award — repeated trivial actions cannot inflate points.
 *  - Totals are always Σ transactions, never a stored counter the client could influence.
 *  - Achievements are unlocked once and never revoked (the unlock record is history).
 */
import { ACHIEVEMENTS, LEVELS, LEVEL_STEP_AFTER_LAST, LEVEL_DISCLAIMER, POINT_RULES, GAMIFICATION_METHOD } from "./progressConfig.js";

export function levelFor(totalPoints) {
  const pts = Math.max(0, totalPoints | 0);
  let current = LEVELS[0];
  for (const l of LEVELS) if (pts >= l.minPoints) current = l;
  let next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  // Beyond the configured ladder: keep going in fixed steps.
  if (current.level === LEVELS[LEVELS.length - 1].level) {
    const extra = Math.floor((pts - current.minPoints) / LEVEL_STEP_AFTER_LAST);
    const level = current.level + extra;
    const minPoints = current.minPoints + extra * LEVEL_STEP_AFTER_LAST;
    current = { level, name: extra ? `${LEVELS[LEVELS.length - 1].name} ${toRoman(extra + 1)}` : current.name, minPoints };
    next = { level: level + 1, name: `${LEVELS[LEVELS.length - 1].name} ${toRoman(extra + 2)}`, minPoints: minPoints + LEVEL_STEP_AFTER_LAST };
  }
  const span = next ? next.minPoints - current.minPoints : 1;
  const into = pts - current.minPoints;
  return {
    level: current.level, name: current.name, totalPoints: pts, levelMinPoints: current.minPoints,
    nextLevel: next ? { level: next.level, name: next.name, minPoints: next.minPoints, pointsNeeded: next.minPoints - pts } : null,
    percentToNext: next ? Math.min(100, Math.round((into / span) * 100)) : 100,
    disclaimer: LEVEL_DISCLAIMER,
  };
}

function toRoman(n) { const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let out = ""; for (const [v, s] of map) while (n >= v) { out += s; n -= v; } return out || String(n); }

/**
 * Decide which transactions to add so the ledger matches the current event list.
 * @param {object[]} events        from activityEventService.deriveEvents (points already capped)
 * @param {object[]} transactions  existing PointTransaction rows for the user
 */
export function planLedger(events, transactions) {
  const state = new Map(); // eventKey → { awards, reversals, lastAwardPoints, eventType, title }
  for (const t of transactions) {
    const s = state.get(t.eventKey) ?? { awards: 0, reversals: 0, lastAwardPoints: 0, eventType: t.eventType, title: t.title, occurredAt: t.occurredAt };
    if (t.kind === "award") { s.awards += 1; s.lastAwardPoints = t.points; } else s.reversals += 1;
    state.set(t.eventKey, s);
  }
  const create = [];
  const present = new Set();
  for (const e of events) {
    present.add(e.eventKey);
    if (e.points <= 0) continue;
    const s = state.get(e.eventKey);
    const awarded = s ? s.awards > s.reversals : false;
    if (awarded) continue;
    create.push({ eventKey: e.eventKey, eventType: e.eventType, kind: "award", cycle: (s?.awards ?? 0) + 1, points: e.points, sourceType: e.sourceType, sourceId: e.sourceId, title: e.title, occurredAt: e.occurredAt });
  }
  for (const [key, s] of state) {
    if (present.has(key) || s.awards <= s.reversals) continue;
    create.push({ eventKey: key, eventType: s.eventType, kind: "reversal", cycle: s.awards, points: -Math.abs(s.lastAwardPoints), sourceType: null, sourceId: null, title: `Reversed: ${s.title} (activity removed or reopened)`, occurredAt: new Date() });
  }
  return create;
}

export function sumPoints(transactions) { return transactions.reduce((s, t) => s + (t.points | 0), 0); }

/** Achievements with progress; `unlocked` = existing UserAchievement rows. */
export function evaluateAchievements(stats, unlocked) {
  const have = new Map(unlocked.map((u) => [u.achievementKey, u]));
  return ACHIEVEMENTS.map((d) => {
    const value = Math.max(0, stats[d.metric] ?? 0);
    const row = have.get(d.key);
    return { key: d.key, title: d.title, description: d.description, category: d.category, icon: d.icon, metric: d.metric, target: d.threshold, progress: Math.min(value, d.threshold), percent: Math.min(100, Math.round((value / d.threshold) * 100)), unlocked: Boolean(row) || value >= d.threshold, unlockedAt: row?.unlockedAt ?? null, newlyUnlocked: !row && value >= d.threshold };
  });
}

/** Human-readable explanation of how XP is earned (served to the UI). */
export function pointRulesView() {
  return Object.entries(POINT_RULES).map(([type, r]) => ({ eventType: type, points: r.points, label: r.label, category: r.category, dailyCap: r.dailyCap ?? null }));
}

export const GAMIFICATION_VIEW_META = { method: GAMIFICATION_METHOD, levels: LEVELS, levelStepAfterLast: LEVEL_STEP_AFTER_LAST, disclaimer: LEVEL_DISCLAIMER };
