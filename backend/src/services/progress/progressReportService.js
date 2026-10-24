/**
 * progressReportService.js — weekly / monthly progress reports.
 *
 * Metrics are computed deterministically here from records. The AI (optional) only
 * rewrites the supplied metrics into a short narrative; it receives numbers, not
 * documents, and every suggestion it returns is labelled as a recommendation. When the
 * provider is unavailable a deterministic narrative is produced instead, so the report
 * is always useful.
 */
import { z } from "zod";
import PDFDocument from "pdfkit";
import { REPORT_METHOD } from "./progressConfig.js";
import { localDayKey, weekStartKey, addDays } from "./streakService.js";
import { roadmapProgress } from "../learning/learningProgressService.js";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
const DAY = 86_400_000;

/** Period bounds in UTC from the user's local calendar. offset 0 = current period to date, 1 = previous period … */
export function reportPeriod(periodType, { now = new Date(), tz = "UTC", offset = 0 } = {}) {
  const today = localDayKey(now, tz);
  if (periodType === "weekly") {
    const start = addDays(weekStartKey(today), -7 * offset);
    return { periodType, periodStart: new Date(`${start}T00:00:00.000Z`), periodEnd: new Date(`${addDays(start, 6)}T23:59:59.999Z`), label: `Week of ${start}` };
  }
  let [y, m] = today.split("-").map(Number);
  m -= offset; while (m <= 0) { m += 12; y -= 1; }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { periodType, periodStart: new Date(`${start}T00:00:00.000Z`), periodEnd: new Date(new Date(`${nextM}T00:00:00.000Z`).getTime() - 1), label: new Date(`${start}T00:00:00.000Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

const inP = (d, p) => d && new Date(d) >= p.periodStart && new Date(d) <= p.periodEnd;
const before = (d, p) => d && new Date(d) < p.periodStart;

/** Deterministic metrics for the period. `events`, `transactions`, `achievements` come from the ledger. */
export function buildReportMetrics(snapshot, { events = [], transactions = [], achievements = [], period }) {
  const prev = { periodStart: new Date(period.periodStart.getTime() - (period.periodEnd.getTime() - period.periodStart.getTime() + 1)), periodEnd: new Date(period.periodStart.getTime() - 1) };
  const evIn = events.filter((e) => inP(e.occurredAt, period));
  const byCategory = {};
  for (const e of evIn) byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  const count = (list, ...types) => list.filter((e) => types.includes(e.eventType)).length;
  const prevEv = events.filter((e) => inP(e.occurredAt, prev));

  // Resume quality: best version score at period end vs best before the period.
  const versions = (snapshot.versions ?? []).filter((v) => num(v.lastQualityScore));
  const bestNow = versions.length ? Math.max(...versions.map((v) => v.lastQualityScore)) : null;
  const edited = versions.filter((v) => inP(v.updatedAt, period));
  // Interviews
  const scored = (snapshot.interviews ?? []).filter((s) => s.status === "completed" && s.source === "mock_interview" && num(s.score));
  const intIn = scored.filter((s) => inP(s.completedAt ?? s.updatedAt, period)), intPrev = scored.filter((s) => inP(s.completedAt ?? s.updatedAt, prev));
  // Skills practised
  const tasks = (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded").flatMap((r) => (r.milestones ?? []).flatMap((m) => m.tasks ?? []));
  const doneIn = tasks.filter((t) => t.status === "completed" && inP(t.completedAt, period));
  const skills = [...new Set(doneIn.map((t) => t.skillName))];
  const topics = [...new Set((snapshot.interviews ?? []).filter((s) => inP(s.completedAt, period)).flatMap((s) => (s.questions ?? []).map((q) => q.topic)))];
  const active = (snapshot.roadmaps ?? []).find((r) => r.status === "active");
  const rp = active ? roadmapProgress(active) : null;
  const apps = snapshot.applications ?? [];
  const appsIn = apps.filter((a) => inP(a.applicationDate ?? a.createdAt, period));
  // Net points: awards minus reversals that fall in the period (a task reopened and redone nets to one award).
  const points = Math.max(0, transactions.filter((t) => inP(t.occurredAt, period)).reduce((s, t) => s + t.points, 0));
  return {
    method: REPORT_METHOD,
    period: { type: period.periodType, start: period.periodStart, end: period.periodEnd, label: period.label },
    activities: { total: evIn.length, byCategory, previousTotal: prevEv.length, learningTasks: count(evIn, "learning_task_completed", "learning_optional_task_completed"), interviews: count(evIn, "interview_completed", "coding_session_completed"), resumeImprovements: count(evIn, "resume_improved"), applications: count(evIn, "application_submitted"), planTasks: count(evIn, "plan_task_completed"), checkpoints: count(evIn, "checkpoint_passed"), milestones: count(evIn, "milestone_completed") },
    resume: { bestQuality: bestNow, bestBefore: versions.filter((v) => before(v.updatedAt, period)).length ? Math.max(...versions.filter((v) => before(v.updatedAt, period)).map((v) => v.lastQualityScore)) : null, versionsEdited: edited.length, analysesRun: (snapshot.analyses ?? []).filter((a) => inP(a.createdAt, period)).length },
    interviews: { completed: intIn.length, average: mean(intIn.map((s) => s.score)), previousAverage: mean(intPrev.map((s) => s.score)), best: intIn.length ? Math.max(...intIn.map((s) => s.score)) : null },
    skillsPractised: [...new Set([...skills, ...topics])].slice(0, 12),
    learning: rp ? { roadmap: active.title, percent: rp.percent, completedTasks: rp.completedTasks, requiredTasks: rp.requiredTasks, tasksThisPeriod: doneIn.length, minutesThisPeriod: doneIn.reduce((s, t) => s + (t.actualStudyMinutes ?? 0), 0) } : null,
    applications: { created: appsIn.length, submitted: appsIn.filter((a) => !["INTERESTED", "WITHDRAWN"].includes(a.status)).length, interviewsReached: apps.filter((a) => ["INTERVIEW", "OFFER"].includes(a.status) && inP(a.updatedAt, period)).length, active: apps.filter((a) => ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"].includes(a.status)).length },
    achievements: achievements.filter((a) => inP(a.unlockedAt, period)).map((a) => ({ key: a.achievementKey, unlockedAt: a.unlockedAt })),
    pointsEarned: points,
    hasActivity: evIn.length > 0 || edited.length > 0 || appsIn.length > 0,
  };
}

/** Rule-based narrative used when the AI is unavailable (and as the structural fallback). */
export function deterministicNarrative(m) {
  const highlights = [];
  if (m.activities.learningTasks) highlights.push(`Completed ${m.activities.learningTasks} learning task${m.activities.learningTasks === 1 ? "" : "s"}${m.skillsPractised.length ? ` across ${m.skillsPractised.slice(0, 4).join(", ")}` : ""}.`);
  if (m.interviews.completed) highlights.push(`Finished ${m.interviews.completed} mock interview${m.interviews.completed === 1 ? "" : "s"} averaging ${m.interviews.average}%${num(m.interviews.previousAverage) ? ` (previous period ${m.interviews.previousAverage}%)` : ""}.`);
  if (m.resume.versionsEdited) highlights.push(`Edited ${m.resume.versionsEdited} resume version${m.resume.versionsEdited === 1 ? "" : "s"}; best quality score is now ${m.resume.bestQuality}${num(m.resume.bestBefore) ? ` (was ${m.resume.bestBefore})` : ""}.`);
  if (m.applications.submitted) highlights.push(`Submitted ${m.applications.submitted} job application${m.applications.submitted === 1 ? "" : "s"}.`);
  if (m.achievements.length) highlights.push(`Unlocked ${m.achievements.length} achievement${m.achievements.length === 1 ? "" : "s"}.`);
  const priorities = [];
  if (m.learning && m.learning.percent < 100) priorities.push(`Continue “${m.learning.roadmap}” — ${m.learning.requiredTasks - m.learning.completedTasks} required tasks remain.`);
  if (!m.interviews.completed) priorities.push("Schedule one mock interview to keep interview practice regular.");
  else if (num(m.interviews.average) && m.interviews.average < 70) priorities.push("Revisit the weak topics from this period's interviews before the next session.");
  if (!m.resume.versionsEdited && num(m.resume.bestQuality) && m.resume.bestQuality < 80) priorities.push("Run the Resume Builder quality check and address the top suggestions.");
  if (m.applications.active && !m.applications.submitted) priorities.push("Follow up on active applications and submit the next one on your list.");
  if (!priorities.length) priorities.push("Keep the current rhythm: one learning task and one practice session per week.");
  const summary = m.hasActivity ? `${m.period.label}: ${m.activities.total} recorded activit${m.activities.total === 1 ? "y" : "ies"}${m.activities.previousTotal ? ` (previous period ${m.activities.previousTotal})` : ""}, ${m.pointsEarned} points earned.` : `${m.period.label}: no recorded activity. That's fine — pick one small task to restart.`;
  return { summary, highlights: highlights.slice(0, 6), priorities: priorities.slice(0, 4), source: "deterministic" };
}

const narrativeSchema = z.object({
  summary: z.string().min(1).max(600),
  highlights: z.array(z.string().min(1).max(240)).max(6).default([]),
  priorities: z.array(z.string().min(1).max(240)).max(4).default([]),
});
const SYSTEM = `You write short, encouraging progress summaries for a job seeker using a career-development app.
You are given METRICS computed from the user's records. Use ONLY those numbers; never invent counts, scores, companies or outcomes.
If a metric is null or zero, say so plainly or omit it. Priorities are recommendations, phrased as suggestions ("Consider…").
Do not promise job outcomes. Keep the summary under 80 words. Return JSON only.`;
const FORMAT = `{ "summary": string, "highlights": string[] (max 6), "priorities": string[] (max 4, each a recommendation) }`;

/** Narrative via the provider, falling back to the deterministic one on any failure. */
export async function narrate(llm, metrics) {
  const fallback = deterministicNarrative(metrics);
  if (!llm) return { narrative: fallback, aiUsed: false, provider: null, model: null };
  try {
    const { data, provider, model } = await llm.generateStructured({ system: SYSTEM, user: `METRICS (JSON):\n${JSON.stringify(metrics, null, 0).slice(0, 6000)}\n\nDeterministic baseline you may rephrase:\n${JSON.stringify(fallback)}`, schema: narrativeSchema, schemaName: "progress_report", formatDescription: FORMAT });
    // Numbers in the narrative must appear in the metrics (guards against invented figures).
    const allowed = new Set(JSON.stringify(metrics).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "").match(/\d+/g) ?? []);
    const invented = (s) => (s.match(/\d+/g) ?? []).some((n) => !allowed.has(n) && !/^\d{4}$/.test(n));
    const text = [data.summary, ...data.highlights, ...data.priorities];
    if (text.some(invented)) return { narrative: { ...fallback, note: "AI summary discarded because it contained numbers not present in your metrics." }, aiUsed: false, provider, model };
    return { narrative: { summary: data.summary.trim(), highlights: data.highlights.map((s) => s.trim()), priorities: data.priorities.map((s) => s.trim()), source: "ai" }, aiUsed: true, provider, model };
  } catch {
    return { narrative: { ...fallback, note: "AI summary unavailable; this narrative was generated from your metrics." }, aiUsed: false, provider: null, model: null };
  }
}

/** PDF rendering (pdfkit, text only). */
export function renderReportPdf(report, { userEmail = "" } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 }, compress: true, info: { Title: `Progress report — ${report.metrics.period.label}`, Creator: "AI Resume Analyzer" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    const m = report.metrics, n = report.narrative ?? deterministicNarrative(m);
    const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#111111").text(`${report.periodType === "weekly" ? "Weekly" : "Monthly"} progress report`);
    doc.font("Helvetica").fontSize(11).fillColor("#555555").text(`${clean(m.period.label)}${userEmail ? ` · ${clean(userEmail)}` : ""} · generated ${new Date(report.createdAt ?? Date.now()).toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111111").text("Summary");
    doc.font("Helvetica").fontSize(11).text(clean(n.summary));
    doc.fontSize(9).fillColor("#777777").text(n.source === "ai" ? "Narrative written by AI from the metrics below." : "Narrative generated from the metrics below (no AI).");
    doc.moveDown();
    const row = (label, value) => { doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#111111").text(`${label}: `, { continued: true }); doc.font("Helvetica").text(value === null || value === undefined ? "no data" : String(value)); };
    doc.font("Helvetica-Bold").fontSize(13).text("Metrics");
    row("Activities recorded", m.activities.total); row("Learning tasks completed", m.activities.learningTasks); row("Mock interviews finished", m.interviews.completed);
    row("Average interview score", num(m.interviews.average) ? `${m.interviews.average}%` : null); row("Best resume quality score", m.resume.bestQuality); row("Resume versions edited", m.resume.versionsEdited);
    row("Applications submitted", m.applications.submitted); row("Interview stages reached", m.applications.interviewsReached);
    if (m.learning) row("Roadmap progress", `${m.learning.percent}% of “${clean(m.learning.roadmap)}”`);
    row("Skills practised", m.skillsPractised.length ? m.skillsPractised.map(clean).join(", ") : null); row("Points earned", m.pointsEarned); row("Achievements unlocked", m.achievements.length);
    doc.moveDown();
    if (n.highlights?.length) { doc.font("Helvetica-Bold").fontSize(13).text("Highlights"); doc.font("Helvetica").fontSize(11); for (const h of n.highlights) doc.text(`• ${clean(h)}`); doc.moveDown(); }
    if (n.priorities?.length) { doc.font("Helvetica-Bold").fontSize(13).text("Recommended priorities (suggestions)"); doc.font("Helvetica").fontSize(11); for (const p of n.priorities) doc.text(`• ${clean(p)}`); doc.moveDown(); }
    doc.fontSize(9).fillColor("#777777").text("Metrics are computed from your own records in the AI Resume Analyzer. They describe activity, not employment outcomes.");
    doc.end();
  });
}
