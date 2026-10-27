/**
 * jobMatchService.js — resume-to-job match (`job-match-1.0`). Pure, no AI.
 *
 * This does not introduce a second scoring system. The skill-evidence primitive
 * is the Phase 11 one (`classifySkillEvidence`), keyword extraction is the
 * Phase 8 one (`resolveJobKeywords` / `keywordsFromText`) and the career level
 * is read with the Phase 11 `inferLevel`, so a skill judged "demonstrated" here
 * is judged "demonstrated" in the resume builder and the ATS panel too.
 *
 * What it adds is the job-shaped part: splitting a description into required and
 * preferred requirements, experience-level alignment, education requirements and
 * the qualification mismatches worth warning about.
 *
 * Honesty rules baked into the output:
 *   - Evidence is four-valued: `demonstrated`, `mentioned` (named but not shown
 *     in any role or project), `not_found` (absent from the resume) and
 *     `not_assessed` (we had nothing to judge it against). A missing keyword is
 *     never reported as proof the user lacks the skill.
 *   - A dimension with nothing to assess is **excluded** and the remaining
 *     weights are re-normalised. Missing information never scores zero.
 *   - The score describes overlap between one resume and one description. It is
 *     not a prediction about an employer's decision, and `disclaimer` says so.
 */
import { classifySkillEvidence } from "../resumeBuilder/atsScoringService.js";
import { keywordsFromText } from "../resumeBuilder/resumeQualityService.js";
import { contentToPlainText, sectionLines } from "../resumeBuilder/resumeContentSchema.js";
import { inferLevel } from "../resumeBuilder/roleRecommendationService.js";

export const JOB_MATCH_METHOD = "job-match-1.0";

/** Weights sum to 100 when every dimension is assessable. */
export const MATCH_WEIGHTS = Object.freeze({
  requiredSkills: 30,
  preferredSkills: 10,
  keywordCoverage: 20,
  experienceRelevance: 15,
  projectRelevance: 10,
  experienceLevel: 10,
  education: 5,
});

export const MATCH_DIMENSION_LABELS = Object.freeze({
  requiredSkills: "Required skills demonstrated",
  preferredSkills: "Preferred skills demonstrated",
  keywordCoverage: "Job description keyword coverage",
  experienceRelevance: "Relevant work experience",
  projectRelevance: "Relevant projects",
  experienceLevel: "Experience-level alignment",
  education: "Education and certifications",
});

/** Credit per evidence state. `mentioned` counts, but less than shown. */
const EVIDENCE_CREDIT = Object.freeze({ demonstrated: 1, mentioned: 0.6, not_found: 0, not_assessed: null });

export const MATCH_DISCLAIMER =
  "This percentage measures how much of what this listing asks for your resume currently evidences. " +
  "It is not a prediction of whether you will be shortlisted or hired: employers weigh things this " +
  "product cannot see, and a listing's wording is not the same as its real requirements. A keyword " +
  "missing from your resume means it is missing from the document, not that you lack the skill.";

const MATCH_LABEL = (n) => (n >= 85 ? "Very strong" : n >= 70 ? "Strong" : n >= 55 ? "Moderate" : n >= 35 ? "Partial" : "Weak");

const norm = (s) => String(s ?? "").toLowerCase().trim();

/** Headings that introduce "nice to have" requirements rather than hard ones. */
const PREFERRED_HEADING = /\b(nice[- ]to[- ]have|preferred|desirable|bonus|plus(es)?|advantageous|good to have|would be a plus)\b/i;
const REQUIRED_HEADING = /\b(requirements?|qualifications?|must[- ]have|essential|what you.ll need|we are looking for|minimum)\b/i;

/**
 * Split a description into a required block and a preferred block by scanning
 * headings. Everything before any heading, and anything under a "requirements"
 * heading, counts as required; only text under a "nice to have" style heading
 * counts as preferred. When no heading is found the whole description is
 * treated as required, which is the conservative reading.
 * @param {string} text
 */
