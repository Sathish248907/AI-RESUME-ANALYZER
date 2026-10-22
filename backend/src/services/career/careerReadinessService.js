/**
 * careerReadinessService.js — transparent readiness assessment (career-readiness-1.0).
 *
 * Every component lists the evidence it used and what is missing. A component
 * with no evidence is EXCLUDED from the weighted average and reported under
 * `missingEvidence` — absence of data is never scored as a weakness.
 */
import { ROLE_BASELINES } from "../learning/skillGapService.js";
import { classifyTopics, toEvidence } from "../interview/weakTopicService.js";
import { roadmapProgress } from "../learning/learningProgressService.js";

export const READINESS_METHOD = "career-readiness-1.0";
export const COMPONENTS = [
  { key: "resumeQuality", label: "Resume quality", weight: 15 },
  { key: "skillCoverage", label: "Required skills demonstrated", weight: 30 },
  { key: "projects", label: "Project relevance", weight: 15 },
  { key: "interviews", label: "Mock interview performance", weight: 20 },
  { key: "learning", label: "Learning roadmap progress", weight: 10 },
  { key: "certifications", label: "Certifications & practical experience", weight: 10 },
];
const SKILL_CREDIT = { demonstrated: 100, needs_improvement: 50, learning_in_progress: 35, self_reported: 40, not_demonstrated: 0 };
const norm = (s) => String(s ?? "").trim().toLowerCase();
const DAY = 86_400_000;

/** Skills the target role needs: role baseline ∪ requirements of saved JDs / analyses for that role. */
export function requiredSkillsFor(snapshot, targetRole) {
  const out = new Map();
  const add = (name, source, priority) => { const k = norm(name); if (!k) return; const e = out.get(k) ?? { skillName: String(name).trim(), sources: new Set(), priority: "baseline" }; e.sources.add(source); if (priority === "required") e.priority = "required"; else if (priority === "preferred" && e.priority !== "required") e.priority = "preferred"; out.set(k, e); };
  for (const s of ROLE_BASELINES[targetRole] ?? []) add(s, "role_baseline");
  for (const jd of snapshot.jobDescriptions ?? []) {
    if (norm(jd.targetRole) !== norm(targetRole) && !norm(jd.jobTitle).includes(norm(targetRole).split(" ")[0])) continue;
    for (const s of jd.extractedRequirements?.skills ?? []) add(s.name, "job_description", s.priority);
  }
  for (const a of (snapshot.analyses ?? []).filter((x) => x.analysisMode === "ai" && norm(x.targetRole) === norm(targetRole)).slice(0, 10)) {
    const r = a.result ?? {};
    for (const s of [...(r.matchedSkills ?? []), ...(r.partiallyMatchedSkills ?? []), ...(r.missingOrUnverifiedSkills ?? [])]) add(s.name, "resume_analysis", s.priority);
  }
  return [...out.values()].map((e) => ({ ...e, sources: [...e.sources] }));
}

