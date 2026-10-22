// Live Phase 7 checkpoint probe (one Gemini call). Generates a roadmap, unlocks the first MCQ
// checkpoint by completing its prerequisite milestones, then verifies server-side grading.
const BASE = "http://localhost:4000";
const email = `e2e_p7cp_${Date.now()}@example.com`;
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(340000) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function must(label, p, ok = (s) => s < 300) {
  const r = await p;
  if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`); process.exit(1); }
  log(`ok   ${label} (${r.status})`);
  return r.body;
}

token = (await must("register", api("/api/auth/register", { method: "POST", body: { email, password: "password123" } }))).token;
const created = await must("create roadmap (AI)", api("/api/learning/roadmaps", { method: "POST", body: { targetRole: "Backend Developer", currentSkillLevel: "beginner", weeklyStudyHours: 8, preferredSchedule: "flexible", objective: "interview_prep", preferredFormat: "exercises", goalSkills: ["SQL", "Docker", "REST APIs"] } }));
let rm = created.roadmap;
const all = () => rm.milestones.flatMap((m) => m.tasks.map((t) => ({ ...t, m })));
const mcqs = all().filter((t) => t.checkpoint?.type === "mcq");
const cps = all().filter((t) => t.checkpoint).map((t) => t.checkpoint.type);
log(`     ${rm.milestones.length} milestones, ${all().length} tasks, checkpoints: ${JSON.stringify(cps)}`);
if (!mcqs.length) { log("NO MCQ checkpoint generated this run — cannot verify live grading (type mix above). Cleaning up."); await api(`/api/learning/roadmaps/${rm.id}`, { method: "DELETE" }); process.exit(2); }
const target = mcqs.sort((a, b) => a.m.sequenceNumber - b.m.sequenceNumber)[0];
log(`     target MCQ: "${target.title}" in milestone ${target.m.sequenceNumber} (${target.checkpoint.questions.length} questions, pass ${target.checkpoint.passScore}%)`);
if (target.checkpoint.questions.some((q) => "correctIndex" in q || "explanation" in q)) { log("FAIL answers leaked"); process.exit(1); }

// Unlock: complete every required task in the transitive prerequisite milestones (and earlier tasks of the target's milestone are not needed).
const bySeq = new Map(rm.milestones.map((m) => [m.sequenceNumber, m]));
const needed = new Set();
(function walk(seq) { for (const p of bySeq.get(seq)?.prerequisiteSequences ?? []) { if (!needed.has(p)) { needed.add(p); walk(p); } } })(target.m.sequenceNumber);
log(`     prerequisite milestones to complete: ${[...needed].sort().join(", ") || "none"}`);
async function finish(t) {
  if (!t.checkpoint) return must(`complete "${t.title}"`, api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", body: { actualStudyMinutes: 10 } }));
  if (t.checkpoint.type !== "mcq") return must(`manual checkpoint "${t.title}"`, api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", body: { checkpointNotes: "live probe self-report", checkedItems: (t.checkpoint.items ?? []).map((_, i) => i) } }));
  const guess = Object.fromEntries(t.checkpoint.questions.map((q) => [q.id, 0]));
  const first = await must(`quiz "${t.title}" (guess)`, api(`/api/learning/tasks/${t.id}/checkpoints/${t.checkpoint.id}/submit`, { method: "POST", body: { answers: guess } }));
  if (first.passed) return first;
  const right = Object.fromEntries(first.results.map((r) => [r.questionId, r.correctIndex]));
  return must(`quiz "${t.title}" (corrected)`, api(`/api/learning/tasks/${t.id}/checkpoints/${t.checkpoint.id}/submit`, { method: "POST", body: { answers: right } }));
}
for (const seq of [...needed].sort((a, b) => a - b)) {
  rm = (await api(`/api/learning/roadmaps/${rm.id}`)).body.roadmap;
  const m = rm.milestones.find((x) => x.sequenceNumber === seq);
  for (const t of m.tasks.filter((t) => t.isRequired && t.status !== "completed")) await finish(t);
  rm = (await api(`/api/learning/roadmaps/${rm.id}`)).body.roadmap;
  log(`     milestone ${seq} → ${rm.milestones.find((x) => x.sequenceNumber === seq).status}`);
}
rm = (await api(`/api/learning/roadmaps/${rm.id}`)).body.roadmap;
const tm = rm.milestones.find((x) => x.sequenceNumber === target.m.sequenceNumber);
log(`     target milestone status: ${tm.status}`);
if (tm.status === "locked") { log("FAIL still locked"); process.exit(1); }

// Wrong answers first (all option index 0 is wrong for at least one question in any real quiz) → not passed unless lucky
const cp = target.checkpoint;
const wrong = Object.fromEntries(cp.questions.map((q) => [q.id, 0]));
const a1 = await must("submit MCQ (all first options)", api(`/api/learning/tasks/${target.id}/checkpoints/${cp.id}/submit`, { method: "POST", body: { answers: wrong } }));
log(`     score ${a1.score}% (${a1.attempt.correct}/${a1.attempt.total}) passed=${a1.passed} task=${a1.task.status}; explanations revealed=${a1.results.every((r) => typeof r.correctIndex === "number" && r.explanation)}`);
if (!a1.results.every((r) => typeof r.correctIndex === "number" && r.explanation)) { log("FAIL results missing explanation"); process.exit(1); }
if (!a1.passed) {
  const right = Object.fromEntries(a1.results.map((r) => [r.questionId, r.correctIndex]));
  const a2 = await must("submit MCQ (corrected)", api(`/api/learning/tasks/${target.id}/checkpoints/${cp.id}/submit`, { method: "POST", body: { answers: right } }));
  log(`     retake: ${a2.score}% passed=${a2.passed} task=${a2.task.status} attempts=${a2.task.checkpointAttempts.length}`);
  if (!a2.passed || a2.task.status !== "completed" || a2.score !== 100) { log("FAIL corrected answers should score 100 and complete the task"); process.exit(1); }
} else if (a1.task.status !== "completed") { log("FAIL passed but not completed"); process.exit(1); }
const after = (await api(`/api/learning/roadmaps/${rm.id}`)).body.roadmap;
const t2 = after.milestones.flatMap((m) => m.tasks).find((t) => t.id === target.id);
log(`     persisted: status=${t2.status}, attempts=${t2.checkpointAttempts.length}, answers now revealed=${t2.checkpoint.questions.every((q) => "correctIndex" in q)}, progress ${after.progress.percent}%`);
await must("delete roadmap", api(`/api/learning/roadmaps/${rm.id}`, { method: "DELETE" }), (s) => s === 204);
log("PHASE 7 CHECKPOINT LIVE E2E PASSED for", email, "(test user remains; roadmap deleted)");
