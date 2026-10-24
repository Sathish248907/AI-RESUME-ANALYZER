/**
 * analyticsService.js — advanced career analytics from persisted records. Pure.
 *
 * Every metric states its denominator; `null` means "no data", never zero. Period
 * comparison uses the immediately preceding window of the same length and is only
 * reported when both windows contain data.
 */
import { roadmapProgress } from "../learning/learningProgressService.js";
import { classifyTopics, toEvidence, aggregateTopics } from "../interview/weakTopicService.js";
import { ANALYTICS_RANGES, MIN_SAMPLE_FOR_RATES, ANALYTICS_METHOD } from "./progressConfig.js";
import { localDayKey, weekStartKey, addDays, dayDiff } from "./streakService.js";

const DAY = 86_400_000;
const num = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

export function rangeBounds(range = "30d", now = new Date()) {
  const days = range in ANALYTICS_RANGES ? ANALYTICS_RANGES[range] : 30;
  if (days === null) return { range, from: null, to: now, prevFrom: null, prevTo: null, days: null };
  const from = new Date(now.getTime() - days * DAY);
  return { range, from, to: now, prevFrom: new Date(from.getTime() - days * DAY), prevTo: from, days };
}
const within = (d, from, to) => { if (!d) return false; const t = new Date(d).getTime(); return (from === null || t >= from.getTime()) && t <= to.getTime(); };
const inCurrent = (b) => (d) => within(d, b.from, b.to);
const inPrev = (b) => (d) => b.prevFrom !== null && within(d, b.prevFrom, b.prevTo);

function comparison(current, previous, { higherIsBetter = true } = {}) {
  if (!num(current) || !num(previous)) return { previous: num(previous) ? previous : null, delta: null, direction: null };
  const delta = current - previous;
  return { previous, delta, direction: delta === 0 ? "flat" : (delta > 0) === higherIsBetter ? "better" : "worse" };
}

/** Bucket event timestamps into weeks (last `weeks`) and months (last `months`). */
export function activitySummaries(events, { tz = "UTC", now = new Date(), weeks = 8, months = 6 } = {}) {
  const today = localDayKey(now, tz);
  const weekly = [];
  let ws = weekStartKey(today);
  for (let i = 0; i < weeks; i++) { weekly.unshift({ weekStart: ws, weekEnd: addDays(ws, 6), events: 0, points: 0, byCategory: {} }); ws = addDays(ws, -7); }
  const monthly = [];
  let [y, m] = today.split("-").map(Number);
  for (let i = 0; i < months; i++) { monthly.unshift({ month: `${y}-${String(m).padStart(2, "0")}`, events: 0, points: 0, byCategory: {} }); m -= 1; if (m === 0) { m = 12; y -= 1; } }
  for (const e of events) {
    const k = localDayKey(e.occurredAt, tz);
    if (!k) continue;
    const w = weekly.find((x) => dayDiff(x.weekStart, k) >= 0 && dayDiff(k, x.weekEnd) >= 0);
    if (w) { w.events++; w.points += e.points ?? 0; w.byCategory[e.category] = (w.byCategory[e.category] ?? 0) + 1; }
    const mo = monthly.find((x) => x.month === k.slice(0, 7));
    if (mo) { mo.events++; mo.points += e.points ?? 0; mo.byCategory[e.category] = (mo.byCategory[e.category] ?? 0) + 1; }
  }
  return { weekly, monthly };
}

