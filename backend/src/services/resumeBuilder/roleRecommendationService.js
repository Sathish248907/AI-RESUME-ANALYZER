/**
 * roleRecommendationService.js — evidence-based role suitability (role-fit-1.0).
 *
 * Deterministic. For each role in the catalog we ask one question: what does
 * this resume actually show? A skill named inside an experience or project
 * bullet counts as demonstrated; a skill that only appears in the skills list
 * counts for half and is reported as "needs evidence"; a skill that is nowhere
 * counts for nothing and is reported as "to develop". Learning progress from
 * the roadmap is shown alongside, labelled as in-progress, and never counted as
 * demonstrated experience.
 *
 * Deliberately absent: salary figures, demand indices, hiring probability and
 * "you are a 92% match for this job" claims. We have no verified data source
 * for any of those, so the service does not invent one. A suitability score
 * here means "how much of what this role usually needs does your resume
 * evidence" — nothing about whether you would be hired.
 *
 * Roles below MIN_SUITABILITY are not returned at all, so a user sees the roles
 * their background supports rather than the whole catalog.
 */
import { classifySkillEvidence, mentionsTerm } from "./atsScoringService.js";
import { sectionLines } from "./resumeContentSchema.js";
import { ROLE_BASELINES } from "../learning/skillGapService.js";
import { resourcesForTask } from "../learning/learningResourceService.js";

export const ROLE_FIT_METHOD = "role-fit-1.0";

/** Below this, a role is not suggested at all. */
export const MIN_SUITABILITY = 35;

export const ROLE_FIT_DISCLAIMER =
  "Suitability measures how much of what this role typically asks for your resume currently evidences. " +
  "It is not a prediction of interviews or offers, and it says nothing about salary, demand or competition — " +
  "this product has no verified data source for those, so it does not estimate them. Job titles and expectations " +
  "also vary between employers, so treat the list as a starting point for where your evidence is strongest.";

/**
 * Role catalog. `core` reuses ROLE_BASELINES where that role already exists, so
 * recommendations, the readiness assessment and the skill-gap analysis all work
 * from the same baseline instead of drifting apart.
 */
export const ROLE_CATALOG = [
  {
    id: "frontend_developer", title: "Frontend Developer", family: "engineering",
    core: ROLE_BASELINES["Frontend Developer"],
    supporting: ["Next.js", "Redux", "Tailwind CSS", "Responsive Design", "React Testing Library", "CI/CD"],
    templateId: "technical",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"],
    summary: "Builds the user-facing side of web applications — components, state, styling and browser performance.",
  },
  {
    id: "backend_developer", title: "Backend Developer", family: "engineering",
    core: ROLE_BASELINES["Backend Developer"],
    supporting: ["Express.js", "PostgreSQL", "MongoDB", "GraphQL", "Kubernetes", "CI/CD", "Security"],
    templateId: "technical",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"],
    summary: "Builds APIs, data models and the services behind an application.",
  },
  {
    id: "full_stack_developer", title: "Full Stack Developer", family: "engineering",
    core: ROLE_BASELINES["Full Stack Developer"],
    supporting: ["Next.js", "Prisma", "PostgreSQL", "CI/CD", "Authentication", "System Design"],
    templateId: "technical",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"],
    summary: "Works across both the interface and the services behind it.",
  },
  {
    id: "software_engineer", title: "Software Engineer", family: "engineering",
    core: ROLE_BASELINES["Software Engineer"],
    supporting: ["System Design", "Docker", "CI/CD", "Unit Testing", "Databases"],
    templateId: "experienced",
    sectionOrder: ["summary", "experience", "skills", "projects", "achievements", "education", "certifications"],
    summary: "General software engineering, assessed on fundamentals, testing and design as much as on one stack.",
  },
  {
    id: "data_analyst", title: "Data Analyst", family: "data",
    core: ROLE_BASELINES["Data Analyst"],
    supporting: ["Dashboards", "ETL", "Data Visualization", "Statistics"],
    templateId: "modern",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"],
    summary: "Turns data into reporting and analysis that other people act on.",
  },
  {
    id: "react_developer", title: "React Developer", family: "engineering",
    core: ["React", "JavaScript", "TypeScript", "HTML", "CSS", "REST APIs", "Git", "Testing"],
    supporting: ["Next.js", "Redux", "React Testing Library", "Tailwind CSS", "Web Performance"],
    templateId: "technical",
    sectionOrder: ["summary", "skills", "projects", "experience", "education", "certifications", "achievements"],
    summary: "A frontend role specified around the React ecosystem.",
  },
  {
    id: "python_developer", title: "Python Developer", family: "engineering",
    core: ["Python", "SQL", "REST APIs", "Git", "Testing", "Databases"],
    supporting: ["Django", "Flask", "FastAPI", "Pandas", "Docker", "CI/CD"],
    templateId: "technical",
    sectionOrder: ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"],
    summary: "Builds services, tooling or data work in Python.",
  },
  {
    id: "java_developer", title: "Java Developer", family: "engineering",
    core: ["Java", "SQL", "REST APIs", "Git", "Testing", "Data Structures"],
    supporting: ["Spring", "Docker", "Kubernetes", "System Design", "Databases"],
    templateId: "experienced",
    sectionOrder: ["summary", "experience", "skills", "projects", "education", "certifications", "achievements"],
    summary: "Builds server-side applications on the JVM.",
  },
  {
    id: "qa_engineer", title: "QA / Test Engineer", family: "quality",
    core: ["Testing", "Unit Testing", "Git", "REST APIs", "Debugging"],
    supporting: ["Cypress", "Playwright", "Jest", "CI/CD", "SQL", "Accessibility"],
    templateId: "modern",
    sectionOrder: ["summary", "skills", "experience", "projects", "certifications", "education", "achievements"],
    summary: "Designs and automates the testing that keeps a product releasable.",
  },
  {
    id: "devops_engineer", title: "DevOps / Platform Engineer", family: "infrastructure",
    core: ["Docker", "CI/CD", "Git", "Kubernetes", "Testing"],
    supporting: ["AWS", "Azure", "Google Cloud", "Security", "System Design", "Databases"],
    templateId: "experienced",
    sectionOrder: ["summary", "experience", "skills", "certifications", "projects", "education", "achievements"],
    summary: "Builds and runs the infrastructure and pipelines other engineers ship through.",
  },
];