export function splitRequirementSections(text) {
  const lines = String(text ?? "").split("\n");
  let mode = "required";
  const required = [];
  const preferred = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // A heading is a short line; a long sentence containing "preferred" is not one.
    if (trimmed && trimmed.length <= 80) {
      const isPreferred = PREFERRED_HEADING.test(trimmed);
      const isRequired = !isPreferred && REQUIRED_HEADING.test(trimmed);
      if (isPreferred || isRequired) {
        mode = isPreferred ? "preferred" : "required";
        // "Requirements: React and TypeScript" is both a heading and content;
        // keep whatever follows the colon so those skills are not lost.
        const remainder = trimmed.includes(":") ? trimmed.slice(trimmed.indexOf(":") + 1).trim() : "";
        if (remainder) (mode === "preferred" ? preferred : required).push(remainder);
        continue;
      }
    }
    (mode === "preferred" ? preferred : required).push(line);
  }
  return { requiredText: required.join("\n"), preferredText: preferred.join("\n") };
}

const DEGREE_RX = /\b(bachelor'?s?|master'?s?|b\.?\s?tech|b\.?\s?e\.?\b|b\.?\s?sc|m\.?\s?tech|m\.?\s?sc|mba|ph\.?\s?d|doctorate|degree in|graduate degree)\b/i;
const DEGREE_OPTIONAL_RX = /\b(or equivalent|equivalent experience|degree is a plus|degree preferred|no degree required)\b/i;
const YEARS_RX = /(\d{1,2})\s*\+?\s*(?:to|-|–)?\s*(\d{1,2})?\s*\+?\s*years?\b[^.]{0,40}?\b(experience|exp)\b/gi;

/**
 * Requirements read out of one listing. Nothing is inferred about the employer;
 * every field reflects what the text actually says, and `null` means the listing
 * did not say.
 *
 * @param {{ description: string, title?: string, experienceLevel?: string, parsedSkills?: Array<{name:string, priority?:string}> }} job
 */
export function extractJobRequirements(job) {
  const description = String(job?.description ?? "");
  const { requiredText, preferredText } = splitRequirementSections(description);

  // Prefer a provider's / parser's own structured skills when present (saved job
  // descriptions carry them from the Phase 3 parser); otherwise scan the text.
  const parsed = Array.isArray(job?.parsedSkills) ? job.parsedSkills.filter((s) => s?.name) : [];
  const skills = new Map();
  if (parsed.length) {
    for (const s of parsed) {
      const priority = norm(s.priority) === "preferred" || norm(s.priority) === "optional" ? "preferred" : "required";
      skills.set(norm(s.name), { name: s.name, priority });
    }
  } else {
    const preferredSet = new Set(keywordsFromText(preferredText).map(norm));
    for (const name of keywordsFromText(requiredText)) skills.set(norm(name), { name, priority: "required" });
    for (const name of keywordsFromText(preferredText)) {
      const key = norm(name);
      if (!skills.has(key)) skills.set(key, { name, priority: "preferred" });
    }
    // A skill that appears only in the preferred block stays preferred.
    for (const [key, value] of skills) if (preferredSet.has(key) && !keywordsFromText(requiredText).map(norm).includes(key)) skills.set(key, { ...value, priority: "preferred" });
  }

  // Years of experience: take the smallest number the listing asks for.
  let minYears = null;
  for (const m of description.matchAll(YEARS_RX)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 40) minYears = minYears === null ? n : Math.min(minYears, n);
  }

  const mentionsDegree = DEGREE_RX.test(description);
  const degreeOptional = DEGREE_OPTIONAL_RX.test(description);

  return {
    skills: [...skills.values()].slice(0, 60),
    requiredSkills: [...skills.values()].filter((s) => s.priority === "required").slice(0, 40),
    preferredSkills: [...skills.values()].filter((s) => s.priority === "preferred").slice(0, 30),
    educationRequired: mentionsDegree && !degreeOptional,
    educationMentioned: mentionsDegree,
    minYears,
    level: job?.experienceLevel && job.experienceLevel !== "unknown" ? job.experienceLevel : null,
    method: JOB_MATCH_METHOD,
  };
}

/** Experience entries in the shape Phase 11's `inferLevel` expects. */
function experienceEntries(content) {
  const sections = (content?.sections ?? []).filter((s) => s.visible !== false);
  return sections
    .filter((s) => s.type === "experience")
    .flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, kind: "experience", sectionId: s.id, label: e.role || e.company || "Role" })));
}

function projectEntries(content) {
  const sections = (content?.sections ?? []).filter((s) => s.visible !== false);
  return sections
    .filter((s) => s.type === "projects")
    .flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, kind: "project", sectionId: s.id, label: e.name || "Project" })));
}

