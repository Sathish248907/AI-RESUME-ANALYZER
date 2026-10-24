/**
 * goalService.js — measures personal goals against linked records. Pure.
 * Only verified activity counts: records created/completed after the goal was created
 * (so an old interview cannot satisfy a new "five interviews" goal), except for
 * absolute goals (roadmap %, resume quality) which read the current state.
 */
import { roadmapProgress } from "../learning/learningProgressService.js";
import { GOAL_TYPES, POINT_RULES } from "./progressConfig.js";

const num = (v) => typeof v === "number" && Number.isFinite(v);
const after = (d, since) => d && new Date(d).getTime() >= new Date(since).getTime();
const norm = (s) => String(s ?? "").trim().toLowerCase();

export function measureGoal(goal, snapshot) {
  const since = goal.createdAt;
  const type = GOAL_TYPES[goal.goalType] ?? GOAL_TYPES.custom;
  let value = goal.currentValue ?? 0, evidence = [], nextAction = null;
  switch (goal.goalType) {
    case "mock_interviews": {
      const s = (snapshot.interviews ?? []).filter((x) => x.status === "completed" && x.source === "mock_interview" && after(x.completedAt, since) && (x.answers ?? []).filter((a) => a.status === "evaluated").length >= (x.interviewType === "coding" ? POINT_RULES.coding_session_completed.minEvaluated : POINT_RULES.interview_completed.minEvaluated) && (!goal.linkKey || norm(x.targetRole) === norm(goal.linkKey)));
      value = s.length; evidence = s.slice(-3).map((x) => `${x.interviewType} interview${num(x.score) ? ` (${x.score}%)` : ""} on ${new Date(x.completedAt).toISOString().slice(0, 10)}`);
      nextAction = { title: "Start a mock interview", href: "/dashboard/interviews/new" }; break;
    }
    case "learning_tasks": {
      const t = (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded" && (!goal.linkKey || r.id === goal.linkKey)).flatMap((r) => (r.milestones ?? []).flatMap((m) => m.tasks ?? [])).filter((x) => x.status === "completed" && after(x.completedAt, since));
      value = t.length; evidence = t.slice(-3).map((x) => `Completed “${x.title}”`);
      nextAction = { title: "Open your learning roadmap", href: goal.linkKey ? `/dashboard/learning/${goal.linkKey}` : "/dashboard/learning" }; break;
    }
    case "roadmap_completion": {
      const r = (snapshot.roadmaps ?? []).find((x) => goal.linkKey ? x.id === goal.linkKey : x.status === "active");
      if (r) { const p = roadmapProgress(r); value = p.percent; evidence = [`${p.completedTasks}/${p.requiredTasks} required tasks in “${r.title}”`]; nextAction = { title: "Continue the roadmap", href: `/dashboard/learning/${r.id}` }; }
      else { value = 0; evidence = ["Roadmap not found (it may have been deleted)."]; nextAction = { title: "Generate a roadmap", href: "/dashboard/learning/new" }; }
      break;
    }
    case "resume_quality": {
      const v = (snapshot.versions ?? []).filter((x) => num(x.lastQualityScore) && (!goal.linkKey || x.resumeId === goal.linkKey));
      value = v.length ? Math.max(...v.map((x) => x.lastQualityScore)) : 0;
      const best = v.find((x) => x.lastQualityScore === value);
      evidence = best ? [`Best version “${best.name}”: ${value}/100`] : ["No resume version with a quality score yet."];
      nextAction = { title: "Improve in the Resume Builder", href: best ? `/dashboard/resume-builder/${best.id}` : "/dashboard/resume-builder" }; break;
    }
    case "skill_practice": {
      const key = norm(goal.linkKey);
      const tasks = (snapshot.roadmaps ?? []).filter((r) => r.status !== "superseded").flatMap((r) => (r.milestones ?? []).flatMap((m) => m.tasks ?? [])).filter((x) => x.status === "completed" && after(x.completedAt, since) && norm(x.skillName) === key);
      const answers = (snapshot.interviews ?? []).flatMap((s) => { const q = new Map((s.questions ?? []).map((x) => [x.id, x])); return (s.answers ?? []).filter((a) => a.status === "evaluated" && after(a.evaluatedAt, since) && norm(q.get(a.questionId)?.topic) === key); });
      value = tasks.length + answers.length; evidence = [`${tasks.length} learning task${tasks.length === 1 ? "" : "s"}, ${answers.length} evaluated interview answer${answers.length === 1 ? "" : "s"} on ${goal.linkKey}`];
      nextAction = { title: `Practise ${goal.linkKey} in an interview`, href: "/dashboard/interviews/new" }; break;
    }
    case "applications": {
      const a = (snapshot.applications ?? []).filter((x) => !["INTERESTED", "WITHDRAWN"].includes(x.status) && after(x.applicationDate ?? x.createdAt, since));
      value = a.length; evidence = a.slice(-3).map((x) => `${x.companyName} — ${x.jobTitle}`);
      nextAction = { title: "Track an application", href: "/dashboard/applications" }; break;
    }
    default:
      evidence = ["Tracked manually — update progress from the goal card."];
  }
  const target = Math.max(1, goal.targetValue);
  const percent = Math.min(100, Math.round((value / target) * 100));
  return { currentValue: value, percent, reached: value >= target, evidence, nextAction, unit: type.unit, measurable: type.measurable, overdue: goal.targetDate && goal.status === "active" && new Date(goal.targetDate) < new Date() && value < target };
}