/** Weights for the suitability score; they sum to 100. */
export const ROLE_WEIGHTS = Object.freeze({
  coreSkills: 55,
  supportingSkills: 20,
  appliedEvidence: 15,
  background: 10,
});

const norm = (s) => String(s ?? "").toLowerCase().trim();
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * @param {object} content                          structured resume
 * @param {object} [context]
 * @param {{ targetRoles?: string[], careerLevel?: string }|null} [context.profile]  career profile
 * @param {Array<{ skillName: string, status?: string, proficiencyStatus?: string }>} [context.learningSkills]
 *        skills the user is working on (roadmap tasks / skill gaps) — shown as in progress, never as evidence
 * @param {number} [context.limit]
 */
export function recommendRoles(content, context = {}) {
  const { profile = null, learningSkills = [], limit = 6 } = context;
  const sections = (content.sections ?? []).filter((s) => s.visible !== false);
  const byType = (t) => sections.filter((s) => s.type === t);

  const entries = [
    ...byType("experience").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, kind: "experience", sectionId: s.id, label: e.role || e.company || "Role" }))),
    ...byType("projects").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, kind: "project", sectionId: s.id, label: e.name || "Project" }))),
  ];
  const eduText = norm(byType("education").flatMap((s) => sectionLines(s)).join(" "));
  const certText = norm(byType("certifications").flatMap((s) => sectionLines(s)).join(" "));
  const headline = norm(content.personal?.title ?? "");
  const summaryText = norm(byType("summary").map((s) => s.text ?? "").join(" "));

  const inProgress = new Set(learningSkills.map((s) => norm(s.skillName)).filter(Boolean));
  const preferred = new Set((profile?.targetRoles ?? []).map(norm));
  const level = profile?.careerLevel ?? inferLevel(entries, eduText);

  const evidenceCache = new Map();
  const evidenceOf = (skill) => {
    const k = norm(skill);
    if (!evidenceCache.has(k)) evidenceCache.set(k, classifySkillEvidence(content, skill));
    return evidenceCache.get(k);
  };

  const results = [];
  for (const role of ROLE_CATALOG) {
    const core = (role.core ?? []).map((name) => ({ name, evidence: evidenceOf(name), learning: inProgress.has(norm(name)) }));
    const supporting = (role.supporting ?? []).map((name) => ({ name, evidence: evidenceOf(name), learning: inProgress.has(norm(name)) }));

    const credit = (rows) => (rows.length ? rows.reduce((a, r) => a + (r.evidence === "demonstrated" ? 1 : r.evidence === "listed" ? 0.5 : 0), 0) / rows.length : 0);
    const coreRatio = credit(core);
    const supportingRatio = credit(supporting);

    // Applied evidence: entries that actually name this role's skills.
    const roleTerms = [...(role.core ?? []), ...(role.supporting ?? [])];
    const matchingEntries = entries
      .map((e) => {
        const text = norm([e.role, e.name, e.company, ...(e.technologies ?? []), ...(e.bullets ?? [])].filter(Boolean).join(" "));
        const hits = roleTerms.filter((t) => mentionsTerm(text, t));
        return { entry: e, hits };
      })
      .filter((x) => x.hits.length > 0)
      .sort((a, b) => b.hits.length - a.hits.length);
    // Two well-matched entries is taken as full credit; nothing beyond that is rewarded.
    const appliedRatio = Math.min(1, matchingEntries.reduce((a, x) => a + Math.min(1, x.hits.length / 3), 0) / 2);

    // Background: the title, summary, education or certifications pointing at this role family.
    let background = 0;
    const titleHit = role.title.split(/[/ ]/).filter((w) => w.length > 3).some((w) => headline.includes(norm(w)) || summaryText.includes(norm(w)));
    if (titleHit) background += 0.5;
    if (eduText && /\b(computer science|software|information technology|engineering|informatics|data science|statistics|mathematics)\b/.test(eduText)) background += 0.3;
    if (certText && roleTerms.some((t) => mentionsTerm(certText, t))) background += 0.2;
    background = Math.min(1, background);

    let score =
      coreRatio * ROLE_WEIGHTS.coreSkills +
      supportingRatio * ROLE_WEIGHTS.supportingSkills +
      appliedRatio * ROLE_WEIGHTS.appliedEvidence +
      background * ROLE_WEIGHTS.background;

    // A stated preference surfaces the role but cannot manufacture evidence for it.
    const isPreferred = preferred.has(norm(role.title));
    if (isPreferred) score = Math.min(100, score + 4);

    const demonstratedSkills = core.filter((c) => c.evidence === "demonstrated").map((c) => c.name);
    const needsEvidence = [...core, ...supporting].filter((c) => c.evidence === "listed").map((c) => c.name);
    const toDevelop = [...core, ...supporting].filter((c) => c.evidence === "absent");

    const reasons = [];
    if (demonstratedSkills.length) reasons.push(`${demonstratedSkills.length} of ${core.length} core skills are demonstrated in your experience or projects: ${demonstratedSkills.slice(0, 5).join(", ")}.`);
    if (matchingEntries.length) reasons.push(`${matchingEntries.length} of your ${entries.length} entries ${matchingEntries.length === 1 ? "uses" : "use"} skills this role asks for — strongest: “${matchingEntries[0].entry.label}” (${matchingEntries[0].hits.slice(0, 4).join(", ")}).`);
    if (titleHit) reasons.push("Your headline or summary already points at this kind of work.");
    if (needsEvidence.length) reasons.push(`${needsEvidence.length} relevant skill${needsEvidence.length === 1 ? " is" : "s are"} listed but not shown in any bullet, so they are only half-counted.`);
    if (isPreferred) reasons.push("You named this as a target role in your career profile.");
    if (!reasons.length) reasons.push("Only weak evidence for this role in the current resume.");

    results.push({
      id: role.id,
      title: role.title,
      family: role.family,
      summary: role.summary,
      suitability: clamp(score),
      band: score >= 75 ? "Strong evidence" : score >= 60 ? "Good evidence" : score >= MIN_SUITABILITY ? "Partial evidence" : "Little evidence",
      isPreferred,
      components: [
        { key: "coreSkills", label: "Core skills demonstrated", weight: ROLE_WEIGHTS.coreSkills, score: clamp(coreRatio * 100) },
        { key: "supportingSkills", label: "Supporting skills", weight: ROLE_WEIGHTS.supportingSkills, score: clamp(supportingRatio * 100) },
        { key: "appliedEvidence", label: "Experience and projects using them", weight: ROLE_WEIGHTS.appliedEvidence, score: clamp(appliedRatio * 100) },
        { key: "background", label: "Headline, education and certifications", weight: ROLE_WEIGHTS.background, score: clamp(background * 100) },
      ],
      matchingSkills: demonstratedSkills,
      skillsNeedingEvidence: needsEvidence,
      skillsToDevelop: toDevelop.map((t) => ({ name: t.name, learningInProgress: t.learning })),
      relevantProjects: matchingEntries.filter((x) => x.entry.kind === "project").slice(0, 4).map((x) => ({ sectionId: x.entry.sectionId, entryId: x.entry.id, name: x.entry.label, matchedSkills: x.hits.slice(0, 6) })),
      relevantExperience: matchingEntries.filter((x) => x.entry.kind === "experience").slice(0, 4).map((x) => ({ sectionId: x.entry.sectionId, entryId: x.entry.id, name: x.entry.label, matchedSkills: x.hits.slice(0, 6) })),
      recommendedTemplateId: role.templateId,
      recommendedSectionOrder: tailorSectionOrder(role, level, entries),
      learningTasks: learningTasksFor(toDevelop, core, inProgress),
      reasons,
      careerLevel: level,
    });
  }

  const recommended = results
    .filter((r) => r.suitability >= MIN_SUITABILITY)
    .sort((a, b) => b.suitability - a.suitability || a.title.localeCompare(b.title))
    .slice(0, limit);

  return {
    method: ROLE_FIT_METHOD,
    roles: recommended,
    considered: results.length,
    belowThreshold: results.filter((r) => r.suitability < MIN_SUITABILITY).map((r) => ({ title: r.title, suitability: r.suitability })).sort((a, b) => b.suitability - a.suitability),
    minSuitability: MIN_SUITABILITY,
    weights: ROLE_WEIGHTS,
    careerLevel: level,
    evidenceNote: recommended.length
      ? "Scores come from what the resume shows, so improving a bullet to name a skill you already have will raise them."
      : "No role reached the evidence threshold yet. Add your skills, then name them inside the experience or project bullets where you used them.",
    disclaimer: ROLE_FIT_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };
}