const LEVEL_ORDER = { entry: 0, fresher: 0, student: 0, junior: 1, mid: 2, senior: 3, lead: 4, experienced: 3 };

/**
 * Score level alignment. Being *over*-qualified is not penalised as hard as
 * being under-qualified, and an unstated level excludes the dimension.
 */
function scoreLevel(jobLevel, resumeLevel) {
  if (!jobLevel || jobLevel === "unknown") return null;
  const want = LEVEL_ORDER[jobLevel];
  const have = LEVEL_ORDER[resumeLevel];
  if (want === undefined || have === undefined) return null;
  const gap = have - want;
  if (gap === 0) return 100;
  if (gap > 0) return gap === 1 ? 90 : 75; // more senior than asked
  return gap === -1 ? 55 : gap === -2 ? 25 : 10;
}

/** Degree evidence in the resume: an education section with any filled entry. */
function hasDegree(content) {
  const edu = (content?.sections ?? []).filter((s) => s.type === "education" && s.visible !== false);
  const entries = edu.flatMap((s) => s.entries ?? []);
  if (!entries.length) return false;
  return entries.some((e) => DEGREE_RX.test(`${e.degree ?? ""} ${e.institution ?? ""}`) || String(e.degree ?? "").trim().length > 0);
}

/**
 * Match one resume version against one job.
 *
 * @param {object} input
 * @param {object} input.content              structured resume content (Phase 8 document)
 * @param {object} input.job                  { title, companyName, description, experienceLevel, workArrangement, location, salary* }
 * @param {object} [input.requirements]       pre-extracted requirements (saves re-parsing in a list)
 * @param {{ locations?: string[], workArrangements?: string[] }} [input.preferences] used only for notes, never for the score
 * @returns {object} match report
 */
