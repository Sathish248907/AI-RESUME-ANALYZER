// Live Phase 9 probe against the running backend (Neon + configured LLM). AI calls: one analysis (Gemini),
// one coach reply (Gemini). Everything else is deterministic. Cleans up records; the test user remains.
import { JOB_DESCRIPTION, RESUME_TEXT } from "./fixtures.js";

const BASE = "http://localhost:4000";
const email = `e2e_p9_${Date.now()}@example.com`;
let token;
const t0 = Date.now();
const log = (...a) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s]`, ...a);
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { Origin: "http://localhost:3001", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(340000) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function must(label, p, ok = (s) => s < 300) { const r = await p; if (!ok(r.status)) { log(`FAIL ${label}: ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`); process.exit(1); } log(`ok   ${label} (${r.status})`); return r.body; }

token = (await must("register", api("/api/auth/register", { method: "POST", body: { email, password: "password123", name: "E2E P9" } }))).token;
const empty = await must("dashboard (empty account)", api("/api/career/dashboard"));
log(`     hasProfile=${empty.dashboard.hasProfile} readiness=${empty.dashboard.readiness.latest}`);
await must("profile validation", api("/api/career/profile", { method: "PUT", body: { targetRoles: [] } }), (s) => s === 400);
const profile = await must("save profile", api("/api/career/profile", { method: "PUT", body: { careerLevel: "junior", targetRoles: ["Frontend Developer"], industries: ["Fintech"], skills: ["React", "TypeScript"], locations: ["Bangalore"], workMode: "hybrid", goals: "Land a frontend role at a product company." } }));
log(`     profile ${profile.profile.id} roles=${profile.profile.targetRoles}`);

log("     running AI analysis (Gemini) …");
const an = await must("AI analysis", api("/api/analysis/resume", { method: "POST", body: { resumeText: RESUME_TEXT, jobTitle: "Senior Frontend Developer", targetRole: "Frontend Developer", jobDescription: JOB_DESCRIPTION } }));
log(`     match ${an.analysis.matchScore}%`);
const jd = await must("save JD", api("/api/job-descriptions", { method: "POST", body: { jobTitle: "Senior Frontend Developer", companyName: "Acme", targetRole: "Frontend Developer", description: JOB_DESCRIPTION, extractedRequirements: { skills: [{ name: "React", priority: "required" }, { name: "GraphQL", priority: "required" }, { name: "AWS", priority: "preferred" }], parserVersion: "demo-rules-1.0" } } }));
const app = await must("track application", api("/api/applications", { method: "POST", body: { companyName: "Acme", jobTitle: "Senior Frontend Developer", status: "APPLIED", jobDescriptionId: jd.jobDescription.id, analysisId: an.analysis.id, nextFollowUpDate: new Date(Date.now() - 86400000).toISOString(), notes: "Hybrid role in Bangalore" } }));

const assess = await must("readiness assessment", api("/api/career/assessments", { method: "POST", body: {} }));
const a = assess.assessment;
log(`     ${a.targetRole}: ${a.overallScore ?? "—"} (${a.readinessLabel}); included ${a.coverage.componentsIncluded}/${a.coverage.componentsTotal}`);
for (const c of a.components) log(`       ${c.label}: ${c.included ? c.score : "no evidence"} — ${(c.evidence[0] ?? c.missing[0] ?? "").slice(0, 90)}`);
log(`     skills: ${a.skills.slice(0, 8).map((s) => `${s.skillName}:${s.status}`).join(", ")}`);
log(`     recommendations: ${assess.recommendations.map((r) => `${r.priority}:${r.key}`).join(" | ")}`);

const recs = await must("recommendations", api("/api/career/recommendations"));
const followup = recs.recommendations.find((r) => r.key === "application:followups");
if (followup) { const d = await must("mark recommendation done", api(`/api/career/recommendations/${followup.id}`, { method: "PATCH", body: { status: "done" } })); log(`     ${d.recommendation.key} → ${d.recommendation.status}`); }

const jobs = await must("job priorities", api("/api/career/job-priorities"));
for (const j of jobs.items) log(`     ${j.jobTitle} @ ${j.companyName}: priority ${j.priorityScore} (match ${j.matchScore}, status ${j.status}); factors ${j.factors.map((f) => `${f.key}=${f.score ?? "n/a"}`).join(",")}`);
const prep = await must("interview prep", api("/api/career/interview-prep"));
log(`     sessions=${prep.prep.sessionsCompleted}; recommended: ${prep.prep.recommendedSessions.map((s) => s.title).join(" | ")}; untested: ${prep.prep.untestedRequirements.slice(0, 4).join(", ")}`);

const plan = await must("generate weekly plan", api("/api/career/action-plans/generate", { method: "POST", body: { weeklyMinutes: 300 } }));
log(`     plan ${plan.plan.id}: ${plan.plan.tasks.length} tasks, ${plan.plan.summary.requiredMinutes} required min`);
for (const t of plan.plan.tasks.slice(0, 6)) log(`       [${t.category}${t.isOptional ? " optional" : ""}] ${t.title} (${t.estimatedMinutes} min, due ${String(t.dueDate).slice(0, 10)})`);
const first = plan.plan.tasks[0];
const done = await must("complete a task", api(`/api/career/action-tasks/${first.id}`, { method: "PATCH", body: { status: "done", notes: "live probe" } }));
log(`     progress ${done.progress.done}/${done.progress.total}`);
const own = await must("add personal task", api("/api/career/action-tasks", { method: "POST", body: { title: "Email a referral contact", category: "personal", estimatedMinutes: 15 } }));
const regen = await must("regenerate plan", api("/api/career/action-plans/generate", { method: "POST", body: { weeklyMinutes: 300 } }));
log(`     regenerated=${regen.regenerated}; done task kept=${regen.plan.tasks.some((t) => t.id === first.id && t.status === "done")}; personal kept=${regen.plan.tasks.some((t) => t.id === own.task.id)}`);

log("     coach chat (Gemini) …");
const chat = await must("coach: start conversation", api("/api/career/coach/conversations", { method: "POST", body: { message: "What should I improve before applying for a senior frontend role? Did I get any offers?" } }));
log(`     reply: ${chat.reply.content.slice(0, 220).replace(/\n/g, " ")}…`);
log(`     facts used: ${chat.reply.factsUsed.length}; suggestions: ${chat.reply.suggestions.length}; links: ${chat.reply.links.map((l) => l.path).join(", ")}; clarifying: ${chat.reply.clarifyingQuestion ?? "none"}`);
if (/offer/i.test(chat.reply.content) && /(you (got|received|have) an offer|congratulations)/i.test(chat.reply.content)) { log("FAIL coach invented an offer"); process.exit(1); }
const conv = await must("coach: conversation history", api(`/api/career/coach/conversations/${chat.conversationId}`));
log(`     ${conv.conversation.messages.length} messages, title “${conv.conversation.title}”`);

const dash = await must("dashboard", api("/api/career/dashboard"));
const d = dash.dashboard;
log(`     readiness ${d.readiness.latest?.overallScore} · best match ${d.jobMatch.best?.matchScore}% · apps ${d.applications.total} (overdue ${d.applications.upcoming.filter((u) => u.overdue).length}) · next: ${d.nextAction?.title} · plan ${d.plan?.done}/${d.plan?.total}`);

// cleanup
await must("delete conversation", api(`/api/career/coach/conversations/${chat.conversationId}`, { method: "DELETE" }), (s) => s === 204);
await must("delete application", api(`/api/applications/${app.application.id}`, { method: "DELETE" }), (s) => s === 204);
await must("delete JD", api(`/api/job-descriptions/${jd.jobDescription.id}`, { method: "DELETE" }), (s) => s === 204);
await must("delete analysis", api(`/api/analysis/${an.analysis.id}`, { method: "DELETE" }), (s) => s === 204);
log("PHASE 9 LIVE E2E PASSED for", email, "(test user, profile, assessment and plan remain; other records cleaned up)");