/** Career level inferred from the resume when the profile does not state one. */
export function inferLevel(entries, eduText) {
  const roles = entries.filter((e) => e.kind === "experience");
  if (roles.length === 0) return /\b(student|pursuing|expected)\b/.test(eduText) ? "student" : "fresher";
  const internOnly = roles.every((e) => /\b(intern|internship|trainee|apprentice)\b/i.test(e.role ?? ""));
  if (internOnly) return "fresher";
  if (roles.length >= 4) return "experienced";
  if (roles.length >= 2) return "mid";
  return "junior";
}

/**
 * The role's section order, adjusted for how much employment history exists:
 * with no roles to show, education and projects lead whatever the role prefers.
 */
export function tailorSectionOrder(role, level, entries) {
  const base = [...(role.sectionOrder ?? [])];
  const hasExperience = entries.some((e) => e.kind === "experience");
  if (hasExperience && !["student", "fresher"].includes(level)) return base;
  const front = ["summary", "education", "skills", "projects"];
  return [...front.filter((t) => base.includes(t)), ...base.filter((t) => !front.includes(t))];
}

/** Learning tasks for the gaps, using only the verified resource catalog. */
export function learningTasksFor(toDevelop, core, inProgress) {
  const coreNames = new Set(core.map((c) => norm(c.name)));
  // Core gaps first — they cost the most score — then supporting ones.
  const ordered = [...toDevelop].sort((a, b) => Number(coreNames.has(norm(b.name))) - Number(coreNames.has(norm(a.name))));
  return ordered.slice(0, 4).map((t) => {
    const resources = resourcesForTask({ skillName: t.name, taskType: "tutorial", difficulty: "beginner" });
    return {
      skillName: t.name,
      isCore: coreNames.has(norm(t.name)),
      inProgress: inProgress.has(norm(t.name)),
      why: coreNames.has(norm(t.name)) ? "A core skill for this role — its absence is what holds the score down most." : "A supporting skill that widens the postings you match.",
      resources: resources.slice(0, 2),
    };
  });
}

/** Look a role up by title or catalog id. */
export function findRole(idOrTitle) {
  const k = norm(idOrTitle);
  return ROLE_CATALOG.find((r) => r.id === k || norm(r.title) === k) ?? null;
}
