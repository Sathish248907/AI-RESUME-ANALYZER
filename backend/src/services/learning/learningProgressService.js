/**
 * learningProgressService.js — progress maths, milestone locking, weekly plan and
 * "next action" selection. Pure functions over a roadmap shaped like the Prisma
 * rows: { milestones: [{ ..., tasks: [...] }] }.
 *
 * Progress method (learning-progress-1.0):
 *   task completion % = completed required tasks / total required tasks × 100
 *   milestone completed = every required task completed (checkpoint tasks included)
 *   roadmap completion % = completed required tasks / total required tasks × 100
 *   Optional and skipped tasks never count as completed required work.
 *   Remaining time = Σ estimatedMinutes of incomplete required tasks (an estimate, not a promise).
 */

export const PROGRESS_METHOD = "learning-progress-1.0";
const DAY = 86_400_000;

const isDone = (t) => t.status === "completed";
const isRequired = (t) => t.isRequired !== false;

export function milestoneProgress(m) {
  const tasks = m.tasks ?? [];
  const required = tasks.filter(isRequired);
  const completedRequired = required.filter(isDone).length;
  const optional = tasks.filter((t) => !isRequired(t));
  return {
    totalTasks: tasks.length,
    requiredTasks: required.length,
    completedRequired,
    completedOptional: optional.filter(isDone).length,
    inProgress: tasks.filter((t) => t.status === "in_progress" || t.status === "paused").length,
    skipped: tasks.filter((t) => t.status === "skipped").length,
    percent: required.length === 0 ? (tasks.length === 0 ? 0 : Math.round((tasks.filter(isDone).length / tasks.length) * 100)) : Math.round((completedRequired / required.length) * 100),
    remainingMinutes: required.filter((t) => !isDone(t)).reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
    criteriaSatisfied: required.length > 0 && completedRequired === required.length,
  };
}

/** Derive effective milestone status (locked when a prerequisite is unfinished). */
export function milestoneStatuses(roadmap) {
  const ms = [...(roadmap.milestones ?? [])].sort((a, b) => a.sequenceNumber - a.sequenceNumber === 0 ? a.sequenceNumber - b.sequenceNumber : a.sequenceNumber - b.sequenceNumber);
  const bySeq = new Map(ms.map((m) => [m.sequenceNumber, m]));
  const result = new Map();
  for (const m of ms) {
    const p = milestoneProgress(m);
    const prereqs = Array.isArray(m.prerequisiteSequences) ? m.prerequisiteSequences : [];
    const unmet = prereqs.filter((seq) => { const pm = bySeq.get(seq); return pm && !milestoneProgress(pm).criteriaSatisfied && pm.status !== "completed"; });
    let status;
    if (m.status === "completed" || p.criteriaSatisfied) status = "completed";
    else if (unmet.length > 0) status = "locked";
    else if (p.completedRequired > 0 || p.inProgress > 0 || p.completedOptional > 0) status = "in_progress";
    else status = "not_started";
    result.set(m.id, { status, unmetPrerequisites: unmet, progress: p });
  }
  return result;
}

export function roadmapProgress(roadmap) {
  const statuses = milestoneStatuses(roadmap);
  const ms = roadmap.milestones ?? [];
  const allTasks = ms.flatMap((m) => m.tasks ?? []);
  const required = allTasks.filter(isRequired);
  const completedRequired = required.filter(isDone).length;
  const studied = allTasks.reduce((s, t) => s + (t.actualStudyMinutes ?? 0), 0);
  const remainingMinutes = required.filter((t) => !isDone(t)).reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);
  const weeklyMinutes = Math.max(1, (roadmap.weeklyStudyHours ?? 5) * 60);
  return {
    method: PROGRESS_METHOD,
    totalMilestones: ms.length,
    completedMilestones: [...statuses.values()].filter((s) => s.status === "completed").length,
    lockedMilestones: [...statuses.values()].filter((s) => s.status === "locked").length,
    totalTasks: allTasks.length,
    requiredTasks: required.length,
    completedTasks: completedRequired,
    completedOptionalTasks: allTasks.filter((t) => !isRequired(t) && isDone(t)).length,
    remainingTasks: required.length - completedRequired,
    inProgressTasks: allTasks.filter((t) => t.status === "in_progress" || t.status === "paused").length,
    skippedTasks: allTasks.filter((t) => t.status === "skipped").length,
    percent: required.length === 0 ? 0 : Math.round((completedRequired / required.length) * 100),
    studiedMinutes: studied,
    remainingMinutes,
    remainingWeeksEstimate: Math.ceil(remainingMinutes / weeklyMinutes),
    milestones: ms.map((m) => ({ id: m.id, sequenceNumber: m.sequenceNumber, ...statuses.get(m.id) })),
  };
}

