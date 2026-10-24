/**
 * streakService.js — learning-streak maths in the user's own timezone. Pure.
 *
 * Rules (documented to the user):
 *  - A "learning day" is any local calendar day with at least one qualifying event
 *    (see progressConfig.STREAK_QUALIFYING_TYPES). Several events on one day count once.
 *  - The current streak counts consecutive learning days ending today or yesterday
 *    (today has not ended yet, so a quiet morning never breaks a streak).
 *  - Day boundaries use the IANA timezone supplied by the client (DST handled by Intl);
 *    an unknown zone falls back to UTC rather than failing.
 *  - Streaks are derived from records on every read — a server error can never reset them.
 */

export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** YYYY-MM-DD for `date` in `tz`. */
export function localDayKey(date, tz = "UTC") {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Add `n` days to a YYYY-MM-DD key (calendar arithmetic, timezone independent). */
export function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d + n);
  return new Date(t).toISOString().slice(0, 10);
}

export function dayDiff(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** ISO-8601 week key (YYYY-Www, Monday-based) for a YYYY-MM-DD key. */
export function isoWeekKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Monday (YYYY-MM-DD) of the week containing dayKey. */
export function weekStartKey(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  return addDays(dayKey, 1 - dow);
}

/**
 * @param {Iterable<string>} learningDays  YYYY-MM-DD keys
 * @param {string} todayKey
 */
export function computeStreaks(learningDays, todayKey) {
  const days = [...new Set(learningDays)].filter(Boolean).sort();
  let longest = 0, run = 0, prev = null;
  for (const day of days) {
    run = prev && dayDiff(prev, day) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = day;
  }
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(todayKey) ? todayKey : set.has(addDays(todayKey, -1)) ? addDays(todayKey, -1) : null;
  while (cursor && set.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }
  const lastActivityDay = days.length ? days[days.length - 1] : null;
  return { currentStreak: current, longestStreak: longest, totalLearningDays: days.length, lastActivityDay, activeToday: set.has(todayKey) };
}

/** Calendar cells for the last `weeks` weeks (oldest first), each { day, count, active }. */
export function activityCalendar(dayCounts, todayKey, { weeks = 12 } = {}) {
  const end = addDays(weekStartKey(todayKey), 6);
  const start = addDays(end, -(weeks * 7 - 1));
  const cells = [];
  for (let k = start; dayDiff(k, end) >= 0; k = addDays(k, 1)) {
    const count = dayCounts.get(k) ?? 0;
    cells.push({ day: k, count, active: count > 0, future: dayDiff(todayKey, k) > 0 });
  }
  return { start, end, cells };
}

/** Weekly summary for the last `weeks` weeks: { weekStart, activeDays, events }. */
export function weeklyActivitySummary(dayCounts, todayKey, { weeks = 8 } = {}) {
  const out = [];
  let ws = weekStartKey(todayKey);
  for (let i = 0; i < weeks; i++) {
    let activeDays = 0, events = 0;
    for (let j = 0; j < 7; j++) { const c = dayCounts.get(addDays(ws, j)) ?? 0; if (c > 0) activeDays++; events += c; }
    out.unshift({ weekStart: ws, weekEnd: addDays(ws, 6), activeDays, events });
    ws = addDays(ws, -7);
  }
  return out;
}
