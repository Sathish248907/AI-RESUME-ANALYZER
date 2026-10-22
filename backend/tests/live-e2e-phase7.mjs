// Live Phase 7 probe against the running backend (Neon Postgres + configured LLM). Not part of the suite.
// Uses one AI call (roadmap generation) and exercises the task / checkpoint / skill-gap / recommendation flow.
const BASE = "http://localhost:4000";
const email = `e2e_p7_${Date.now()}@example.com`;
const password = "password123";
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);

async function api(path, { method = "GET", body, timeout = 340000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally { clearTimeout(timer); }
}
async function must(label, p, ok = (s) => s < 300) {
  const r = await p;
  if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`); process.exit(1); }
  log(`ok   ${label} (${r.status})`);
  return r.body;
}

const reg = await must("register", api("/api/auth/register", { method: "POST", body: { email, password, name: "E2E P7" } }));
token = reg.token;

const empty = await must("recommendations (no roadmap)", api("/api/learning/recommendations"));
if (empty.recommendations[0]?.key !== "create-roadmap") { log("FAIL expected create-roadmap recommendation"); process.exit(1); }
await must("skill gaps empty", api("/api/learning/skill-gaps"));
await must("validation rejects bad input", api("/api/learning/roadmaps", { method: "POST", body: { targetRole: "x", currentSkillLevel: "wizard", weeklyStudyHours: 0, objective: "job_readiness" } }), (s) => s === 400);

log("     generating roadmap via", (await api("/api/health")).body.ai.model, "…");
const created = await must("create roadmap (AI)", api("/api/learning/roadmaps", { method: "POST", body: { targetRole: "Frontend Developer", currentSkillLevel: "intermediate", weeklyStudyHours: 5, preferredSchedule: "weekdays", objective: "job_readiness", preferredFormat: "mixed", goalSkills: ["GraphQL", "Docker"], confirmedSkills: ["HTML", "CSS"], useInterviewHistory: true } }));
const rm = created.roadmap;
log(`     "${rm.title}" — ${rm.milestones.length} milestones, ${rm.milestones.reduce((s, m) => s + m.tasks.length, 0)} tasks, ${rm.estimatedHours} h, provider ${rm.provider}/${rm.model}`);
for (const m of rm.milestones) log(`       ${m.sequenceNumber}. [${m.status}] ${m.title} (${m.requiredSkills.join(", ")}) prereq=${JSON.stringify(m.prerequisiteSequences)} tasks=${m.tasks.length}`);
const resources = rm.milestones.flatMap((m) => m.tasks.flatMap((t) => t.resources));
log(`     resources stored: ${resources.length}, verified URLs: ${resources.filter((r) => r.urlVerified).length}, invented URLs: ${resources.filter((r) => r.url && !r.urlVerified).length}`);
const gapNames = created.skillGaps.skills.map((s) => `${s.skillName}:${s.proficiencyStatus}/${s.priority}`);
log("     skill gaps:", gapNames.slice(0, 12).join(", "));
if (!created.skillGaps.skills.some((s) => s.skillName === "HTML" && s.proficiencyStatus === "demonstrated")) { log("FAIL confirmed skill should be demonstrated"); process.exit(1); }

const got = await must("get roadmap", api(`/api/learning/roadmaps/${rm.id}`));
const m1 = got.roadmap.milestones[0];
const firstTask = m1.tasks.find((t) => t.taskType !== "knowledge_checkpoint") ?? m1.tasks[0];
const lockedMilestone = got.roadmap.milestones.find((m) => m.status === "locked");
if (lockedMilestone) await must("locked task cannot be completed", api(`/api/learning/tasks/${lockedMilestone.tasks[0].id}/complete`, { method: "POST", body: {} }), (s) => s === 409);

const started = await must("start task", api(`/api/learning/tasks/${firstTask.id}`, { method: "PATCH", body: { status: "in_progress", addStudyMinutes: 20 } }));
if (started.task.status !== "in_progress") { log("FAIL start"); process.exit(1); }
const recs1 = await must("recommendations (in progress)", api("/api/learning/recommendations"));
log("     recs:", recs1.recommendations.map((r) => `${r.type}:${r.title}`).slice(0, 4).join(" | "));
if (recs1.recommendations[0]?.key !== `resume:${firstTask.id}`) { log("FAIL expected continue recommendation first"); process.exit(1); }
const gaps1 = await must("skill gaps (in progress marker)", api("/api/learning/skill-gaps"));
log("     gap for", firstTask.skillName, "→", gaps1.skillGaps.find((g) => g.skillName.toLowerCase() === firstTask.skillName.toLowerCase())?.proficiencyStatus ?? "(skill not in gap list)");

const done = await must("complete task", api(`/api/learning/tasks/${firstTask.id}/complete`, { method: "POST", body: { notes: "Live E2E", actualStudyMinutes: 45 } }));
log(`     progress ${done.progress.percent}% · milestone ${done.milestoneStatus.status}`);

const cpTask = got.roadmap.milestones.flatMap((m) => m.tasks).find((t) => t.checkpoint?.type === "mcq" && !t.locked);
if (cpTask) {
  const cp = cpTask.checkpoint;
  if (cp.questions.some((q) => "correctIndex" in q)) { log("FAIL correct answers leaked to client"); process.exit(1); }
  const wrong = Object.fromEntries(cp.questions.map((q) => [q.id, 0]));
  const attempt = await must("submit checkpoint (all option 0)", api(`/api/learning/tasks/${cpTask.id}/checkpoints/${cp.id}/submit`, { method: "POST", body: { answers: wrong } }));
  log(`     quiz: ${attempt.score}% (${attempt.attempt.correct}/${attempt.attempt.total}) passed=${attempt.passed}; explanations revealed=${attempt.results.every((r) => r.explanation)}`);
  if (!attempt.passed) {
    const right = Object.fromEntries(attempt.results.map((r) => [r.questionId, r.correctIndex]));
    const pass = await must("submit checkpoint (corrected)", api(`/api/learning/tasks/${cpTask.id}/checkpoints/${cp.id}/submit`, { method: "POST", body: { answers: right } }));
    log(`     quiz retake: ${pass.score}% passed=${pass.passed} task=${pass.task.status}`);
  }
} else log("     (no unlocked MCQ checkpoint in this roadmap — skipped quiz check)");

const prog = await must("progress + weekly plan", api(`/api/learning/roadmaps/${rm.id}/progress`));
log(`     weekly target ${prog.weeklyPlan.weeklyTargetMinutes} min, study days ${prog.weeklyPlan.sessions.filter((s) => s.studyDay).length}, planned ${prog.weeklyPlan.sessions.reduce((s, d) => s + d.tasks.length, 0)} tasks; next: ${prog.nextAction?.title ?? "none"}`);
const reopened = await must("reopen task", api(`/api/learning/tasks/${firstTask.id}/reopen`, { method: "POST" }));
if (reopened.task.status !== "in_progress") { log("FAIL reopen"); process.exit(1); }
await must("dismiss recommendation", api(`/api/learning/recommendations/${encodeURIComponent(`resume:${firstTask.id}`)}/dismiss`, { method: "POST" }), (s) => s === 204);
const recs2 = await must("recommendations after dismiss", api("/api/learning/recommendations"));
if (recs2.recommendations.some((r) => r.key === `resume:${firstTask.id}`)) { log("FAIL dismissed rec still present"); process.exit(1); }

const gap = gaps1.skillGaps.find((g) => g.proficiencyStatus !== "demonstrated");
if (gap) {
  const upd = await must("confirm a skill gap", api(`/api/learning/skill-gaps/${gap.id}`, { method: "PATCH", body: { proficiencyStatus: "demonstrated", userNote: "live e2e" } }));
  log(`     ${upd.skillGap.skillName} → ${upd.skillGap.proficiencyStatus} (confirmed=${upd.skillGap.userConfirmed})`);
}
const list = await must("list roadmaps", api("/api/learning/roadmaps"));
log(`     ${list.total} roadmap(s), active progress ${list.roadmaps[0].progress.percent}%`);

// relogin → persistence
const login = await must("login again", api("/api/auth/login", { method: "POST", body: { email, password } }));
token = login.token;
const again = await must("roadmap persisted after re-login", api(`/api/learning/roadmaps/${rm.id}`));
log(`     tasks in progress: ${again.roadmap.progress.inProgressTasks}, completed: ${again.roadmap.progress.completedTasks}`);

// cleanup
await must("delete roadmap", api(`/api/learning/roadmaps/${rm.id}`, { method: "DELETE" }), (s) => s === 204);
const gapsAfter = await must("skill gaps survive roadmap deletion", api("/api/learning/skill-gaps"));
log(`     ${gapsAfter.skillGaps.length} skill gap rows kept (roadmapId nulled)`);
log("PHASE 7 LIVE E2E PASSED for", email, "(test user remains; roadmap deleted, skill gaps kept)");
