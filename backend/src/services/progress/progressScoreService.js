/**
 * progressScoreService.js — the transparent Career Progress Score. Pure.
 *
 * Six dimensions, each 0–100 with its own evidence and a plain-language formula. A
 * dimension with no evidence is *excluded* (new users are not penalised) and the
 * remaining weights are re-normalised; fewer than PROGRESS_MIN_DIMENSIONS → no score.
 * The score measures activity and improvement recorded in this app; it is kept separate
 * from job-match percentages and interview scores and never predicts employment.
 */
import { roadmapProgress } from "../learning/learningProgressService.js";
import { PROGRESS_WEIGHTS, PROGRESS_MIN_DIMENSIONS, PROGRESS_SCORE_METHOD } from "./progressConfig.js";
import { resumeBaseline } from "./activityEventService.js";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const DAY = 86_400_000;

function dim(key, label, weight, score, evidence, explanation, formula) {
  return { key, label, weight, score: num(score) ? clamp(score) : null, included: num(score), evidence, explanation, formula };
}

export function computeProgressScore(snapshot, { now = new Date(), weights = PROGRESS_WEIGHTS } = {}) {
  const dims = [];

  // 1. Resume improvement: best non-original version quality blended with its gain over the baseline.
  const versions = (snapshot.versions ?? []).filter((v) => num(v.lastQualityScore));
  const improved = versions.filter((v) => !v.isOriginal);
  if (improved.length) {
    const best = improved.reduce((b, v) => (v.lastQualityScore > b.lastQualityScore ? v : b));
    const base = resumeBaseline(best, snapshot.versions ?? []);
    const delta = base ? best.lastQualityScore - base.score : 0;
    const gainScore = base ? clamp(50 + delta * 2.5) : 50;
    dims.push(dim("resume_improvement", "Resume improvement", weights.resume_improvement, 0.6 * best.lastQualityScore + 0.4 * gainScore, [`Best version “${best.name}”: quality ${best.lastQualityScore}/100`, base ? `Baseline (${base.source} version): ${base.score} → change ${delta >= 0 ? "+" : ""}${delta}` : "No baseline version to compare against"], "60 % best quality score of an edited version + 40 % improvement over the original (50 = no change, +2.5 per point gained).", "0.6 × bestQuality + 0.4 × clamp(50 + 2.5 × Δquality)"));
  } else dims.push(dim("resume_improvement", "Resume improvement", weights.resume_improvement, null, [], "Create or edit a version in the Resume Builder to measure improvement.", "0.6 × bestQuality + 0.4 × clamp(50 + 2.5 × Δquality)"));

  // 2. Interview performance: mean of the last 5 scored mock interviews (≥ 3 evaluated answers each).
  const scored = (snapshot.interviews ?? []).filter((s) => s.status === "completed" && s.source === "mock_interview" && num(s.score) && (s.answers ?? []).filter((a) => a.status === "evaluated" && num(a.score)).length >= 3).sort((a, b) => new Date(b.completedAt ?? b.updatedAt) - new Date(a.completedAt ?? a.updatedAt));
  if (scored.length) {
    const recent = scored.slice(0, 5);
    const mean = recent.reduce((s, x) => s + x.score, 0) / recent.length;
    dims.push(dim("interview_performance", "Technical interview performance", weights.interview_performance, mean, [`${recent.length} recent scored interview${recent.length === 1 ? "" : "s"}: ${recent.map((s) => `${s.score}%`).join(", ")}`], "Average score of your last five completed mock interviews that had at least three evaluated answers.", "mean(last 5 interview scores)"));
  } else dims.push(dim("interview_performance", "Technical interview performance", weights.interview_performance, null, [], "Complete a mock interview with at least three evaluated answers.", "mean(last 5 interview scores)"));

  // 3. Skill development: weighted share of tracked skills that are demonstrated / in progress.
  const gaps = snapshot.skillGaps ?? [];
  if (gaps.length) {
    const w = { demonstrated: 1, learning_in_progress: 0.5, needs_improvement: 0.35, not_demonstrated: 0, not_assessed: 0 };
    const inProgressSkills = new Set((snapshot.roadmaps ?? []).filter((r) => r.status === "active").flatMap((r) => r.milestones ?? []).flatMap((m) => m.tasks ?? []).filter((t) => t.status === "in_progress" || t.status === "paused").map((t) => t.skillName.toLowerCase()));
    const score = (gaps.reduce((s, g) => s + (w[g.proficiencyStatus === "demonstrated" ? "demonstrated" : inProgressSkills.has(g.skillName.toLowerCase()) ? "learning_in_progress" : g.proficiencyStatus] ?? 0), 0) / gaps.length) * 100;
    const demonstrated = gaps.filter((g) => g.proficiencyStatus === "demonstrated").length;
    dims.push(dim("skill_development", "Skill development", weights.skill_development, score, [`${demonstrated}/${gaps.length} tracked skills demonstrated`, `${gaps.filter((g) => g.proficiencyStatus === "needs_improvement").length} need improvement, ${inProgressSkills.size} being learned`], "Each tracked skill counts 1 when demonstrated, 0.5 while being learned, 0.35 when it needs improvement and 0 otherwise; the average is shown as a percentage.", "Σ skillWeight / trackedSkills × 100"));
  } else dims.push(dim("skill_development", "Skill development", weights.skill_development, null, [], "Generate a learning roadmap to start tracking skills.", "Σ skillWeight / trackedSkills × 100"));

  // 4. Learning completion: required-task completion of the active roadmap (best archived one otherwise).
  const roadmaps = (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded");
  const active = roadmaps.find((r) => r.status === "active") ?? roadmaps[0];
  if (active && roadmapProgress(active).requiredTasks > 0) {
    const p = roadmapProgress(active);
    dims.push(dim("learning_completion", "Learning task completion", weights.learning_completion, p.percent, [`${p.completedTasks}/${p.requiredTasks} required tasks done in “${active.title}”`, `${p.completedMilestones}/${p.totalMilestones} milestones completed`], "Percentage of required tasks completed in your current learning roadmap.", "completedRequired / requiredTasks × 100"));
  } else dims.push(dim("learning_completion", "Learning task completion", weights.learning_completion, null, [], "Generate a learning roadmap and complete tasks to measure this.", "completedRequired / requiredTasks × 100"));

  // 5. Application activity (last 90 days): submissions and progress through the pipeline, saturating.
  const apps = snapshot.applications ?? [];
  if (apps.length) {
    const since = now.getTime() - 90 * DAY;
    const recent = apps.filter((a) => new Date(a.applicationDate ?? a.createdAt).getTime() >= since || new Date(a.updatedAt).getTime() >= since);
    const submitted = recent.filter((a) => !["INTERESTED", "WITHDRAWN"].includes(a.status)).length;
    const advanced = recent.filter((a) => ["ASSESSMENT", "INTERVIEW", "OFFER"].includes(a.status)).length;
    dims.push(dim("application_activity", "Job application activity", weights.application_activity, Math.min(100, submitted * 12 + advanced * 15), [`${submitted} application${submitted === 1 ? "" : "s"} submitted in the last 90 days`, `${advanced} progressed to assessment / interview / offer`], "12 points per application submitted in the last 90 days plus 15 per application that progressed past Applied, capped at 100. Measures activity, not outcomes.", "min(100, 12 × submitted90d + 15 × advanced90d)"));
  } else dims.push(dim("application_activity", "Job application activity", weights.application_activity, null, [], "Track a job application to measure this.", "min(100, 12 × submitted90d + 15 × advanced90d)"));

  // 6. Career readiness: latest assessment with evidence.
  const assessments = (snapshot.assessments ?? []).filter((a) => a.readinessLabel !== "Insufficient evidence" && num(a.overallScore)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (assessments.length) dims.push(dim("career_readiness", "Career readiness", weights.career_readiness, assessments[0].overallScore, [`Latest assessment for ${assessments[0].targetRole}: ${assessments[0].overallScore}/100 (${assessments[0].readinessLabel})`], "Your most recent career readiness assessment score (Career Coach).", "latestAssessment.overallScore"));
  else dims.push(dim("career_readiness", "Career readiness", weights.career_readiness, null, [], "Run a readiness assessment in the Career Coach.", "latestAssessment.overallScore"));

  const included = dims.filter((d) => d.included);
  const weightUsed = included.reduce((s, d) => s + d.weight, 0);
  const overall = included.length >= PROGRESS_MIN_DIMENSIONS && weightUsed > 0 ? clamp(included.reduce((s, d) => s + d.score * d.weight, 0) / weightUsed) : null;
  return {
    method: PROGRESS_SCORE_METHOD,
    overallScore: overall,
    label: overall === null ? "Not enough data yet" : overall >= 75 ? "Strong momentum" : overall >= 50 ? "Building steadily" : overall >= 25 ? "Getting started" : "Early days",
    dimensions: dims,
    coverage: { included: included.length, total: dims.length, weightUsed },
    disclaimer: "The progress score summarises activity and improvement recorded in this app. It is not a job-match percentage, an interview grade or a prediction of employment outcomes.",
  };
}

/** Compare two snapshots' dimensions. */
export function compareProgress(current, previous) {
  if (!previous) return null;
  const prev = new Map((previous.dimensions ?? []).map((d) => [d.key, d.score]));
  return {
    previousDayKey: previous.dayKey,
    overallDelta: num(current.overallScore) && num(previous.overallScore) ? current.overallScore - previous.overallScore : null,
    dimensions: current.dimensions.map((d) => ({ key: d.key, delta: num(d.score) && num(prev.get(d.key)) ? d.score - prev.get(d.key) : null })),
  };
}