// ── Resume ─────────────────────────────────────────────────────────────────
export function resumeAnalytics(snapshot, b) {
  const versions = (snapshot.versions ?? []).filter((v) => num(v.lastQualityScore)).sort((a, c) => new Date(a.updatedAt) - new Date(c.updatedAt));
  const qualityTrend = versions.map((v) => ({ date: v.updatedAt, score: v.lastQualityScore, name: v.name, kind: v.kind, isOriginal: v.isOriginal, versionId: v.id }));
  const ai = (snapshot.analyses ?? []).filter((a) => a.analysisMode === "ai" && num(a.matchScore)).sort((a, c) => new Date(a.createdAt) - new Date(c.createdAt));
  const matchTrend = ai.map((a) => ({ date: a.createdAt, score: a.matchScore, jobTitle: a.jobTitle, companyName: a.companyName, targetRole: a.targetRole, analysisId: a.id }));
  const cur = ai.filter((a) => inCurrent(b)(a.createdAt)), prev = ai.filter((a) => inPrev(b)(a.createdAt));
  const curV = versions.filter((v) => inCurrent(b)(v.updatedAt)), prevV = versions.filter((v) => inPrev(b)(v.updatedAt));
  const byRole = {};
  for (const a of ai) { const k = a.targetRole || "Unspecified"; (byRole[k] ??= []).push(a.matchScore); }
  return {
    qualityTrend, matchTrend,
    quality: { best: versions.length ? Math.max(...versions.map((v) => v.lastQualityScore)) : null, latest: versions.at(-1)?.lastQualityScore ?? null, versions: versions.length, originalBaseline: versions.find((v) => v.isOriginal)?.lastQualityScore ?? null, editedInRange: curV.length, ...comparison(mean(curV.map((v) => v.lastQualityScore)), mean(prevV.map((v) => v.lastQualityScore))) },
    match: { analyses: ai.length, analysesInRange: cur.length, average: mean(cur.map((a) => a.matchScore)), best: cur.length ? Math.max(...cur.map((a) => a.matchScore)) : null, ...comparison(mean(cur.map((a) => a.matchScore)), mean(prev.map((a) => a.matchScore))), byRole: Object.entries(byRole).map(([role, scores]) => ({ role, analyses: scores.length, average: mean(scores) })).sort((x, y) => y.analyses - x.analyses).slice(0, 8) },
    uploads: (snapshot.resumes ?? []).length,
    definitions: { quality: "Resume Builder quality score (0–100) of each saved version at its last edit.", match: "AI job-match score (0–100) per analysis; the average covers analyses created in the selected range." },
  };
}

// ── Interviews ─────────────────────────────────────────────────────────────
function interviewAnswers(sessions) {
  return sessions.flatMap((s) => { const q = new Map((s.questions ?? []).map((x) => [x.id, x])); return (s.answers ?? []).map((a) => ({ ...a, question: q.get(a.questionId) })); });
}
export function interviewAnalytics(snapshot, b) {
  const all = (snapshot.interviews ?? []).filter((s) => s.source === "mock_interview");
  const completed = all.filter((s) => s.status === "completed").sort((x, y) => new Date(x.completedAt ?? x.updatedAt) - new Date(y.completedAt ?? y.updatedAt));
  const scored = completed.filter((s) => num(s.score));
  const trend = scored.map((s) => ({ date: s.completedAt ?? s.updatedAt, score: s.score, type: s.interviewType, role: s.targetRole, sessionId: s.id, evaluatedAnswers: (s.answers ?? []).filter((a) => a.status === "evaluated").length }));
  const cur = scored.filter((s) => inCurrent(b)(s.completedAt ?? s.updatedAt)), prev = scored.filter((s) => inPrev(b)(s.completedAt ?? s.updatedAt));
  const byType = {};
  for (const s of scored) (byType[s.interviewType] ??= []).push(s.score);
  const { weak, strong, candidates } = classifyTopics(toEvidence(interviewAnswers(completed)));
  const coding = completed.filter((s) => s.interviewType === "coding");
  return {
    trend,
    sessions: { total: all.length, completed: completed.length, inRange: cur.length, abandoned: all.filter((s) => s.status === "abandoned").length, inProgress: all.filter((s) => s.status === "in_progress").length },
    score: { average: mean(cur.map((s) => s.score)), best: cur.length ? Math.max(...cur.map((s) => s.score)) : null, ...comparison(mean(cur.map((s) => s.score)), mean(prev.map((s) => s.score))) },
    byType: Object.entries(byType).map(([type, scores]) => ({ type, sessions: scores.length, average: mean(scores) })),
    weakTopics: weak.slice(0, 6).map((t) => ({ topic: t.topic, mean: t.mean, attempts: t.attempts })),
    strongTopics: strong.slice(0, 6).map((t) => ({ topic: t.topic, mean: t.mean, attempts: t.attempts })),
    candidateTopics: candidates.slice(0, 4).map((t) => ({ topic: t.topic, mean: t.mean })),
    coding: coding.length ? { sessions: coding.length, average: mean(coding.filter((s) => num(s.score)).map((s) => s.score)) } : null,
    definitions: { score: "Mean of evaluated answer scores per completed mock interview (0–100). Averages cover interviews completed in the selected range.", weak: "A topic is weak after ≥ 2 evaluated attempts with a mean below 60 (or 3 attempts whose latest two are below 50)." },
  };
}

