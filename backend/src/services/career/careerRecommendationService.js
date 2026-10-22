/**
 * careerRecommendationService.js — evidence-backed, keyed recommendations that
 * link to existing features. Pure: derived from the snapshot + an assessment.
 */
import { classifyTopics, toEvidence } from "../interview/weakTopicService.js";
import { availableTasks, roadmapProgress } from "../learning/learningProgressService.js";
import { ACTIVE_STATUSES } from "../../models/applicationRepository.js";

const DAY = 86_400_000;
const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * @param {object} snapshot
 * @param {object|null} assessment  output of computeReadiness (or null)
 * @returns {Array<{ key, type, title, explanation, reason, evidence: string[], priority, effortMinutes, href }>}
 */
export function buildCareerRecommendations(snapshot, assessment, { now = new Date(), limit = 12 } = {}) {
  const recs = [];
  const push = (r) => { if (!recs.some((x) => x.key === r.key)) recs.push(r); };
  const role = assessment?.targetRole ?? snapshot.profile?.targetRoles?.[0] ?? null;

  // Profile
  if (!snapshot.profile) push({ key: "profile:create", type: "profile", title: "Complete your career profile", explanation: "Target roles, level and preferences make every other recommendation specific.", reason: "No career profile yet.", evidence: [], priority: "high", effortMinutes: 10, href: "/dashboard/career/profile" });

  // Resume quality
  const versions = snapshot.versions ?? [];
  const scored = versions.filter((v) => typeof v.lastQualityScore === "number" && !v.isOriginal);
  const best = scored.length ? scored.reduce((a, b) => (b.lastQualityScore > a.lastQualityScore ? b : a)) : null;
  if (!versions.length && (snapshot.resumes ?? []).length) push({ key: "resume:builder", type: "resume", title: "Open your resume in the builder", explanation: "A structured copy enables quality checks, AI improvements and tailored exports.", reason: "You have uploads but no editable version.", evidence: [`${snapshot.resumes.length} uploaded resume${snapshot.resumes.length === 1 ? "" : "s"}`], priority: "medium", effortMinutes: 15, href: "/dashboard/resume-builder" });
  if (!(snapshot.resumes ?? []).length && !versions.length) push({ key: "resume:upload", type: "resume", title: "Upload or create your resume", explanation: "Everything else — analyses, tailoring, readiness — needs a resume to work from.", reason: "No resume on record.", evidence: [], priority: "high", effortMinutes: 10, href: "/dashboard/my-resumes" });
  if (best && best.lastQualityScore < 75) push({ key: `resume:quality:${best.id}`, type: "resume", title: `Improve “${best.name}” (quality ${best.lastQualityScore}/100)`, explanation: "Run the quality panel and apply AI suggestions to the flagged fields.", reason: "Quality score below 75.", evidence: [`Quality ${best.lastQualityScore}/100 (resume-quality-1.0)`], priority: best.lastQualityScore < 60 ? "high" : "medium", effortMinutes: 40, href: `/dashboard/resume-builder/${best.id}` });

  // Projects lacking required skills
  const weakProjects = (assessment?.components ?? []).find((c) => c.key === "projects");
  if (weakProjects && weakProjects.included && weakProjects.score < 50) push({ key: `project:relevance:${norm(role)}`, type: "project", title: `Add a project that shows ${role ?? "the target role"} skills`, explanation: "Document (or build) a project using the role's core stack and describe your contribution and outcome.", reason: weakProjects.evidence[0] ?? "Few relevant projects.", evidence: weakProjects.evidence, priority: "medium", effortMinutes: 240, href: "/dashboard/learning" });

  // Skill gaps (high priority, no roadmap task in progress)
  const roadmap = snapshot.roadmap;
  const roadmapSkills = new Set((roadmap?.milestones ?? []).flatMap((m) => (m.tasks ?? []).map((t) => norm(t.skillName))));
  for (const g of (snapshot.skillGaps ?? []).filter((x) => x.priority === "high" && ["not_demonstrated", "needs_improvement"].includes(x.proficiencyStatus)).slice(0, 3)) {
    const inRoadmap = roadmapSkills.has(norm(g.skillName));
    push({ key: `skill:${norm(g.skillName)}`, type: "skill", title: `${g.proficiencyStatus === "not_demonstrated" ? "Learn" : "Strengthen"} ${g.skillName}`, explanation: g.whyItMatters, reason: g.explanation, evidence: (g.evidenceSources ?? []).map((e) => `evidence: ${String(e).replace(/_/g, " ")}`), priority: "high", effortMinutes: 120, href: inRoadmap ? "/dashboard/learning" : "/dashboard/learning/skill-gaps" });
  }
  if (!roadmap && (snapshot.skillGaps ?? []).length === 0 && (snapshot.analyses ?? []).some((a) => a.analysisMode === "ai")) push({ key: "learning:create", type: "learning", title: "Generate a learning roadmap", explanation: "Turns your analysed skill gaps into ordered milestones and tasks.", reason: "You have AI analyses but no roadmap.", evidence: [`${snapshot.analyses.filter((a) => a.analysisMode === "ai").length} AI analyses`], priority: "medium", effortMinutes: 5, href: "/dashboard/learning/new" });

  // Roadmap next task
  if (roadmap) {
    const p = roadmapProgress(roadmap);
    const next = availableTasks(roadmap)[0];
    if (next) push({ key: `learning:task:${next.task.id}`, type: "learning", title: `Roadmap: ${next.task.title}`, explanation: `${next.milestone.title} · ~${next.task.estimatedMinutes} min`, reason: `Roadmap ${p.percent}% complete; this is the next unlocked task.`, evidence: [`${p.completedTasks}/${p.requiredTasks} required tasks done`], priority: p.percent < 30 ? "high" : "medium", effortMinutes: next.task.estimatedMinutes ?? 60, href: "/dashboard/learning" });
  }

  // Interview weak topics / no interviews
  const completed = (snapshot.interviews ?? []).filter((i) => i.status === "completed");
  const answers = completed.flatMap((s) => { const q = new Map(s.questions.map((x) => [x.id, x])); return s.answers.map((a) => ({ ...a, question: q.get(a.questionId) })); });
  const { weak, candidates } = classifyTopics(toEvidence(answers));
  for (const w of weak.slice(0, 2)) push({ key: `interview:weak:${norm(w.topic)}`, type: "interview", title: `Review ${w.topic} before your next interview`, explanation: "Re-read your evaluated answers, then run a focused mock interview on this topic.", reason: `Average ${w.mean}% over ${w.attempts} evaluated answers.`, evidence: [`worst ${w.worst}%, best ${w.best}%`], priority: "high", effortMinutes: 60, href: `/dashboard/interviews/new?topic=${encodeURIComponent(w.topic)}` });
  for (const c of candidates.slice(0, 1)) push({ key: `interview:confirm:${norm(c.topic)}`, type: "interview", title: `Re-attempt a question on ${c.topic}`, explanation: "One low score is not enough evidence; try again to confirm or clear it.", reason: `Single evaluated answer scored ${c.mean}%.`, evidence: [`1 answer`], priority: "low", effortMinutes: 20, href: `/dashboard/interviews/new?topic=${encodeURIComponent(c.topic)}` });
  if (completed.length === 0 && role) push({ key: `interview:first:${norm(role)}`, type: "interview", title: `Take a mock interview for ${role}`, explanation: "Evaluated answers feed your readiness score, weak-topic tracking and the learning roadmap.", reason: "No completed mock interviews yet.", evidence: [], priority: "medium", effortMinutes: 30, href: "/dashboard/interviews/new" });
  const incomplete = (snapshot.interviews ?? []).filter((i) => i.status === "in_progress" && now - new Date(i.createdAt) < 14 * DAY)[0];
  if (incomplete) push({ key: `interview:resume:${incomplete.id}`, type: "interview", title: "Finish your in-progress mock interview", explanation: "Unanswered questions are not evaluated and do not count toward progress.", reason: `Started ${new Date(incomplete.createdAt).toLocaleDateString()}.`, evidence: [`${incomplete.completedQuestionCount ?? 0}/${incomplete.questionCount} answered`], priority: "medium", effortMinutes: 20, href: `/dashboard/interviews/${incomplete.id}` });

  // Applications
  const apps = snapshot.applications ?? [];
  const overdue = apps.filter((a) => a.nextFollowUpDate && new Date(a.nextFollowUpDate) < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && ACTIVE_STATUSES.includes(a.status));
  if (overdue.length) push({ key: "application:followups", type: "application", title: `${overdue.length} follow-up${overdue.length === 1 ? "" : "s"} overdue`, explanation: "Send the follow-up or update the status so the pipeline stays honest.", reason: `Oldest: ${overdue[0].companyName} — ${overdue[0].jobTitle}.`, evidence: overdue.slice(0, 3).map((a) => `${a.companyName}: due ${new Date(a.nextFollowUpDate).toLocaleDateString()}`), priority: "high", effortMinutes: 15, href: "/dashboard/applications" });
  const interested = apps.filter((a) => a.status === "INTERESTED");
  if (interested.length >= 2 && assessment?.overallScore !== null && (assessment?.overallScore ?? 0) >= 65) push({ key: "application:apply", type: "application", title: `Apply to ${interested.length} saved job${interested.length === 1 ? "" : "s"}`, explanation: "Your readiness is in the “nearly ready” band; tailor a resume version and apply.", reason: `Readiness ${assessment.overallScore}/100 for ${assessment.targetRole}.`, evidence: interested.slice(0, 3).map((a) => `${a.companyName} — ${a.jobTitle}`), priority: "medium", effortMinutes: 60, href: "/dashboard/career/jobs" });

  // Tailored resume for a job description without one
  for (const jd of (snapshot.jobDescriptions ?? []).slice(0, 10)) {
    if (versions.some((v) => v.jobDescriptionId === jd.id)) continue;
    if (!apps.some((a) => a.jobDescriptionId === jd.id && ["INTERESTED", "APPLIED"].includes(a.status))) continue;
    push({ key: `resume:tailor:${jd.id}`, type: "resume", title: `Tailor a resume version for ${jd.jobTitle}${jd.companyName ? ` at ${jd.companyName}` : ""}`, explanation: "Reword your existing experience for this job's requirements; genuine gaps are listed separately.", reason: "You are pursuing this job but have no tailored version.", evidence: [`application status: ${apps.find((a) => a.jobDescriptionId === jd.id)?.status}`], priority: "medium", effortMinutes: 30, href: "/dashboard/resume-builder" });
    break;
  }

  const order = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, limit);
}