/** Evidence-based status of one skill, in priority order: skill-gap rows → analyses → roadmap → profile. */
function skillStatus(snapshot, targetRole, skillName) {
  const k = norm(skillName);
  const gap = (snapshot.skillGaps ?? []).find((g) => norm(g.skillName) === k);
  const evidence = [];
  if (gap) {
    evidence.push(`Skill gap record: ${gap.proficiencyStatus.replace(/_/g, " ")}${gap.userConfirmed ? " (confirmed by you)" : ""} — ${gap.explanation}`);
    if (gap.proficiencyStatus !== "not_assessed") return { status: gap.proficiencyStatus, evidence };
  }
  for (const a of (snapshot.analyses ?? []).filter((x) => x.analysisMode === "ai")) {
    const r = a.result ?? {};
    const m = (r.matchedSkills ?? []).find((s) => norm(s.name) === k);
    if (m) { evidence.push(`Matched in analysis “${a.jobTitle}” (${a.matchScore}%): ${m.evidence ?? "direct evidence"}`); return { status: "demonstrated", evidence }; }
    const p = (r.partiallyMatchedSkills ?? []).find((s) => norm(s.name) === k);
    if (p) { evidence.push(`Partially matched in analysis “${a.jobTitle}”: ${p.gap ?? p.evidence ?? ""}`); return { status: "needs_improvement", evidence }; }
  }
  const task = (snapshot.roadmap?.milestones ?? []).flatMap((m) => m.tasks ?? []).find((t) => norm(t.skillName) === k);
  if (task) {
    if (task.status === "completed") { evidence.push(`Roadmap task completed: “${task.title}”`); return { status: "needs_improvement", evidence }; }
    if (task.status === "in_progress" || task.status === "paused") { evidence.push(`Roadmap task in progress: “${task.title}”`); return { status: "learning_in_progress", evidence }; }
  }
  for (const v of snapshot.versions ?? []) {
    const text = JSON.stringify(v.content ?? {}).toLowerCase();
    if (text.includes(k)) { evidence.push(`Mentioned in resume version “${v.name}” (not verified by an analysis)`); return { status: "self_reported", evidence }; }
  }
  if ((snapshot.profile?.skills ?? []).some((s) => norm(s) === k)) { evidence.push("Listed in your career profile (self-reported)"); return { status: "self_reported", evidence }; }
  const missingInAnalysis = (snapshot.analyses ?? []).some((a) => (a.result?.missingOrUnverifiedSkills ?? []).some((s) => norm(s.name) === k));
  if (missingInAnalysis) { evidence.push("Listed as missing/unverified in a resume analysis"); return { status: "not_demonstrated", evidence }; }
  return { status: "not_assessed", evidence: ["No record mentions this skill yet"] };
}

/**
 * @param {object} snapshot  from careerRepository.loadSnapshot
 * @param {string} targetRole
 */