// ── Skills ─────────────────────────────────────────────────────────────────
const normSkill = (s) => String(s ?? "").trim().toLowerCase();
export function skillAnalytics(snapshot, { now = new Date() } = {}) {
  const skills = new Map();
  const get = (name) => { const k = normSkill(name); if (!k) return null; if (!skills.has(k)) skills.set(k, { key: k, skillName: String(name).trim(), status: "not_assessed", sources: [], evidence: [], lastAssessedAt: null, interview: null, learning: { completedTasks: 0, totalTasks: 0, roadmapId: null }, history: [], links: [] }); return skills.get(k); };
  const touch = (s, at) => { if (at && (!s.lastAssessedAt || new Date(at) > new Date(s.lastAssessedAt))) s.lastAssessedAt = at; };

  for (const g of snapshot.skillGaps ?? []) {
    const s = get(g.skillName); if (!s) continue;
    s.status = g.proficiencyStatus; s.priority = g.priority; s.category = g.category; s.userConfirmed = g.userConfirmed;
    s.sources.push({ source: "skill_gap", method: "skill-gap-1.0", date: g.lastAssessedAt ?? g.updatedAt, detail: g.userConfirmed ? "Confirmed by you" : (g.evidenceSources ?? []).join(", ") || g.explanation?.slice(0, 120) });
    touch(s, g.lastAssessedAt ?? g.updatedAt);
    s.links.push({ label: "Skill gap analysis", href: "/dashboard/learning/skill-gaps" });
  }
  const sessions = (snapshot.interviews ?? []).filter((s) => s.status === "completed" && s.source === "mock_interview");
  const topics = aggregateTopics(toEvidence(interviewAnswers(sessions)));
  for (const t of topics) {
    const s = get(t.topic); if (!s) continue;
    const scoresByTime = interviewAnswers(sessions).filter((a) => normSkill(a.question?.topic) === s.key && num(a.score)).sort((x, y) => new Date(x.evaluatedAt ?? 0) - new Date(y.evaluatedAt ?? 0)).map((a) => a.score);
    const half = Math.floor(scoresByTime.length / 2);
    const earlier = scoresByTime.slice(0, half), later = scoresByTime.slice(half);
    const improvement = earlier.length && later.length ? mean(later) - mean(earlier) : null;
    s.interview = { attempts: t.attempts, mean: t.mean, best: t.best, improvement };
    s.sources.push({ source: "mock_interview", method: "answer-evaluation", date: new Date(t.latest).toISOString(), detail: `${t.attempts} evaluated answer${t.attempts === 1 ? "" : "s"}, mean ${t.mean}%` });
    touch(s, new Date(t.latest).toISOString());
    s.links.push({ label: "Practise in a mock interview", href: "/dashboard/interviews/new" });
  }
  for (const rm of (snapshot.roadmaps ?? []).filter((r) => r.status === "active")) for (const m of rm.milestones ?? []) for (const t of m.tasks ?? []) {
    const s = get(t.skillName); if (!s) continue;
    s.learning.totalTasks++; if (t.status === "completed") s.learning.completedTasks++; s.learning.roadmapId = rm.id;
    if (t.status === "completed" && t.completedAt) { s.sources.push({ source: "learning_task", method: "task-completion", date: t.completedAt, detail: `Completed “${t.title}”` }); touch(s, t.completedAt); }
    if (!s.links.some((l) => l.href === `/dashboard/learning/${rm.id}`)) s.links.push({ label: "Learning roadmap", href: `/dashboard/learning/${rm.id}` });
  }
  for (const a of (snapshot.assessments ?? []).slice().sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))) for (const sk of Array.isArray(a.skills) ? a.skills : []) {
    const s = get(sk.skillName); if (!s) continue;
    s.history.push({ date: a.createdAt, status: sk.status, score: sk.score ?? null, source: "career_assessment", targetRole: a.targetRole });
  }
  const list = [...skills.values()].map((s) => {
    const recentImprovement = (s.interview?.improvement ?? 0) >= 10 || (s.history.length >= 2 && s.history.at(-1).status === "demonstrated" && s.history.at(-2).status !== "demonstrated");
    const bucket = s.status === "demonstrated" ? "demonstrated" : s.status === "not_assessed" && !s.interview && s.learning.totalTasks === 0 ? "not_assessed" : "needs_practice";
    const notes = [];
    if (s.status === "not_demonstrated" && s.sources.every((x) => x.source === "skill_gap")) notes.push("Only resume keyword evidence — a missing keyword does not prove the skill is absent.");
    if (s.interview && s.sources.some((x) => x.source === "skill_gap")) notes.push("Interview scores and resume evidence use different methods; compare trends, not absolute values.");
    if (s.interview?.improvement >= 10) notes.push("Improved assessment results show practice progress, not confirmed real-world proficiency.");
    const links = s.links.filter((l, i, arr) => arr.findIndex((x) => x.href === l.href) === i);
    return { ...s, bucket, recentImprovement, notes, links };
  });
  const byBucket = (k) => list.filter((s) => s.bucket === k).sort((a, c) => (c.lastAssessedAt ? new Date(c.lastAssessedAt).getTime() : 0) - (a.lastAssessedAt ? new Date(a.lastAssessedAt).getTime() : 0));
  return {
    method: ANALYTICS_METHOD,
    totals: { tracked: list.length, demonstrated: byBucket("demonstrated").length, needsPractice: byBucket("needs_practice").length, notAssessed: byBucket("not_assessed").length, improving: list.filter((s) => s.recentImprovement).length },
    demonstrated: byBucket("demonstrated"), needsPractice: byBucket("needs_practice"), notAssessed: byBucket("not_assessed"), improving: list.filter((s) => s.recentImprovement),
    assessmentHistory: (snapshot.assessments ?? []).slice().sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)).map((a) => ({ date: a.createdAt, targetRole: a.targetRole, demonstrated: (Array.isArray(a.skills) ? a.skills : []).filter((s) => s.status === "demonstrated").length, total: Array.isArray(a.skills) ? a.skills.length : 0 })),
    definitions: { status: "Skill status comes from the skill-gap analysis (resume + analyses), mock-interview topic scores and roadmap task completion. Sources and dates are listed per skill; methods are not directly comparable.", improving: "Later interview answers average ≥ 10 points above earlier ones, or an assessment moved the skill to demonstrated." },
    generatedAt: now.toISOString(),
  };
}

