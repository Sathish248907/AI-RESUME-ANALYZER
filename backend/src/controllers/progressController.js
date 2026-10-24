/**
 * progressController.js — Phase 10 HTTP handlers. `sync()` is the single reconcile step:
 * records → eligible events → ledger plan → achievements / streaks / level → persisted
 * (only when something changed). It runs on every gamification read, so totals can never
 * drift from the underlying records and nothing is ever accepted from the client.
 */
import { ApiError, badRequest } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { pageMeta } from "../validators/common.js";
import { deriveEvents, computeStats } from "../services/progress/activityEventService.js";
import { planLedger, sumPoints, levelFor, evaluateAchievements, pointRulesView, GAMIFICATION_VIEW_META } from "../services/progress/gamificationService.js";
import { computeStreaks, localDayKey, activityCalendar, weeklyActivitySummary } from "../services/progress/streakService.js";
import { computeProgressScore, compareProgress } from "../services/progress/progressScoreService.js";
import { overviewAnalytics, rangeBounds, resumeAnalytics, interviewAnalytics, skillAnalytics, applicationAnalytics } from "../services/progress/analyticsService.js";
import { measureGoal } from "../services/progress/goalService.js";
import { reportPeriod, buildReportMetrics, narrate, renderReportPdf } from "../services/progress/progressReportService.js";
import { ACHIEVEMENTS, STREAK_MILESTONES, DEFAULT_NOTIFICATION_PREFERENCES, GOAL_TYPES, PROGRESS_WEIGHTS } from "../services/progress/progressConfig.js";

const DAY = 86_400_000;
const NOTIFY_WINDOW_DAYS = 14;

/**
 * @param {{ repo, getLlm: Function }} deps
 */
