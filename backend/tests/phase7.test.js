/**
 * Phase 7 tests: skill-gap classification, roadmap generation/validation/persistence,
 * task lifecycle (start/complete/reopen/skip), prerequisite locking, milestone
 * completion, progress %, weekly plan, checkpoints, recommendations + dismissal,
 * regeneration (preview/apply, version history, carried progress), ownership,
 * malformed AI output and provider failures.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { ApiError } from "../src/utils/errors.js";
import { TEST_ENV, fakeLlm, fakePrisma, validRoadmapOutput, RESUME_TEXT, JOB_DESCRIPTION } from "./fixtures.js";
import { analyzeSkillGaps, selectRoadmapSkills } from "../src/services/learning/skillGapService.js";
import { postProcessRoadmap, mergeProgress, gradeMcq, publicCheckpoint } from "../src/services/learning/learningRoadmapService.js";
import { milestoneStatuses, roadmapProgress, buildWeeklyPlan, nextAction } from "../src/services/learning/learningProgressService.js";
import { buildLearningRecommendations } from "../src/services/learning/learningRecommendationService.js";
import { resourcesForTask } from "../src/services/learning/learningResourceService.js";

let server, baseUrl, prisma, llm;
let behaviour = null; // per-test override for the fake provider

async function ensureServer() {
  if (server) return;
  prisma = fakePrisma();
  llm = fakeLlm((req) => (behaviour ? behaviour(req) : undefined) ?? defaultLlm(req));
  const app = createApp({ env: loadEnv(TEST_ENV), prisma, llm });
  await new Promise((resolve) => {
    server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
    server.unref();
  });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

// Re-export the fixture default so the override hook can fall through.
import * as fx from "./fixtures.js";
function defaultLlm(req) {
  if (req.schemaName === "learning_roadmap") return validRoadmapOutput(req);
  if (req.schemaName === "interview_questions") return fx.validQuestionBatch(req);
  if (req.schemaName === "answer_evaluation") return fx.validEvaluation(req);
  return fx.validAiOutput();
}

async function api(path, { method = "GET", token, body } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } });
  assert.equal(r.status, 201);
  return r.body.token;
}
const setup = { targetRole: "Frontend Developer", currentSkillLevel: "intermediate", weeklyStudyHours: 6, preferredSchedule: "weekdays", objective: "job_readiness", preferredFormat: "mixed" };
async function createRoadmap(token, extra = {}) {
  const r = await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 400));
  return r.body;
}
const allTasks = (roadmap) => roadmap.milestones.flatMap((m) => m.tasks);

// ─── Unit: skill gap engine ─────────────────────────────────────────────────

test("skill gaps: classification, scoring, evidence and roadmap selection", () => {
  const out = analyzeSkillGaps({
    targetRole: "Frontend Developer",
    jobSkills: [{ name: "React", priority: "required" }, { name: "GraphQL", priority: "required" }, { name: "AWS", priority: "preferred" }, { name: "Next.js", priority: "preferred" }],
    analysis: { matched: ["React"], partial: ["Next.js"], missing: [{ name: "GraphQL", priority: "required" }, { name: "AWS", priority: "preferred" }] },
    interview: { weakTopics: ["React"], candidateTopics: [], strongTopics: [], recurringGaps: [] },
    confirmedSkills: ["CSS"],
    goalSkills: ["Docker"],
  });
  const by = Object.fromEntries(out.skills.map((s) => [s.skillName, s]));
  assert.equal(by.GraphQL.proficiencyStatus, "not_demonstrated");
  assert.equal(by.GraphQL.priority, "high", "required + missing is high priority");
  assert.ok(by.GraphQL.evidenceSources.includes("resume_analysis") && by.GraphQL.evidenceSources.includes("job_description"));
  assert.equal(by["Next.js"].proficiencyStatus, "needs_improvement");
  assert.equal(by.React.proficiencyStatus, "needs_improvement", "demonstrated on resume but weak in interviews → needs improvement");
  assert.ok(by.React.evidenceSources.includes("mock_interview"));
  assert.equal(by.CSS.proficiencyStatus, "demonstrated", "user-confirmed skills count as demonstrated");
  assert.equal(by.Docker.proficiencyStatus, "not_assessed");
  assert.ok(by.Docker.evidenceSources.includes("user_goal"));
  assert.ok(out.skills.every((s) => s.explanation && s.whyItMatters && typeof s.priorityScore === "number"));
  assert.equal(out.summary.total, out.skills.length);
  assert.ok(out.skills[0].priorityScore >= out.skills[out.skills.length - 1].priorityScore, "sorted by priority score");
  const selected = selectRoadmapSkills(out, { max: 3 });
  assert.equal(selected.length, 3);
  assert.ok(selected.every((s) => s.proficiencyStatus !== "demonstrated"));
  assert.equal(selected[0].priority, "high");
});
test("skill gaps: empty inputs fall back to role baseline, never crash", () => {
  const out = analyzeSkillGaps({ targetRole: "Frontend Developer" });
  assert.ok(out.skills.length > 0);
  assert.ok(out.skills.every((s) => s.proficiencyStatus === "not_assessed" && s.evidenceSources.includes("role_baseline")));
  const unknown = analyzeSkillGaps({ targetRole: "Astronaut" });
  assert.deepEqual(unknown.skills, []);
});

// ─── Unit: roadmap post-processing, checkpoints, merge ──────────────────────

test("roadmap post-processing: renumbering, prerequisite pruning, estimates, resources, checkpoints", () => {
  const cfg = { weeklyStudyHours: 5, gapSkills: [{ skillName: "GraphQL" }, { skillName: "AWS" }, { skillName: "Next.js" }], demonstratedSkills: [] };
  const raw = validRoadmapOutput({ user: "1. GraphQL [Backend] —\n2. AWS [Cloud] —\n3. Next.js [Frontend] —" });
  raw.milestones[0].prerequisiteSequences = [3]; // forward reference → pruned
  raw.milestones[1].tasks[0].estimatedMinutes = 47; // rounded to 15-min grid
  const out = postProcessRoadmap(raw, cfg);
  assert.deepEqual(out.milestones.map((m) => m.sequenceNumber), [1, 2, 3]);
  assert.deepEqual(out.milestones[0].prerequisiteSequences, []);
  assert.deepEqual(out.milestones[1].prerequisiteSequences, [1]);
  assert.equal(out.milestones[1].tasks[0].estimatedMinutes % 15, 0);
  assert.ok(out.estimatedHours > 0 && out.estimatedWeeks >= 1);
  const gql = out.milestones[0].tasks[0];
  assert.ok(gql.resources.length > 0 && gql.resources.some((r) => r.urlVerified && r.url.startsWith("https://")), "GraphQL has verified official docs");
  const cp = out.milestones[0].tasks.find((t) => t.taskType === "knowledge_checkpoint").checkpoint;
  assert.equal(cp.id, "cp");
  assert.equal(cp.type, "mcq");
  assert.ok(cp.questions.every((q) => q.id));
  const hidden = publicCheckpoint(cp);
  assert.ok(hidden.questions.every((q) => !("correctIndex" in q) && !("explanation" in q)), "answers hidden before attempt");
  const graded = gradeMcq(cp, { q1: 0, q2: 1, q3: 3 });
  assert.equal(graded.correct, 2);
  assert.equal(graded.score, 67);
  assert.equal(graded.passed, false);
  assert.equal(gradeMcq(cp, { q1: 0, q2: 1, q3: 2 }).passed, true);

  // demonstrated-only milestones are dropped; too few milestones → 502
  const drop = postProcessRoadmap(validRoadmapOutput({ user: "1. GraphQL [B] —\n2. AWS [C] —\n3. Next.js [F] —\n" }), { ...cfg, demonstratedSkills: [] });
  assert.equal(drop.milestones.length, 3);
  assert.throws(() => postProcessRoadmap(raw, { ...cfg, demonstratedSkills: ["GraphQL"] }), (e) => e.status === 502 && e.code === "LLM_INVALID_OUTPUT");
});

test("unknown skills get a search suggestion instead of an invented URL", () => {
  const res = resourcesForTask({ skillName: "Zorbulator Framework", taskType: "learn_concept", difficulty: "beginner" });
  assert.ok(res.length >= 1);
  assert.ok(res.every((r) => r.urlVerified === false || r.url === null || /^https:\/\//.test(r.url)));
  assert.ok(res.some((r) => r.resourceType === "search_suggestion" && r.url === null));
});

test("progress: locking, completion, percent, weekly plan and next action are derived from task state", () => {
  const roadmap = {
    id: "r", weeklyStudyHours: 4, preferredSchedule: "weekends",
    milestones: [
      { id: "m1", sequenceNumber: 1, prerequisiteSequences: [], status: "not_started", title: "A", tasks: [{ id: "t1", skillName: "GraphQL", status: "completed", isRequired: true, estimatedMinutes: 60, actualStudyMinutes: 50, completedAt: new Date(), title: "T1", taskType: "learn_concept" }, { id: "t2", skillName: "GraphQL", status: "not_started", isRequired: true, estimatedMinutes: 60, title: "T2", taskType: "coding_exercise" }] },
      { id: "m2", sequenceNumber: 2, prerequisiteSequences: [1], status: "not_started", title: "B", tasks: [{ id: "t3", skillName: "AWS", status: "not_started", isRequired: true, estimatedMinutes: 120, title: "T3", taskType: "tutorial" }] },
    ],
  };
  let st = milestoneStatuses(roadmap);
  assert.equal(st.get("m1").status, "in_progress");
  assert.equal(st.get("m2").status, "locked");
  assert.deepEqual(st.get("m2").unmetPrerequisites, [1]);
  let p = roadmapProgress(roadmap);
  assert.equal(p.percent, 33);
  assert.equal(p.lockedMilestones, 1);
  assert.equal(p.studiedMinutes, 50);
  const na = nextAction(roadmap);
  assert.equal(na.taskId, "t2", "locked milestone tasks are never suggested");
  const plan = buildWeeklyPlan(roadmap, { now: new Date("2026-10-12T09:00:00Z") });
  assert.equal(plan.weeklyTargetMinutes, 240);
  assert.equal(plan.sessions.length, 7);
  assert.equal(plan.sessions.filter((d) => d.studyDay).length, 2, "weekend schedule → two study days");
  assert.ok(plan.sessions.some((d) => d.tasks.length > 0) && plan.sessions.every((d) => d.tasks.every((t) => t.taskId !== "t3")), "weekly plan only schedules unlocked tasks");
  roadmap.milestones[0].tasks[1].status = "completed";
  st = milestoneStatuses(roadmap);
  assert.equal(st.get("m1").status, "completed");
  assert.equal(st.get("m2").status, "not_started");
  assert.equal(roadmapProgress(roadmap).percent, 67);
});

test("recommendations: derived from records, respect dismissals, cap at 8", () => {
  const now = new Date();
  const roadmap = { id: "r", weeklyStudyHours: 3, milestones: [{ id: "m1", sequenceNumber: 1, prerequisiteSequences: [], status: "in_progress", title: "A", tasks: [
    { id: "t1", skillName: "GraphQL", status: "in_progress", isRequired: true, estimatedMinutes: 60, title: "Learn GraphQL", taskType: "learn_concept" },
    { id: "t2", skillName: "AWS", status: "not_started", isRequired: true, estimatedMinutes: 30, title: "AWS basics", taskType: "read_docs" },
    { id: "t3", skillName: "React", status: "not_started", isRequired: true, estimatedMinutes: 45, title: "React hooks", taskType: "coding_exercise" },
  ] }] };
  const gaps = [{ skillName: "AWS", proficiencyStatus: "not_demonstrated", priority: "high", priorityScore: 80, whyItMatters: "Required by the job.", explanation: "" }];
  const recs = buildLearningRecommendations({ roadmap, skillGaps: gaps, interview: { weakTopics: ["React"], recurringGaps: [] }, dismissedKeys: [], now });
  assert.equal(recs[0].type, "continue");
  assert.equal(recs[0].taskId, "t1");
  assert.ok(recs.some((r) => r.key === "weak:react" && r.taskId === "t3"));
  assert.ok(recs.some((r) => r.key === "gap:aws" && r.taskId === "t2"));
  assert.ok(recs.every((r) => r.reason && r.key));
  const after = buildLearningRecommendations({ roadmap, skillGaps: gaps, interview: { weakTopics: ["React"], recurringGaps: [] }, dismissedKeys: ["weak:react", "resume:t1"], now });
  assert.ok(!after.some((r) => r.key === "weak:react" || r.key === "resume:t1"));
  const none = buildLearningRecommendations({ roadmap: null, skillGaps: [], interview: { weakTopics: [], recurringGaps: [] } });
  assert.equal(none[0].key, "create-roadmap");
});

test("mergeProgress carries completed work by skill+type and reports changes", () => {
  const old = { milestones: [{ title: "A", tasks: [{ id: "o1", skillName: "GraphQL", taskType: "learn_concept", status: "completed", completedAt: new Date("2026-10-01"), notes: "done", actualStudyMinutes: 40, title: "x" }, { id: "o2", skillName: "AWS", taskType: "tutorial", status: "completed", title: "y" }, { id: "o3", skillName: "Old skill", taskType: "tutorial", status: "not_started", title: "z" }] }] };
  const fresh = postProcessRoadmap(validRoadmapOutput({ user: "1. GraphQL [B] —\n2. AWS [C] —\n3. Next.js [F] —" }), { weeklyStudyHours: 5, gapSkills: [], demonstratedSkills: [] });
  const { roadmap, carried, changes } = mergeProgress(old, fresh);
  assert.equal(carried, 1);
  const t = roadmap.milestones[0].tasks[0];
  assert.equal(t.status, "completed");
  assert.equal(t.carriedFromTaskId, "o1");
  assert.equal(t.notes, "done");
  assert.ok(roadmap.milestones.flatMap((m) => m.tasks).filter((x) => x.taskType === "knowledge_checkpoint").every((x) => x.status !== "completed"), "checkpoints are never carried over");
  assert.equal(changes.completedNotCarried, 1);
  assert.ok(changes.addedSkills.includes("nextjs"));
  assert.ok(changes.removedSkills.includes("old skill"));
});

// ─── HTTP: generation ───────────────────────────────────────────────────────

test("create roadmap: validation, generation from resume analysis + JD + interview history, persistence", async () => {
  const token = await registerUser("p7-create@example.com");
  assert.equal((await api("/api/learning/roadmaps", { method: "POST", body: setup })).status, 401);
  const bad = await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, weeklyStudyHours: 0, currentSkillLevel: "wizard" } });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.details.some((d) => d.field === "weeklyStudyHours") && bad.body.error.details.some((d) => d.field === "currentSkillLevel"));
  assert.equal((await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, targetCompletionDate: "2020-01-01" } })).status, 400, "completion date must be in the future");

  // evidence: an AI analysis (GraphQL/AWS missing, Next.js partial) + a JD with extracted skills
  const an = await api("/api/analysis/resume", { method: "POST", token, body: { resumeText: RESUME_TEXT, jobTitle: "Senior FE", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } });
  assert.equal(an.status, 201, JSON.stringify(an.body).slice(0, 300));
  const jd = await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION, extractedRequirements: { skills: [{ name: "React", priority: "required" }, { name: "GraphQL", priority: "required" }, { name: "Docker", priority: "preferred", category: "DevOps" }], parserVersion: "demo-rules-1.0" } } });
  assert.equal(jd.status, 201);
  assert.equal((await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, jobDescriptionId: "c".repeat(25) } })).status, 404, "unknown JD id");

  const callsBefore = llm.calls;
  const created = await createRoadmap(token, { analysisId: an.body.analysis.id, jobDescriptionId: jd.body.jobDescription.id, goalSkills: ["Testing"] });
  assert.equal(llm.calls, callsBefore + 1);
  assert.equal(llm.lastRequest.schemaName, "learning_roadmap");
  assert.match(llm.lastRequest.user, /GraphQL/);
  assert.match(llm.lastRequest.user, /Already demonstrated.*React/, "demonstrated skills are excluded from teaching");
  assert.match(llm.lastRequest.user, /<job_description>/);

  const { roadmap, skillGaps, sources } = created;
  assert.equal(roadmap.status, "active");
  assert.equal(roadmap.version, 1);
  assert.equal(roadmap.targetRole, "Frontend Developer");
  assert.ok(roadmap.milestones.length >= 3);
  assert.deepEqual(roadmap.milestones.map((m) => m.sequenceNumber), roadmap.milestones.map((_, i) => i + 1));
  assert.equal(roadmap.milestones[0].status, "not_started");
  assert.equal(roadmap.milestones[1].status, "locked", "prerequisite locking at creation");
  assert.ok(roadmap.milestones[1].tasks.every((t) => t.locked));
  assert.ok(roadmap.estimatedHours > 0);
  assert.equal(roadmap.progress.percent, 0);
  assert.deepEqual(sources.map((s) => s.type).sort(), ["job_description", "resume_analysis"]);
  assert.equal(roadmap.provider, "fake");
  assert.equal(roadmap.sources.jobDescriptionId, jd.body.jobDescription.id);
  const cpTask = allTasks(roadmap).find((t) => t.taskType === "knowledge_checkpoint");
  assert.ok(cpTask.checkpoint.questions.every((q) => !("correctIndex" in q)), "correct answers hidden from the client");
  const gapNames = skillGaps.skills.map((s) => s.skillName);
  assert.ok(gapNames.includes("GraphQL") && gapNames.includes("Docker") && gapNames.includes("Testing"));

  // persisted
  assert.equal(prisma.tables.learningRoadmap.length, 1);
  assert.equal(prisma.tables.roadmapMilestone.length, roadmap.milestones.length);
  assert.equal(prisma.tables.learningTask.length, allTasks(roadmap).length);
  assert.ok(prisma.tables.learningResource.every((r) => r.url === null || r.urlVerified), "only verified URLs are stored");
  const gapsRes = await api("/api/learning/skill-gaps", { token });
  assert.equal(gapsRes.status, 200);
  assert.ok(gapsRes.body.skillGaps.length >= 4);
  assert.equal(gapsRes.body.skillGaps.find((g) => g.skillName === "GraphQL").proficiencyStatus, "not_demonstrated");
  assert.equal(gapsRes.body.skillGaps.find((g) => g.skillName === "React").proficiencyStatus, "demonstrated");

  const get = await api(`/api/learning/roadmaps/${roadmap.id}`, { token });
  assert.equal(get.status, 200);
  assert.equal(get.body.roadmap.milestones.length, roadmap.milestones.length);
  const list = await api("/api/learning/roadmaps", { token });
  assert.equal(list.body.roadmaps.length, 1);
  assert.equal(list.body.roadmaps[0].progress.percent, 0);
  assert.equal((await api("/api/learning/roadmaps?status=bogus", { token })).status, 400);
});

test("create roadmap: nothing to plan → 400; malformed AI output and provider failure persist nothing", async () => {
  const token = await registerUser("p7-fail@example.com");
  const before = prisma.tables.learningRoadmap.length;
  const nothing = await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, targetRole: "Astronaut" } });
  assert.equal(nothing.status, 400);
  assert.match(nothing.body.error.message, /nothing to plan/i);

  try {
    behaviour = (req) => (req.schemaName === "learning_roadmap" ? { title: "x", milestones: [] } : undefined);
    const malformed = await api("/api/learning/roadmaps", { method: "POST", token, body: setup });
    assert.ok(malformed.status >= 500, "schema-invalid output is rejected");
    behaviour = (req) => { if (req.schemaName === "learning_roadmap") throw new ApiError(504, "timeout", { code: "LLM_TIMEOUT", retryable: true }); };
    const down = await api("/api/learning/roadmaps", { method: "POST", token, body: setup });
    assert.equal(down.status, 504);
    assert.equal(down.body.error.retryable, true);
    // Structurally valid but useless: every milestone teaches a demonstrated skill → 502 LLM_INVALID_OUTPUT
    behaviour = (req) => (req.schemaName === "learning_roadmap" ? validRoadmapOutput({ user: "1. React [F] —\n2. React [F] —\n3. React [F] —" }) : undefined);
    const useless = await api("/api/learning/roadmaps", { method: "POST", token, body: { ...setup, confirmedSkills: ["React"] } });
    assert.equal(useless.status, 502);
    assert.equal(useless.body.error.code, "LLM_INVALID_OUTPUT");
  } finally { behaviour = null; }
  assert.equal(prisma.tables.learningRoadmap.length, before, "failed generations persist nothing");
  assert.equal(prisma.tables.learningRoadmap.filter((r) => r.title === "x").length, 0);
});

// ─── HTTP: task lifecycle ───────────────────────────────────────────────────

test("tasks: start, notes, complete, locking, milestone completion, reopen, skip, progress & weekly plan", async () => {
  const token = await registerUser("p7-tasks@example.com");
  const { roadmap } = await createRoadmap(token);
  const [m1, m2] = roadmap.milestones;
  const lockedTask = m2.tasks[0];
  const locked = await api(`/api/learning/tasks/${lockedTask.id}/complete`, { method: "POST", token, body: {} });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.error.code, "MILESTONE_LOCKED");
  const lockedCp = m2.tasks.find((t) => t.taskType === "knowledge_checkpoint");
  const lockedQuiz = await api(`/api/learning/tasks/${lockedCp.id}/checkpoints/cp/submit`, { method: "POST", token, body: { answers: { q1: 0, q2: 1, q3: 2 } } });
  assert.equal(lockedQuiz.status, 409, "quiz on a locked milestone is rejected");
  assert.equal(lockedQuiz.body.error.code, "MILESTONE_LOCKED");

  const t1 = m1.tasks[0];
  const started = await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { status: "in_progress", notes: "Reading docs", addStudyMinutes: 25 } });
  assert.equal(started.status, 200);
  assert.equal(started.body.task.status, "in_progress");
  assert.ok(started.body.task.startedAt);
  assert.equal(started.body.task.actualStudyMinutes, 25);
  assert.equal((await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: {} })).status, 400);
  const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const scheduled = await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { scheduledDate: future } });
  assert.equal(scheduled.status, 200);
  assert.equal(String(scheduled.body.task.scheduledDate).slice(0, 10), future);
  assert.equal(scheduled.body.task.status, "in_progress", "rescheduling never changes completion state");
  const planned = await api(`/api/learning/roadmaps/${roadmap.id}/progress`, { token });
  assert.ok(planned.body.weeklyPlan.sessions.find((s) => s.date === future)?.tasks.some((x) => x.taskId === t1.id), "scheduled task appears on its day in the weekly plan");
  assert.equal((await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { scheduledDate: null } })).body.task.scheduledDate, null, "schedule can be cleared");
  assert.equal((await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { scheduledDate: "not-a-date" } })).status, 400);
  assert.equal((await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { status: "completed" } })).status, 400, "completion goes through /complete");

  let r = await api(`/api/learning/roadmaps/${roadmap.id}`, { token });
  assert.equal(r.body.roadmap.milestones[0].status, "in_progress");
  assert.equal(r.body.progress, undefined);
  assert.equal(r.body.roadmap.progress.inProgressTasks, 1);

  const done = await api(`/api/learning/tasks/${t1.id}/complete`, { method: "POST", token, body: { notes: "Finished", addStudyMinutes: 10 } });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.status, "completed");
  assert.ok(done.body.task.completedAt);
  assert.equal(done.body.progress.completedTasks, 1);
  assert.equal(done.body.milestoneStatus.status, "in_progress");
  assert.equal((await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { status: "in_progress" } })).status, 409, "completed tasks must be reopened first");

  // Checkpoint task cannot be completed without passing the quiz
  const cpTask = m1.tasks.find((t) => t.taskType === "knowledge_checkpoint");
  const noQuiz = await api(`/api/learning/tasks/${cpTask.id}/complete`, { method: "POST", token, body: {} });
  assert.equal(noQuiz.status, 409);
  assert.equal(noQuiz.body.error.code, "CHECKPOINT_NOT_PASSED");
  const failAttempt = await api(`/api/learning/tasks/${cpTask.id}/checkpoints/cp/submit`, { method: "POST", token, body: { answers: { q1: 3, q2: 3, q3: 3 } } });
  assert.equal(failAttempt.status, 200);
  assert.equal(failAttempt.body.passed, false);
  assert.equal(failAttempt.body.score, 0);
  assert.equal(failAttempt.body.task.status, "not_started");
  assert.ok(failAttempt.body.results.every((x) => typeof x.correctIndex === "number" && x.explanation), "explanations revealed after an attempt");
  assert.equal((await api(`/api/learning/tasks/${cpTask.id}/checkpoints/nope/submit`, { method: "POST", token, body: { answers: { q1: 0 } } })).status, 404);
  assert.equal((await api(`/api/learning/tasks/${cpTask.id}/checkpoints/cp/submit`, { method: "POST", token, body: {} })).status, 400);
  const passAttempt = await api(`/api/learning/tasks/${cpTask.id}/checkpoints/cp/submit`, { method: "POST", token, body: { answers: { q1: 0, q2: 1, q3: 2 } } });
  assert.equal(passAttempt.body.passed, true);
  assert.equal(passAttempt.body.task.status, "completed", "passing the checkpoint completes the task");
  assert.equal(passAttempt.body.task.checkpointAttempts.length, 2);

  // Complete the remaining required task in milestone 1 → milestone completes, milestone 2 unlocks
  for (const t of m1.tasks) if (t.id !== t1.id && t.id !== cpTask.id) assert.equal((await api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", token, body: {} })).status, 200);
  r = await api(`/api/learning/roadmaps/${roadmap.id}`, { token });
  assert.equal(r.body.roadmap.milestones[0].status, "completed");
  assert.ok(r.body.roadmap.milestones[0].completedAt);
  assert.equal(r.body.roadmap.milestones[1].status, "not_started", "unlocked after prerequisite completed");
  assert.equal(r.body.roadmap.progress.completedMilestones, 1);
  assert.equal(r.body.roadmap.progress.percent, Math.round((m1.tasks.length / allTasks(roadmap).length) * 100));
  assert.equal((await api(`/api/learning/tasks/${lockedTask.id}/complete`, { method: "POST", token, body: {} })).status, 200, "previously locked task is now completable");

  // Progress endpoint: weekly plan & next action (milestone 2 is unlocked and has open tasks)
  const prog = await api(`/api/learning/roadmaps/${roadmap.id}/progress`, { token });
  assert.equal(prog.status, 200);
  assert.equal(prog.body.weeklyPlan.weeklyTargetMinutes, 360);
  assert.equal(prog.body.weeklyPlan.sessions.length, 7);
  assert.ok(prog.body.nextAction && prog.body.nextAction.taskId, "a next action is suggested");
  assert.equal(m2.tasks.some((t) => t.id === prog.body.nextAction.taskId), true, "next action comes from the unlocked milestone");
  assert.notEqual(prog.body.nextAction.taskId, lockedTask.id);

  // Reopen drops milestone back to in_progress and re-locks dependants
  const reopened = await api(`/api/learning/tasks/${t1.id}/reopen`, { method: "POST", token });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.task.status, "in_progress");
  assert.equal(reopened.body.task.completedAt, null);
  r = await api(`/api/learning/roadmaps/${roadmap.id}`, { token });
  assert.equal(r.body.roadmap.milestones[0].status, "in_progress");
  assert.equal(r.body.roadmap.milestones[1].status, "locked");
  assert.equal((await api(`/api/learning/tasks/${t1.id}/reopen`, { method: "POST", token })).status, 409);

  // Skip is allowed and excluded from completion
  const skipped = await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { status: "skipped" } });
  assert.equal(skipped.body.task.status, "skipped");
  r = await api(`/api/learning/roadmaps/${roadmap.id}`, { token });
  assert.equal(r.body.roadmap.milestones[0].status, "in_progress", "skipped required task does not complete a milestone");
  assert.equal(r.body.roadmap.progress.skippedTasks, 1);

  // With milestone 1 reopened and milestone 2 locked again, nothing is available → no next action
  const prog2 = await api(`/api/learning/roadmaps/${roadmap.id}/progress`, { token });
  assert.equal(prog2.body.nextAction, null);

  // Task listing & resources
  const tasks = await api(`/api/learning/roadmaps/${roadmap.id}/tasks?status=completed`, { token });
  assert.equal(tasks.status, 200);
  assert.ok(tasks.body.tasks.length >= 2 && tasks.body.tasks.every((t) => t.status === "completed" && t.milestone?.title));
  const res = await api(`/api/learning/tasks/${t1.id}/resources`, { token });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.resources));
});

// ─── HTTP: recommendations & skill gaps ─────────────────────────────────────

test("recommendations reflect state and can be dismissed; skill gap confirmation sticks across regeneration", async () => {
  const token = await registerUser("p7-recs@example.com");
  const empty = await api("/api/learning/recommendations", { token });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.recommendations[0].key, "create-roadmap");
  assert.equal(empty.body.nextAction, null);
  const gaps0 = await api("/api/learning/skill-gaps", { token });
  assert.deepEqual(gaps0.body.skillGaps, []);

  const { roadmap } = await createRoadmap(token, { weeklyStudyHours: 3 });
  const t1 = roadmap.milestones[0].tasks[0];
  await api(`/api/learning/tasks/${t1.id}`, { method: "PATCH", token, body: { status: "in_progress" } });
  let recs = await api("/api/learning/recommendations", { token });
  assert.equal(recs.body.recommendations[0].key, `resume:${t1.id}`);
  assert.equal(recs.body.nextAction.taskId, t1.id);
  const gapsNow = await api("/api/learning/skill-gaps", { token });
  const inProg = gapsNow.body.skillGaps.find((g) => g.skillName.toLowerCase() === t1.skillName.toLowerCase());
  assert.equal(inProg?.proficiencyStatus, "learning_in_progress", "active task marks the gap as in progress");

  const dismiss = await api(`/api/learning/recommendations/${encodeURIComponent(`resume:${t1.id}`)}/dismiss`, { method: "POST", token });
  assert.equal(dismiss.status, 204);
  recs = await api("/api/learning/recommendations", { token });
  assert.ok(!recs.body.recommendations.some((r) => r.key === `resume:${t1.id}`));
  assert.equal((await api(`/api/learning/recommendations/${encodeURIComponent(`resume:${t1.id}`)}/dismiss`, { method: "POST", token })).status, 204, "idempotent");

  // Confirm a skill as demonstrated; regeneration keeps the user's verdict
  const gap = gapsNow.body.skillGaps.find((g) => g.skillName !== t1.skillName && g.proficiencyStatus !== "demonstrated");
  const upd = await api(`/api/learning/skill-gaps/${gap.id}`, { method: "PATCH", token, body: { proficiencyStatus: "demonstrated", userNote: "Used daily at work" } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.skillGap.userConfirmed, true);
  assert.equal(upd.body.skillGap.proficiencyStatus, "demonstrated");
  assert.equal((await api(`/api/learning/skill-gaps/${gap.id}`, { method: "PATCH", token, body: {} })).status, 400);
  const regen = await api(`/api/learning/roadmaps/${roadmap.id}/regenerate`, { method: "POST", token, body: { apply: true } });
  assert.equal(regen.status, 201);
  const after = await api("/api/learning/skill-gaps", { token });
  assert.equal(after.body.skillGaps.find((g) => g.id === gap.id).proficiencyStatus, "demonstrated");
  assert.match(llm.lastRequest.user, new RegExp(`Already demonstrated.*${gap.skillName}`), "confirmed skill excluded from the new roadmap");
});

// ─── HTTP: regeneration & versions ──────────────────────────────────────────

test("regenerate: preview does not persist; apply creates v2, supersedes v1, carries completed tasks", async () => {
  const token = await registerUser("p7-regen@example.com");
  const { roadmap: v1 } = await createRoadmap(token);
  const t1 = v1.milestones[0].tasks[0];
  assert.equal((await api(`/api/learning/tasks/${t1.id}/complete`, { method: "POST", token, body: { actualStudyMinutes: 30 } })).status, 200);

  const count = prisma.tables.learningRoadmap.length;
  const preview = await api(`/api/learning/roadmaps/${v1.id}/regenerate`, { method: "POST", token, body: { weeklyStudyHours: 10, reason: "More time available" } });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.preview, true);
  assert.equal(preview.body.changes.completedCarriedOver, 1);
  assert.equal(preview.body.changes.reason, "More time available");
  assert.ok(preview.body.roadmap.milestones.length >= 3);
  assert.equal(prisma.tables.learningRoadmap.length, count, "preview persists nothing");

  const applied = await api(`/api/learning/roadmaps/${v1.id}/regenerate`, { method: "POST", token, body: { apply: true, weeklyStudyHours: 10, currentSkillLevel: "advanced" } });
  assert.equal(applied.status, 201);
  const v2 = applied.body.roadmap;
  assert.equal(v2.version, 2);
  assert.equal(v2.previousVersionId, v1.id);
  assert.equal(v2.status, "active");
  assert.equal(v2.weeklyStudyHours, 10);
  assert.equal(v2.currentSkillLevel, "advanced");
  assert.equal(v2.changeSummary.completedCarriedOver, 1);
  const carried = allTasks(v2).find((t) => t.status === "completed");
  assert.ok(carried && carried.skillName === t1.skillName);
  assert.equal(carried.actualStudyMinutes, 30);
  assert.equal(v2.progress.completedTasks, 1);

  const old = await api(`/api/learning/roadmaps/${v1.id}`, { token });
  assert.equal(old.body.roadmap.status, "superseded", "history is preserved, not deleted");
  const stale = await api(`/api/learning/tasks/${v1.milestones[0].tasks[1].id}/complete`, { method: "POST", token, body: {} });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "ROADMAP_INACTIVE");
  const all = await api("/api/learning/roadmaps", { token });
  assert.equal(all.body.roadmaps.length, 2);
  assert.equal(all.body.roadmaps[0].status, "active");
  const history = await api("/api/learning/roadmaps?status=superseded", { token });
  assert.deepEqual(history.body.roadmaps.map((r) => r.id), [v1.id]);

  // Archive / re-activate via PATCH keeps exactly one active roadmap
  assert.equal((await api(`/api/learning/roadmaps/${v2.id}`, { method: "PATCH", token, body: { status: "archived", title: "Paused plan" } })).body.roadmap.status, "archived");
  const reactivated = await api(`/api/learning/roadmaps/${v1.id}`, { method: "PATCH", token, body: { status: "active" } });
  assert.equal(reactivated.body.roadmap.status, "active");
  assert.deepEqual(prisma.tables.learningRoadmap.filter((r) => [v1.id, v2.id].includes(r.id) && r.status === "active").map((r) => r.id), [v1.id]);
});

// ─── Ownership ──────────────────────────────────────────────────────────────

test("ownership: another user cannot read, modify, regenerate or delete; delete cascades and keeps skill gaps", async () => {
  const owner = await registerUser("p7-owner@example.com");
  const other = await registerUser("p7-other@example.com");
  const { roadmap } = await createRoadmap(owner);
  const task = roadmap.milestones[0].tasks[0];
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}`, { token: other })).status, 404);
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}/tasks`, { token: other })).status, 404);
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}/progress`, { token: other })).status, 404);
  assert.equal((await api(`/api/learning/tasks/${task.id}`, { method: "PATCH", token: other, body: { status: "in_progress" } })).status, 404);
  assert.equal((await api(`/api/learning/tasks/${task.id}/complete`, { method: "POST", token: other, body: {} })).status, 404);
  assert.equal((await api(`/api/learning/tasks/${task.id}/resources`, { token: other })).status, 404);
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}/regenerate`, { method: "POST", token: other, body: {} })).status, 404);
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}`, { method: "DELETE", token: other })).status, 404);
  const ownerGaps = (await api("/api/learning/skill-gaps", { token: owner })).body.skillGaps;
  assert.equal((await api(`/api/learning/skill-gaps/${ownerGaps[0].id}`, { method: "PATCH", token: other, body: { userNote: "x" } })).status, 404);
  assert.deepEqual((await api("/api/learning/skill-gaps", { token: other })).body.skillGaps, []);
  assert.deepEqual((await api("/api/learning/roadmaps", { token: other })).body.roadmaps, []);

  const taskCount = prisma.tables.learningTask.length;
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}`, { method: "DELETE", token: owner })).status, 204);
  assert.equal((await api(`/api/learning/roadmaps/${roadmap.id}`, { token: owner })).status, 404);
  assert.equal(prisma.tables.learningTask.length, taskCount - allTasks(roadmap).length, "milestones/tasks cascade");
  assert.ok(prisma.tables.skillGap.filter((g) => g.roadmapId === null).length >= ownerGaps.length, "skill gaps survive with roadmapId nulled");
});
