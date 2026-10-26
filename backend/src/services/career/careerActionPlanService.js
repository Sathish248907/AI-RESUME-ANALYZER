/**
 * careerActionPlanService.js — builds a weekly action plan (career-plan-1.0)
 * from recommendations, the learning roadmap's weekly plan, interview weak
 * topics, resume quality and application follow-ups. Pure.
 */
import { buildWeeklyPlan } from "../learning/learningProgressService.js";
import { ACTIVE_STATUSES } from "../../models/applicationRepository.js";

export const PLAN_METHOD = "career-plan-1.0";
const DAY = 86_400_000;

export function weekBounds(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const day = start.getDay(); // Monday-based week
  start.setDate(start.getDate() - ((day + 6) % 7));
  const end = new Date(start.getTime() + 6 * DAY); end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * @param {object} input
 * @param {object} input.snapshot
 * @param {Array} input.recommendations   open recommendations (from the repository)
 * @param {Array} [input.existingDone]    tasks already done this week (sourceKeys to skip)
 * @param {number} [input.weeklyMinutes]  budget; defaults to roadmap hours or 6 h
 * @param {Date} [input.now]
 */
export function buildActionPlan({ snapshot, recommendations = [], existingDone = [], weeklyMinutes, now = new Date() }) {
  const { start, end } = weekBounds(now);
  const budget = weeklyMinutes ?? ((snapshot.roadmap?.weeklyStudyHours ?? 6) * 60);
  const done = new Set(existingDone.map((t) => t.sourceKey).filter(Boolean));
  const tasks = [];
  const seen = new Set();
  const add = (t) => { if (!t.sourceKey || (!seen.has(t.sourceKey) && !done.has(t.sourceKey))) { if (t.sourceKey) seen.add(t.sourceKey); tasks.push({ isOptional: false, estimatedMinutes: 30, ...t }); } };
  const dayAt = (offset) => { const d = new Date(start.getTime() + Math.min(6, Math.max(0, offset)) * DAY); d.setHours(18, 0, 0, 0); return d; };
  const todayOffset = Math.max(0, Math.floor((now - start) / DAY));
  /**
   * Dates that come from elsewhere are pulled into this plan's week. The
   * roadmap's weekly plan is a rolling seven days from today, not a Monday
   * week, so its sessions can fall on either side of these bounds; a task in
   * *this* week's plan must be due in this week, as overdue follow-ups already
   * are.
   */
  const withinWeek = (d) => (d < start ? dayAt(todayOffset) : d > end ? dayAt(6) : d);

  // 1. Application follow-ups due this week / overdue → first
  for (const a of (snapshot.applications ?? []).filter((x) => x.nextFollowUpDate && ACTIVE_STATUSES.includes(x.status) && new Date(x.nextFollowUpDate) <= end)) {
    const due = new Date(a.nextFollowUpDate);
    add({ title: `Follow up: ${a.companyName} — ${a.jobTitle}`, description: due < start ? "This follow-up is overdue." : "Send the follow-up and update the application status.", category: "application", href: "/dashboard/applications", estimatedMinutes: 15, dueDate: due < start ? dayAt(todayOffset) : due, sourceKey: `application:${a.id}:${due.toISOString().slice(0, 10)}` });
  }

  // 2. High-priority recommendations
  for (const r of recommendations.filter((x) => x.status === "open" && x.priority === "high").slice(0, 3)) {
    add({ title: r.title, description: r.explanation, category: r.type === "interview" ? "interview" : r.type === "resume" ? "resume" : r.type === "application" ? "application" : "learning", href: r.href, estimatedMinutes: Math.min(180, r.effortMinutes ?? 45), dueDate: dayAt(todayOffset + 1), sourceKey: `rec:${r.key}` });
  }

  // 3. Learning: the roadmap's own weekly plan
  if (snapshot.roadmap) {
    const plan = buildWeeklyPlan(snapshot.roadmap, { now });
    for (const session of plan.sessions) for (const t of session.tasks) {
      if (t.status === "completed") continue;
      add({ title: `Roadmap: ${t.title}`, description: `${t.milestoneTitle} · ${t.skillName}`, category: "learning", href: "/dashboard/learning", estimatedMinutes: t.estimatedMinutes ?? 45, dueDate: withinWeek(new Date(`${session.date}T18:00:00`)), sourceKey: `roadmap:${t.taskId}`, isOptional: t.isRequired === false });
    }
  }

  // 4. Interview practice (weak topics from recommendations, else a general session)
  const interviewRecs = recommendations.filter((x) => x.status === "open" && x.type === "interview");
  if (interviewRecs.length) { const r = interviewRecs[0]; add({ title: r.title, description: r.reason, category: "interview", href: r.href, estimatedMinutes: 45, dueDate: dayAt(todayOffset + 3), sourceKey: `rec:${r.key}` }); }
  else if ((snapshot.profile?.targetRoles ?? []).length) add({ title: `Mock interview: ${snapshot.profile.targetRoles[0]}`, description: "Keep interview practice regular — one session this week.", category: "interview", href: "/dashboard/interviews/new", estimatedMinutes: 30, dueDate: dayAt(todayOffset + 3), sourceKey: `interview:weekly:${start.toISOString().slice(0, 10)}`, isOptional: true });

  // 5. Resume improvement (one task per week)
  const resumeRec = recommendations.find((x) => x.status === "open" && x.type === "resume");
  if (resumeRec) add({ title: resumeRec.title, description: resumeRec.explanation, category: "resume", href: resumeRec.href, estimatedMinutes: Math.min(60, resumeRec.effortMinutes ?? 30), dueDate: dayAt(todayOffset + 2), sourceKey: `rec:${resumeRec.key}` });

  // 6. Remaining medium recommendations as optional
  for (const r of recommendations.filter((x) => x.status === "open" && x.priority === "medium" && !seen.has(`rec:${x.key}`)).slice(0, 3)) {
    add({ title: r.title, description: r.explanation, category: r.type === "interview" ? "interview" : r.type === "resume" ? "resume" : r.type === "application" ? "application" : "learning", href: r.href, estimatedMinutes: Math.min(120, r.effortMinutes ?? 30), dueDate: dayAt(todayOffset + 4), sourceKey: `rec:${r.key}`, isOptional: true });
  }

  // Budget: required tasks first; mark overflow optional
  let used = 0;
  for (const t of tasks.sort((a, b) => Number(a.isOptional) - Number(b.isOptional) || new Date(a.dueDate) - new Date(b.dueDate))) {
    if (used + t.estimatedMinutes > budget) t.isOptional = true;
    else used += t.estimatedMinutes;
  }
  const byCategory = {};
  for (const t of tasks) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.estimatedMinutes;
  return {
    method: PLAN_METHOD, weekStart: start, weekEnd: end, tasks,
    summary: { totalMinutes: tasks.reduce((s, t) => s + t.estimatedMinutes, 0), requiredMinutes: used, budgetMinutes: budget, byCategory, sources: { recommendations: recommendations.length, roadmap: Boolean(snapshot.roadmap), applications: (snapshot.applications ?? []).length } },
  };
}

/** Progress of a plan: counts, overdue, by category. */
export function planProgress(plan, now = new Date()) {
  const tasks = plan.tasks ?? [];
  const req = tasks.filter((t) => !t.isOptional);
  const done = tasks.filter((t) => t.status === "done");
  const overdue = tasks.filter((t) => t.status === "pending" && t.dueDate && new Date(t.dueDate) < now);
  return { total: tasks.length, required: req.length, done: done.length, doneRequired: req.filter((t) => t.status === "done").length, skipped: tasks.filter((t) => t.status === "skipped").length, overdue: overdue.length, percent: req.length ? Math.round((req.filter((t) => t.status === "done").length / req.length) * 100) : tasks.length ? Math.round((done.length / tasks.length) * 100) : 0, minutesDone: done.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0) };
}