export function createProgressController({ repo, getLlm }) {
  const prefsOf = (profile) => ({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...(profile?.notificationPreferences ?? {}) });

  /** Reconcile ledger, achievements, streaks, level, activity feed and notifications with current records. */
  async function sync(userId, { tz, now = new Date() } = {}) {
    const snapshot = await repo.loadProgressSnapshot(userId);
    const stored = snapshot.gamification;
    const zone = tz ?? stored?.timezone ?? "UTC";
    const { events, learningDays, dayCounts } = deriveEvents(snapshot, { tz: zone, now });
    const todayKey = localDayKey(now, zone);
    const streaks = computeStreaks(learningDays, todayKey);
    const stats = computeStats(events, { longestStreak: streaks.longestStreak });

    const newTx = planLedger(events, snapshot.transactions);
    const transactions = [...snapshot.transactions, ...newTx];
    const totalPoints = sumPoints(transactions);
    const level = levelFor(totalPoints);
    const achievementsView = evaluateAchievements(stats, snapshot.achievements);
    const newUnlocks = achievementsView.filter((a) => a.newlyUnlocked).map((a) => ({ achievementKey: a.key, unlockedAt: now, progressValue: a.progress, targetValue: a.target, evidence: { metric: a.metric, value: stats[a.metric] ?? 0 } }));

    const prefs = prefsOf(stored);
    const recent = (d) => now.getTime() - new Date(d).getTime() <= NOTIFY_WINDOW_DAYS * DAY;
    const notifications = [];
    if (prefs.achievements) for (const a of newUnlocks) { const def = ACHIEVEMENTS.find((d) => d.key === a.achievementKey); notifications.push({ type: "achievement", title: `Achievement unlocked: ${def.title}`, body: def.description, href: "/dashboard/progress/achievements", dedupeKey: `achievement:${a.achievementKey}` }); }
    if (prefs.levels && stored && level.level > stored.level) notifications.push({ type: "level", title: `You reached level ${level.level}: ${level.name}`, body: `${totalPoints} points earned so far. ${level.disclaimer}`, href: "/dashboard/progress", dedupeKey: `level:${level.level}` });
    if (prefs.streaks) for (const m of STREAK_MILESTONES) if (streaks.currentStreak >= m && (stored?.currentStreak ?? 0) < m) notifications.push({ type: "streak", title: `${m}-day learning streak`, body: `You have learned on ${m} consecutive days. Breaks are fine — your history stays.`, href: "/dashboard/progress", dedupeKey: `streak:${m}` });
    for (const e of events) {
      if (!recent(e.occurredAt)) continue;
      if (prefs.milestones && e.eventType === "milestone_completed") notifications.push({ type: "milestone", title: "Learning milestone completed", body: e.title, href: e.href, dedupeKey: e.eventKey });
      if (prefs.assessments && e.eventType === "career_assessment_completed") notifications.push({ type: "assessment", title: "Career assessment completed", body: e.title, href: e.href, dedupeKey: e.eventKey });
    }

    // Activity feed rows: every derived event (points as awarded) + gamification events; rows whose source vanished are removed.
    const awardedPoints = new Map();
    for (const t of transactions) awardedPoints.set(t.eventKey, (awardedPoints.get(t.eventKey) ?? 0) + t.points);
    const activity = events.map((e) => ({ eventKey: e.eventKey, eventType: e.eventType, title: e.title, category: e.category, points: Math.max(0, awardedPoints.get(e.eventKey) ?? 0), href: e.href, occurredAt: e.occurredAt, metadata: e.metadata }));
    for (const a of newUnlocks) activity.push({ eventKey: `achievement_unlocked:${a.achievementKey}`, eventType: "achievement_unlocked", title: `Unlocked “${ACHIEVEMENTS.find((d) => d.key === a.achievementKey).title}”`, category: "gamification", points: 0, href: "/dashboard/progress/achievements", occurredAt: now, metadata: null });
    if (stored && level.level > stored.level) activity.push({ eventKey: `level_reached:${level.level}`, eventType: "level_reached", title: `Reached level ${level.level} — ${level.name}`, category: "gamification", points: 0, href: "/dashboard/progress", occurredAt: now, metadata: null });
    const existingActivity = await repo.listActivity(userId, { page: 1, limit: 1000 });
    const presentKeys = new Set(events.map((e) => e.eventKey));
    const removeActivityKeys = existingActivity.items.filter((r) => r.category !== "gamification" && !presentKeys.has(r.eventKey)).map((r) => r.eventKey);
    const existingByKey = new Map(existingActivity.items.map((r) => [r.eventKey, r]));
    const activityChanged = activity.some((a) => { const r = existingByKey.get(a.eventKey); return !r || r.points !== a.points; });

    const profile = { totalPoints, level: level.level, timezone: zone, currentStreak: streaks.currentStreak, longestStreak: streaks.longestStreak, lastActivityDay: streaks.lastActivityDay, lastReconciledAt: now };
    const profileChanged = !stored || ["totalPoints", "level", "timezone", "currentStreak", "longestStreak", "lastActivityDay"].some((k) => stored[k] !== profile[k]);
    if (newTx.length || newUnlocks.length || notifications.length || activityChanged || removeActivityKeys.length || profileChanged) {
      await repo.applyLedger(userId, { transactions: newTx, achievements: newUnlocks, activity: activityChanged ? activity : [], removeActivityKeys, notifications, profile });
      if (newTx.length) logger.info("gamification ledger updated", { userId, awards: newTx.filter((t) => t.kind === "award").length, reversals: newTx.filter((t) => t.kind === "reversal").length });
    }
    const achievementRows = newUnlocks.length ? await repo.listAchievements(userId) : snapshot.achievements;
    return { snapshot, events, dayCounts, learningDays, streaks, stats, transactions, totalPoints, level, achievements: evaluateAchievements(stats, achievementRows), achievementRows, tz: zone, todayKey, prefs, profile: { ...(stored ?? {}), ...profile } };
  }

  /** Recompute goal progress; complete reached goals (with a notification). */
  async function syncGoals(userId, ctx) {
    const out = [];
    for (const g of ctx.snapshot.goals) {
      const m = measureGoal(g, ctx.snapshot);
      let row = g;
      const data = {};
      if (GOAL_TYPES[g.goalType]?.measurable && g.currentValue !== m.currentValue) data.currentValue = m.currentValue;
      if (g.status === "active" && m.reached) { data.status = "completed"; data.completedAt = new Date(); if (ctx.prefs.goals) await repo.createNotification(userId, { type: "goal", title: `Goal completed: ${g.title}`, body: `You reached ${g.targetValue} ${m.unit}.`, href: "/dashboard/progress/goals", dedupeKey: `goal:${g.id}` }); }
      if (Object.keys(data).length) row = await repo.updateGoal(g.id, userId, data);
      out.push({ ...row, progress: { ...m, currentValue: GOAL_TYPES[g.goalType]?.measurable ? m.currentValue : row.currentValue, percent: GOAL_TYPES[g.goalType]?.measurable ? m.percent : Math.min(100, Math.round((row.currentValue / Math.max(1, row.targetValue)) * 100)) }, typeLabel: GOAL_TYPES[g.goalType]?.label ?? g.goalType });
    }
    return out;
  }

  async function storeProgressSnapshot(userId, ctx) {
    const score = computeProgressScore(ctx.snapshot);
    const saved = await repo.upsertProgressSnapshot(userId, ctx.todayKey, { overallScore: score.overallScore, dimensions: score.dimensions, coverage: score.coverage, method: score.method });
    const history = (await repo.listProgressSnapshots(userId, { limit: 90 })).filter((s) => s.id !== saved.id);
    // Compare with the snapshot from ≥ 7 days ago when one exists, else the oldest available.
    const weekAgo = history.find((s) => Date.parse(`${s.dayKey}T00:00:00Z`) <= Date.parse(`${ctx.todayKey}T00:00:00Z`) - 7 * DAY) ?? history[history.length - 1] ?? null;
    const all = [...history, saved].sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1));
    return { score, comparison: compareProgress(score, weekAgo), history: all.map((s) => ({ dayKey: s.dayKey, overallScore: s.overallScore, dimensions: (s.dimensions ?? []).map((d) => ({ key: d.key, score: d.score })) })) };
  }

  const txView = (t) => ({ id: t.id, eventKey: t.eventKey, eventType: t.eventType, kind: t.kind, cycle: t.cycle, points: t.points, title: t.title, occurredAt: t.occurredAt, createdAt: t.createdAt });

  return {
    // ── Analytics ───────────────────────────────────────────────────────────
    async overview(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        const progress = await storeProgressSnapshot(req.user.id, ctx);
        res.json({ analytics: overviewAnalytics(ctx.snapshot, ctx.events, { range: req.query.range, tz: ctx.tz }), progress: progress.score, progressComparison: progress.comparison, gamification: { totalPoints: ctx.totalPoints, level: ctx.level, streak: ctx.streaks } });
      } catch (err) { next(err); }
    },
    async careerProgress(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        const progress = await storeProgressSnapshot(req.user.id, ctx);
        res.json({ progress: progress.score, comparison: progress.comparison, history: progress.history, weights: PROGRESS_WEIGHTS });
      } catch (err) { next(err); }
    },
    async skills(req, res, next) { try { res.json({ skills: skillAnalytics(await repo.loadProgressSnapshot(req.user.id)) }); } catch (err) { next(err); } },
    async interviews(req, res, next) { try { const b = rangeBounds(req.query.range); res.json({ range: b.range, from: b.from, to: b.to, interviews: interviewAnalytics(await repo.loadProgressSnapshot(req.user.id), b) }); } catch (err) { next(err); } },
    async resume(req, res, next) { try { const b = rangeBounds(req.query.range); res.json({ range: b.range, from: b.from, to: b.to, resume: resumeAnalytics(await repo.loadProgressSnapshot(req.user.id), b) }); } catch (err) { next(err); } },
    async applications(req, res, next) { try { const b = rangeBounds(req.query.range); res.json({ range: b.range, from: b.from, to: b.to, applications: applicationAnalytics(await repo.loadProgressSnapshot(req.user.id), b, { tz: req.query.tz ?? "UTC" }) }); } catch (err) { next(err); } },

    // ── Gamification ────────────────────────────────────────────────────────
    async gamificationProfile(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        const recentTx = [...ctx.transactions].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 8).map(txView);
        res.json({ profile: { totalPoints: ctx.totalPoints, level: ctx.level, streak: ctx.streaks, timezone: ctx.tz, achievementsUnlocked: ctx.achievements.filter((a) => a.unlocked).length, achievementsTotal: ctx.achievements.length, stats: ctx.stats, recentTransactions: recentTx, notificationPreferences: ctx.prefs, ...GAMIFICATION_VIEW_META }, rules: pointRulesView() });
      } catch (err) { next(err); }
    },
    async updateGamificationProfile(req, res, next) {
      try {
        const data = {};
        if (req.body.timezone) data.timezone = req.body.timezone;
        await repo.updateProfile(req.user.id, data);
        const ctx = await sync(req.user.id, { tz: req.body.timezone });
        res.json({ profile: { totalPoints: ctx.totalPoints, level: ctx.level, streak: ctx.streaks, timezone: ctx.tz } });
      } catch (err) { next(err); }
    },
    async pointsHistory(req, res, next) {
      try {
        await sync(req.user.id, { tz: req.query.tz });
        const { page, limit, eventType } = req.query;
        const { total, items } = await repo.listTransactions(req.user.id, { page, limit, eventType });
        res.json({ transactions: items.map(txView), ...pageMeta(page, limit, total) });
      } catch (err) { next(err); }
    },
    async achievements(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        res.json({ achievements: ctx.achievements.map(({ newlyUnlocked, ...a }) => a), unlocked: ctx.achievements.filter((a) => a.unlocked).length, total: ctx.achievements.length });
      } catch (err) { next(err); }
    },
    async streaks(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        res.json({ streaks: { ...ctx.streaks, timezone: ctx.tz, today: ctx.todayKey, milestones: STREAK_MILESTONES, calendar: activityCalendar(ctx.dayCounts, ctx.todayKey, { weeks: 16 }), weekly: weeklyActivitySummary(ctx.dayCounts, ctx.todayKey, { weeks: 8 }), rules: "A learning day has at least one completed learning task, checkpoint, milestone, mock interview or weekly-plan task (in your timezone). The current streak counts consecutive learning days ending today or yesterday. Missing a day is not a failure — your history and longest streak are kept." } });
      } catch (err) { next(err); }
    },
    async activity(req, res, next) {
      try {
        await sync(req.user.id, { tz: req.query.tz });
        const { page, limit, category } = req.query;
        const { total, items } = await repo.listActivity(req.user.id, { page, limit, category });
        res.json({ activity: items, ...pageMeta(page, limit, total) });
      } catch (err) { next(err); }
    },
    async rules(_req, res) { res.json({ rules: pointRulesView(), ...GAMIFICATION_VIEW_META, achievements: ACHIEVEMENTS.map(({ metric, ...a }) => a), progressWeights: PROGRESS_WEIGHTS }); },

    // ── Goals ───────────────────────────────────────────────────────────────
    async listGoals(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz });
        let goals = await syncGoals(req.user.id, ctx);
        if (req.query.status) goals = goals.filter((g) => g.status === req.query.status);
        res.json({ goals, goalTypes: Object.entries(GOAL_TYPES).map(([key, v]) => ({ key, ...v })) });
      } catch (err) { next(err); }
    },
    async createGoal(req, res, next) {
      try {
        const snapshot = await repo.loadProgressSnapshot(req.user.id);
        const type = GOAL_TYPES[req.body.goalType];
        if (req.body.goalType === "roadmap_completion" && req.body.linkKey && !snapshot.roadmaps.some((r) => r.id === req.body.linkKey)) throw badRequest("Roadmap not found.", [{ field: "linkKey", message: "Unknown roadmap id." }]);
        if (req.body.goalType === "resume_quality" && req.body.linkKey && !snapshot.resumes.some((r) => r.id === req.body.linkKey)) throw badRequest("Resume not found.", [{ field: "linkKey", message: "Unknown resume id." }]);
        const row = await repo.createGoal(req.user.id, { title: req.body.title, description: req.body.description ?? null, goalType: req.body.goalType, linkKey: req.body.linkKey ?? null, targetValue: req.body.targetValue, unit: type.unit, targetDate: req.body.targetDate ?? null });
        const m = measureGoal(row, snapshot);
        const saved = type.measurable && m.currentValue !== row.currentValue ? await repo.updateGoal(row.id, req.user.id, { currentValue: m.currentValue, baselineValue: type.absolute || type.percent ? m.currentValue : 0 }) : row;
        res.status(201).json({ goal: { ...saved, progress: m, typeLabel: type.label } });
      } catch (err) { next(err); }
    },
    async updateGoal(req, res, next) {
      try {
        const g = await repo.findGoal(req.params.goalId, req.user.id);
        const data = {};
        for (const k of ["title", "description", "targetValue", "targetDate", "status"]) if (req.body[k] !== undefined) data[k] = req.body[k];
        if (req.body.currentValue !== undefined) { if (GOAL_TYPES[g.goalType]?.measurable) throw new ApiError(409, "This goal's progress is measured from your records and cannot be set manually.", { code: "GOAL_MEASURED" }); data.currentValue = req.body.currentValue; }
        if (data.status === "completed") data.completedAt = new Date(); else if (data.status) data.completedAt = null;
        const row = await repo.updateGoal(g.id, req.user.id, data);
        const m = measureGoal(row, await repo.loadProgressSnapshot(req.user.id));
        res.json({ goal: { ...row, progress: GOAL_TYPES[row.goalType]?.measurable ? m : { ...m, currentValue: row.currentValue, percent: Math.min(100, Math.round((row.currentValue / Math.max(1, row.targetValue)) * 100)), reached: row.currentValue >= row.targetValue }, typeLabel: GOAL_TYPES[row.goalType]?.label ?? row.goalType } });
      } catch (err) { next(err); }
    },
    async deleteGoal(req, res, next) { try { await repo.deleteGoal(req.params.goalId, req.user.id); res.status(204).end(); } catch (err) { next(err); } },

    // ── Reports ─────────────────────────────────────────────────────────────
    async generateReport(req, res, next) {
      try {
        const ctx = await sync(req.user.id, { tz: req.query.tz ?? req.body.tz });
        const period = reportPeriod(req.body.periodType, { tz: ctx.tz, offset: req.body.offset });
        const existing = await repo.findReportForPeriod(req.user.id, period.periodType, period.periodStart);
        if (existing && !req.body.force && req.body.offset > 0) return res.json({ report: existing, reused: true });
        const metrics = buildReportMetrics(ctx.snapshot, { events: ctx.events, transactions: ctx.transactions, achievements: ctx.achievementRows, period });
        let llm = null;
        try { llm = getLlm(); } catch { llm = null; }
        const { narrative, aiUsed, provider, model } = await narrate(llm, metrics);
        const report = await repo.saveReport(req.user.id, { periodType: period.periodType, periodStart: period.periodStart, periodEnd: period.periodEnd, metrics, narrative, aiUsed, provider, model, method: metrics.method });
        if (ctx.prefs.reports && !existing) await repo.createNotification(req.user.id, { type: "report", title: `${period.periodType === "weekly" ? "Weekly" : "Monthly"} report ready`, body: narrative.summary, href: `/dashboard/progress/reports?report=${report.id}`, dedupeKey: `report:${report.id}` });
        res.status(existing ? 200 : 201).json({ report, reused: false });
      } catch (err) { next(err); }
    },
    async listReports(req, res, next) {
      try { const { page, limit, periodType } = req.query; const { total, items } = await repo.listReports(req.user.id, { page, limit, periodType }); res.json({ reports: items.map((r) => ({ ...r, summary: r.narrative?.summary ?? null, narrative: undefined })), ...pageMeta(page, limit, total) }); } catch (err) { next(err); }
    },
    async getReport(req, res, next) { try { res.json({ report: await repo.findReport(req.params.reportId, req.user.id) }); } catch (err) { next(err); } },
    async reportPdf(req, res, next) {
      try {
        const report = await repo.findReport(req.params.reportId, req.user.id);
        const buffer = await renderReportPdf(report, { userEmail: req.user.email });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="progress-report-${report.periodType}-${new Date(report.periodStart).toISOString().slice(0, 10)}.pdf"`);
        res.setHeader("Content-Length", String(buffer.length));
        res.end(buffer);
      } catch (err) { next(err); }
    },

    // ── Notifications ───────────────────────────────────────────────────────
    async listNotifications(req, res, next) {
      try {
        await sync(req.user.id, { tz: req.query.tz });
        const { page, limit, unread } = req.query;
        const { total, unread: unreadCount, items } = await repo.listNotifications(req.user.id, { page, limit, unreadOnly: unread });
        res.json({ notifications: items, unread: unreadCount, ...pageMeta(page, limit, total) });
      } catch (err) { next(err); }
    },
    async markRead(req, res, next) { try { const { row } = await repo.markRead(req.params.notificationId, req.user.id); res.json({ notification: row }); } catch (err) { next(err); } },
    async markAllRead(req, res, next) { try { res.json({ updated: await repo.markAllRead(req.user.id) }); } catch (err) { next(err); } },
    async getPreferences(req, res, next) { try { res.json({ preferences: prefsOf(await repo.ensureProfile(req.user.id)) }); } catch (err) { next(err); } },
    async updatePreferences(req, res, next) {
      try {
        const current = prefsOf(await repo.ensureProfile(req.user.id));
        const next_ = { ...current, ...req.body };
        await repo.updateProfile(req.user.id, { notificationPreferences: next_ });
        res.json({ preferences: next_ });
      } catch (err) { next(err); }
    },
  };
}
