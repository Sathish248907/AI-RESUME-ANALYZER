/**
 * careerDashboardService.js — widgets for the career progress dashboard,
 * derived from persisted records only. Pure.
 */
import { roadmapProgress, availableTasks } from "../learning/learningProgressService.js";
import { classifyTopics, toEvidence } from "../interview/weakTopicService.js";
import { ACTIVE_STATUSES } from "../../models/applicationRepository.js";
import { planProgress } from "./careerActionPlanService.js";

const DAY = 86_400_000;

export function buildCareerDashboard({ snapshot, latestAssessment, recommendations = [], plan = null, now = new Date() }) {
  const assessments = (snapshot.assessments ?? []).slice().reverse();
  const readiness = { latest: latestAssessment ? { id: latestAssessment.id, targetRole: latestAssessment.targetRole, overallScore: latestAssessment.overallScore, readinessLabel: latestAssessment.readinessLabel, createdAt: latestAssessment.createdAt } : null, trend: assessments.map((a) => ({ date: a.createdAt, score: a.overallScore, targetRole: a.targetRole })) };
  const strengths = latestAssessment?.strengths ?? [];
  const gaps = (snapshot.skillGaps ?? []).filter((g) => g.proficiencyStatus !== "demonstrated" && g.priority === "high").slice(0, 6).map((g) => ({ skillName: g.skillName, status: g.proficiencyStatus, priorityScore: g.priorityScore }));

  const versions = (snapshot.versions ?? []).filter((v) => !v.isOriginal && typeof v.lastQualityScore === "number");
  const resume = { versions: versions.length, bestQuality: versions.length ? Math.max(...versions.map((v) => v.lastQualityScore)) : null, uploads: (snapshot.resumes ?? []).length };
  const ai = (snapshot.analyses ?? []).filter((a) => a.analysisMode === "ai" && typeof a.matchScore === "number");
  const jobMatch = { analyses: ai.length, average: ai.length ? Math.round(ai.reduce((s, a) => s + a.matchScore, 0) / ai.length) : null, best: ai.length ? ai.reduce((b, a) => (a.matchScore > b.matchScore ? a : b)) : null };

  const completed = (snapshot.interviews ?? []).filter((i) => i.status === "completed");
  const answers = completed.flatMap((s) => { const q = new Map(s.questions.map((x) => [x.id, x])); return s.answers.map((a) => ({ ...a, question: q.get(a.questionId) })); });
  const { weak } = classifyTopics(toEvidence(answers));
  const interviews = { completed: completed.length, trend: completed.filter((s) => typeof s.score === "number").sort((a, b) => new Date(a.completedAt ?? a.createdAt) - new Date(b.completedAt ?? b.createdAt)).map((s) => ({ date: s.completedAt ?? s.createdAt, score: s.score, type: s.interviewType })), weakTopics: weak.slice(0, 4).map((w) => w.topic) };

  const rm = snapshot.roadmap;
  const learning = rm ? { roadmapId: rm.id, title: rm.title, targetRole: rm.targetRole, ...roadmapProgress(rm), nextTask: availableTasks(rm)[0]?.task?.title ?? null } : null;

  const apps = snapshot.applications ?? [];
  const byStatus = {}; for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const upcoming = apps.filter((a) => a.nextFollowUpDate && ACTIVE_STATUSES.includes(a.status) && new Date(a.nextFollowUpDate) <= new Date(now.getTime() + 14 * DAY)).sort((a, b) => new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate)).slice(0, 6).map((a) => ({ id: a.id, companyName: a.companyName, jobTitle: a.jobTitle, status: a.status, nextFollowUpDate: a.nextFollowUpDate, overdue: new Date(a.nextFollowUpDate) < now }));
  // Conversion rates only when there is enough data (≥ 5 applications that went past "interested").
  const submitted = apps.filter((a) => a.status !== "INTERESTED" && a.status !== "WITHDRAWN");
  const responded = submitted.filter((a) => ["ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED"].includes(a.status));
  const interviewed = submitted.filter((a) => ["INTERVIEW", "OFFER"].includes(a.status));
  const rates = submitted.length >= 5 ? { sampleSize: submitted.length, responseRate: Math.round((responded.length / submitted.length) * 100), interviewRate: Math.round((interviewed.length / submitted.length) * 100), offerRate: Math.round((submitted.filter((a) => a.status === "OFFER").length / submitted.length) * 100), basis: "applications with a status beyond Interested, excluding withdrawn" } : { sampleSize: submitted.length, responseRate: null, interviewRate: null, offerRate: null, basis: "needs at least 5 submitted applications" };
  const applications = { total: apps.length, active: apps.filter((a) => ACTIVE_STATUSES.includes(a.status)).length, byStatus, interviews: byStatus.INTERVIEW ?? 0, upcoming, rates, closed: apps.filter((a) => ["REJECTED", "WITHDRAWN"].includes(a.status)).map((a) => ({ id: a.id, companyName: a.companyName, jobTitle: a.jobTitle, status: a.status, updatedAt: a.updatedAt })).slice(0, 8) };

  const achievements = [];
  const since = now.getTime() - 14 * DAY;
  for (const m of rm?.milestones ?? []) if (m.completedAt && new Date(m.completedAt).getTime() >= since) achievements.push({ kind: "milestone", title: `Completed milestone “${m.title}”`, date: m.completedAt });
  for (const t of (rm?.milestones ?? []).flatMap((m) => m.tasks ?? [])) if (t.completedAt && new Date(t.completedAt).getTime() >= since) achievements.push({ kind: "task", title: `Finished “${t.title}”`, date: t.completedAt });
  for (const s of completed) if (new Date(s.completedAt ?? s.createdAt).getTime() >= since) achievements.push({ kind: "interview", title: `Completed a ${s.interviewType} interview${typeof s.score === "number" ? ` (${s.score}%)` : ""}`, date: s.completedAt ?? s.createdAt });
  for (const r of recommendations) if (r.status === "done" && r.completedAt && new Date(r.completedAt).getTime() >= since) achievements.push({ kind: "recommendation", title: r.title, date: r.completedAt });
  for (const a of apps) if (["INTERVIEW", "OFFER"].includes(a.status) && new Date(a.updatedAt).getTime() >= since) achievements.push({ kind: "application", title: `${a.companyName}: ${a.status === "OFFER" ? "offer received" : "interview stage"}`, date: a.updatedAt });
  achievements.sort((a, b) => new Date(b.date) - new Date(a.date));

  const open = recommendations.filter((r) => r.status === "open");
  const nextAction = open[0] ? { title: open[0].title, href: open[0].href, reason: open[0].reason, priority: open[0].priority } : null;
  const planSummary = plan ? { id: plan.id, weekStart: plan.weekStart, weekEnd: plan.weekEnd, ...planProgress(plan, now), tasksDueToday: (plan.tasks ?? []).filter((t) => t.status === "pending" && t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString()).length } : null;

  return { readiness, strengths: strengths.slice(0, 5), priorityGaps: gaps, resume, jobMatch: { ...jobMatch, best: jobMatch.best ? { id: jobMatch.best.id, jobTitle: jobMatch.best.jobTitle, companyName: jobMatch.best.companyName, matchScore: jobMatch.best.matchScore } : null }, interviews, learning, applications, achievements: achievements.slice(0, 8), nextAction, openRecommendations: open.length, plan: planSummary, hasProfile: Boolean(snapshot.profile), generatedAt: now.toISOString() };
}