// ── Applications funnel ────────────────────────────────────────────────────
const STAGES = ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
const STAGE_RANK = { INTERESTED: 0, APPLIED: 1, ASSESSMENT: 2, INTERVIEW: 3, OFFER: 4 };
export function applicationAnalytics(snapshot, b, { tz = "UTC", now = new Date() } = {}) {
  const apps = snapshot.applications ?? [];
  const inRange = apps.filter((a) => b.from === null || inCurrent(b)(a.applicationDate ?? a.createdAt) || inCurrent(b)(a.updatedAt));
  const byStatus = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  // Reached-stage counts: an application at INTERVIEW has also "reached" APPLIED and ASSESSMENT is unknown (skipped stages allowed) → count ≥ rank.
  const submitted = apps.filter((a) => a.status !== "INTERESTED" && a.status !== "WITHDRAWN");
  const reached = (stage) => submitted.filter((a) => (STAGE_RANK[a.status] ?? -1) >= STAGE_RANK[stage] || (a.status === "REJECTED" && stage === "APPLIED")).length;
  const funnel = [
    { stage: "Saved", key: "INTERESTED", count: apps.length, definition: "All tracked applications (any status)." },
    { stage: "Applied", key: "APPLIED", count: submitted.length, definition: "Status beyond Interested, excluding withdrawn (rejected included)." },
    { stage: "Assessment", key: "ASSESSMENT", count: reached("ASSESSMENT"), definition: "Currently at Assessment, Interview or Offer." },
    { stage: "Interview", key: "INTERVIEW", count: reached("INTERVIEW"), definition: "Currently at Interview or Offer." },
    { stage: "Offer", key: "OFFER", count: byStatus.OFFER, definition: "Currently at Offer." },
  ];
  const enough = submitted.length >= MIN_SAMPLE_FOR_RATES;
  const responded = submitted.filter((a) => ["ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED"].includes(a.status));
  const rates = {
    sampleSize: submitted.length, minSample: MIN_SAMPLE_FOR_RATES, available: enough,
    responseRate: enough ? pct(responded.length, submitted.length) : null,
    interviewRate: enough ? pct(reached("INTERVIEW"), submitted.length) : null,
    offerRate: enough ? pct(byStatus.OFFER, submitted.length) : null,
    appliedToInterview: enough ? pct(reached("INTERVIEW"), submitted.length) : null,
    interviewToOffer: reached("INTERVIEW") >= 3 ? pct(byStatus.OFFER, reached("INTERVIEW")) : null,
    definitions: { responseRate: "Applications whose status moved to Assessment, Interview, Offer or Rejected ÷ submitted applications.", interviewRate: "Applications currently at Interview or Offer ÷ submitted applications.", offerRate: "Applications at Offer ÷ submitted applications.", interviewToOffer: "Offers ÷ applications that reached Interview (needs ≥ 3).", caveat: `Rates are hidden until ${MIN_SAMPLE_FOR_RATES} applications have been submitted. Active applications are not failures; incomplete records are not rejections.` },
  };
  // Response time: days between application date and the last status change for responded applications (approximation: updatedAt).
  const responseDays = responded.filter((a) => a.applicationDate && a.updatedAt && new Date(a.updatedAt) > new Date(a.applicationDate)).map((a) => Math.round((new Date(a.updatedAt) - new Date(a.applicationDate)) / DAY));
  const responseTime = responseDays.length >= 3 ? { sampleSize: responseDays.length, medianDays: median(responseDays), meanDays: mean(responseDays), caveat: "Approximated from the last status update of each responded application; the exact response date is not recorded." } : { sampleSize: responseDays.length, medianDays: null, meanDays: null, caveat: "Needs at least 3 responded applications." };
  // Over time (weekly buckets of applicationDate, last 12 weeks or range).
  const today = localDayKey(now, tz);
  const weeks = [];
  let ws = weekStartKey(today);
  const n = b.days ? Math.max(4, Math.ceil(b.days / 7)) : 12;
  for (let i = 0; i < n; i++) { weeks.unshift({ weekStart: ws, applications: 0, submitted: 0 }); ws = addDays(ws, -7); }
  for (const a of apps) { const k = localDayKey(a.applicationDate ?? a.createdAt, tz); const w = weeks.find((x) => dayDiff(x.weekStart, k) >= 0 && dayDiff(k, addDays(x.weekStart, 6)) >= 0); if (w) { w.applications++; if (a.status !== "INTERESTED" && a.status !== "WITHDRAWN") w.submitted++; } }
  const group = (fn) => { const m = new Map(); for (const a of apps) { const k = fn(a) || "Unspecified"; const g = m.get(k) ?? { key: k, total: 0, submitted: 0, interviews: 0, offers: 0 }; g.total++; if (!["INTERESTED", "WITHDRAWN"].includes(a.status)) g.submitted++; if (["INTERVIEW", "OFFER"].includes(a.status)) g.interviews++; if (a.status === "OFFER") g.offers++; m.set(k, g); } return [...m.values()].sort((x, y) => y.total - x.total).slice(0, 10); };
  const jdRole = new Map((snapshot.jobDescriptions ?? []).map((j) => [j.id, j.targetRole]));
  const prevSubmitted = apps.filter((a) => inPrev(b)(a.applicationDate ?? a.createdAt) && !["INTERESTED", "WITHDRAWN"].includes(a.status)).length;
  const curSubmitted = apps.filter((a) => inCurrent(b)(a.applicationDate ?? a.createdAt) && !["INTERESTED", "WITHDRAWN"].includes(a.status)).length;
  return {
    total: apps.length, inRange: inRange.length, byStatus, funnel, rates, responseTime, overTime: weeks,
    submittedInRange: { current: curSubmitted, ...comparison(curSubmitted, b.prevFrom ? prevSubmitted : null) },
    byRole: group((a) => jdRole.get(a.jobDescriptionId) ?? (snapshot.analyses ?? []).find((x) => x.id === a.analysisId)?.targetRole ?? null),
    byCompany: group((a) => a.companyName),
    active: apps.filter((a) => ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"].includes(a.status)).length,
  };
}
function median(xs) { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

// ── Learning & readiness ───────────────────────────────────────────────────
export function learningAnalytics(snapshot, b) {
  const roadmaps = (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded");
  const tasks = roadmaps.flatMap((r) => (r.milestones ?? []).flatMap((m) => (m.tasks ?? []).map((t) => ({ ...t, roadmapId: r.id }))));
  const done = tasks.filter((t) => t.status === "completed" && t.completedAt);
  const cur = done.filter((t) => inCurrent(b)(t.completedAt)).length, prev = done.filter((t) => inPrev(b)(t.completedAt)).length;
  const minutes = done.filter((t) => inCurrent(b)(t.completedAt)).reduce((s, t) => s + (t.actualStudyMinutes ?? 0), 0);
  return {
    roadmaps: roadmaps.map((r) => { const p = roadmapProgress(r); return { id: r.id, title: r.title, targetRole: r.targetRole, status: r.status, percent: p.percent, completedTasks: p.completedTasks, requiredTasks: p.requiredTasks, completedMilestones: p.completedMilestones, totalMilestones: p.totalMilestones, studiedMinutes: p.studiedMinutes }; }),
    tasksCompleted: { current: cur, ...comparison(cur, b.prevFrom ? prev : null) },
    studyMinutesInRange: minutes,
    checkpointsPassed: tasks.filter((t) => Array.isArray(t.checkpointAttempts) && t.checkpointAttempts.some((a) => a.passed && a.verified)).length,
  };
}
export function readinessHistory(snapshot) {
  return (snapshot.assessments ?? []).slice().sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)).map((a) => ({ id: a.id, date: a.createdAt, targetRole: a.targetRole, score: a.readinessLabel === "Insufficient evidence" ? null : a.overallScore, label: a.readinessLabel }));
}

/** Everything the overview page needs, in one object. */
export function overviewAnalytics(snapshot, events, { range = "30d", tz = "UTC", now = new Date() } = {}) {
  const b = rangeBounds(range, now);
  const inRangeEvents = events.filter((e) => inCurrent(b)(e.occurredAt));
  const prevEvents = events.filter((e) => inPrev(b)(e.occurredAt));
  const countType = (list, ...types) => list.filter((e) => types.includes(e.eventType)).length;
  const kpi = (label, types, def) => { const c = countType(inRangeEvents, ...types), p = countType(prevEvents, ...types); return { label, current: c, ...comparison(c, b.prevFrom && prevEvents.length ? p : null), definition: def }; };
  return {
    method: ANALYTICS_METHOD, range: b.range, from: b.from, to: b.to, previousFrom: b.prevFrom, previousTo: b.prevTo,
    kpis: [
      kpi("Learning tasks completed", ["learning_task_completed", "learning_optional_task_completed"], "Roadmap tasks marked complete in the range."),
      kpi("Mock interviews finished", ["interview_completed", "coding_session_completed"], "Completed sessions with enough evaluated answers."),
      kpi("Resume versions improved", ["resume_improved"], "Versions whose quality rose 5+ points over their baseline."),
      kpi("Applications submitted", ["application_submitted"], "Applications whose status moved beyond Interested."),
    ],
    activity: activitySummaries(events, { tz, now }),
    resume: resumeAnalytics(snapshot, b), interviews: interviewAnalytics(snapshot, b), learning: learningAnalytics(snapshot, b), applications: applicationAnalytics(snapshot, b, { tz, now }), readiness: readinessHistory(snapshot),
    emptyState: events.length === 0 ? "No activity recorded yet. Analyse a resume, finish a mock interview or complete a learning task to start building analytics." : null,
    generatedAt: now.toISOString(),
  };
}
