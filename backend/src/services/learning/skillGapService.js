/**
 * skillGapService.js — classifies the skills a target role needs against the
 * user's evidence and ranks them. Pure functions; every result carries the
 * evidence sources and a plain-language explanation so the ranking is auditable.
 *
 * Proficiency statuses
 *   demonstrated          resume evidence (AI "matched" skill) or user confirmation
 *   needs_improvement     partial resume match, or interview evidence of difficulty
 *   not_demonstrated      the job asks for it and nothing in the user's records shows it
 *   not_assessed          mentioned as a goal / role baseline but no job or evidence signal
 *   learning_in_progress  present in an active roadmap with an in-progress task
 *
 * Priority score (0–100, documented):
 *   +40 required by the job description · +20 preferred · +10 role baseline only
 *   +25 interview weak topic · +10 interview "needs another attempt"
 *   +20 not_demonstrated · +10 needs_improvement · +0 demonstrated (capped at 25 when demonstrated)
 *   +10 foundational skill (others depend on it)
 *   +5 explicitly selected goal
 *   High ≥ 60 · Medium 35–59 · Low < 35
 * The ranking orders study; it does not predict hiring outcomes.
 */

export const PROFICIENCY = ["demonstrated", "needs_improvement", "not_demonstrated", "not_assessed", "learning_in_progress"];

/** Baseline skills per role (used when no job description is supplied). */
export const ROLE_BASELINES = {
  "Frontend Developer": ["JavaScript", "HTML", "CSS", "React", "TypeScript", "REST APIs", "Git", "Testing", "Web Performance", "Accessibility"],
  "Backend Developer": ["Node.js", "REST APIs", "SQL", "Databases", "Authentication", "Testing", "Git", "Docker", "API Design", "Caching"],
  "Full Stack Developer": ["JavaScript", "React", "Node.js", "REST APIs", "SQL", "TypeScript", "Testing", "Git", "Docker", "Deployment"],
  "Data Analyst": ["SQL", "Python", "Pandas", "Data Visualization", "Excel", "Statistics", "Dashboards", "ETL", "Communication"],
  "Software Engineer": ["Data Structures", "Algorithms", "Git", "Testing", "System Design", "SQL", "REST APIs", "Debugging", "Code Review"],
};

/** Skills other skills build on; learning these first unblocks the rest. */
export const FOUNDATIONS = {
  JavaScript: ["React", "TypeScript", "Node.js", "Next.js", "Vue.js", "Angular"],
  HTML: ["React", "Accessibility"],
  CSS: ["Tailwind CSS", "Responsive Design"],
  SQL: ["PostgreSQL", "MySQL", "Databases", "ETL"],
  Python: ["Pandas", "Django", "Flask", "FastAPI", "Machine Learning"],
  "Node.js": ["Express.js", "NestJS"],
  React: ["Next.js", "Redux", "React Testing Library"],
  Git: ["CI/CD"],
  Docker: ["Kubernetes"],
  "REST APIs": ["GraphQL", "API Design"],
  "Data Structures": ["Algorithms"],
};

const CATEGORY_GUESS = [
  [/react|vue|angular|html|css|tailwind|next\.js|redux|frontend|accessib|dom|browser/i, "Frontend"],
  [/node|express|nest|django|flask|fastapi|rest|graphql|api|auth|backend|microservice|cach/i, "Backend"],
  [/sql|postgres|mysql|mongo|database|prisma|redis|etl|data model/i, "Database"],
  [/aws|azure|gcp|docker|kubernetes|ci\/cd|deploy|devops|linux|terraform/i, "Cloud/DevOps"],
  [/test|jest|cypress|playwright|vitest|tdd/i, "Testing"],
  [/python|pandas|excel|tableau|power bi|statistic|visuali|dashboard|machine learning/i, "Data"],
  [/git|jira|figma|agile|scrum|code review|debug/i, "Tools"],
  [/communicat|leadership|teamwork|problem solving|system design|algorithm|data structure|explain/i, "Core"],
];