export function matchResumeToJob({ content, job, requirements, preferences = null }) {
  const req = requirements ?? extractJobRequirements(job);
  const resumeText = contentToPlainText(content);
  const assessable = resumeText.trim().length >= 40;

  /** Four-valued evidence for one skill name. */
  const evidenceFor = (name) => {
    if (!assessable) return "not_assessed";
    const state = classifySkillEvidence(content, name);
    return state === "demonstrated" ? "demonstrated" : state === "listed" ? "mentioned" : "not_found";
  };

  const skillEvidence = req.skills.map((s) => ({ name: s.name, priority: s.priority, evidence: evidenceFor(s.name) }));
  const requiredEvidence = skillEvidence.filter((s) => s.priority === "required");
  const preferredEvidence = skillEvidence.filter((s) => s.priority === "preferred");

  /** Mean credit over a skill list, or null when there is nothing to score. */
  const skillScore = (list) => {
    const scored = list.filter((s) => EVIDENCE_CREDIT[s.evidence] !== null);
    if (!scored.length) return null;
    return Math.round((scored.reduce((sum, s) => sum + EVIDENCE_CREDIT[s.evidence], 0) / scored.length) * 100);
  };

  // Keyword coverage: presence anywhere in the document, including skills lists.
  const keywordTotal = req.skills.length;
  const keywordFound = skillEvidence.filter((s) => s.evidence === "demonstrated" || s.evidence === "mentioned");
  const keywordMissing = skillEvidence.filter((s) => s.evidence === "not_found");
  const keywordScore = !assessable || keywordTotal === 0 ? null : Math.round((keywordFound.length / keywordTotal) * 100);

  // Experience / project relevance: entries whose own text uses the job's skills.
  const jobSkillNames = req.skills.map((s) => norm(s.name));
  const entryRelevance = (entries) => {
    if (!assessable || entries.length === 0 || jobSkillNames.length === 0) return { score: null, items: [] };
    const items = entries.map((e) => {
      const text = norm([e.label, e.role, e.company, e.name, (e.technologies ?? []).join(" "), ...(e.bullets ?? []), ...(e.details ?? [])].filter(Boolean).join(" "));
      const matched = req.skills.filter((s) => text.includes(norm(s.name))).map((s) => s.name);
      return { sectionId: e.sectionId, entryId: e.id, name: e.label, matchedSkills: matched };
    });
    const relevant = items.filter((i) => i.matchedSkills.length > 0);
    // Credit the share of entries that are relevant, and reward depth a little.
    const breadth = relevant.length / items.length;
    const depth = Math.min(1, relevant.reduce((m, i) => Math.max(m, i.matchedSkills.length), 0) / Math.min(5, Math.max(1, jobSkillNames.length)));
    return { score: Math.round((0.7 * breadth + 0.3 * depth) * 100), items: relevant.sort((a, b) => b.matchedSkills.length - a.matchedSkills.length) };
  };
  const experience = entryRelevance(experienceEntries(content));
  const projects = entryRelevance(projectEntries(content));

  const resumeLevel = inferLevel(
    experienceEntries(content),
    (content?.sections ?? []).filter((s) => s.type === "education").flatMap((s) => sectionLines(s)).join(" ")
  );
  const levelScore = scoreLevel(req.level, resumeLevel);

  // Education only counts when the listing actually requires a degree.
  const educationScore = !assessable || !req.educationRequired ? null : hasDegree(content) ? 100 : 0;

  const raw = {
    requiredSkills: skillScore(requiredEvidence),
    preferredSkills: skillScore(preferredEvidence),
    keywordCoverage: keywordScore,
    experienceRelevance: experience.score,
    projectRelevance: projects.score,
    experienceLevel: levelScore,
    education: educationScore,
  };

  // Re-normalise over the dimensions that could be assessed.
  const applicable = Object.entries(raw).filter(([, v]) => v !== null);
  const totalWeight = applicable.reduce((sum, [k]) => sum + MATCH_WEIGHTS[k], 0);
  const matchScore = totalWeight === 0 ? null : Math.round(applicable.reduce((sum, [k, v]) => sum + v * MATCH_WEIGHTS[k], 0) / totalWeight);

  const dimensions = Object.keys(MATCH_WEIGHTS).map((key) => ({
    key,
    label: MATCH_DIMENSION_LABELS[key],
    weight: MATCH_WEIGHTS[key],
    score: raw[key],
    applicable: raw[key] !== null,
    explanation: explainDimension(key, { raw, req, experience, projects, resumeLevel, assessable }),
  }));

  // Qualification mismatches worth naming explicitly, each with its evidence.
  const mismatches = [];
  const missingRequired = requiredEvidence.filter((s) => s.evidence === "not_found");
  if (missingRequired.length) {
    mismatches.push({
      key: "required_skills",
      severity: missingRequired.length >= 3 ? "high" : "medium",
      title: `${missingRequired.length} required skill${missingRequired.length === 1 ? "" : "s"} not found in your resume`,
      detail: missingRequired.map((s) => s.name).join(", "),
      note: "Not found in the document. If you have the skill, add it where you used it — do not add it otherwise.",
    });
  }
  if (req.educationRequired && assessable && !hasDegree(content)) {
    mismatches.push({ key: "education", severity: "high", title: "The listing states a degree requirement", detail: "Your resume has no education entry.", note: "Add your education if you have it. Some employers accept equivalent experience." });
  }
  if (levelScore !== null && levelScore < 55) {
    mismatches.push({ key: "level", severity: "medium", title: `The listing targets a ${req.level} level`, detail: `Your resume reads as ${resumeLevel}.`, note: "Level is read from your job titles and history; it is a rough signal, not a rule." });
  }
  if (req.minYears !== null) {
    mismatches.push({ key: "years", severity: "low", title: `The listing asks for ${req.minYears}+ years of experience`, detail: "Years of experience are not computed from your resume, so this is shown for you to judge.", note: "Stated requirements are often flexible." });
  }

  return {
    method: JOB_MATCH_METHOD,
    matchScore,
    label: matchScore === null ? "Not assessed" : MATCH_LABEL(matchScore),
    assessed: assessable && totalWeight > 0,
    notAssessedReason: assessable ? (totalWeight === 0 ? "This listing has no recognisable requirements to compare against." : null) : "This resume version has no content to compare yet.",
    dimensions,
    weightsUsed: Object.fromEntries(applicable.map(([k]) => [k, MATCH_WEIGHTS[k]])),
    skills: {
      requiredDemonstrated: requiredEvidence.filter((s) => s.evidence === "demonstrated").map((s) => s.name),
      requiredMentioned: requiredEvidence.filter((s) => s.evidence === "mentioned").map((s) => s.name),
      requiredNotFound: missingRequired.map((s) => s.name),
      preferredDemonstrated: preferredEvidence.filter((s) => s.evidence === "demonstrated").map((s) => s.name),
      preferredMentioned: preferredEvidence.filter((s) => s.evidence === "mentioned").map((s) => s.name),
      preferredNotFound: preferredEvidence.filter((s) => s.evidence === "not_found").map((s) => s.name),
      needingEvidence: skillEvidence.filter((s) => s.evidence === "mentioned").map((s) => s.name),
      detail: skillEvidence,
    },
    keywordCoverage: keywordTotal === 0 ? null : {
      total: keywordTotal,
      found: keywordFound.map((s) => s.name),
      missing: keywordMissing.map((s) => s.name),
      percent: keywordScore,
    },
    relevantExperience: experience.items,
    relevantProjects: projects.items,
    mismatches,
    resumeLevel,
    jobLevel: req.level,
    requirements: { skills: req.skills, educationRequired: req.educationRequired, minYears: req.minYears, level: req.level },
    preferenceNotes: preferenceNotes(job, preferences),
    evidenceScale: [
      { key: "demonstrated", label: "Demonstrated", meaning: "Used in a role or project on your resume." },
      { key: "mentioned", label: "Mentioned", meaning: "Listed on your resume but not shown in any role or project." },
      { key: "not_found", label: "Not found", meaning: "Absent from this resume version — not evidence that you lack the skill." },
      { key: "not_assessed", label: "Not assessed", meaning: "There was nothing to compare it against." },
    ],
    disclaimer: MATCH_DISCLAIMER,
    computedAt: new Date().toISOString(),
  };
}

