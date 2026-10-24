/**
 * activityEventService.js — derives the list of *eligible* career-development events
 * from persisted records. Pure. Nothing here is accepted from the client: every event
 * points at a row that already exists (task, session, version, application …), so a
 * reward can only follow a successfully persisted activity, and deleting / reopening the
 * row makes the event disappear, which the ledger turns into a reversal.
 *
 * Event keys are stable (`<type>:<rowId>`), which is what makes awards idempotent.
 */
import { milestoneStatuses, roadmapProgress } from "../learning/learningProgressService.js";
import { POINT_RULES, STREAK_QUALIFYING_TYPES } from "./progressConfig.js";
import { localDayKey, isoWeekKey, addDays, weekStartKey } from "./streakService.js";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const date = (v) => (v ? new Date(v) : null);

function ev(type, id, occurredAt, title, extra = {}) {
  const rule = POINT_RULES[type];
  return { eventKey: `${type}:${id}`, eventType: type, points: rule?.points ?? 0, basePoints: rule?.points ?? 0, category: rule?.category ?? "career", title, occurredAt: occurredAt instanceof Date ? occurredAt : new Date(occurredAt), sourceType: extra.sourceType ?? type, sourceId: String(id), href: extra.href ?? null, metadata: extra.metadata ?? null };
}

/** Baseline for a resume version: the original version of the same upload, else its parent. */
export function resumeBaseline(version, versions) {
  const byId = new Map(versions.map((v) => [v.id, v]));
  if (version.resumeId) {
    const original = versions.find((v) => v.resumeId === version.resumeId && v.isOriginal && num(v.lastQualityScore));
    if (original && original.id !== version.id) return { score: original.lastQualityScore, source: "original" };
  }
  const parent = version.parentVersionId ? byId.get(version.parentVersionId) : null;
  if (parent && num(parent.lastQualityScore)) return { score: parent.lastQualityScore, source: "parent" };
  return null;
}

/**
 * @param {object} snapshot  from progressRepository.loadProgressSnapshot
 * @param {{ tz?: string, now?: Date }} opts
 * @returns {{ events: object[], learningDays: string[], dayCounts: Map<string, number> }}
 */