export function computeReadiness(snapshot, targetRole, { now = new Date() } = {}) {
  const components = [];
  const missingEvidence = [];
  const strengths = [], improvements = [], nextActions = [];
  const push = (key, score, evidence, missing = []) => {
    const def = COMPONENTS.find((c) => c.key === key);
    components.push({ ...def, score: score === null ? null : Math.round(score), evidence, missing, included: score !== null });
    if (score === null) missingEvidence.push(...missing);
  };

  // 1. Resume quality (Phase 8 quality score of the best version; else a rough proxy from Phase 4 ATS checks)
  const versions = snapshot.versions ?? [];
  const scored = versions.filter((v) => typeof v.lastQualityScore === "number");
  if (scored.length) {
    const best = scored.reduce((a, b) => (b.lastQualityScore > a.lastQualityScore ? b : a));
    push("resumeQuality", best.lastQualityScore, [`Best resume quality score ${best.lastQualityScore}/100 (“${best.name}”, resume-quality-1.0)`]);
    if (best.lastQualityScore < 70) nextActions.push({ title: "Fix the top resume quality issues", href: `/dashboard/resume-builder/${best.id}`, reason: `Quality score ${best.lastQualityScore}/100` });
  } else {
    const ai = (snapshot.analyses ?? []).find((a) => a.analysisMode === "ai" && Array.isArray(a.result?.atsChecks));
    if (ai) {
      const checks = ai.result.atsChecks;
      const pass = checks.filter((c) => c.status === "pass").length;
      push("resumeQuality", checks.length ? Math.round((pass / checks.length) * 100) : null, [`${pass}/${checks.length} ATS checks passed in analysis “${ai.jobTitle}” (proxy; run the resume builder quality check for a full score)`]);
    } else push("resumeQuality", null, [], ["No resume quality check or AI analysis yet — open the resume builder or run an analysis"]);
  }

  // 2. Skill coverage
  const required = requiredSkillsFor(snapshot, targetRole);
  const skills = required.map((r) => { const st = skillStatus(snapshot, targetRole, r.skillName); return { skillName: r.skillName, priority: r.priority, requiredBy: r.sources, status: st.status, score: st.status === "not_assessed" ? null : SKILL_CREDIT[st.status] ?? 0, evidence: st.evidence }; });
  const assessed = skills.filter((s) => s.score !== null);
  if (required.length === 0) push("skillCoverage", null, [], [`No skill requirements known for “${targetRole}” — save a job description for this role`]);
  else if (assessed.length === 0) push("skillCoverage", null, [], [`None of the ${required.length} required skills have evidence yet — run an AI analysis or generate a learning roadmap`]);
  else {
    const weight = (s) => (s.priority === "required" ? 2 : 1);
    const score = assessed.reduce((sum, s) => sum + s.score * weight(s), 0) / assessed.reduce((sum, s) => sum + weight(s), 0);
    const demonstrated = skills.filter((s) => s.status === "demonstrated").length;
    const gaps = skills.filter((s) => s.status === "not_demonstrated");
    const unassessed = skills.filter((s) => s.score === null);
    push("skillCoverage", score, [`${demonstrated}/${required.length} required skills demonstrated, ${gaps.length} not demonstrated, ${unassessed.length} not assessed`], unassessed.length ? [`${unassessed.length} required skills have no evidence either way: ${unassessed.slice(0, 5).map((s) => s.skillName).join(", ")}`] : []);
    if (gaps.length) nextActions.push({ title: `Close the ${Math.min(gaps.length, 3)} highest-priority skill gaps`, href: "/dashboard/learning", reason: gaps.slice(0, 3).map((s) => s.skillName).join(", ") });
  }

  // 3. Project relevance (structured resume projects that use required skills)
  const projects = versions.flatMap((v) => (v.content?.sections ?? []).filter((s) => s.type === "projects").flatMap((s) => s.entries ?? []));
  if (projects.length === 0) push("projects", null, [], ["No projects in a resume version yet — add them in the resume builder"]);
  else {
    const req = new Set(required.map((r) => norm(r.skillName)));
    const relevant = projects.filter((p) => [...(p.technologies ?? []), ...(p.bullets ?? [])].some((t) => [...req].some((k) => norm(t).includes(k))));
    const score = Math.min(100, Math.round((relevant.length / Math.max(1, Math.min(projects.length, 3))) * 70 + (relevant.length >= 2 ? 30 : relevant.length === 1 ? 15 : 0)));
    push("projects", score, [`${relevant.length}/${projects.length} projects use skills required for ${targetRole}`]);
    if (relevant.length < 2) nextActions.push({ title: "Build or document a project that uses the role's core skills", href: "/dashboard/learning", reason: "Fewer than two relevant projects on your resume" });
  }

  // 4. Interviews
  const completed = (snapshot.interviews ?? []).filter((i) => i.status === "completed");
  const forRole = completed.filter((i) => norm(i.targetRole) === norm(targetRole));
  const pool = forRole.length ? forRole : completed;
  const answers = pool.flatMap((s) => { const q = new Map(s.questions.map((x) => [x.id, x])); return s.answers.map((a) => ({ ...a, question: q.get(a.questionId) })); });
  const ev = toEvidence(answers);
  const scoredSessions = pool.filter((s) => typeof s.score === "number");
  if (scoredSessions.length === 0) push("interviews", null, [], ["No completed mock interview with a score yet — start one for this role"]);
  else {
    const avg = Math.round(scoredSessions.reduce((s, x) => s + x.score, 0) / scoredSessions.length);
    const { weak } = classifyTopics(ev);
    const recent = scoredSessions.slice(0, 3).map((s) => s.score);
    push("interviews", avg, [`Average ${avg}% over ${scoredSessions.length} completed session${scoredSessions.length === 1 ? "" : "s"}${forRole.length ? " for this role" : " (other roles)"}`, ...(recent.length > 1 ? [`Recent scores: ${recent.join(", ")}`] : []), ...(weak.length ? [`Weak topics: ${weak.slice(0, 4).map((w) => w.topic).join(", ")}`] : [])]);
    if (weak.length) nextActions.push({ title: `Practise ${weak[0].topic} in a focused mock interview`, href: `/dashboard/interviews/new?topic=${encodeURIComponent(weak[0].topic)}`, reason: `Average ${weak[0].mean}% over ${weak[0].attempts} answers` });
  }

  // 5. Learning
  const roadmap = snapshot.roadmap;
  if (!roadmap) push("learning", null, [], ["No active learning roadmap — generate one to track skill-building"]);
  else {
    const p = roadmapProgress(roadmap);
    push("learning", p.percent, [`Roadmap “${roadmap.title}”: ${p.percent}% (${p.completedTasks}/${p.requiredTasks} required tasks${norm(roadmap.targetRole) === norm(targetRole) ? "" : `, built for ${roadmap.targetRole}`})`]);
    if (p.percent < 100 && p.remainingTasks > 0) nextActions.push({ title: "Continue your learning roadmap", href: "/dashboard/learning", reason: `${p.remainingTasks} required tasks left` });
  }

  // 6. Certifications & practical experience
  const certs = versions.flatMap((v) => (v.content?.sections ?? []).filter((s) => s.type === "certifications").flatMap((s) => s.entries ?? []));
  const experience = versions.flatMap((v) => (v.content?.sections ?? []).filter((s) => s.type === "experience").flatMap((s) => s.entries ?? []));
  if (versions.length === 0) push("certifications", null, [], ["No structured resume yet — the builder reads certifications and experience from it"]);
  else {
    const req = new Set(required.map((r) => norm(r.skillName)));
    const relevantCerts = certs.filter((c) => [...req].some((k) => norm(c.name).includes(k)));
    const months = experience.reduce((s, e) => s + spanMonths(e), 0);
    const score = Math.min(100, (relevantCerts.length ? 40 : certs.length ? 20 : 0) + Math.min(60, Math.round(months / 36 * 60)));
    push("certifications", score, [`${certs.length} certification${certs.length === 1 ? "" : "s"} (${relevantCerts.length} relevant), ≈${Math.round(months / 12 * 10) / 10} years of listed experience`]);
  }

  const included = components.filter((c) => c.included);
  const totalWeight = included.reduce((s, c) => s + c.weight, 0);
  const overallScore = totalWeight ? Math.round(included.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : 0;
  const insufficient = included.length < 2;
  const readinessLabel = insufficient ? "Insufficient evidence" : overallScore >= 80 ? "Ready to apply" : overallScore >= 65 ? "Nearly ready" : overallScore >= 45 ? "Building" : "Early stage";
  for (const c of included) { if (c.score >= 75) strengths.push(`${c.label}: ${c.score}/100`); else if (c.score < 55) improvements.push(`${c.label}: ${c.score}/100`); }
  if (!nextActions.length) nextActions.push({ title: "Keep your profile and records current", href: "/dashboard/career/profile", reason: "No urgent gaps detected from the available evidence" });

  return {
    method: READINESS_METHOD,
    targetRole,
    overallScore: insufficient ? null : overallScore,
    readinessLabel,
    coverage: { componentsIncluded: included.length, componentsTotal: COMPONENTS.length, weightUsed: totalWeight },
    components,
    skills: skills.sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || a.skillName.localeCompare(b.skillName)),
    strengths, improvements, missingEvidence, nextActions: nextActions.slice(0, 6),
    sources: { resumes: (snapshot.resumes ?? []).length, analyses: (snapshot.analyses ?? []).length, interviews: completed.length, roadmaps: roadmap ? 1 : 0, applications: (snapshot.applications ?? []).length, versions: versions.length },
    disclaimer: "Scores summarise the evidence in your records; they are not a prediction of interview or job outcomes. Missing evidence lowers confidence, not the score.",
    assessedAt: now.toISOString(),
  };
}

function spanMonths(e) {
  const start = parseDate(e.startDate), end = e.current ? new Date() : parseDate(e.endDate);
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end - start) / (30 * DAY)));
}
function parseDate(s) {
  if (!s) return null;
  const m = String(s).match(/(\d{4})/);
  if (!m) return null;
  const month = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(String(s));
  const mi = month ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month[1].toLowerCase()) : 0;
  return new Date(Number(m[1]), mi, 1);
}