/** Plain-language reason for one dimension's score, or why it was excluded. */
function explainDimension(key, { raw, req, experience, projects, resumeLevel, assessable }) {
  if (!assessable) return "This resume version has no content yet.";
  switch (key) {
    case "requiredSkills":
      return req.requiredSkills.length === 0
        ? "The listing states no recognisable required skills, so this is excluded from the score."
        : `${req.requiredSkills.length} required skill${req.requiredSkills.length === 1 ? "" : "s"} read from the listing; demonstrated skills score full credit and mentioned skills 60%.`;
    case "preferredSkills":
      return req.preferredSkills.length === 0
        ? "The listing separates no preferred skills, so this is excluded."
        : `${req.preferredSkills.length} skill${req.preferredSkills.length === 1 ? "" : "s"} found under a “nice to have” style heading.`;
    case "keywordCoverage":
      return raw.keywordCoverage === null ? "No recognisable keywords in the listing." : "Share of the listing's skill terms that appear anywhere in the resume.";
    case "experienceRelevance":
      return experience.score === null ? "No work experience entries to assess, so this is excluded rather than scored zero." : `${experience.items.length} experience entr${experience.items.length === 1 ? "y" : "ies"} use skills this listing asks for.`;
    case "projectRelevance":
      return projects.score === null ? "No project entries to assess, so this is excluded rather than scored zero." : `${projects.items.length} project${projects.items.length === 1 ? "" : "s"} use skills this listing asks for.`;
    case "experienceLevel":
      return raw.experienceLevel === null ? "The listing does not state a level, so this is excluded." : `Listing targets ${req.level}; your resume reads as ${resumeLevel}.`;
    case "education":
      return raw.education === null ? "The listing states no degree requirement, so this is excluded." : raw.education === 100 ? "The listing requires a degree and your resume has an education entry." : "The listing requires a degree and your resume has no education entry.";
    default:
      return "";
  }
}

/**
 * Notes about location and work arrangement. These are deliberately *not* part
 * of the match score — Phase 12 keeps fit (can you do this job) separate from
 * preference (do you want it), which is a ranking concern.
 */
function preferenceNotes(job, preferences) {
  if (!preferences) return [];
  const notes = [];
  const wanted = (preferences.workArrangements ?? []).map(norm);
  if (wanted.length && job?.workArrangement && job.workArrangement !== "unknown" && !wanted.includes(norm(job.workArrangement))) {
    notes.push(`This role is ${job.workArrangement}; you prefer ${wanted.join(" or ")}.`);
  }
  if (wanted.length && (!job?.workArrangement || job.workArrangement === "unknown")) {
    notes.push("The listing does not say whether the role is remote, hybrid or on-site.");
  }
  const locations = (preferences.locations ?? []).map(norm).filter(Boolean);
  if (locations.length && job?.location && !locations.some((l) => norm(job.location).includes(l))) {
    notes.push(`Location is ${job.location}; your preferred locations are ${(preferences.locations ?? []).join(", ")}.`);
  }
  return notes;
}
