/**
 * learningRecommendationService.js — "what should I study next?" derived from the
 * user's records. Pure; every recommendation carries a key (for dismissal), a
 * reason and, where possible, a concrete task to open.
 */
import { availableTasks, roadmapProgress } from "./learningProgressService.js";

const norm = (s) => String(s ?? "").trim().toLowerCase();
const DAY = 86_400_000;

/**
 * @param {object} input
 * @param {object|null} input.roadmap           active roadmap with milestones+tasks
 * @param {object[]} input.skillGaps            persisted SkillGap rows (sorted by priorityScore desc)
 * @param {{ weakTopics: string[], recurringGaps: string[] }} input.interview
 * @param {string[]} input.dismissedKeys
 * @param {{ weeklyStudyHours?: number }} [input.preferences]
 * @param {Date} [input.now]
 */
export function buildLearningRecommendations({ roadmap, skillGaps = [], interview = { weakTopics: [], recurringGaps: [] }, dismissedKeys = [], preferences = {}, now = new Date() }) {
  const dismissed = new Set(dismissedKeys);
  const recs = [];
  const push = (r) => { if (!dismissed.has(r.key) && !recs.some((x) => x.key === r.key)) recs.push(r); };
  const avail = roadmap ? availableTasks(roadmap) : [];
  const taskForSkill = (skill) => avail.find(({ task }) => norm(task.skillName) === norm(skill) || norm(task.skillName).includes(norm(skill)) || norm(skill).includes(norm(task.skillName)));
  const recentlyCompleted = roadmap ? (roadmap.milestones ?? []).flatMap((m) => m.tasks ?? []).filter((t) => t.completedAt && now - new Date(t.completedAt) < 7 * DAY) : [];

  // 1. Resume an in-progress task
  const inProgress = avail.find(({ task }) => task.status === "in_progress" || task.status === "paused");
  if (inProgress) push({ key: `resume:${inProgress.task.id}`, type: "continue", title: `Continue "${inProgress.task.title}"`, reason: inProgress.task.status === "paused" ? "You paused this task." : "You started this task but have not completed it.", skillName: inProgress.task.skillName, taskId: inProgress.task.id, milestoneId: inProgress.milestone.id, priority: "high" });

  // 2. Interview weak topics → matching roadmap task, or a review suggestion
  for (const topic of interview.weakTopics ?? []) {
    const hit = taskForSkill(topic);
    if (hit) push({ key: `weak:${norm(topic)}`, type: "review", title: `Review ${topic}`, reason: "Repeated difficulty with related mock-interview questions.", skillName: hit.task.skillName, taskId: hit.task.id, milestoneId: hit.milestone.id, priority: "high" });
    else push({ key: `weak:${norm(topic)}`, type: "review", title: `Review ${topic}`, reason: "Repeated difficulty with related mock-interview questions; not yet covered by a roadmap task.", skillName: topic, taskId: null, milestoneId: null, priority: "high", action: "regenerate" });
  }

  // 3. Highest-priority open skill gaps with an available task
  for (const gap of skillGaps.filter((g) => g.proficiencyStatus !== "demonstrated").slice(0, 6)) {
    const hit = taskForSkill(gap.skillName);
    if (!hit) continue;
    if (recs.some((r) => norm(r.skillName) === norm(gap.skillName))) continue;
    push({ key: `gap:${norm(gap.skillName)}`, type: "study", title: `${verb(hit.task.taskType)} ${gap.skillName}`, reason: gap.proficiencyStatus === "not_demonstrated" ? `${gap.whyItMatters} No evidence of it in your records yet.` : gap.explanation, skillName: gap.skillName, taskId: hit.task.id, milestoneId: hit.milestone.id, priority: gap.priority });
  }

  // 4. Build after fundamentals: a mini-project unlocked by recent completions
  const project = avail.find(({ task }) => task.taskType === "mini_project");
  if (project && recentlyCompleted.length >= 2) push({ key: `project:${project.task.id}`, type: "build", title: project.task.title, reason: `You completed ${recentlyCompleted.length} tasks this week — apply them in a project.`, skillName: project.task.skillName, taskId: project.task.id, milestoneId: project.milestone.id, priority: "medium" });

  // 5. Review session for a skill completed > 2 weeks ago that is also an interview gap
  for (const topic of interview.recurringGaps ?? []) {
    const done = roadmap ? (roadmap.milestones ?? []).flatMap((m) => m.tasks ?? []).find((t) => t.status === "completed" && norm(t.skillName) === norm(topic) && now - new Date(t.completedAt) > 14 * DAY) : null;
    if (done) push({ key: `revisit:${done.id}`, type: "review", title: `Revisit ${done.skillName}`, reason: "Completed over two weeks ago but still marked missing in interview answers — a short review session is worthwhile.", skillName: done.skillName, taskId: done.id, milestoneId: done.milestoneId, priority: "medium" });
  }

  // 6. Time-fit suggestion
  const hours = preferences.weeklyStudyHours ?? roadmap?.weeklyStudyHours ?? 5;
  const quick = avail.find(({ task }) => (task.estimatedMinutes ?? 30) <= 30 && !recs.some((r) => r.taskId === task.id));
  if (quick && hours <= 5) push({ key: `quick:${quick.task.id}`, type: "study", title: `Quick win: ${quick.task.title}`, reason: `Fits a short session (~${quick.task.estimatedMinutes} min) within your ${hours} h/week plan.`, skillName: quick.task.skillName, taskId: quick.task.id, milestoneId: quick.milestone.id, priority: "low" });

  // 7. Nothing left / no roadmap
  if (!roadmap) push({ key: "create-roadmap", type: "setup", title: "Generate a learning roadmap", reason: "No active roadmap yet — one will turn your skill gaps into ordered milestones.", skillName: null, taskId: null, milestoneId: null, priority: "high", action: "create" });
  else if (avail.length === 0 && roadmapProgress(roadmap).percent === 100) push({ key: "roadmap-complete", type: "setup", title: "Roadmap complete — generate the next one", reason: "Every required task is done. Regenerate with a harder level or a new job description.", skillName: null, taskId: null, milestoneId: null, priority: "medium", action: "regenerate" });

  return recs.slice(0, 8);
}

function verb(taskType) {
  switch (taskType) {
    case "coding_exercise": return "Practice";
    case "mini_project": return "Build with";
    case "read_docs": return "Read up on";
    case "review_interview_questions": return "Review interview questions on";
    case "explain_concept": return "Practice explaining";
    default: return "Learn";
  }
}
