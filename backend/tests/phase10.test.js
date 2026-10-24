/**
 * Phase 10 tests: analytics (ranges, comparisons, empty states), progress score (missing
 * dimensions excluded, weights), ledger (award / reversal / duplicate prevention / caps),
 * levels, achievements, streaks + timezone boundaries, goals (create, measured progress,
 * manual custom progress, completion), application funnel denominators, reports with and
 * without AI (+ PDF), notifications (dedupe, read state, preferences), ownership isolation.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { TEST_ENV, fakeLlm, fakePrisma, RESUME_TEXT, JOB_DESCRIPTION } from "./fixtures.js";
import * as fx from "./fixtures.js";
import { deriveEvents, computeStats } from "../src/services/progress/activityEventService.js";
import { planLedger, levelFor, evaluateAchievements, sumPoints } from "../src/services/progress/gamificationService.js";
import { computeStreaks, localDayKey, isoWeekKey, addDays } from "../src/services/progress/streakService.js";
import { computeProgressScore } from "../src/services/progress/progressScoreService.js";
import { applicationAnalytics, rangeBounds, overviewAnalytics, skillAnalytics } from "../src/services/progress/analyticsService.js";
import { measureGoal } from "../src/services/progress/goalService.js";
import { buildReportMetrics, deterministicNarrative, narrate, reportPeriod } from "../src/services/progress/progressReportService.js";
import { LEVELS, POINT_RULES } from "../src/services/progress/progressConfig.js";

let server, baseUrl, prisma, llm, behaviour = null;
async function ensureServer() {
  if (server) return;
  prisma = fakePrisma();
  llm = fakeLlm((req) => (behaviour ? behaviour(req) : undefined) ?? defaultLlm(req));
  const app = createApp({ env: loadEnv(TEST_ENV), prisma, llm });
  await new Promise((resolve) => { server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); }); server.unref(); });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));
function defaultLlm(req) {
  if (req.schemaName === "progress_report") return fx.validProgressNarrative(req);
  if (req.schemaName === "learning_roadmap") return fx.validRoadmapOutput(req);
  if (req.schemaName === "interview_questions") return fx.validQuestionBatch(req);
  if (req.schemaName === "answer_evaluation") return fx.validEvaluation(req);
  return fx.validAiOutput();
}
async function api(path, { method = "GET", token, body, raw = false } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return { status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function registerUser(email) { const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } }); assert.equal(r.status, 201); return r.body.token; }

/** Seed: analysis, JD, application (APPLIED), completed interview (5 evaluated answers), roadmap with two completed tasks. */
async function seedUser(token) {
  const an = await api("/api/analysis/resume", { method: "POST", token, body: { resumeText: RESUME_TEXT, jobTitle: "Senior Frontend Developer", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } });
  assert.equal(an.status, 201);
  const jd = await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } });
  const app = await api("/api/applications", { method: "POST", token, body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", status: "APPLIED", jobDescriptionId: jd.body.jobDescription.id, analysisId: an.body.analysis.id } });
  assert.equal(app.status, 201);
  const s = await api("/api/interviews", { method: "POST", token, body: { targetRole: "Frontend Developer", interviewType: "technical", difficulty: "intermediate", durationMinutes: 20, questionCount: 5 } });
  assert.equal(s.status, 201);
  for (const q of s.body.session.questions) assert.equal((await api(`/api/interviews/${s.body.session.id}/answers/${q.id}/evaluate`, { method: "POST", token, body: { answerText: "Closures let an inner function capture variables from its enclosing scope even after that scope has returned, e.g. a counter factory." } })).status, 200);
  assert.equal((await api(`/api/interviews/${s.body.session.id}/complete`, { method: "POST", token, body: {} })).status, 200);
  const r = await api("/api/learning/roadmaps", { method: "POST", token, body: { targetRole: "Frontend Developer", currentSkillLevel: "intermediate", weeklyStudyHours: 5, preferredSchedule: "flexible", objective: "job_readiness", preferredFormat: "mixed", analysisId: an.body.analysis.id, jobDescriptionId: jd.body.jobDescription.id } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 300));
  const tasks = r.body.roadmap.milestones[0].tasks.filter((t) => !t.checkpoint);
  const completed = [];
  for (const t of tasks.slice(0, 2)) { const c = await api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", token, body: { actualStudyMinutes: 30 } }); assert.equal(c.status, 200, JSON.stringify(c.body).slice(0, 200)); completed.push(t); }
  return { analysis: an.body.analysis, jd: jd.body.jobDescription, application: app.body.application, session: s.body.session, roadmap: r.body.roadmap, completedTasks: completed };
}

// ─── Unit: events, ledger, levels, achievements ──────────────────────────────

const d = (iso) => new Date(iso);
function richSnapshot() {
  return {
    analyses: [{ id: "a1", analysisMode: "ai", jobTitle: "FE", createdAt: d("2026-10-01T10:00:00Z"), matchScore: 70 }, { id: "a2", analysisMode: "demo", jobTitle: "FE", createdAt: d("2026-10-01T11:00:00Z"), matchScore: 50 }],
    versions: [
      { id: "v0", resumeId: "r1", name: "Original", isOriginal: true, lastQualityScore: 60, updatedAt: d("2026-10-01T09:00:00Z") },
      { id: "v1", resumeId: "r1", parentVersionId: "v0", name: "Improved", isOriginal: false, lastQualityScore: 72, updatedAt: d("2026-10-02T09:00:00Z") },
      { id: "v2", resumeId: "r1", parentVersionId: "v0", name: "Tiny edit", isOriginal: false, lastQualityScore: 62, updatedAt: d("2026-10-02T10:00:00Z") },
    ],
    interviews: [
      { id: "s1", status: "completed", source: "mock_interview", interviewType: "technical", targetRole: "FE", score: 85, completedAt: d("2026-10-03T18:00:00Z"), answers: [1, 2, 3].map((i) => ({ questionId: `q${i}`, status: "evaluated", score: 85 })), questions: [] },
      { id: "s2", status: "completed", source: "mock_interview", interviewType: "technical", targetRole: "FE", score: 90, completedAt: d("2026-10-03T19:00:00Z"), answers: [{ questionId: "q9", status: "evaluated", score: 90 }], questions: [] }, // only 1 evaluated → ineligible
      { id: "s3", status: "completed", source: "mock_interview", interviewType: "coding", targetRole: "FE", score: 60, completedAt: d("2026-10-04T18:00:00Z"), answers: [{ questionId: "c1", status: "evaluated", score: 60 }, { questionId: "c2", status: "evaluated", score: 60 }], questions: [] },
    ],
    roadmaps: [{ id: "rm1", title: "Plan", status: "active", weeklyStudyHours: 5, milestones: [
      { id: "m1", sequenceNumber: 1, title: "Basics", prerequisiteSequences: [], status: "in_progress", tasks: [
        { id: "t1", title: "Learn hooks", skillName: "React", status: "completed", isRequired: true, completedAt: d("2026-10-05T08:00:00Z"), checkpoint: null },
        { id: "t2", title: "Quiz", skillName: "React", status: "completed", isRequired: true, completedAt: d("2026-10-06T08:00:00Z"), checkpoint: { type: "mcq" }, checkpointAttempts: [{ at: "2026-10-06T07:50:00Z", passed: true, verified: true, score: 90 }] },
      ] },
      { id: "m2", sequenceNumber: 2, title: "Next", prerequisiteSequences: [1], status: "not_started", tasks: [{ id: "t3", title: "Later", skillName: "GraphQL", status: "not_started", isRequired: true }] },
    ] }, { id: "rmOld", title: "Old", status: "superseded", milestones: [{ id: "mo", sequenceNumber: 1, prerequisiteSequences: [], tasks: [{ id: "to", title: "Learn hooks", skillName: "React", status: "completed", isRequired: true, completedAt: d("2026-10-05T08:00:00Z") }] }] }],
    applications: [
      { id: "ap1", companyName: "Acme", jobTitle: "FE", status: "INTERVIEW", applicationDate: d("2026-10-02T00:00:00Z"), updatedAt: d("2026-10-08T00:00:00Z"), createdAt: d("2026-10-02T00:00:00Z") },
      { id: "ap2", companyName: "Beta", jobTitle: "FE", status: "INTERESTED", applicationDate: d("2026-10-02T00:00:00Z"), updatedAt: d("2026-10-02T00:00:00Z"), createdAt: d("2026-10-02T00:00:00Z") },
    ],
    assessments: [{ id: "as1", targetRole: "FE", overallScore: 61, readinessLabel: "Building", createdAt: d("2026-10-07T12:00:00Z"), skills: [{ skillName: "React", status: "demonstrated" }] }],
    plans: [{ id: "p1", weekStart: d("2026-10-05T00:00:00Z"), tasks: [{ id: "pt1", title: "Do X", status: "done", isOptional: false, completedAt: d("2026-10-06T10:00:00Z") }, { id: "pt2", title: "Do Y", status: "done", isOptional: false, completedAt: d("2026-10-07T10:00:00Z") }, { id: "pt3", title: "Opt", status: "pending", isOptional: true }] }],
    skillGaps: [{ skillName: "React", proficiencyStatus: "demonstrated", priority: "medium", category: "frontend", updatedAt: d("2026-10-01T00:00:00Z"), evidenceSources: ["resume"] }, { skillName: "GraphQL", proficiencyStatus: "not_demonstrated", priority: "high", category: "api", updatedAt: d("2026-10-01T00:00:00Z"), evidenceSources: ["job_description"] }],
    resumes: [{ id: "r1" }], jobDescriptions: [], goals: [], transactions: [], achievements: [], progressSnapshots: [],
  };
}

test("events: derived only from persisted, eligible records; superseded roadmaps and thin interviews ignored; caps applied", () => {
  const { events, learningDays } = deriveEvents(richSnapshot(), { tz: "UTC", now: d("2026-10-10T12:00:00Z") });
  const keys = events.map((e) => e.eventKey);
  assert.ok(keys.includes("resume_analysis_run:a1")); assert.ok(!keys.includes("resume_analysis_run:a2"), "demo analyses earn nothing");
  assert.ok(keys.includes("resume_improved:v1")); assert.ok(!keys.includes("resume_improved:v2"), "+2 quality is below the 5-point threshold");
  assert.ok(keys.includes("interview_completed:s1") && keys.includes("interview_strong_score:s1"));
  assert.ok(!keys.includes("interview_completed:s2"), "one evaluated answer is not a finished interview");
  assert.ok(keys.includes("coding_session_completed:s3"));
  assert.ok(keys.includes("learning_task_completed:t1") && keys.includes("learning_task_completed:t2") && keys.includes("checkpoint_passed:t2"));
  assert.ok(!keys.includes("learning_task_completed:to"), "copy of a task in a superseded roadmap is deduped");
  assert.ok(keys.includes("milestone_completed:m1")); assert.ok(!keys.includes("roadmap_completed:rm1"));
  assert.ok(keys.includes("application_submitted:ap1") && keys.includes("application_interview_stage:ap1") && !keys.includes("application_submitted:ap2"));
  assert.ok(keys.includes("weekly_plan_completed:p1") && keys.includes("plan_task_completed:pt1"));
  assert.ok(keys.includes("career_assessment_completed:as1"));
  assert.deepEqual(learningDays, ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.ok(keys.some((k) => k.startsWith("consistency_week:2026-W41")), "3+ learning days in ISO week 41");
  // Daily cap: a 3rd analysis on the same day earns 0 but is still listed.
  const snap = richSnapshot();
  snap.analyses = [1, 2, 3].map((i) => ({ id: `x${i}`, analysisMode: "ai", jobTitle: "FE", createdAt: d(`2026-10-01T1${i}:00:00Z`), matchScore: 70 }));
  const capped = deriveEvents(snap, { tz: "UTC" }).events.filter((e) => e.eventType === "resume_analysis_run");
  assert.equal(capped.length, 3); assert.equal(capped.filter((e) => e.points > 0).length, POINT_RULES.resume_analysis_run.dailyCap); assert.equal(capped[2].capped, true);
});

test("ledger: idempotent awards, reversal when an activity disappears, re-award uses a new cycle (net = one award)", () => {
  const { events } = deriveEvents(richSnapshot(), { tz: "UTC" });
  const first = planLedger(events, []);
  assert.ok(first.length > 5 && first.every((t) => t.kind === "award" && t.cycle === 1 && t.points > 0));
  const ledger = first.map((t, i) => ({ id: `tx${i}`, ...t }));
  assert.deepEqual(planLedger(events, ledger), [], "second reconcile creates nothing");
  // Task t1 reopened → its event disappears → reversal.
  const without = events.filter((e) => e.eventKey !== "learning_task_completed:t1");
  const rev = planLedger(without, ledger);
  assert.equal(rev.length, 1); assert.equal(rev[0].kind, "reversal"); assert.equal(rev[0].points, -POINT_RULES.learning_task_completed.points); assert.equal(rev[0].cycle, 1);
  const ledger2 = [...ledger, { id: "txr", ...rev[0] }];
  assert.deepEqual(planLedger(without, ledger2), []);
  // Completed again → cycle 2 award; total equals a single award.
  const again = planLedger(events, ledger2);
  assert.equal(again.length, 1); assert.equal(again[0].kind, "award"); assert.equal(again[0].cycle, 2);
  const total = sumPoints([...ledger2, again[0]]);
  assert.equal(total, sumPoints(ledger));
});

test("levels: thresholds from config, progress to next, open-ended ladder", () => {
  assert.equal(levelFor(0).level, 1); assert.equal(levelFor(0).nextLevel.pointsNeeded, LEVELS[1].minPoints);
  assert.equal(levelFor(LEVELS[1].minPoints).level, 2); assert.equal(levelFor(LEVELS[1].minPoints - 1).level, 1);
  const l5 = levelFor(LEVELS[4].minPoints); assert.equal(l5.level, 5); assert.equal(l5.name, "Professional Growth"); assert.ok(l5.nextLevel);
  const l6 = levelFor(LEVELS[4].minPoints + 1000); assert.equal(l6.level, 6); assert.match(l6.name, /Professional Growth II/);
  assert.equal(levelFor(100).percentToNext, 50); assert.match(levelFor(0).disclaimer, /not your qualification/);
});

test("achievements: progress toward criteria, unlock once, existing unlock kept", () => {
  const { events } = deriveEvents(richSnapshot(), { tz: "UTC" });
  const stats = computeStats(events, { longestStreak: 5 });
  const a = evaluateAchievements(stats, []);
  const by = Object.fromEntries(a.map((x) => [x.key, x]));
  assert.equal(by.first_analysis.unlocked, true); assert.equal(by.first_interview.newlyUnlocked, true); assert.equal(by.strong_interview.unlocked, true);
  assert.equal(by.consistent_learner.unlocked, false); assert.equal(by.consistent_learner.progress, 5); assert.equal(by.consistent_learner.percent, 71);
  assert.equal(by.interview_practice_5.progress, 2);
  const again = evaluateAchievements({ ...stats, analyses: 0 }, [{ achievementKey: "first_analysis", unlockedAt: new Date("2026-10-01") }]);
  const fa = again.find((x) => x.key === "first_analysis");
  assert.equal(fa.unlocked, true); assert.equal(fa.newlyUnlocked, false, "never unlocked twice");
});

test("streaks: timezone day boundaries, grace for today, DST-safe calendar arithmetic", () => {
  // 2026-10-05 23:30 UTC is 2026-10-06 05:00 in Kolkata and 2026-10-05 16:30 in Los Angeles.
  const t = new Date("2026-10-05T23:30:00Z");
  assert.equal(localDayKey(t, "Asia/Kolkata"), "2026-10-06"); assert.equal(localDayKey(t, "America/Los_Angeles"), "2026-10-05"); assert.equal(localDayKey(t, "Not/AZone"), "2026-10-05");
  const s = computeStreaks(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-07", "2026-10-08"], "2026-10-09");
  assert.equal(s.currentStreak, 2, "no activity today yet, yesterday counts"); assert.equal(s.longestStreak, 3); assert.equal(s.totalLearningDays, 5);
  assert.equal(computeStreaks(["2026-10-07"], "2026-10-09").currentStreak, 0, "a two-day gap ends the streak");
  assert.equal(computeStreaks([], "2026-10-09").longestStreak, 0);
  // US DST ended 2026-11-01: calendar arithmetic across it stays 1 day per step.
  assert.equal(addDays("2026-10-31", 1), "2026-11-01"); assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01"); assert.equal(isoWeekKey("2027-01-01"), "2026-W53");
});

test("progress score: missing dimensions excluded (new users not penalised), evidence + formula per dimension", () => {
  const empty = computeProgressScore({ versions: [], interviews: [], skillGaps: [], roadmaps: [], applications: [], assessments: [] });
  assert.equal(empty.overallScore, null); assert.equal(empty.label, "Not enough data yet"); assert.equal(empty.coverage.included, 0); assert.ok(empty.dimensions.every((x) => x.score === null && x.formula));
  const r = computeProgressScore(richSnapshot(), { now: d("2026-10-10T00:00:00Z") });
  const by = Object.fromEntries(r.dimensions.map((x) => [x.key, x]));
  assert.equal(by.career_readiness.score, 61); assert.equal(by.interview_performance.score, 85, "s1 only: s2 has 1 evaluated answer, s3 (coding) has 2 (< 3)");
  assert.equal(by.learning_completion.score, 67); assert.equal(by.resume_improvement.score, Math.round(0.6 * 72 + 0.4 * 80));
  assert.equal(r.coverage.included, 6); assert.ok(r.overallScore > 0 && r.overallScore <= 100); assert.match(r.disclaimer, /not a job-match/);
  // Weighted mean check with only two dimensions present.
  const two = computeProgressScore({ ...richSnapshot(), versions: [], interviews: [], skillGaps: [], roadmaps: [] }, { now: d("2026-10-10T00:00:00Z") });
  assert.equal(two.coverage.included, 2); assert.equal(two.coverage.weightUsed, 30);
});

test("analytics: ranges, previous-period comparison, funnel denominators, small-sample caveats, skills buckets", () => {
  const now = d("2026-10-10T12:00:00Z");
  const b = rangeBounds("7d", now);
  assert.equal(b.prevTo.getTime(), b.from.getTime()); assert.equal(rangeBounds("all", now).from, null);
  const snap = richSnapshot();
  const apps = applicationAnalytics(snap, b, { now });
  assert.equal(apps.rates.available, false); assert.equal(apps.rates.interviewRate, null); assert.match(apps.rates.definitions.caveat, /not failures/);
  assert.equal(apps.funnel.find((f) => f.key === "APPLIED").count, 1); assert.equal(apps.funnel.find((f) => f.key === "INTERVIEW").count, 1);
  snap.applications = [...Array(6)].map((_, i) => ({ id: `b${i}`, companyName: `C${i}`, jobTitle: "FE", status: i < 2 ? "INTERVIEW" : i === 2 ? "REJECTED" : "APPLIED", applicationDate: d("2026-10-01T00:00:00Z"), updatedAt: d("2026-10-05T00:00:00Z"), createdAt: d("2026-10-01T00:00:00Z") }));
  const a2 = applicationAnalytics(snap, b, { now });
  assert.equal(a2.rates.available, true); assert.equal(a2.rates.sampleSize, 6); assert.equal(a2.rates.responseRate, 50); assert.equal(a2.rates.interviewRate, 33); assert.equal(a2.rates.offerRate, 0); assert.equal(a2.rates.interviewToOffer, null, "needs ≥ 3 interviews");
  assert.equal(a2.responseTime.sampleSize, 3); assert.equal(a2.responseTime.medianDays, 4);
  const { events } = deriveEvents(richSnapshot(), { now });
  const ov = overviewAnalytics(richSnapshot(), events, { range: "7d", now });
  assert.equal(ov.emptyState, null); assert.ok(ov.kpis.every((k) => typeof k.current === "number" && k.definition));
  assert.equal(ov.kpis[0].current, 2); assert.equal(ov.activity.weekly.length, 8); assert.equal(ov.activity.monthly.length, 6);
  assert.equal(ov.interviews.score.average, 78, "s1 (85), s2 (90) and s3 (60) completed inside the last 7 days; analytics report every scored session");
  const emptyOv = overviewAnalytics({ ...richSnapshot(), analyses: [], versions: [], interviews: [], roadmaps: [], applications: [], assessments: [], plans: [] }, [], { range: "30d", now });
  assert.match(emptyOv.emptyState, /No activity recorded yet/); assert.equal(emptyOv.interviews.score.average, null, "null, not zero");
  const sk = skillAnalytics(richSnapshot(), { now });
  assert.equal(sk.totals.demonstrated, 1); assert.ok(sk.needsPractice.some((s) => s.skillName === "GraphQL" && s.notes.some((n) => /missing keyword/.test(n))));
  assert.ok(sk.demonstrated[0].sources.every((s) => s.source && s.date));
});

test("goals: measured from records created after the goal; absolute goals read current state", () => {
  const snap = richSnapshot();
  const g = { goalType: "mock_interviews", targetValue: 2, createdAt: d("2026-10-04T00:00:00Z"), currentValue: 0 };
  const m = measureGoal(g, snap);
  assert.equal(m.currentValue, 1, "s1 completed before the goal does not count; s3 does"); assert.equal(m.percent, 50); assert.equal(m.reached, false);
  const q = measureGoal({ goalType: "resume_quality", targetValue: 70, createdAt: d("2026-10-09T00:00:00Z"), currentValue: 0 }, snap);
  assert.equal(q.currentValue, 72); assert.equal(q.reached, true);
  const rm = measureGoal({ goalType: "roadmap_completion", linkKey: "rm1", targetValue: 100, createdAt: d("2026-10-09T00:00:00Z") }, snap);
  assert.equal(rm.currentValue, 67);
  const sp = measureGoal({ goalType: "skill_practice", linkKey: "react", targetValue: 5, createdAt: d("2026-10-01T00:00:00Z") }, snap);
  assert.equal(sp.currentValue, 2);
});

test("reports: deterministic metrics, narrative without AI, AI narrative rejected when it invents numbers", async () => {
  const snap = richSnapshot();
  const period = reportPeriod("weekly", { now: d("2026-10-10T12:00:00Z"), tz: "UTC" });
  assert.equal(period.periodStart.toISOString(), "2026-10-05T00:00:00.000Z");
  const { events } = deriveEvents(snap, { now: d("2026-10-10T12:00:00Z") });
  const m = buildReportMetrics(snap, { events, transactions: planLedger(events, []), achievements: [], period });
  assert.equal(m.activities.learningTasks, 2); assert.equal(m.interviews.completed, 0); assert.equal(m.applications.interviewsReached, 1); assert.ok(m.pointsEarned > 0);
  const n = deterministicNarrative(m);
  assert.equal(n.source, "deterministic"); assert.ok(n.highlights.length >= 1 && n.priorities.length >= 1);
  const off = await narrate(null, m); assert.equal(off.aiUsed, false);
  const bad = await narrate(fakeLlm(() => ({ summary: "You completed 999 interviews!", highlights: [], priorities: [] })), m);
  assert.equal(bad.aiUsed, false); assert.match(bad.narrative.note, /discarded/);
  const good = await narrate(fakeLlm((req) => fx.validProgressNarrative(req)), m);
  assert.equal(good.aiUsed, true); assert.equal(good.narrative.source, "ai");
  const monthly = reportPeriod("monthly", { now: d("2026-10-10T12:00:00Z"), tz: "UTC", offset: 1 });
  assert.equal(monthly.periodStart.toISOString(), "2026-09-01T00:00:00.000Z"); assert.equal(monthly.periodEnd.toISOString(), "2026-09-30T23:59:59.999Z");
});

// ─── HTTP ────────────────────────────────────────────────────────────────────

test("http: gamification profile reconciles from records; points never accepted from the client; repeat reads are idempotent", async () => {
  const token = await registerUser("p10-a@example.com");
  const fresh = await api("/api/gamification/profile?tz=Asia/Kolkata", { token });
  assert.equal(fresh.status, 200); assert.equal(fresh.body.profile.totalPoints, 0); assert.equal(fresh.body.profile.level.level, 1); assert.equal(fresh.body.profile.timezone, "Asia/Kolkata");
  await seedUser(token);
  const p = await api("/api/gamification/profile", { token });
  assert.equal(p.status, 200);
  const pts = p.body.profile.totalPoints;
  assert.ok(pts >= POINT_RULES.resume_analysis_run.points + POINT_RULES.interview_completed.points + POINT_RULES.application_submitted.points + 2 * POINT_RULES.learning_task_completed.points, `points ${pts}`);
  assert.equal(p.body.profile.stats.interviewsCompleted, 1); assert.equal(p.body.profile.stats.learningTasksCompleted, 2);
  assert.ok(p.body.rules.length > 10);
  const again = await api("/api/gamification/profile", { token });
  assert.equal(again.body.profile.totalPoints, pts, "idempotent");
  const hist = await api("/api/gamification/points/history?limit=50", { token });
  assert.equal(hist.status, 200); assert.equal(hist.body.transactions.reduce((s, t) => s + t.points, 0), pts); assert.ok(hist.body.transactions.every((t) => t.kind === "award"));
  // Client cannot post points.
  assert.equal((await api("/api/gamification/points/history", { method: "POST", token, body: { points: 9999 } })).status, 404);
  assert.equal((await api("/api/gamification/profile", { method: "PATCH", token, body: { totalPoints: 9999 } })).status, 200);
  assert.equal((await api("/api/gamification/profile", { token })).body.profile.totalPoints, pts, "ignored");
  assert.equal((await api("/api/gamification/profile", { method: "PATCH", token, body: { timezone: "Mars/Olympus" } })).status, 400);
  const ach = await api("/api/gamification/achievements", { token });
  assert.equal(ach.status, 200);
  const byKey = Object.fromEntries(ach.body.achievements.map((a) => [a.key, a]));
  assert.equal(byKey.first_analysis.unlocked, true); assert.equal(byKey.first_interview.unlocked, true); assert.equal(byKey.first_application.unlocked, true); assert.equal(byKey.interview_practice_5.unlocked, false); assert.equal(byKey.interview_practice_5.progress, 1);
  assert.ok(byKey.first_analysis.unlockedAt);
  const st = await api("/api/gamification/streaks", { token });
  assert.equal(st.status, 200); assert.equal(st.body.streaks.currentStreak, 1); assert.equal(st.body.streaks.activeToday, true); assert.equal(st.body.streaks.calendar.cells.length, 16 * 7); assert.match(st.body.streaks.rules, /not a failure/);
  const act = await api("/api/gamification/activity?limit=50", { token });
  assert.equal(act.status, 200); assert.ok(act.body.activity.some((a) => a.eventType === "achievement_unlocked")); assert.ok(act.body.activity.some((a) => a.eventType === "interview_completed" && a.points === POINT_RULES.interview_completed.points));
  const notes = await api("/api/notifications", { token });
  assert.equal(notes.status, 200); assert.ok(notes.body.unread >= 3); assert.ok(notes.body.notifications.some((n) => n.type === "achievement"));
  const n0 = notes.body.notifications[0];
  const read = await api(`/api/notifications/${n0.id}/read`, { method: "PATCH", token });
  assert.equal(read.status, 200); assert.ok(read.body.notification.readAt);
  const afterRead = await api("/api/notifications", { token });
  assert.equal(afterRead.body.unread, notes.body.unread - 1); assert.equal(afterRead.body.total, notes.body.total, "no duplicate notifications on re-read");
  const all = await api("/api/notifications/read-all", { method: "POST", token });
  assert.ok(all.body.updated >= 1); assert.equal((await api("/api/notifications?unread=true", { token })).body.notifications.length, 0);
});

test("http: reopening a task reverses its points; completing again does not double-award", async () => {
  const token = await registerUser("p10-b@example.com");
  const seed = await seedUser(token);
  const before = (await api("/api/gamification/profile", { token })).body.profile.totalPoints;
  const t = seed.completedTasks[0];
  assert.equal((await api(`/api/learning/tasks/${t.id}/reopen`, { method: "POST", token })).status, 200);
  const mid = await api("/api/gamification/profile", { token });
  assert.equal(mid.body.profile.totalPoints, before - POINT_RULES.learning_task_completed.points);
  const hist = await api("/api/gamification/points/history?limit=50", { token });
  assert.ok(hist.body.transactions.some((x) => x.kind === "reversal" && x.eventKey === `learning_task_completed:${t.id}`));
  assert.equal((await api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", token, body: {} })).status, 200);
  const after_ = await api("/api/gamification/profile", { token });
  assert.equal(after_.body.profile.totalPoints, before, "net one award");
  const acts = (await api("/api/gamification/activity?limit=100", { token })).body.activity.filter((a) => a.eventKey === `learning_task_completed:${t.id}`);
  assert.equal(acts.length, 1);
});

test("http: analytics endpoints — ranges validated, comparisons, progress score snapshot stored once per day", async () => {
  const token = await registerUser("p10-c@example.com");
  const empty = await api("/api/analytics/overview?range=30d", { token });
  assert.equal(empty.status, 200); assert.match(empty.body.analytics.emptyState, /No activity/); assert.equal(empty.body.progress.overallScore, null);
  assert.equal((await api("/api/analytics/overview?range=2y", { token })).status, 400);
  await seedUser(token);
  const ov = await api("/api/analytics/overview?range=7d&tz=Europe/London", { token });
  assert.equal(ov.status, 200);
  assert.equal(ov.body.analytics.emptyState, null); assert.equal(ov.body.analytics.kpis[1].current, 1); assert.equal(ov.body.analytics.kpis[1].delta, null, "no previous-period data → no comparison");
  assert.ok(ov.body.analytics.resume.matchTrend.length === 1 && ov.body.analytics.interviews.trend.length === 1);
  assert.ok(ov.body.progress.coverage.included >= 3); assert.ok(typeof ov.body.progress.overallScore === "number");
  const cp = await api("/api/analytics/career-progress", { token });
  assert.equal(cp.status, 200); assert.equal(cp.body.history.length, 1, "one snapshot per day"); assert.ok(cp.body.weights.resume_improvement);
  assert.equal((await api("/api/analytics/career-progress", { token })).body.history.length, 1);
  for (const p of ["skills", "interviews?range=90d", "resume?range=all", "applications?range=30d"]) { const r = await api(`/api/analytics/${p}`, { token }); assert.equal(r.status, 200, p); }
  const ap = await api("/api/analytics/applications?range=all", { token });
  assert.equal(ap.body.applications.total, 1); assert.equal(ap.body.applications.rates.available, false);
  const sk = await api("/api/analytics/skills", { token });
  assert.ok(sk.body.skills.totals.tracked > 0); assert.ok(sk.body.skills.definitions.status);
});

test("http: goals — validation, measured progress, manual custom progress, completion notification, ownership", async () => {
  const token = await registerUser("p10-d@example.com");
  const other = await registerUser("p10-d2@example.com");
  assert.equal((await api("/api/goals", { method: "POST", token, body: { title: "x", goalType: "mock_interviews", targetValue: 2 } })).status, 400, "title too short");
  assert.equal((await api("/api/goals", { method: "POST", token, body: { title: "Practise", goalType: "skill_practice", targetValue: 3 } })).status, 400, "skill goal needs linkKey");
  assert.equal((await api("/api/goals", { method: "POST", token, body: { title: "Quality", goalType: "resume_quality", targetValue: 150 } })).status, 400);
  const g = await api("/api/goals", { method: "POST", token, body: { title: "Two mock interviews", goalType: "mock_interviews", targetValue: 1 } });
  assert.equal(g.status, 201); assert.equal(g.body.goal.progress.currentValue, 0); assert.equal(g.body.goal.typeLabel, "Finish mock interviews");
  const c = await api("/api/goals", { method: "POST", token, body: { title: "Read two books", goalType: "custom", targetValue: 2, targetDate: "2026-12-31" } });
  assert.equal(c.status, 201);
  assert.equal((await api(`/api/goals/${g.body.goal.id}`, { method: "PATCH", token, body: { currentValue: 5 } })).status, 409, "measured goals cannot be set manually");
  const cu = await api(`/api/goals/${c.body.goal.id}`, { method: "PATCH", token, body: { currentValue: 1, status: "paused" } });
  assert.equal(cu.status, 200); assert.equal(cu.body.goal.progress.percent, 50); assert.equal(cu.body.goal.status, "paused");
  await seedUser(token);
  const list = await api("/api/goals", { token });
  assert.equal(list.status, 200);
  const mi = list.body.goals.find((x) => x.id === g.body.goal.id);
  assert.equal(mi.status, "completed", "interview completed after goal creation satisfies it"); assert.ok(mi.completedAt); assert.equal(mi.progress.currentValue, 1);
  const notes = await api("/api/notifications", { token });
  assert.ok(notes.body.notifications.some((n) => n.type === "goal" && n.dedupeKey === `goal:${g.body.goal.id}`));
  assert.equal((await api("/api/goals", { token })).body.goals.filter((x) => x.id === g.body.goal.id).length, 1);
  assert.equal((await api(`/api/goals/${g.body.goal.id}`, { method: "PATCH", token: other, body: { title: "Hijack" } })).status, 404);
  assert.equal((await api(`/api/goals/${g.body.goal.id}`, { method: "DELETE", token: other })).status, 404);
  assert.equal((await api(`/api/goals/${c.body.goal.id}`, { method: "DELETE", token })).status, 204);
  assert.equal((await api("/api/goals?status=completed", { token })).body.goals.length, 1);
  assert.equal((await api("/api/goals", { token: other })).body.goals.length, 0);
});

test("http: progress reports — generate (AI), regenerate without AI, list, detail, PDF, notification, ownership", async () => {
  const token = await registerUser("p10-e@example.com");
  const other = await registerUser("p10-e2@example.com");
  await seedUser(token);
  const r = await api("/api/progress-reports/generate", { method: "POST", token, body: { periodType: "weekly", tz: "UTC" } });
  assert.equal(r.status, 201); assert.equal(r.body.report.aiUsed, true); assert.equal(r.body.report.narrative.source, "ai"); assert.equal(r.body.report.metrics.activities.learningTasks, 2);
  behaviour = () => { const e = new Error("rate limited"); e.status = 429; throw e; };
  const r2 = await api("/api/progress-reports/generate", { method: "POST", token, body: { periodType: "weekly", force: true } });
  behaviour = null;
  assert.equal(r2.status, 200); assert.equal(r2.body.report.id, r.body.report.id, "same period updates in place"); assert.equal(r2.body.report.aiUsed, false); assert.match(r2.body.report.narrative.note, /unavailable/); assert.ok(r2.body.report.narrative.summary);
  const prev = await api("/api/progress-reports/generate", { method: "POST", token, body: { periodType: "monthly", offset: 1 } });
  assert.equal(prev.status, 201); assert.equal(prev.body.report.metrics.hasActivity, false);
  const reuse = await api("/api/progress-reports/generate", { method: "POST", token, body: { periodType: "monthly", offset: 1 } });
  assert.equal(reuse.body.reused, true);
  const list = await api("/api/progress-reports", { token });
  assert.equal(list.body.total, 2); assert.ok(list.body.reports[0].summary);
  const det = await api(`/api/progress-reports/${r.body.report.id}`, { token });
  assert.equal(det.status, 200); assert.equal(det.body.report.method, "progress-report-1.0");
  const pdf = await api(`/api/progress-reports/${r.body.report.id}/pdf`, { token, raw: true });
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get("content-type"), "application/pdf"); assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  const { default: pdfParse } = await import("pdf-parse");
  const text = (await pdfParse(pdf.buffer)).text;
  assert.match(text, /Weekly progress report/); assert.match(text, /Learning tasks completed: 2/);
  assert.equal((await api(`/api/progress-reports/${r.body.report.id}`, { token: other })).status, 404);
  assert.equal((await api(`/api/progress-reports/${r.body.report.id}/pdf`, { token: other })).status, 404);
  const notes = await api("/api/notifications", { token });
  assert.ok(notes.body.notifications.some((n) => n.type === "report"));
});

test("http: notification preferences suppress categories; auth required everywhere", async () => {
  const token = await registerUser("p10-f@example.com");
  assert.equal((await api("/api/notifications/preferences", { method: "PATCH", token, body: {} })).status, 400);
  const p = await api("/api/notifications/preferences", { method: "PATCH", token, body: { achievements: false, reports: false } });
  assert.equal(p.status, 200); assert.equal(p.body.preferences.achievements, false); assert.equal(p.body.preferences.levels, true);
  await seedUser(token);
  const notes = await api("/api/notifications", { token });
  assert.ok(!notes.body.notifications.some((n) => n.type === "achievement"), "achievement notifications off");
  assert.equal((await api("/api/notifications/preferences", { token })).body.preferences.reports, false);
  for (const path of ["/api/analytics/overview", "/api/gamification/profile", "/api/goals", "/api/progress-reports", "/api/notifications"]) assert.equal((await api(path)).status, 401, path);
});
