/**
 * interviewPrepService.js — connects the career coach to Phase 6 data: session
 * recommendations, recurring weak topics, a practice plan and a score trend.
 * Pure; reuses the interview weak-topic engine and roadmap tasks.
 */
import { classifyTopics, recurringMissingConcepts, toEvidence } from "../interview/weakTopicService.js";
import { requiredSkillsFor } from "./careerReadinessService.js";

const norm = (s) => String(s ?? "").trim().toLowerCase();

export function buildInterviewPrep(snapshot, targetRole) {
  const completed = (snapshot.interviews ?? []).filter((i) => i.status === "completed");
  const answers = completed.flatMap((s) => { const q = new Map(s.questions.map((x) => [x.id, x])); return s.answers.map((a) => ({ ...a, question: q.get(a.questionId), sessionId: s.id })); });
  const ev = toEvidence(answers);
  const { weak, candidates, strong } = classifyTopics(ev);
  const gaps = recurringMissingConcepts(ev);
  const required = requiredSkillsFor(snapshot, targetRole);
  const practised = new Set(ev.map((e) => norm(e.topic)));
  const untested = required.filter((r) => ![...practised].some((p) => p.includes(norm(r.skillName)) || norm(r.skillName).includes(p))).slice(0, 6);

  const trend = completed.filter((s) => typeof s.score === "number").sort((a, b) => new Date(a.completedAt ?? a.createdAt) - new Date(b.completedAt ?? b.createdAt)).map((s) => ({ sessionId: s.id, date: s.completedAt ?? s.createdAt, score: s.score, type: s.interviewType, role: s.targetRole, answered: s.completedQuestionCount ?? 0, total: s.questionCount }));

  const sessions = [];
  if (weak.length) sessions.push({ key: "weak", title: `Focused technical session on ${weak.slice(0, 3).map((w) => w.topic).join(", ")}`, interviewType: "technical", difficulty: "intermediate", topics: weak.slice(0, 3).map((w) => w.topic), reason: "Topics with repeatedly low scores.", href: `/dashboard/interviews/new?topic=${encodeURIComponent(weak[0].topic)}` });
  if (untested.length) sessions.push({ key: "untested", title: `Cover untested requirements: ${untested.slice(0, 3).map((u) => u.skillName).join(", ")}`, interviewType: "technical", difficulty: completed.length ? "intermediate" : "beginner", topics: untested.slice(0, 3).map((u) => u.skillName), reason: `Required for ${targetRole} but never practised.`, href: "/dashboard/interviews/new" });
  if (!completed.some((s) => s.interviewType === "behavioral" || s.interviewType === "hr")) sessions.push({ key: "behavioral", title: "Behavioral / HR session", interviewType: "behavioral", difficulty: "intermediate", topics: [], reason: "No behavioral practice recorded yet.", href: "/dashboard/interviews/new" });
  if (strong.length >= 3 && trend.length >= 2 && trend[trend.length - 1].score >= 75) sessions.push({ key: "advanced", title: "Advanced-difficulty mixed interview", interviewType: "mixed", difficulty: "advanced", topics: [], reason: "Recent scores are strong — raise the difficulty.", href: "/dashboard/interviews/new" });
  if (!sessions.length) sessions.push({ key: "start", title: `Mixed interview for ${targetRole}`, interviewType: "mixed", difficulty: "intermediate", topics: [], reason: "Build a baseline for weak-topic tracking.", href: "/dashboard/interviews/new" });

  const roadmapTasks = (snapshot.roadmap?.milestones ?? []).flatMap((m) => (m.tasks ?? []).map((t) => ({ ...t, milestoneTitle: m.title })));
  const practicePlan = [
    ...weak.slice(0, 3).map((w, i) => ({ step: i + 1, kind: "review", title: `Re-read your evaluated answers on ${w.topic}`, detail: `Average ${w.mean}% over ${w.attempts} answers — note the missing concepts in the feedback.`, href: "/dashboard/interviews", minutes: 20 })),
    ...gaps.slice(0, 2).map((g, i) => ({ step: weak.length + i + 1, kind: "study", title: `Study ${g.concept}`, detail: `Marked missing in ${g.count} answers.`, href: roadmapTasks.find((t) => norm(t.skillName).includes(norm(g.concept)) || norm(g.concept).includes(norm(t.skillName))) ? "/dashboard/learning" : "/dashboard/learning/skill-gaps", minutes: 40 })),
    ...sessions.slice(0, 2).map((s, i) => ({ step: weak.length + Math.min(gaps.length, 2) + i + 1, kind: "practice", title: s.title, detail: s.reason, href: s.href, minutes: 30 })),
  ];
  const codingTasks = roadmapTasks.filter((t) => ["coding_exercise", "mini_project"].includes(t.taskType) && t.status !== "completed").slice(0, 3).map((t) => ({ taskId: t.id, title: t.title, skillName: t.skillName, taskType: t.taskType, milestone: t.milestoneTitle, href: "/dashboard/learning" }));

  return {
    targetRole,
    sessionsCompleted: completed.length,
    weakTopics: weak, candidateTopics: candidates, strongTopics: strong, recurringGaps: gaps,
    untestedRequirements: untested.map((u) => u.skillName),
    recommendedSessions: sessions, practicePlan, codingTasks, trend,
    followUps: answers.filter((a) => a.status === "insufficient" || (typeof a.score === "number" && a.score < 50)).slice(0, 5).map((a) => ({ sessionId: a.sessionId ?? null, topic: a.question?.topic ?? null, score: a.score ?? null, status: a.status })),
  };
}
