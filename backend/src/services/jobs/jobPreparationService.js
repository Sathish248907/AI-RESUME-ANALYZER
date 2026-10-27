/**
 * jobPreparationService.js — what to do about one job (`job-prep-1.0`). Pure.
 *
 * This deliberately implements almost nothing of its own. The skill-gap list is
 * the Phase 7 engine (`analyzeSkillGaps`), the interview history, weak topics,
 * practice plan and coding exercises are the Phase 9 engine
 * (`buildInterviewPrep`) over the Phase 6 records, and resources come from the
 * Phase 7 verified catalogue (`resourcesForTask`). The job-specific part is
 * turning this listing's requirements into topics, ordered by how much evidence
 * the user's resume already shows for each.
 *
 * Nothing about the employer is invented: topics come from the listing's own
 * text and from the user's own records, and a requirement the listing does not
 * state produces no advice.
 */
import { analyzeSkillGaps } from "../learning/skillGapService.js";
import { resourcesForTask } from "../learning/learningResourceService.js";
import { buildInterviewPrep } from "../career/interviewPrepService.js";

export const JOB_PREP_METHOD = "job-prep-1.0";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Behavioural themes, detected only from the listing's own wording. */
const BEHAVIOURAL_THEMES = [
  { key: "ownership", rx: /\b(ownership|own the|end[- ]to[- ]end|autonom|self[- ]start|drive)\b/i, topic: "Taking ownership of a project end to end", ask: "Describe something you owned from start to finish, including what went wrong." },
  { key: "collaboration", rx: /\b(collaborat|cross[- ]functional|stakeholder|team ?work|partner with)\b/i, topic: "Working across teams", ask: "Describe a disagreement with another team and how it was resolved." },
  { key: "mentoring", rx: /\b(mentor|coach|lead a team|line manage|review code)\b/i, topic: "Mentoring and code review", ask: "How do you give feedback on someone else's code?" },
  { key: "communication", rx: /\b(communicat|present|document|write[- ]up|explain)\b/i, topic: "Explaining technical work to non-engineers", ask: "Describe explaining a technical trade-off to a non-technical stakeholder." },
  { key: "delivery", rx: /\b(deadline|fast[- ]paced|ship|deliver|agile|scrum|sprint)\b/i, topic: "Delivering under a deadline", ask: "Describe a time you had to cut scope to ship on time." },
  { key: "customer", rx: /\b(customer|client|user[- ]focused|user research|support)\b/i, topic: "Customer-facing judgement", ask: "Describe a decision you changed because of user feedback." },
];

/**
 * Interview topics for this listing, split by how well the resume evidences
 * each requirement — which changes the advice, not just the ordering.
 * @param {object} match match report from jobMatchService
 */
export function technicalTopics(match) {
  const detail = match?.skills?.detail ?? [];
  const order = { required: 0, preferred: 1 };
  const advice = {
    demonstrated: { priority: "high", why: "You show this in a role or project, so expect the deepest questions here.", prepare: "Be ready to explain a decision you made, a trade-off you took and what you would do differently." },
    mentioned: { priority: "high", why: "Your resume lists this but does not show where you used it, so it is the most likely place to be probed.", prepare: "Prepare one concrete example before the interview, or be ready to say how far your experience actually goes." },
    not_found: { priority: "medium", why: "The listing asks for this and your resume does not mention it.", prepare: "Learn the basics so you can discuss it honestly, and say plainly what you have not used yet." },
    not_assessed: { priority: "low", why: "This could not be checked against your resume.", prepare: "Review it yourself." },
  };
  return detail
    .slice()
    .sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2))
    .map((s) => ({
      topic: s.name,
      requirement: s.priority,
      evidence: s.evidence,
      priority: s.priority === "required" ? advice[s.evidence].priority : "low",
      why: advice[s.evidence].why,
      prepare: advice[s.evidence].prepare,
    }))
    .slice(0, 14);
}

/** Behavioural topics the listing itself raises. */
export function behaviouralTopics(description) {
  const text = String(description ?? "");
  const hits = BEHAVIOURAL_THEMES.filter((t) => t.rx.test(text)).map((t) => ({ key: t.key, topic: t.topic, question: t.ask, source: "Mentioned in this listing" }));
  if (hits.length) return hits.slice(0, 5);
  // No themes detected: offer the two that apply to essentially any role, labelled as such.
  return [
    { key: "ownership", topic: BEHAVIOURAL_THEMES[0].topic, question: BEHAVIOURAL_THEMES[0].ask, source: "Standard question — this listing names no behavioural themes" },
    { key: "collaboration", topic: BEHAVIOURAL_THEMES[1].topic, question: BEHAVIOURAL_THEMES[1].ask, source: "Standard question — this listing names no behavioural themes" },
  ];
}

/**
 * Practice questions grounded in the listing's requirements. These are prompts
 * to think about, not generated interview content: each one names the skill it
 * came from so the user can see why it is being asked.
 */
export function practiceQuestions(match, description) {
  const out = [];
  const required = (match?.skills?.detail ?? []).filter((s) => s.priority === "required");
  for (const s of required.filter((x) => x.evidence === "demonstrated").slice(0, 3)) {
    out.push({ kind: "technical", skill: s.name, question: `Walk through how you used ${s.name} on one of your projects — what you built, which decisions were yours, and what you would change.`, basis: "Required by the listing and demonstrated on your resume" });
  }
  for (const s of required.filter((x) => x.evidence === "mentioned").slice(0, 3)) {
    out.push({ kind: "technical", skill: s.name, question: `How deep is your experience with ${s.name}? Give a specific example of a problem you solved with it.`, basis: "Required by the listing and listed on your resume without a supporting example" });
  }
  for (const s of required.filter((x) => x.evidence === "not_found").slice(0, 2)) {
    out.push({ kind: "technical", skill: s.name, question: `What do you know about ${s.name}, and how would you get up to speed on it?`, basis: "Required by the listing and not found on your resume — answer honestly" });
  }
  for (const b of behaviouralTopics(description).slice(0, 3)) {
    out.push({ kind: "behavioural", skill: null, question: b.question, basis: b.source });
  }
  return out.slice(0, 10);
}

