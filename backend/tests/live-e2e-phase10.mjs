// Live Phase 10 probe against the running backend (Neon + configured LLM). AI calls: one analysis, one interview
// (questions + 3 evaluations), one roadmap, one report narrative (Gemini). Everything else is deterministic.
// Creates a fresh user; records stay so the UI can be inspected afterwards.
import { JOB_DESCRIPTION, RESUME_TEXT } from "./fixtures.js";

const BASE = "http://localhost:4000";
const TZ = "Asia/Kolkata";
const email = `e2e_p10_${Date.now()}@example.com`;
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
async function api(path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(340000) });
  if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") };
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function must(label, p, ok = (s) => s < 300) { const r = await p; if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`); process.exit(1); } log(`ok   ${label} (${r.status})`); return r.body ?? r; }

token = (await must("register", api("/api/auth/register", { method: "POST", body: { email, password: "password123", name: "E2E P10" } }))).token;
const empty = await must("gamification profile (empty)", api(`/api/gamification/profile?tz=${TZ}`));
log(`     points=${empty.profile.totalPoints} level=${empty.profile.level.level} ${empty.profile.level.name} tz=${empty.profile.timezone}`);
const emptyOv = await must("analytics overview (empty)", api("/api/analytics/overview?range=30d"));
log(`     emptyState: ${emptyOv.analytics.emptyState?.slice(0, 60)} progress=${emptyOv.progress.overallScore} (${emptyOv.progress.label})`);

log("     AI analysis (Gemini) …");
const an = await must("AI analysis", api("/api/analysis/resume", { method: "POST", body: { resumeText: RESUME_TEXT, jobTitle: "Senior Frontend Developer", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } }));
log(`     match ${an.analysis.matchScore}%`);
const jd = await must("save JD", api("/api/job-descriptions", { method: "POST", body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } }));
await must("track application", api("/api/applications", { method: "POST", body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", status: "APPLIED", jobDescriptionId: jd.jobDescription.id, analysisId: an.analysis.id } }));

log("     mock interview (Gemini questions + 3 evaluations) …");
const s = await must("create interview", api("/api/interviews", { method: "POST", body: { targetRole: "Frontend Developer", interviewType: "technical", difficulty: "intermediate", durationMinutes: 10, questionCount: 5 } }));
for (const q of s.session.questions.slice(0, 3)) await must(`evaluate ${q.id.slice(-4)}`, api(`/api/interviews/${s.session.id}/answers/${q.id}/evaluate`, { method: "POST", body: { answerText: "React re-renders a component when its state or props change; keys help reconcile lists, useMemo and useCallback avoid recreating values, and React.memo skips re-rendering when props are shallowly equal. I measure with the Profiler before optimising." } }));
const done = await must("complete interview", api(`/api/interviews/${s.session.id}/complete`, { method: "POST", body: {} }));
log(`     interview score ${done.session.score ?? done.session.overallScore}`);

log("     learning roadmap (Gemini) …");
const rm = await must("create roadmap", api("/api/learning/roadmaps", { method: "POST", body: { targetRole: "Frontend Developer", currentSkillLevel: "intermediate", weeklyStudyHours: 5, preferredSchedule: "flexible", objective: "job_readiness", preferredFormat: "mixed", analysisId: an.analysis.id, jobDescriptionId: jd.jobDescription.id } }));
const tasks = rm.roadmap.milestones[0].tasks.filter((t) => !t.checkpoint).slice(0, 2);
for (const t of tasks) await must(`complete task “${t.title.slice(0, 30)}”`, api(`/api/learning/tasks/${t.id}/complete`, { method: "POST", body: { actualStudyMinutes: 25 } }));

const goal = await must("create goal", api("/api/goals", { method: "POST", body: { title: "Finish two more mock interviews", goalType: "mock_interviews", targetValue: 2 } }));
const prof = await must("gamification profile (seeded)", api(`/api/gamification/profile?tz=${TZ}`));
log(`     points=${prof.profile.totalPoints} level=${prof.profile.level.level} ${prof.profile.level.name} streak=${prof.profile.streak.currentStreak} unlocked=${prof.profile.achievementsUnlocked}/${prof.profile.achievementsTotal}`);
log(`     recent: ${prof.profile.recentTransactions.map((t) => `${t.points >= 0 ? "+" : ""}${t.points} ${t.eventType}`).join(", ")}`);
const again = await must("profile again (idempotent)", api(`/api/gamification/profile?tz=${TZ}`));
if (again.profile.totalPoints !== prof.profile.totalPoints) { log("FAIL idempotency"); process.exit(1); }
const ach = await must("achievements", api("/api/gamification/achievements"));
log(`     unlocked: ${ach.achievements.filter((a) => a.unlocked).map((a) => a.key).join(", ")}`);
const st = await must("streaks", api(`/api/gamification/streaks?tz=${TZ}`));
log(`     streak ${st.streaks.currentStreak}/${st.streaks.longestStreak}, today ${st.streaks.today}, cells ${st.streaks.calendar.cells.length}`);

// Reversal: reopen a task → points reversed; complete again → net one award.
await must("reopen task", api(`/api/learning/tasks/${tasks[0].id}/reopen`, { method: "POST" }));
const afterReopen = await must("profile after reopen", api("/api/gamification/profile"));
log(`     points after reopen ${afterReopen.profile.totalPoints} (was ${prof.profile.totalPoints})`);
await must("complete task again", api(`/api/learning/tasks/${tasks[0].id}/complete`, { method: "POST", body: {} }));
const afterRedo = await must("profile after redo", api("/api/gamification/profile"));
log(`     points after redo ${afterRedo.profile.totalPoints}`);
if (afterRedo.profile.totalPoints !== prof.profile.totalPoints || afterReopen.profile.totalPoints >= prof.profile.totalPoints) { log("FAIL reversal maths"); process.exit(1); }

const ov = await must("analytics overview (7d)", api(`/api/analytics/overview?range=7d&tz=${TZ}`));
log(`     kpis: ${ov.analytics.kpis.map((k) => `${k.label}=${k.current}`).join(" | ")}`);
log(`     progress ${ov.progress.overallScore} (${ov.progress.label}); dims ${ov.progress.dimensions.map((d) => `${d.key}:${d.score ?? "—"}`).join(", ")}`);
const cp = await must("career progress", api("/api/analytics/career-progress"));
log(`     snapshot history length ${cp.history.length}`);
await must("skills analytics", api("/api/analytics/skills"));
await must("interview analytics", api("/api/analytics/interviews?range=30d"));
await must("resume analytics", api("/api/analytics/resume?range=all"));
const fun = await must("application analytics", api("/api/analytics/applications?range=90d"));
log(`     funnel: ${fun.applications.funnel.map((f) => `${f.stage}=${f.count}`).join(", ")}; rates available=${fun.applications.rates.available}`);

const goals = await must("list goals", api("/api/goals"));
log(`     goal “${goals.goals[0].title}” ${goals.goals[0].progress.currentValue}/${goals.goals[0].targetValue} status=${goals.goals[0].status}`);

log("     weekly report (Gemini narrative) …");
const rep = await must("generate weekly report", api("/api/progress-reports/generate", { method: "POST", body: { periodType: "weekly", tz: TZ } }));
log(`     aiUsed=${rep.report.aiUsed} provider=${rep.report.provider} source=${rep.report.narrative?.source}`);
log(`     summary: ${rep.report.narrative?.summary?.slice(0, 160)}`);
log(`     priorities: ${rep.report.narrative?.priorities?.slice(0, 2).join(" | ")}`);
const pdf = await must("report PDF", api(`/api/progress-reports/${rep.report.id}/pdf`, { raw: true }));
log(`     pdf ${pdf.type} ${pdf.buffer.length} bytes starts ${pdf.buffer.subarray(0, 4)}`);
const notes = await must("notifications", api("/api/notifications"));
log(`     ${notes.total} notifications, ${notes.unread} unread: ${notes.notifications.slice(0, 4).map((n) => n.type).join(", ")}`);
if (notes.notifications[0]) await must("mark read", api(`/api/notifications/${notes.notifications[0].id}/read`, { method: "PATCH" }));
await must("read all", api("/api/notifications/read-all", { method: "POST" }));
await must("preferences", api("/api/notifications/preferences", { method: "PATCH", body: { streaks: false } }));
log(`DONE in ${Math.round((Date.now() - t0) / 1000)}s — user ${email} / password123 (left in place for UI inspection)`);