/** Tasks the user can work on right now (milestone unlocked, task not finished), in roadmap order. */
export function availableTasks(roadmap) {
  const statuses = milestoneStatuses(roadmap);
  const out = [];
  for (const m of [...(roadmap.milestones ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    const st = statuses.get(m.id);
    if (!st || st.status === "locked" || st.status === "completed") continue;
    for (const t of [...(m.tasks ?? [])].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      if (t.status === "completed" || t.status === "skipped") continue;
      out.push({ task: t, milestone: m });
    }
  }
  return out;
}

/**
 * Build a weekly plan: distribute available tasks across the next 7 days according to the
 * schedule preference and weekly hours. Already-scheduled tasks keep their date.
 */
export function buildWeeklyPlan(roadmap, { now = new Date() } = {}) {
  const weeklyMinutes = Math.max(30, (roadmap.weeklyStudyHours ?? 5) * 60);
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
  const allowed = (d) => {
    const wd = d.getDay();
    if (roadmap.preferredSchedule === "weekdays") return wd >= 1 && wd <= 5;
    if (roadmap.preferredSchedule === "weekends") return wd === 0 || wd === 6;
    return true;
  };
  const studyDays = days.filter(allowed);
  const perDay = studyDays.length ? Math.round(weeklyMinutes / studyDays.length) : weeklyMinutes;
  const sessions = days.map((d) => ({ date: d.toISOString().slice(0, 10), weekday: d.toLocaleDateString("en-US", { weekday: "short" }), studyDay: allowed(d), targetMinutes: allowed(d) ? perDay : 0, tasks: [], plannedMinutes: 0 }));
  const byDate = new Map(sessions.map((s) => [s.date, s]));

  const avail = availableTasks(roadmap);
  // 1. tasks already scheduled inside the window
  const unscheduled = [];
  for (const { task, milestone } of avail) {
    const key = task.scheduledDate ? new Date(task.scheduledDate).toISOString().slice(0, 10) : null;
    const s = key ? byDate.get(key) : null;
    if (s) { s.tasks.push(entry(task, milestone)); s.plannedMinutes += task.estimatedMinutes ?? 0; }
    else if (!key || new Date(task.scheduledDate) < start) unscheduled.push({ task, milestone });
  }
  // 2. fill study days greedily in roadmap order until the weekly budget is used
  let budget = weeklyMinutes - sessions.reduce((s, x) => s + x.plannedMinutes, 0);
  for (const { task, milestone } of unscheduled) {
    const mins = task.estimatedMinutes ?? 30;
    if (budget - mins < -perDay) break;
    const target = sessions.filter((s) => s.studyDay && s.date >= start.toISOString().slice(0, 10)).sort((a, b) => a.plannedMinutes - b.plannedMinutes || a.date.localeCompare(b.date))[0];
    if (!target) break;
    target.tasks.push({ ...entry(task, milestone), suggested: true });
    target.plannedMinutes += mins;
    budget -= mins;
  }

  const weekStart = start.getTime();
  const completedThisWeek = (roadmap.milestones ?? []).flatMap((m) => m.tasks ?? []).filter((t) => t.completedAt && new Date(t.completedAt).getTime() >= weekStart - 7 * DAY);
  const doneMinutes = completedThisWeek.reduce((s, t) => s + (t.actualStudyMinutes || t.estimatedMinutes || 0), 0);
  return {
    weeklyTargetMinutes: weeklyMinutes,
    schedule: roadmap.preferredSchedule ?? "flexible",
    sessions,
    completedThisWeek: completedThisWeek.length,
    completedMinutesThisWeek: doneMinutes,
    weeklyCompletionPercent: Math.min(100, Math.round((doneMinutes / weeklyMinutes) * 100)),
    remainingTargetMinutes: Math.max(0, weeklyMinutes - doneMinutes),
  };
}

function entry(task, milestone) {
  return { taskId: task.id, title: task.title, skillName: task.skillName, taskType: task.taskType, estimatedMinutes: task.estimatedMinutes, status: task.status, milestoneId: milestone.id, milestoneTitle: milestone.title, isRequired: task.isRequired !== false };
}

/**
 * Recommended next action: in-progress task first, otherwise the first available required
 * task whose skill has the highest priority (ties → roadmap order), fitting the time available.
 */
export function nextAction(roadmap, { skillPriority = new Map(), availableMinutes = null } = {}) {
  const avail = availableTasks(roadmap);
  if (avail.length === 0) return null;
  const inProgress = avail.find(({ task }) => task.status === "in_progress" || task.status === "paused");
  if (inProgress) return { ...entry(inProgress.task, inProgress.milestone), reason: inProgress.task.status === "paused" ? "You paused this task — pick it back up." : "Continue the task you already started." };
  const scored = avail.map((x, idx) => ({ x, idx, prio: skillPriority.get(String(x.task.skillName).toLowerCase()) ?? 0, fits: availableMinutes === null || (x.task.estimatedMinutes ?? 30) <= availableMinutes }));
  scored.sort((a, b) => (b.fits - a.fits) || (b.x.task.isRequired !== false) - (a.x.task.isRequired !== false) || b.prio - a.prio || a.idx - b.idx);
  const best = scored[0];
  const reasons = [];
  if (best.prio >= 60) reasons.push("high-priority skill gap");
  if (best.idx === 0) reasons.push("next in your roadmap order");
  if (availableMinutes !== null && best.fits) reasons.push(`fits in ${availableMinutes} min`);
  return { ...entry(best.x.task, best.x.milestone), reason: reasons.length ? reasons.join(" · ") : "Next unlocked task in sequence." };
}