export function guessCategory(skill) {
  for (const [rx, cat] of CATEGORY_GUESS) if (rx.test(skill)) return cat;
  return "Other";
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

/**
 * @param {object} input
 * @param {string} input.targetRole
 * @param {{ name: string, priority?: "required"|"preferred"|"unknown", category?: string }[]} [input.jobSkills]   from a saved JD's extractedRequirements or an analysis
 * @param {{ matched: string[], partial: string[], missing: {name, priority?}[] }} [input.analysis]           latest AI resume analysis
 * @param {{ weakTopics: string[], candidateTopics: string[], strongTopics: string[], recurringGaps: string[] }} [input.interview]
 * @param {string[]} [input.confirmedSkills]   skills the user marked as known
 * @param {string[]} [input.goalSkills]        topics the user explicitly wants to learn
 * @param {string[]} [input.inProgressSkills]  skills with an in-progress task in the active roadmap
 */
export function analyzeSkillGaps(input) {
  const role = input.targetRole;
  const map = new Map();
  const ensure = (name, category) => {
    const key = norm(name);
    if (!key) return null;
    if (!map.has(key)) map.set(key, { skillName: String(name).trim(), category: category || guessCategory(name), evidenceSources: new Set(), signals: {}, relatedTopics: new Set() });
    return map.get(key);
  };

  // 1. Requirements
  for (const s of input.jobSkills ?? []) {
    const e = ensure(s.name, s.category);
    if (!e) continue;
    e.signals.jobPriority = s.priority === "required" ? "required" : s.priority === "preferred" ? "preferred" : e.signals.jobPriority ?? "unknown";
    e.evidenceSources.add("job_description");
  }
  for (const s of ROLE_BASELINES[role] ?? []) {
    const e = ensure(s);
    if (e && !e.signals.jobPriority) { e.signals.roleBaseline = true; e.evidenceSources.add("role_baseline"); }
  }
  for (const g of input.goalSkills ?? []) {
    const e = ensure(g);
    if (e) { e.signals.goal = true; e.evidenceSources.add("user_goal"); }
  }

  // 2. Evidence
  for (const m of input.analysis?.matched ?? []) { const e = ensure(m); if (e) { e.signals.resumeMatched = true; e.evidenceSources.add("resume_analysis"); } }
  for (const p of input.analysis?.partial ?? []) { const e = ensure(p); if (e) { e.signals.resumePartial = true; e.evidenceSources.add("resume_analysis"); } }
  for (const m of input.analysis?.missing ?? []) { const e = ensure(m.name ?? m); if (e) { e.signals.resumeMissing = true; if (m.priority === "required" && !e.signals.jobPriority) e.signals.jobPriority = "required"; e.evidenceSources.add("resume_analysis"); } }
  for (const c of input.confirmedSkills ?? []) { const e = ensure(c); if (e) { e.signals.confirmed = true; e.evidenceSources.add("user_confirmed"); } }
  for (const t of input.interview?.weakTopics ?? []) { const e = matchTopic(map, t) ?? ensure(t); if (e) { e.signals.interviewWeak = true; e.relatedTopics.add(t); e.evidenceSources.add("mock_interview"); } }
  for (const t of input.interview?.candidateTopics ?? []) { const e = matchTopic(map, t) ?? ensure(t); if (e) { e.signals.interviewCandidate = true; e.relatedTopics.add(t); e.evidenceSources.add("mock_interview"); } }
  for (const t of input.interview?.strongTopics ?? []) { const e = matchTopic(map, t); if (e) { e.signals.interviewStrong = true; e.relatedTopics.add(t); e.evidenceSources.add("mock_interview"); } }
  for (const g of input.interview?.recurringGaps ?? []) { const e = matchTopic(map, g) ?? ensure(g); if (e) { e.signals.recurringGap = true; e.relatedTopics.add(g); e.evidenceSources.add("mock_interview"); } }
  for (const s of input.inProgressSkills ?? []) { const e = ensure(s); if (e) e.signals.inProgress = true; }

  // 3. Classify + score
  const foundationOf = new Map();
  for (const [base, dependents] of Object.entries(FOUNDATIONS)) for (const d of dependents) foundationOf.set(norm(d), base);
  const skillNames = new Set([...map.keys()]);

  const out = [];
  for (const e of map.values()) {
    const s = e.signals;
    let status, explanation;
    if (s.inProgress) { status = "learning_in_progress"; explanation = "Currently being studied in your active roadmap."; }
    else if (s.confirmed) { status = "demonstrated"; explanation = "You confirmed this skill."; }
    else if (s.interviewWeak || s.recurringGap) { status = "needs_improvement"; explanation = s.interviewWeak ? "Mock interview answers on this topic scored low across repeated attempts." : "This concept was repeatedly marked missing in interview answers."; }
    else if (s.resumeMatched && s.interviewStrong) { status = "demonstrated"; explanation = "Shown on your resume and answered well in mock interviews."; }
    else if (s.resumeMatched) { status = "demonstrated"; explanation = "Evidence found in your resume analysis."; }
    else if (s.resumePartial || s.interviewCandidate) { status = "needs_improvement"; explanation = s.resumePartial ? "Your resume shows a related skill but not this one directly." : "One low-scoring interview answer — not yet confirmed as a gap."; }
    else if (s.resumeMissing || s.jobPriority) { status = "not_demonstrated"; explanation = s.resumeMissing ? "The job asks for it and your resume analysis found no evidence — this may be a real gap or an undetected mention." : "The job description asks for this; no records show it yet."; }
    else { status = "not_assessed"; explanation = "No job requirement or evidence signal yet — included as a baseline for the role."; }

    const isFoundation = [...(FOUNDATIONS[e.skillName] ?? [])].some((d) => skillNames.has(norm(d)));
    let score = 0;
    const reasons = [];
    if (s.jobPriority === "required") { score += 40; reasons.push("required by the job description"); }
    else if (s.jobPriority === "preferred") { score += 20; reasons.push("preferred by the job description"); }
    else if (s.jobPriority === "unknown") { score += 15; reasons.push("mentioned in the job description"); }
    else if (s.roleBaseline) { score += 10; reasons.push(`baseline for ${role}`); }
    if (s.interviewWeak) { score += 25; reasons.push("weak in mock interviews"); }
    else if (s.interviewCandidate) { score += 10; reasons.push("one low interview score"); }
    if (status === "not_demonstrated") { score += 20; reasons.push("no evidence yet"); }
    else if (status === "needs_improvement") { score += 10; reasons.push("partial evidence"); }
    if (isFoundation) { score += 10; reasons.push("foundation for other skills"); }
    if (s.goal) { score += 5; reasons.push("your selected goal"); }
    if (status === "demonstrated") score = Math.min(score, 25);
    score = Math.min(100, score);

    out.push({
      skillName: e.skillName,
      category: e.category,
      proficiencyStatus: status,
      priority: score >= 60 ? "high" : score >= 35 ? "medium" : "low",
      priorityScore: score,
      priorityReasons: reasons,
      evidenceSources: [...e.evidenceSources],
      explanation,
      whyItMatters: whyItMatters(e.skillName, role, s),
      targetProficiency: s.jobPriority === "required" || s.interviewWeak ? "confident" : "working",
      relatedTopics: [...e.relatedTopics],
      foundationFor: (FOUNDATIONS[e.skillName] ?? []).filter((d) => skillNames.has(norm(d))),
      dependsOn: foundationOf.get(norm(e.skillName)) ?? null,
    });
  }

  out.sort((a, b) => b.priorityScore - a.priorityScore || a.skillName.localeCompare(b.skillName));
  return {
    targetRole: role,
    skills: out,
    summary: {
      total: out.length,
      demonstrated: out.filter((x) => x.proficiencyStatus === "demonstrated").length,
      needsImprovement: out.filter((x) => x.proficiencyStatus === "needs_improvement").length,
      notDemonstrated: out.filter((x) => x.proficiencyStatus === "not_demonstrated").length,
      notAssessed: out.filter((x) => x.proficiencyStatus === "not_assessed").length,
      learningInProgress: out.filter((x) => x.proficiencyStatus === "learning_in_progress").length,
      highPriority: out.filter((x) => x.priority === "high").length,
    },
    method: "skill-gap-1.0",
  };
}

/** Find a tracked skill that an interview topic refers to ("React state management" → React). */
function matchTopic(map, topic) {
  const t = norm(topic);
  if (!t) return null;
  if (map.has(t)) return map.get(t);
  let best = null;
  for (const e of map.values()) {
    const k = norm(e.skillName);
    if (k.length >= 3 && (t.includes(k) || k.includes(t))) { if (!best || k.length > norm(best.skillName).length) best = e; }
  }
  return best;
}

function whyItMatters(skill, role, s) {
  if (s.jobPriority === "required") return `${skill} is listed as a requirement for this position.`;
  if (s.jobPriority === "preferred") return `${skill} is a preferred skill for this position and strengthens your application.`;
  if (s.interviewWeak) return `Interviewers for ${role} roles probe ${skill}; your practice answers show it needs work.`;
  if (s.roleBaseline) return `${skill} is a standard expectation for ${role} roles.`;
  if (s.goal) return `You chose ${skill} as a learning goal.`;
  return `${skill} supports the day-to-day work of a ${role}.`;
}

/** Skills a roadmap should cover: everything not already demonstrated, ordered by priority, foundations first within the same priority band. */
export function selectRoadmapSkills(gapResult, { max = 12 } = {}) {
  const candidates = gapResult.skills.filter((s) => s.proficiencyStatus !== "demonstrated");
  const byName = new Map(candidates.map((s) => [norm(s.skillName), s]));
  const ordered = [...candidates].sort((a, b) => {
    const band = (x) => (x.priority === "high" ? 0 : x.priority === "medium" ? 1 : 2);
    if (band(a) !== band(b)) return band(a) - band(b);
    const aDep = a.dependsOn && byName.has(norm(a.dependsOn)) ? 1 : 0;
    const bDep = b.dependsOn && byName.has(norm(b.dependsOn)) ? 1 : 0;
    if (aDep !== bDep) return aDep - bDep;
    return b.priorityScore - a.priorityScore;
  });
  return ordered.slice(0, max);
}