/**
 * Everything the job detail page needs beyond the match itself.
 *
 * @param {object} input
 * @param {object} input.job             the listing (external or saved description)
 * @param {object} input.match           match report
 * @param {object} input.careerSnapshot  Phase 9 snapshot (interviews, roadmap, skill gaps)
 * @param {string} [input.targetRole]    role used for the history-driven parts
 */
export function buildJobPreparation({ job, match, careerSnapshot = {}, targetRole = null }) {
  const role = targetRole || job?.targetRole || job?.title || "this role";

  // ── Skill gaps: the Phase 7 engine, fed by this job's requirements ──
  const detail = match?.skills?.detail ?? [];
  const gapResult = analyzeSkillGaps({
    targetRole: role,
    jobSkills: (match?.requirements?.skills ?? []).map((s) => ({ name: s.name, priority: s.priority })),
    // The match report's evidence states map onto the analysis shape the engine expects.
    analysis: {
      matched: detail.filter((s) => s.evidence === "demonstrated").map((s) => s.name),
      partial: detail.filter((s) => s.evidence === "mentioned").map((s) => s.name),
      missing: detail.filter((s) => s.evidence === "not_found").map((s) => ({ name: s.name, priority: s.priority })),
    },
    interview: {
      weakTopics: (careerSnapshot.skillGaps ?? []).filter((g) => g.proficiencyStatus === "needs_improvement").map((g) => g.skillName),
      candidateTopics: [],
      strongTopics: (careerSnapshot.skillGaps ?? []).filter((g) => g.proficiencyStatus === "demonstrated").map((g) => g.skillName),
      recurringGaps: [],
    },
    inProgressSkills: (careerSnapshot.roadmap?.milestones ?? [])
      .flatMap((m) => m.tasks ?? [])
      .filter((t) => t.status === "in_progress")
      .map((t) => t.skillName)
      .filter(Boolean),
  });

  // ── Interview preparation: Phase 9 engine over Phase 6 records ──
  let history = null;
  try { history = buildInterviewPrep(careerSnapshot, role); } catch { history = null; }

  // ── Learning: existing roadmap tasks first, then verified catalogue resources ──
  const roadmapTasks = (careerSnapshot.roadmap?.milestones ?? []).flatMap((m) => (m.tasks ?? []).map((t) => ({ ...t, milestoneTitle: m.title })));
  const needed = detail.filter((s) => s.evidence === "not_found" || s.evidence === "mentioned");
  const learning = needed.slice(0, 8).map((s) => {
    const existing = roadmapTasks.find((t) => norm(t.skillName) && (norm(t.skillName).includes(norm(s.name)) || norm(s.name).includes(norm(t.skillName))));
    const resources = existing ? [] : resourcesForTask({ skillName: s.name, taskType: "learn_concept", difficulty: "beginner" });
    return {
      skillName: s.name,
      requirement: s.priority,
      evidence: s.evidence,
      inRoadmap: Boolean(existing),
      taskId: existing?.id ?? null,
      taskStatus: existing?.status ?? null,
      milestone: existing?.milestoneTitle ?? null,
      href: existing ? "/dashboard/learning" : "/dashboard/learning/skill-gaps",
      why: s.evidence === "not_found"
        ? `Required by this listing and not found on your resume.`
        : `Listed on your resume but not shown in any role or project.`,
      resources: Array.isArray(resources) ? resources.slice(0, 3) : [],
    };
  });

  return {
    method: JOB_PREP_METHOD,
    targetRole: role,
    skillGaps: {
      method: gapResult.method ?? null,
      skills: (gapResult.skills ?? []).slice(0, 20),
      summary: gapResult.summary ?? null,
    },
    interview: {
      technicalTopics: technicalTopics(match),
      behaviouralTopics: behaviouralTopics(job?.description),
      practiceQuestions: practiceQuestions(match, job?.description),
      // Straight from the Phase 9 engine: the user's own history drives these.
      recommendedSessions: history?.recommendedSessions ?? [],
      weakTopics: history?.weakTopics ?? [],
      codingExercises: history?.codingTasks ?? [],
      practicePlan: history?.practicePlan ?? [],
      untestedRequirements: history?.untestedRequirements ?? [],
      sessionsCompleted: history?.sessionsCompleted ?? 0,
      scoreTrend: history?.trend ?? [],
      startSessionHref: `/dashboard/interviews/new?role=${encodeURIComponent(role)}`,
      // The engine returns a shape even with no sessions, so the note depends on
      // whether there is actually any history to have drawn on.
      note: (history?.sessionsCompleted ?? 0) > 0
        ? "Weak topics, the score trend and the recommended sessions come from your own completed mock interviews."
        : "No mock-interview history is available yet, so only this listing's requirements are used.",
    },
    learning,
    notes: [
      "Topics are read from this listing's text and from your own records. Nothing about the employer's actual interview process is known.",
      "A requirement the listing does not state produces no advice here.",
    ],
  };
}