export function deriveEvents(snapshot, { tz = "UTC", now = new Date() } = {}) {
  const events = [];

  // ── Analyses ──
  for (const a of snapshot.analyses ?? []) if (a.analysisMode === "ai") events.push(ev("resume_analysis_run", a.id, a.createdAt, `Analysed resume for ${a.jobTitle}`, { href: `/dashboard/resume-analysis/${a.id}` }));

  // ── Resume improvements ──
  const versions = snapshot.versions ?? [];
  for (const v of versions) {
    if (v.isOriginal || !num(v.lastQualityScore)) continue;
    const base = resumeBaseline(v, versions);
    const rule = POINT_RULES.resume_improved;
    const eligible = base ? v.lastQualityScore - base.score >= rule.minDelta : v.lastQualityScore >= rule.minAbsolute;
    if (eligible) events.push(ev("resume_improved", v.id, v.updatedAt, `Improved “${v.name}” to quality ${v.lastQualityScore}${base ? ` (from ${base.score})` : ""}`, { href: `/dashboard/resume-builder/${v.id}`, metadata: { score: v.lastQualityScore, baseline: base?.score ?? null } }));
  }

  // ── Interviews ──
  for (const s of snapshot.interviews ?? []) {
    if (s.status !== "completed" || s.source !== "mock_interview") continue;
    const evaluated = (s.answers ?? []).filter((a) => a.status === "evaluated" && num(a.score)).length;
    const when = s.completedAt ?? s.updatedAt;
    const coding = s.interviewType === "coding";
    const rule = coding ? POINT_RULES.coding_session_completed : POINT_RULES.interview_completed;
    if (evaluated < rule.minEvaluated) continue;
    events.push(ev(coding ? "coding_session_completed" : "interview_completed", s.id, when, `${coding ? "Completed a coding session" : "Finished a mock interview"} for ${s.targetRole}${num(s.score) ? ` (${s.score}%)` : ""}`, { href: `/dashboard/interviews/${s.id}/report`, metadata: { score: s.score ?? null, evaluated, interviewType: s.interviewType } }));
    if (num(s.score) && s.score >= POINT_RULES.interview_strong_score.minScore) events.push(ev("interview_strong_score", s.id, when, `Scored ${s.score}% in a ${s.interviewType} interview`, { href: `/dashboard/interviews/${s.id}/report` }));
  }

  // ── Learning (skip superseded roadmaps; dedupe tasks copied between versions by signature) ──
  const seenTask = new Set();
  for (const rm of (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded")) {
    const statuses = milestoneStatuses(rm);
    const progress = roadmapProgress(rm);
    for (const m of rm.milestones ?? []) {
      let lastTaskDone = null;
      for (const t of m.tasks ?? []) {
        if (t.status !== "completed" || !t.completedAt) continue;
        const sig = `${t.skillName}|${t.title}|${new Date(t.completedAt).getTime()}`;
        if (seenTask.has(sig)) continue;
        seenTask.add(sig);
        const d = date(t.completedAt);
        if (!lastTaskDone || d > lastTaskDone) lastTaskDone = d;
        events.push(ev(t.isRequired === false ? "learning_optional_task_completed" : "learning_task_completed", t.id, d, `Completed “${t.title}” (${t.skillName})`, { href: `/dashboard/learning/${rm.id}`, metadata: { roadmapId: rm.id, skillName: t.skillName, taskType: t.taskType } }));
        const attempts = Array.isArray(t.checkpointAttempts) ? t.checkpointAttempts : [];
        const pass = attempts.find((a) => a.passed && a.verified);
        if (t.checkpoint && pass) events.push(ev("checkpoint_passed", t.id, pass.at ?? d, `Passed the checkpoint for “${t.title}”`, { href: `/dashboard/learning/${rm.id}`, metadata: { roadmapId: rm.id, score: pass.score ?? null } }));
      }
      const st = statuses.get(m.id);
      if (st?.status === "completed" && (m.completedAt || lastTaskDone)) events.push(ev("milestone_completed", m.id, m.completedAt ?? lastTaskDone, `Completed milestone “${m.title}”`, { href: `/dashboard/learning/${rm.id}`, metadata: { roadmapId: rm.id } }));
    }
    if (progress.requiredTasks > 0 && progress.percent === 100) {
      const last = (rm.milestones ?? []).flatMap((m) => m.tasks ?? []).map((t) => date(t.completedAt)).filter(Boolean).sort((a, b) => b - a)[0];
      if (last) events.push(ev("roadmap_completed", rm.id, last, `Finished the roadmap “${rm.title}”`, { href: `/dashboard/learning/${rm.id}` }));
    }
  }

  // ── Applications ──
  for (const a of snapshot.applications ?? []) {
    if (a.status !== "INTERESTED" && a.status !== "WITHDRAWN") events.push(ev("application_submitted", a.id, a.applicationDate ?? a.createdAt, `Applied to ${a.companyName} — ${a.jobTitle}`, { href: "/dashboard/applications" }));
    if (a.status === "INTERVIEW" || a.status === "OFFER") events.push(ev("application_interview_stage", a.id, a.updatedAt, `${a.companyName}: ${a.status === "OFFER" ? "offer received" : "interview stage"}`, { href: "/dashboard/applications" }));
  }

  // ── Career coach ──
  for (const as of snapshot.assessments ?? []) events.push(ev("career_assessment_completed", as.id, as.createdAt, `Ran a readiness assessment for ${as.targetRole}${num(as.overallScore) && as.readinessLabel !== "Insufficient evidence" ? ` (${as.overallScore})` : ""}`, { href: "/dashboard/career/assessment" }));
  for (const p of snapshot.plans ?? []) {
    const tasks = p.tasks ?? [];
    let last = null;
    for (const t of tasks) {
      if (t.status !== "done" || !t.completedAt) continue;
      const d = date(t.completedAt);
      if (!last || d > last) last = d;
      events.push(ev("plan_task_completed", t.id, d, `Completed plan task “${t.title}”`, { href: "/dashboard/career/plan" }));
    }
    const required = tasks.filter((t) => !t.isOptional);
    if (required.length && required.every((t) => t.status === "done") && last) events.push(ev("weekly_plan_completed", p.id, last, `Completed the weekly plan of ${new Date(p.weekStart).toISOString().slice(0, 10)}`, { href: "/dashboard/career/plan" }));
  }

  // ── Learning days & consistency weeks ──
  const dayCounts = new Map();
  for (const e of events) {
    if (!STREAK_QUALIFYING_TYPES.has(e.eventType)) continue;
    const k = localDayKey(e.occurredAt, tz);
    if (k) dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }
  const learningDays = [...dayCounts.keys()].sort();
  const byWeek = new Map();
  for (const d of learningDays) { const w = isoWeekKey(d); byWeek.set(w, [...(byWeek.get(w) ?? []), d]); }
  for (const [week, days] of byWeek) {
    if (days.length >= POINT_RULES.consistency_week.minActiveDays) {
      const third = days[POINT_RULES.consistency_week.minActiveDays - 1];
      events.push(ev("consistency_week", week, new Date(`${third}T12:00:00.000Z`), `Learned on ${days.length} days in week ${week.slice(-3)}`, { metadata: { days } }));
    }
  }

  // ── Daily caps: later events of a type on the same local day earn 0 (still listed as activity) ──
  events.sort((a, b) => a.occurredAt - b.occurredAt);
  const perDay = new Map();
  for (const e of events) {
    const cap = POINT_RULES[e.eventType]?.dailyCap;
    if (!cap) continue;
    const k = `${e.eventType}|${localDayKey(e.occurredAt, tz)}`;
    const n = (perDay.get(k) ?? 0) + 1;
    perDay.set(k, n);
    if (n > cap) { e.points = 0; e.capped = true; }
  }
  // Future-dated records (clock skew / manual dates) never earn points.
  for (const e of events) if (e.occurredAt > new Date(now.getTime() + 86_400_000)) { e.points = 0; e.capped = true; }

  return { events, learningDays, dayCounts, weekStart: weekStartKey(localDayKey(now, tz)), addDays };
}

/** Aggregate counts used by achievements and the gamification profile. */
export function computeStats(events, { longestStreak = 0 } = {}) {
  const count = (t) => events.filter((e) => e.eventType === t).length;
  return {
    analyses: count("resume_analysis_run"),
    resumeImprovements: count("resume_improved"),
    interviewsCompleted: count("interview_completed") + count("coding_session_completed"),
    codingSessions: count("coding_session_completed"),
    strongInterviews: count("interview_strong_score"),
    milestonesCompleted: count("milestone_completed"),
    learningTasksCompleted: count("learning_task_completed") + count("learning_optional_task_completed"),
    checkpointsPassed: count("checkpoint_passed"),
    roadmapsCompleted: count("roadmap_completed"),
    applicationsSubmitted: count("application_submitted"),
    applicationsInterviewStage: count("application_interview_stage"),
    plansCompleted: count("weekly_plan_completed"),
    planTasksCompleted: count("plan_task_completed"),
    assessments: count("career_assessment_completed"),
    consistencyWeeks: count("consistency_week"),
    longestStreak,
  };
}
