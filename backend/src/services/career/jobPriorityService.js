/**
 * jobPriorityService.js — transparent priority score for the user's saved job
 * descriptions and tracked applications (job-priority-1.0). Factors and weights
 * are returned with every item; weights can be overridden per request.
 */
import { ACTIVE_STATUSES } from "../../models/applicationRepository.js";

export const PRIORITY_METHOD = "job-priority-1.0";
export const DEFAULT_WEIGHTS = Object.freeze({ match: 35, skills: 20, relevance: 20, preference: 10, urgency: 15 });
const DAY = 86_400_000;
const norm = (s) => String(s ?? "").trim().toLowerCase();
const STATUS_RANK = { INTERVIEW: 1, ASSESSMENT: 0.9, OFFER: 0.5, APPLIED: 0.6, INTERESTED: 0.4, REJECTED: 0, WITHDRAWN: 0 };

/**
 * @param {object} snapshot
 * @param {{ weights?: Partial<typeof DEFAULT_WEIGHTS>, now?: Date }} [opts]
 */
export function prioritiseJobs(snapshot, { weights: w = {}, now = new Date() } = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(w).filter(([, v]) => typeof v === "number" && v >= 0)) };
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const profile = snapshot.profile;
  const targetRoles = (profile?.targetRoles ?? []).map(norm);
  const apps = snapshot.applications ?? [];
  const analyses = (snapshot.analyses ?? []).filter((a) => a.analysisMode === "ai");
  const versions = snapshot.versions ?? [];
  const weakTopics = new Set((snapshot.skillGaps ?? []).filter((g) => g.proficiencyStatus === "needs_improvement").map((g) => norm(g.skillName)));

  // One item per job description, plus applications without a saved JD.
  const items = [];
  for (const jd of snapshot.jobDescriptions ?? []) items.push({ jobDescriptionId: jd.id, jobTitle: jd.jobTitle, companyName: jd.companyName, targetRole: jd.targetRole, requirements: jd.extractedRequirements?.skills ?? [], application: apps.find((a) => a.jobDescriptionId === jd.id) ?? null });
  for (const a of apps) if (!a.jobDescriptionId) items.push({ jobDescriptionId: null, jobTitle: a.jobTitle, companyName: a.companyName, targetRole: null, requirements: [], application: a });

  const out = items.map((it) => {
    const factors = [];
    const analysis = (it.jobDescriptionId && analyses.find((a) => a.jobDescriptionId === it.jobDescriptionId)) || (it.application?.analysisId && analyses.find((a) => a.id === it.application.analysisId)) || null;
    const r = analysis?.result ?? null;

    // match: Phase 4 score
    const match = typeof analysis?.matchScore === "number" ? analysis.matchScore : null;
    factors.push({ key: "match", label: "Resume match score", weight: weights.match, score: match, evidence: analysis ? `AI analysis “${analysis.jobTitle}” ${new Date(analysis.createdAt).toLocaleDateString()}: ${match}%` : "No AI analysis for this job yet" });

    // skills: demonstrated vs required from the analysis (or none)
    let skillsScore = null, demonstrated = [], needsWork = [];
    if (r) {
      demonstrated = (r.matchedSkills ?? []).map((s) => s.name);
      needsWork = [...(r.partiallyMatchedSkills ?? []).map((s) => s.name), ...(r.missingOrUnverifiedSkills ?? []).map((s) => s.name)];
      const all = demonstrated.length + needsWork.length;
      skillsScore = all ? Math.round(((demonstrated.length + 0.5 * (r.partiallyMatchedSkills ?? []).length) / all) * 100) : null;
    } else if (it.requirements.length) {
      const known = new Set((snapshot.skillGaps ?? []).filter((g) => g.proficiencyStatus === "demonstrated").map((g) => norm(g.skillName)));
      demonstrated = it.requirements.filter((s) => known.has(norm(s.name))).map((s) => s.name);
      needsWork = it.requirements.filter((s) => !known.has(norm(s.name))).map((s) => s.name);
      skillsScore = Math.round((demonstrated.length / it.requirements.length) * 100);
    }
    factors.push({ key: "skills", label: "Demonstrated required skills", weight: weights.skills, score: skillsScore, evidence: skillsScore === null ? "No requirements or analysis to compare" : `${demonstrated.length} demonstrated, ${needsWork.length} need evidence` });

    // relevance to profile target roles / title
    let relevance = null;
    if (targetRoles.length) {
      const role = norm(it.targetRole), title = norm(it.jobTitle);
      relevance = targetRoles.some((t) => t === role) ? 100 : targetRoles.some((t) => title.includes(t) || t.split(" ").some((word) => word.length > 3 && title.includes(word))) ? 70 : 20;
    }
    factors.push({ key: "relevance", label: "Matches your target roles", weight: weights.relevance, score: relevance, evidence: targetRoles.length ? `Profile targets: ${(profile.targetRoles ?? []).join(", ")}` : "Set target roles in your career profile" });

    // preference: work mode / location are only known from the profile; job records carry no location → neutral unless notes mention it
    let preference = null;
    const notes = norm(it.application?.notes ?? "");
    if (profile && (profile.workMode !== "any" || (profile.locations ?? []).length)) {
      const hits = [profile.workMode !== "any" && notes.includes(profile.workMode) ? 1 : 0, (profile.locations ?? []).some((l) => notes.includes(norm(l))) ? 1 : 0];
      preference = notes ? Math.round((hits.reduce((a, b) => a + b, 0) / 2) * 100) : null;
    }
    factors.push({ key: "preference", label: "Location / work-mode fit", weight: weights.preference, score: preference, evidence: preference === null ? "Not enough information (add location or remote/on-site to the application notes)" : "Based on application notes vs your profile" });

    // urgency: follow-up date, status
    let urgency = null;
    const app = it.application;
    if (app) {
      const base = (STATUS_RANK[app.status] ?? 0.3) * 60;
      let due = 0;
      if (app.nextFollowUpDate && ACTIVE_STATUSES.includes(app.status)) { const days = (new Date(app.nextFollowUpDate) - now) / DAY; due = days < 0 ? 40 : days <= 3 ? 30 : days <= 7 ? 15 : 5; }
      urgency = Math.round(Math.min(100, base + due));
    }
    factors.push({ key: "urgency", label: "Application urgency", weight: weights.urgency, score: urgency, evidence: app ? `Status ${app.status}${app.nextFollowUpDate ? `, follow-up ${new Date(app.nextFollowUpDate).toLocaleDateString()}` : ""}` : "Not tracked as an application yet" });

    const used = factors.filter((f) => f.score !== null);
    const usedWeight = used.reduce((s, f) => s + f.weight, 0);
    const priorityScore = usedWeight ? Math.round(used.reduce((s, f) => s + f.score * f.weight, 0) / usedWeight) : null;
    const closed = app && ["REJECTED", "WITHDRAWN"].includes(app.status);

    const recommendedVersion = versions.find((v) => it.jobDescriptionId && v.jobDescriptionId === it.jobDescriptionId) ?? versions.filter((v) => !v.isOriginal && typeof v.lastQualityScore === "number").sort((a, b) => b.lastQualityScore - a.lastQualityScore)[0] ?? null;
    const prepTopics = needsWork.filter((s) => weakTopics.has(norm(s))).slice(0, 3);
    const interviewPrep = { suggestedType: needsWork.length > demonstrated.length ? "technical" : "mixed", topics: (prepTopics.length ? prepTopics : needsWork.slice(0, 3)), href: `/dashboard/interviews/new${it.targetRole ? `?role=${encodeURIComponent(it.targetRole)}` : ""}` };

    return {
      jobDescriptionId: it.jobDescriptionId, applicationId: app?.id ?? null, jobTitle: it.jobTitle, companyName: it.companyName, targetRole: it.targetRole,
      status: app?.status ?? null, nextFollowUpDate: app?.nextFollowUpDate ?? null, matchScore: match, analysisId: analysis?.id ?? null,
      demonstratedSkills: demonstrated.slice(0, 12), skillsNeedingEvidence: needsWork.slice(0, 12),
      experienceAlignment: r?.experienceAlignment?.meetsRequirement ?? null, educationAlignment: r?.educationAlignment?.meetsRequirement ?? null,
      recommendedVersion: recommendedVersion ? { id: recommendedVersion.id, name: recommendedVersion.name, tailored: recommendedVersion.jobDescriptionId === it.jobDescriptionId } : null,
      interviewPrep, priorityScore, closed, factors, weightsUsed: usedWeight, confidence: usedWeight / total,
    };
  });

  return {
    method: PRIORITY_METHOD, weights,
    items: out.sort((a, b) => Number(a.closed) - Number(b.closed) || (b.priorityScore ?? -1) - (a.priorityScore ?? -1)),
    disclaimer: "Priority combines your own records (match score, demonstrated skills, target roles, follow-up urgency). It does not predict an employer's decision.",
  };
}
