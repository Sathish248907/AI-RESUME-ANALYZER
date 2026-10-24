/**
 * atsScoringService.js — explainable ATS-readiness score (ats-readiness-1.0).
 *
 * Every number here is computed in code from the structured resume document.
 * The LLM never assigns or adjusts a score; it only writes the prose
 * suggestions served by resumeSuggestionService, which quote this breakdown.
 *
 * Two modes, never mixed:
 *   - "general"  no job description → general ATS readiness. The job-keyword
 *                category is dropped and its weight re-normalised away.
 *   - "job"      a job description (or parsed requirements) is supplied → the
 *                keyword and skills categories are scored against that job.
 *
 * This is not the Phase 4 job-match score (scoringService.js, which rates a
 * candidate against one job from AI skill classifications) and not the Phase 8
 * document-quality score (resumeQualityService.js). All three are reported
 * separately with their own method strings so the numbers never get conflated.
 *
 * Limits we state rather than hide: applicant tracking systems differ, most are
 * not public, and none of them publish their parsers. A high score means the
 * document is conventionally structured, complete and aligned with the job text
 * supplied — not that any particular system will parse or shortlist it.
 */
import { contentToPlainText, listTextFields, sectionLines, TEMPLATES } from "./resumeContentSchema.js";
import { keywordsFromText } from "./resumeQualityService.js";
import { lookupSkillKey } from "../learning/learningResourceService.js";
import { ROLE_BASELINES } from "../learning/skillGapService.js";

export const ATS_METHOD = "ats-readiness-1.0";

/** Configurable category weights. They sum to 100 when every category applies. */
export const ATS_WEIGHTS = Object.freeze({
  keywords: 25,
  skills: 20,
  structure: 15,
  relevance: 15,
  readability: 10,
  formatting: 10,
  contact: 5,
});

export const ATS_CATEGORY_LABELS = Object.freeze({
  keywords: "Job-specific keyword alignment",
  skills: "Skills alignment",
  structure: "Structure and section completeness",
  relevance: "Experience and project relevance",
  readability: "Readability and content quality",
  formatting: "Formatting and parsing compatibility",
  contact: "Contact information and completeness",
});

export const ATS_DISCLAIMER =
  "This score describes how complete, conventionally structured and job-aligned your resume text is. " +
  "Applicant tracking systems differ and none of them publish their parsers, so no score can guarantee that a " +
  "particular system will parse your resume or that a recruiter will shortlist it. Treat it as a checklist, not a verdict.";

const BAND = (n) => (n >= 90 ? "Excellent" : n >= 75 ? "Strong" : n >= 60 ? "Good" : n >= 40 ? "Needs work" : "Weak");
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const norm = (s) => String(s ?? "").toLowerCase().trim();
const words = (s) => String(s ?? "").split(/\s+/).filter(Boolean);

const WEAK_VERBS = /\b(responsible for|worked on|helped|involved in|assisted with|participated in|tasked with|duties included)\b/i;
const STRONG_VERBS = /^(built|designed|developed|led|launched|shipped|implemented|optimi[sz]ed|reduced|increased|improved|automated|migrated|architected|delivered|created|owned|mentored|scaled|cut|grew|refactored|integrated|deployed|analy[sz]ed|resolved|drove|established|streamlined|coordinated|maintained|tested|debugged|documented|researched|presented|wrote)\b/i;
const METRIC_RX = /\b\d+(\.\d+)?\s?(%|percent|x\b|k\b|m\b|users|customers|requests|rps|ms|seconds|hours|days|weeks|months|million|thousand|\$|€|£|₹)/i;
const VAGUE_RX = /\b(various|several|many|some|stuff|things|etc\.?|and more|a lot of)\b/i;
const PRONOUN_RX = /\b(i|my|me|we|our)\b/i;
const NON_ASCII_SYMBOL_RX = /[•▪●‣⁃∙☑✔✓➜➤→▶❖◦]/;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RX = /^[+(]?[\d][\d\s().-]{6,}$/;

/** Headings an ATS is most likely to recognise, by section type. First entry is the canonical one. */
export const STANDARD_HEADINGS = Object.freeze({
  summary: ["professional summary", "summary", "profile", "career summary", "objective", "professional profile"],
  skills: ["technical skills", "skills", "core skills", "key skills", "technologies", "technical expertise"],
  experience: ["work experience", "experience", "professional experience", "employment history", "employment"],
  projects: ["projects", "personal projects", "key projects", "selected projects", "academic projects"],
  education: ["education", "academic background", "academic qualifications", "education and training"],
  certifications: ["certifications", "certificates", "licenses and certifications", "professional certifications"],
  achievements: ["achievements", "awards", "honors", "honours", "awards and achievements", "accomplishments"],
  languages: ["languages", "language skills"],
  custom: [],
});

/** Conventional, parseable date formats. */
export const DATE_FORMATS = [
  { name: "Month YYYY", rx: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}$/i },
  { name: "MM/YYYY", rx: /^\d{1,2}\/\d{4}$/ },
  { name: "YYYY-MM", rx: /^\d{4}-\d{2}$/ },
  { name: "YYYY", rx: /^\d{4}$/ },
];
export const dateFormatName = (d) => DATE_FORMATS.find((f) => f.rx.test(String(d).trim()))?.name ?? null;

/** Boundary-aware containment, so "c++", "next.js" and "go" match correctly. */
export function mentionsTerm(haystackLower, term) {
  const k = norm(term);
  if (!k) return false;
  const isWordChar = (ch) => /[a-z0-9]/i.test(ch ?? "");
  let i = haystackLower.indexOf(k);
  while (i !== -1) {
    if (!isWordChar(haystackLower[i - 1]) && !isWordChar(haystackLower[i + k.length])) return true;
    i = haystackLower.indexOf(k, i + 1);
  }
  return false;
}

/** How many times a term occurs (boundary-aware). Used for stuffing detection. */
export function countTerm(haystackLower, term) {
  const k = norm(term);
  if (!k) return 0;
  const isWordChar = (ch) => /[a-z0-9]/i.test(ch ?? "");
  let n = 0, i = haystackLower.indexOf(k);
  while (i !== -1) {
    if (!isWordChar(haystackLower[i - 1]) && !isWordChar(haystackLower[i + k.length])) n += 1;
    i = haystackLower.indexOf(k, i + 1);
  }
  return n;
}

/**
 * Where a skill is evidenced:
 *   "demonstrated" — named in experience, project, summary or achievement text
 *   "listed"       — only in the skills section
 *   "absent"       — nowhere in the resume
 * This is what separates "skills found" from "skills not demonstrated". It never
 * claims the user lacks a skill, only that the resume does not show it.
 */
export function classifySkillEvidence(content, term) {
  const skillsText = norm((content.sections ?? []).filter((s) => s.type === "skills")
    .flatMap((s) => (s.groups ?? []).flatMap((g) => [g.name, ...(g.items ?? [])])).join(" "));
  const evidenceText = norm((content.sections ?? [])
    .filter((s) => ["experience", "projects", "achievements", "summary", "certifications", "custom"].includes(s.type))
    .flatMap((s) => sectionLines(s)).join(" "));
  const key = lookupSkillKey(term);
  const hit = (hay) => mentionsTerm(hay, term) || (key ? mentionsTerm(hay, key) : false);
  if (hit(evidenceText)) return "demonstrated";
  if (hit(skillsText)) return "listed";
  return "absent";
}

/** Job keywords from parsed requirements, else from the raw text, de-duplicated. */
export function resolveJobKeywords({ jobSkills = [], jobDescriptionText = "" } = {}) {
  const out = new Map();
  for (const s of jobSkills) {
    const name = String(s?.name ?? s ?? "").trim();
    if (!name) continue;
    const key = norm(name);
    const priority = s?.priority ?? null;
    const existing = out.get(key);
    // A skill listed twice keeps the stronger priority: "required" once is required.
    if (existing && (existing.priority === "required" || priority === null)) continue;
    out.set(key, { name: existing?.name ?? name, priority });
  }
  if (out.size === 0 && jobDescriptionText) {
    for (const name of keywordsFromText(jobDescriptionText)) out.set(norm(name), { name, priority: null });
  }
  return [...out.values()].slice(0, 60);
}

/**
 * @param {object} content                   structured resume document
 * @param {object} [opts]
 * @param {Array<{name:string,priority?:string}>} [opts.jobSkills]
 * @param {string} [opts.jobDescriptionText]
 * @param {string} [opts.jobTitle]
 * @param {string} [opts.targetRole]         baseline skills source in general mode
 * @param {object} [opts.formatting]
 * @param {string} [opts.templateId]
 * @param {Partial<typeof ATS_WEIGHTS>} [opts.weights]
 */
export function scoreAtsReadiness(content, opts = {}) {
  const { jobSkills = [], jobDescriptionText = "", jobTitle = null, targetRole = null, formatting = {}, templateId = "modern", weights: weightOverrides = {} } = opts;
  const weights = { ...ATS_WEIGHTS, ...weightOverrides };

  const text = contentToPlainText(content);
  const lower = norm(text);
  const fields = listTextFields(content);
  const sections = (content.sections ?? []).filter((s) => s.visible !== false);
  const byType = (t) => sections.filter((s) => s.type === t);
  const filled = (s) => sectionLines(s).length > 0;

  const jobKeywords = resolveJobKeywords({ jobSkills, jobDescriptionText });
  const mode = jobKeywords.length > 0 ? "job" : "general";

  const categories = [];
  const findings = []; // { id, category, priority, title, issue, why, action, sectionId?, entryId?, field?, autoFix? }
  let fid = 0;
  const finding = (f) => { findings.push({ id: `f${++fid}`, sectionId: null, entryId: null, field: null, autoFix: null, ...f }); };

  // ── 1. Job-specific keyword alignment (job mode only) ───────────────────────
  let keywordCoverage = null;
  if (mode === "job") {
    const found = [], missing = [];
    let earned = 0, possible = 0;
    for (const k of jobKeywords) {
      const w = k.priority === "required" ? 1 : 0.6;
      possible += w;
      const evidence = classifySkillEvidence(content, k.name);
      if (evidence === "demonstrated") { earned += w; found.push({ ...k, evidence }); }
      else if (evidence === "listed") { earned += w * 0.6; found.push({ ...k, evidence }); }
      else missing.push({ ...k, evidence });
    }
    let score = possible === 0 ? 0 : (earned / possible) * 100;

    // Stuffing: a term repeated far more than a human would write it earns nothing extra and costs points.
    const stuffed = jobKeywords.map((k) => ({ name: k.name, n: countTerm(lower, k.name) })).filter((x) => x.n >= 6);
    if (stuffed.length) {
      score -= Math.min(25, stuffed.length * 8);
      finding({ category: "keywords", priority: "medium", title: "Repeated keywords look like keyword stuffing", issue: `${stuffed.map((s) => `“${s.name}” ×${s.n}`).join(", ")}.`, why: "Reviewers read repetition as padding, and it does not improve matching — most systems count a term once.", action: "Keep each term where it genuinely describes the work and remove the rest." });
    }
    keywordCoverage = {
      total: jobKeywords.length,
      found: found.map((f) => f.name),
      missing: missing.map((f) => f.name),
      percent: jobKeywords.length ? Math.round((found.length / jobKeywords.length) * 100) : 0,
      requiredMissing: missing.filter((m) => m.priority === "required").map((m) => m.name),
      detail: [...found, ...missing].map((k) => ({ name: k.name, priority: k.priority, evidence: k.evidence })),
    };
    if (missing.length) {
      finding({
        category: "keywords", priority: keywordCoverage.requiredMissing.length ? "high" : "medium",
        title: `${missing.length} job keyword${missing.length === 1 ? "" : "s"} not found in your resume`,
        issue: `${missing.slice(0, 10).map((m) => m.name).join(", ")}${missing.length > 10 ? `, +${missing.length - 10} more` : ""}.`,
        why: "Recruiters and keyword filters look for the job's own vocabulary. A term missing because you phrase it differently costs nothing to fix; one missing because you have not done it is a real skill gap, not a wording problem.",
        action: "Add only the terms that honestly describe work you have done — ideally inside an experience or project bullet, not as a bare list entry. Treat the rest as skills to learn.",
      });
    }
    categories.push(category("keywords", weights.keywords, clamp(score), true,
      `${found.length} of ${jobKeywords.length} job keywords appear in your resume${jobTitle ? ` for ${jobTitle}` : ""}. Terms shown inside experience or project text score higher than terms that only appear in your skills list.`));
  } else {
    categories.push(category("keywords", weights.keywords, null, false,
      "No job description supplied, so job-specific keyword alignment is not scored and its weight is redistributed. Add a job description to measure this."));
  }

  // ── 2. Skills alignment ─────────────────────────────────────────────────────
  const skillGroups = byType("skills").flatMap((s) => (s.groups ?? []).map((g) => ({ ...g, sectionId: s.id })));
  const skillItems = skillGroups.flatMap((g) => (g.items ?? []).map((i) => String(i).trim()).filter(Boolean));
  const skillsSection = byType("skills")[0] ?? null;
  const uniqueSkills = [...new Set(skillItems)];
  const demonstrated = [], listedOnly = [];
  for (const s of uniqueSkills) (classifySkillEvidence(content, s) === "demonstrated" ? demonstrated : listedOnly).push(s);

  let skillsScore, skillsExplanation;
  let baselineReport = null;
  if (mode === "job") {
    const rows = jobKeywords.map((k) => ({ name: k.name, priority: k.priority, evidence: classifySkillEvidence(content, k.name) }));
    const earned = rows.reduce((a, r) => a + (r.evidence === "demonstrated" ? 1 : r.evidence === "listed" ? 0.5 : 0), 0);
    skillsScore = clamp(rows.length ? (earned / rows.length) * 100 : 0);
    const notDemonstrated = rows.filter((r) => r.evidence === "listed");
    if (notDemonstrated.length) {
      finding({
        category: "skills", priority: "high",
        title: `${notDemonstrated.length} skill${notDemonstrated.length === 1 ? " this job needs is" : "s this job needs are"} listed but never demonstrated`,
        issue: `${notDemonstrated.slice(0, 8).map((r) => r.name).join(", ")} appear only in your skills list.`,
        why: "A skills list is a claim; a bullet that shows the skill in use is evidence. Reviewers discount skills with no supporting work.",
        action: "Name the skill inside the experience or project bullet where you actually used it.",
        sectionId: skillsSection?.id ?? null,
      });
    }
    skillsExplanation = `Of the ${rows.length} skills this job asks for, ${rows.filter((r) => r.evidence === "demonstrated").length} are shown in your experience or projects, ${notDemonstrated.length} appear only in your skills list, and ${rows.filter((r) => r.evidence === "absent").length} are not in the resume.`;
  } else {
    let s = 100;
    if (skillItems.length === 0) {
      s = 10;
      finding({ category: "skills", priority: "high", title: "No skills listed", issue: "The resume has no skills entries.", why: "A skills section is the first place both recruiters and keyword filters look for your stack.", action: "Add a skills section grouped by category — languages, frameworks, databases, tools.", sectionId: skillsSection?.id ?? null });
    } else {
      if (skillItems.length < 6) { s -= 30; finding({ category: "skills", priority: "medium", title: `Only ${skillItems.length} skill${skillItems.length === 1 ? "" : "s"} listed`, issue: "The skills section is very short.", why: "Too few skills makes it hard to match you to any role.", action: "List the languages, frameworks, databases and tools you genuinely use.", sectionId: skillsSection?.id ?? null }); }
      if (skillItems.length > 35) { s -= 15; finding({ category: "skills", priority: "low", title: `${skillItems.length} skills is a long list`, issue: "Long, unfocused skill lists read as padding.", why: "Reviewers trust a focused list more than an exhaustive one.", action: "Keep the skills relevant to your target role and drop the rest.", sectionId: skillsSection?.id ?? null }); }
      if (skillGroups.length <= 1 && skillItems.length > 10) { s -= 10; finding({ category: "skills", priority: "low", title: "Skills are one flat list", issue: `${skillItems.length} skills with no grouping.`, why: "Grouped skills are faster to scan and parse into categories.", action: "Group them, e.g. Languages / Frameworks / Databases / Tools.", sectionId: skillsSection?.id ?? null }); }
      const dupes = duplicates(skillItems);
      if (dupes.length) { s -= 10; finding({ category: "skills", priority: "low", title: "Duplicate skills", issue: `Repeated: ${dupes.join(", ")}.`, why: "Duplicates waste space and read as careless.", action: "Remove the repeated entries.", sectionId: skillsSection?.id ?? null, autoFix: { kind: "dedupe_skills", label: "Remove duplicate skills" } }); }
      // Evidence ratio scales continuously: a skills list nobody can verify is worth little.
      const ratio = uniqueSkills.length ? demonstrated.length / uniqueSkills.length : 0;
      if (ratio < 0.6) {
        s -= Math.round(((0.6 - ratio) / 0.6) * 30);
        if (ratio < 0.4) {
          finding({ category: "skills", priority: "medium", title: `Only ${demonstrated.length} of ${uniqueSkills.length} listed skills are demonstrated`, issue: `${listedOnly.slice(0, 8).join(", ")}${listedOnly.length > 8 ? `, +${listedOnly.length - 8} more` : ""} appear only in your skills list.`, why: "Skills backed by a bullet that shows them in use carry far more weight than a list; an unverifiable list invites doubt about the whole section.", action: "For your strongest skills, name them in the bullet describing the work where you used them.", sectionId: skillsSection?.id ?? null });
        }
      }
    }
    const baseline = targetRole ? ROLE_BASELINES[targetRole] ?? null : null;
    if (baseline) {
      const rows = baseline.map((name) => ({ name, evidence: classifySkillEvidence(content, name) }));
      const covered = rows.filter((r) => r.evidence !== "absent").length;
      baselineReport = { role: targetRole, total: rows.length, covered, missing: rows.filter((r) => r.evidence === "absent").map((r) => r.name) };
      s = Math.round(s * 0.5 + (covered / rows.length) * 100 * 0.5);
      if (baselineReport.missing.length) {
        finding({ category: "skills", priority: "medium", title: `Common ${targetRole} skills missing from the resume`, issue: `${baselineReport.missing.slice(0, 8).join(", ")}.`, why: `These appear in most ${targetRole} postings, so their absence narrows the jobs you match.`, action: "Add the ones you already have; put the rest on your learning plan. Never list a skill you cannot discuss." });
      }
    }
    skillsScore = clamp(s);
    skillsExplanation = baselineReport
      ? `Scored on the health of your skills section and coverage of the ${baselineReport.covered}/${baselineReport.total} skills common to ${targetRole} postings. Add a job description for job-specific scoring.`
      : `Scored on the completeness, grouping and evidence of your skills section — ${demonstrated.length} of ${uniqueSkills.length} listed skills are shown in your experience or projects. Add a job description or target role for alignment scoring.`;
  }
  categories.push(category("skills", weights.skills, skillsScore, true, skillsExplanation));

  // ── 3. Structure and section completeness ───────────────────────────────────
  const expSection = byType("experience")[0] ?? null;
  const projSection = byType("projects")[0] ?? null;
  const REQUIRED_SECTIONS = [
    { type: "summary", label: "Professional summary", points: 15 },
    { type: "skills", label: "Skills", points: 20 },
    { type: "education", label: "Education", points: 20 },
  ];
  let structure = 0;
  const completeness = [];
  for (const r of REQUIRED_SECTIONS) {
    const s = byType(r.type)[0];
    const ok = Boolean(s && filled(s));
    if (ok) structure += r.points;
    completeness.push({ type: r.type, label: r.label, present: Boolean(s), filled: ok, required: true, sectionId: s?.id ?? null });
    if (!ok) {
      finding({ category: "structure", priority: r.type === "education" ? "medium" : "high", title: `${r.label} section ${s ? "is empty" : "is missing"}`, issue: s ? `The “${s.title}” section has no content.` : `No ${r.label.toLowerCase()} section exists.`, why: "Parsers and reviewers both expect this section; its absence leaves an obvious hole.", action: s ? `Fill in the ${r.label.toLowerCase()} section or hide it before exporting.` : `Add a ${r.label.toLowerCase()} section.`, sectionId: s?.id ?? null });
    }
  }
  const hasExp = Boolean(expSection && filled(expSection));
  const hasProj = Boolean(projSection && filled(projSection));
  completeness.push({ type: "experience", label: "Work experience", present: Boolean(expSection), filled: hasExp, required: false, sectionId: expSection?.id ?? null });
  completeness.push({ type: "projects", label: "Projects", present: Boolean(projSection), filled: hasProj, required: false, sectionId: projSection?.id ?? null });
  if (hasExp && hasProj) structure += 30;
  else if (hasExp || hasProj) structure += 22;
  else finding({ category: "structure", priority: "high", title: "No work experience or projects", issue: "Neither section has any entries.", why: "Without either, nothing in the resume evidences what you can do.", action: "Add roles, internships, freelance work or substantial projects — whichever you genuinely have." });

  const oddHeadings = sections.filter((s) => filled(s) && (STANDARD_HEADINGS[s.type] ?? []).length > 0 && !(STANDARD_HEADINGS[s.type] ?? []).includes(norm(s.title)));
  if (oddHeadings.length === 0) structure += 15;
  else {
    structure += Math.max(0, 15 - oddHeadings.length * 6);
    for (const s of oddHeadings) {
      const suggested = titleCase(STANDARD_HEADINGS[s.type][0]);
      finding({
        category: "structure", priority: "medium",
        title: `“${s.title}” is not a conventional heading`,
        issue: `Parsers map sections by heading text; “${s.title}” may not be recognised as ${s.type}.`,
        why: "A section under an unrecognised heading can be dropped, or filed under the wrong field.",
        action: `Rename it to a standard heading such as “${suggested}”.`,
        sectionId: s.id,
        autoFix: { kind: "rename_heading", label: `Rename to “${suggested}”`, sectionId: s.id, value: suggested },
      });
    }
  }
  const emptyVisible = sections.filter((s) => !filled(s));
  if (emptyVisible.length) {
    structure -= Math.min(10, emptyVisible.length * 5);
    finding({ category: "structure", priority: "low", title: `${emptyVisible.length} empty section${emptyVisible.length === 1 ? "" : "s"} will still print`, issue: `${emptyVisible.map((s) => s.title).join(", ")}.`, why: "An empty heading in the exported PDF looks unfinished.", action: "Fill them in, or hide them before exporting.", autoFix: { kind: "hide_empty_sections", label: "Hide the empty sections" } });
  }
  categories.push(category("structure", weights.structure, clamp(structure), true,
    "Checks that the conventional sections exist, carry content, and use headings a parser is likely to recognise."));

  // ── 4. Experience and project relevance ─────────────────────────────────────
  const expEntries = byType("experience").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id, _kind: "experience" })));
  const projEntries = byType("projects").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id, _kind: "projects" })));
  const allEntries = [...expEntries, ...projEntries];
  const allBullets = allEntries.flatMap((e) => (e.bullets ?? []).filter((b) => String(b).trim()));
  let relevance;
  if (allEntries.length === 0) relevance = 0;
  else {
    let r = 100;
    for (const e of allEntries) {
      const label = e.role || e.name || e.company || "An entry";
      const bl = (e.bullets ?? []).filter((b) => String(b).trim());
      if (bl.length === 0) {
        r -= 15;
        finding({ category: "relevance", priority: "high", title: `“${label}” has no bullet points`, issue: "The entry names a role or project but says nothing about the work.", why: "An entry with no detail contributes nothing a reviewer can assess.", action: "Add 2–5 bullets covering what you built, how, and what changed as a result.", sectionId: e.sectionId, entryId: e.id });
      } else if (bl.length < 2 && e._kind === "experience") {
        r -= 5;
        finding({ category: "relevance", priority: "low", title: `“${label}” has only one bullet`, issue: "A single bullet rarely covers a whole role.", why: "Reviewers expect a role's scope, the work, and its outcome.", action: "Add one or two more bullets about the scope and the result.", sectionId: e.sectionId, entryId: e.id });
      }
      bl.forEach((b, i) => {
        if (WEAK_VERBS.test(b)) {
          r -= 4;
          finding({ category: "relevance", priority: "medium", title: "Bullet opens with a weak phrase", issue: `“${String(b).slice(0, 70)}${String(b).length > 70 ? "…" : ""}”`, why: "“Responsible for” describes a job description, not something you achieved.", action: "Start with a concrete action verb — built, led, reduced, migrated — and end with the effect.", sectionId: e.sectionId, entryId: e.id, field: `bullet:${i}` });
        } else if (!STRONG_VERBS.test(String(b).trim())) r -= 1.5;
      });
      if (e._kind === "projects" && (e.technologies ?? []).length === 0) {
        r -= 6;
        finding({ category: "relevance", priority: "medium", title: `“${label}” lists no technologies`, issue: "The project does not say what it was built with.", why: "The technology list is how a reviewer — and a keyword filter — connects the project to the role.", action: "Add the stack you used for this project.", sectionId: e.sectionId, entryId: e.id });
      }
    }
    const quantified = allBullets.filter((b) => METRIC_RX.test(b)).length;
    const quantRatio = allBullets.length ? quantified / allBullets.length : 0;
    if (quantRatio === 0 && allBullets.length) {
      r -= 15;
      finding({ category: "relevance", priority: "medium", title: "No bullet states a measurable outcome", issue: `None of your ${allBullets.length} bullets contains a number, percentage or scale.`, why: "Concrete outcomes are the clearest evidence of impact; without any, every bullet reads as a duty.", action: "Where you honestly can, add the real figure — users served, latency cut, time saved, revenue. Never invent a number; if you do not know it, describe the effect qualitatively." });
    } else if (quantRatio < 0.25) r -= 7;

    if (mode === "job" && allEntries.length) {
      const hits = allEntries.filter((e) => {
        const t = norm([e.role, e.name, e.company, ...(e.technologies ?? []), ...(e.bullets ?? [])].filter(Boolean).join(" "));
        return jobKeywords.some((k) => mentionsTerm(t, k.name));
      }).length;
      const share = hits / allEntries.length;
      r = Math.round(r * 0.65 + share * 100 * 0.35);
      if (share < 0.5) {
        finding({ category: "relevance", priority: "medium", title: "Few entries mention anything this job asks for", issue: `${hits} of ${allEntries.length} experience and project entries reference the job's requirements.`, why: "Reviewers skim the first entries; relevant work that is buried or worded differently gets missed.", action: "Reorder so the most relevant entries come first, and reword existing bullets in the job's own vocabulary where that is accurate." });
      }
    }
    relevance = clamp(r);
  }
  categories.push(category("relevance", weights.relevance, relevance, true,
    mode === "job"
      ? "Scored on bullet detail, action verbs, measurable outcomes, and how many of your entries relate to this job's requirements."
      : "Scored on bullet detail, action verbs and measurable outcomes in your experience and project entries."));

  // ── 5. Readability and content quality ──────────────────────────────────────
  let readability = 100;
  const summary = byType("summary")[0];
  const summaryText = String(summary?.text ?? "").trim();
  if (!summaryText) readability -= 15;
  else {
    const n = words(summaryText).length;
    if (n < 20) { readability -= 10; finding({ category: "readability", priority: "medium", title: `The summary is very short (${n} words)`, issue: "It has no room to state your role, strengths and target.", why: "The summary is read first and frames everything after it.", action: "Aim for 40–80 words: your role, years of experience, core stack and what you deliver.", sectionId: summary.id, field: "summary" }); }
    else if (n > 120) { readability -= 8; finding({ category: "readability", priority: "low", title: `The summary is long (${n} words)`, issue: "Long summaries get skipped.", why: "Detail belongs in experience bullets, where it is attached to evidence.", action: "Trim to 40–80 words.", sectionId: summary.id, field: "summary" }); }
    if (PRONOUN_RX.test(summaryText)) { readability -= 5; finding({ category: "readability", priority: "low", title: "The summary uses first-person pronouns", issue: "“I”, “my” or “we” appear in the summary.", why: "Resumes conventionally omit pronouns; it reads as more direct.", action: "Rewrite without “I”/“my” — the subject is understood.", sectionId: summary.id, field: "summary" }); }
  }
  const longFields = fields.filter((f) => words(f.text).length > 35);
  if (longFields.length) {
    readability -= Math.min(20, longFields.length * 5);
    finding({ category: "readability", priority: "low", title: `${longFields.length} over-long bullet${longFields.length === 1 ? "" : "s"}`, issue: `${longFields.length} field${longFields.length === 1 ? " runs" : "s run"} past 35 words.`, why: "Long bullets are skimmed past; one idea per bullet gets read.", action: "Split each into separate bullets, or cut to the outcome.", sectionId: longFields[0].sectionId, entryId: longFields[0].entryId, field: longFields[0].field });
  }
  const vagueFields = fields.filter((f) => VAGUE_RX.test(f.text));
  if (vagueFields.length) {
    readability -= Math.min(15, vagueFields.length * 4);
    finding({ category: "readability", priority: "medium", title: `${vagueFields.length} vague phrase${vagueFields.length === 1 ? "" : "s"}`, issue: "Wording such as “various”, “several” or “etc.” appears in the content.", why: "Vague quantifiers tell a reviewer nothing, and hide the specifics that would.", action: "Name the actual technologies, systems or numbers instead.", sectionId: vagueFields[0].sectionId, entryId: vagueFields[0].entryId, field: vagueFields[0].field });
  }
  const dupBullets = duplicates(allBullets);
  if (dupBullets.length) {
    readability -= Math.min(15, dupBullets.length * 7);
    finding({ category: "readability", priority: "medium", title: `${dupBullets.length} duplicate bullet${dupBullets.length === 1 ? "" : "s"}`, issue: "The same bullet text appears more than once.", why: "Repeated bullets waste the reader's limited attention and look like an editing mistake.", action: "Remove the duplicates, or rewrite them to say different things.", autoFix: { kind: "dedupe_bullets", label: "Remove duplicate bullets" } });
  }
  const openers = {};
  for (const f of fields) { const v = norm(words(f.text)[0] ?? "").replace(/[^a-z]/g, ""); if (v.length > 3) openers[v] = (openers[v] ?? 0) + 1; }
  const repeated = Object.entries(openers).filter(([, n]) => n >= 4);
  if (repeated.length) {
    readability -= 10;
    finding({ category: "readability", priority: "low", title: "Repetitive bullet openings", issue: `${repeated.map(([v, n]) => `“${v}” ×${n}`).join(", ")}.`, why: "The same opening verb throughout flattens everything to one register.", action: "Vary the verbs so each bullet's action is distinct." });
  }
  const totalWords = words(text).length;
  if (totalWords < 200) { readability -= 15; finding({ category: "readability", priority: "medium", title: `The resume is very short (${totalWords} words)`, issue: "There is not enough content for a reviewer to assess.", why: "Most one-page resumes run 300–600 words; much less suggests missing sections.", action: "Expand your experience and project bullets with the scope, your contribution and the outcome." }); }
  else if (totalWords > 1200) { readability -= 8; finding({ category: "readability", priority: "low", title: `The resume is long (${totalWords} words)`, issue: "Content past the second page is rarely read.", why: "Length dilutes the strongest material.", action: "Cut the oldest or least relevant entries and tighten the rest." }); }
  categories.push(category("readability", weights.readability, clamp(readability), true,
    "Scored on summary length, bullet length, specific rather than vague wording, duplication and overall length."));

  // ── 6. Formatting and parsing compatibility ─────────────────────────────────
  let fmtScore = 100;
  const formattingIssues = [];
  const tpl = TEMPLATES.find((t) => t.id === templateId);
  const guarantees = [
    "Single-column layout with no tables, sidebars or text boxes",
    "All text is real selectable text — nothing is inside an image",
    "Standard PDF fonts (Helvetica, Times or Courier) with nothing embedded",
    "Contact details are plain text in the header, not icons",
  ];

  const eduEntries = byType("education").flatMap((s) => (s.entries ?? []).map((e) => ({ ...e, sectionId: s.id })));
  const dateValues = [...expEntries, ...projEntries, ...eduEntries].flatMap((e) => [e.startDate, e.endDate]).filter((d) => String(d ?? "").trim());
  const formats = [...new Set(dateValues.map((d) => dateFormatName(d) ?? "unrecognised"))];
  // A bare year next to "Mar 2023" is conventional (education often omits months), so only
  // competing month-precision formats count as an inconsistency.
  const monthFormats = formats.filter((f) => f !== "YYYY" && f !== "unrecognised");
  if (monthFormats.length > 1) {
    fmtScore -= 20;
    formattingIssues.push({ issue: "Mixed date formats", detail: monthFormats.join(", ") });
    finding({ category: "formatting", priority: "medium", title: "Dates use more than one format", issue: `Found: ${monthFormats.join(", ")}.`, why: "Inconsistent dates look careless and can defeat the date parsing that builds your timeline.", action: "Use one format everywhere, e.g. “Mar 2023 – Present”.", autoFix: { kind: "normalise_dates", label: "Reformat all dates as “Mon YYYY”" } });
  }
  if (formats.includes("unrecognised")) {
    fmtScore -= 10;
    const bad = dateValues.filter((d) => !dateFormatName(d));
    formattingIssues.push({ issue: "Unrecognised date values", detail: bad.slice(0, 5).join(", ") });
    finding({ category: "formatting", priority: "medium", title: "Some dates are in no conventional format", issue: `${bad.slice(0, 5).join(", ")}${bad.length > 5 ? ` +${bad.length - 5} more` : ""}.`, why: "A date a parser cannot read leaves the role without a timeline.", action: "Write dates as “Mar 2023” or “03/2023”.", autoFix: { kind: "normalise_dates", label: "Reformat all dates as “Mon YYYY”" } });
  }
  for (const e of expEntries) {
    if (e.current && String(e.endDate ?? "").trim()) {
      fmtScore -= 6;
      finding({ category: "formatting", priority: "medium", title: `“${e.role || e.company}” is marked current but has an end date`, issue: "The entry contradicts itself.", why: "Contradictory dates make the timeline unreliable and raise questions in interviews.", action: "Clear the end date, or untick “I currently work here”.", sectionId: e.sectionId, entryId: e.id, autoFix: { kind: "fix_current_dates", label: "Clear the end date on current roles" } });
    }
    if (!String(e.startDate ?? "").trim()) {
      fmtScore -= 5;
      finding({ category: "formatting", priority: "medium", title: `“${e.role || e.company || "An experience entry"}” has no dates`, issue: "The role has no start date.", why: "Undated roles cannot be placed on a timeline, and gaps get assumed.", action: "Add at least the start month and year.", sectionId: e.sectionId, entryId: e.id });
    }
  }
  const symbolFields = fields.filter((f) => NON_ASCII_SYMBOL_RX.test(f.text));
  if (symbolFields.length) {
    fmtScore -= 10;
    formattingIssues.push({ issue: "Decorative symbols inside the text", detail: `${symbolFields.length} field(s)` });
    finding({ category: "formatting", priority: "low", title: "Decorative symbols inside your text", issue: `${symbolFields.length} field${symbolFields.length === 1 ? "" : "s"} contain characters such as ● ▪ ➜ ✔.`, why: "Bullet glyphs typed into the text itself can come through as question marks, and the builder already draws your bullets.", action: "Remove them and let the template's bullet style do the work.", autoFix: { kind: "strip_symbols", label: "Remove decorative symbols from the text" } });
  }
  const malformed = linkProblems(content.personal ?? {}, content);
  if (malformed.length) {
    fmtScore -= Math.min(12, malformed.length * 6);
    for (const l of malformed) {
      formattingIssues.push({ issue: "Malformed link", detail: `${l.label}: ${l.value}` });
      finding({ category: "formatting", priority: "low", title: `The ${l.label} link looks malformed`, issue: `“${l.value}” — ${l.reason}.`, why: "A broken link is a dead end for a reviewer who wants to see your work.", action: "Use the full address, e.g. linkedin.com/in/yourname or https://github.com/yourname.", field: l.field });
    }
  }
  if (formatting.fontSize && (formatting.fontSize < 9.5 || formatting.fontSize > 12)) {
    fmtScore -= 8;
    formattingIssues.push({ issue: "Font size outside the readable band", detail: `${formatting.fontSize}pt` });
    finding({ category: "formatting", priority: "low", title: `Body text is ${formatting.fontSize}pt`, issue: formatting.fontSize < 9.5 ? "Below about 9.5pt is hard to read on paper." : "Above 12pt wastes space and pushes content onto extra pages.", why: "Readable body text on A4 is 10–11.5pt.", action: "Set the font size to 10–11.5pt in the template panel." });
  }
  if (formatting.margins === "narrow") { fmtScore -= 3; formattingIssues.push({ issue: "Narrow margins", detail: "Some printers clip content near the page edge." }); }
  const atsSafeRender = Boolean(formatting.atsMode) || tpl?.atsSafe === true;
  if (atsSafeRender) guarantees.push("ATS mode: rendered without accent colour or decorative rules");
  categories.push(category("formatting", weights.formatting, clamp(fmtScore), true,
    "Deterministic checks on dates, symbols, links and type size. This builder's templates are structurally single-column, text-only and use standard PDF fonts, so the layout risks of a hand-made document do not apply here."));

  // ── 7. Contact information and completeness ─────────────────────────────────
  const p = content.personal ?? {};
  let contact = 100;
  if (!String(p.fullName ?? "").trim()) { contact -= 45; finding({ category: "contact", priority: "high", title: "Your name is missing", issue: "The resume header has no name.", why: "Without a name the file cannot be attributed to you at all.", action: "Add your full name in personal details.", field: "fullName" }); }
  if (!String(p.email ?? "").trim()) { contact -= 30; finding({ category: "contact", priority: "high", title: "No email address", issue: "There is no email address on the resume.", why: "Email is the primary way recruiters reply; a resume without one is usually discarded.", action: "Add a professional email address.", field: "email" }); }
  else if (!EMAIL_RX.test(String(p.email).trim())) { contact -= 20; finding({ category: "contact", priority: "high", title: "The email address looks invalid", issue: `“${p.email}” is not a valid address.`, why: "A typo in your email silently loses every reply.", action: "Correct the address.", field: "email" }); }
  if (!String(p.phone ?? "").trim()) { contact -= 10; finding({ category: "contact", priority: "medium", title: "No phone number", issue: "There is no phone number on the resume.", why: "Recruiters often call rather than email.", action: "Add a phone number with its country code.", field: "phone" }); }
  else if (!PHONE_RX.test(String(p.phone).trim())) { contact -= 8; finding({ category: "contact", priority: "medium", title: "The phone number looks malformed", issue: `“${p.phone}” does not look like a phone number.`, why: "A mistyped number is as good as no number.", action: "Use digits with an optional leading +country code.", field: "phone" }); }
  if (!String(p.location ?? "").trim()) { contact -= 5; finding({ category: "contact", priority: "low", title: "No location", issue: "The resume does not say where you are based.", why: "Location drives a lot of recruiter filtering, including remote eligibility.", action: "Add your city and country — a street address is not needed.", field: "location" }); }
  if (![p.linkedin, p.github, p.website].some((x) => String(x ?? "").trim())) { contact -= 10; finding({ category: "contact", priority: "medium", title: "No LinkedIn, GitHub or portfolio link", issue: "There is no professional link in the header.", why: "A link is where a reviewer goes to verify your work.", action: "Add at least one: LinkedIn, GitHub or a portfolio.", field: "linkedin" }); }
  categories.push(category("contact", weights.contact, clamp(contact), true,
    "Name, a valid email, a phone number, a location and at least one professional link, all as plain text in the header."));

  // ── Overall ─────────────────────────────────────────────────────────────────
  const applicable = categories.filter((c) => c.applicable);
  const totalWeight = applicable.reduce((a, c) => a + c.weight, 0);
  const overall = totalWeight === 0 ? 0 : clamp(applicable.reduce((a, c) => a + c.score * c.weight, 0) / totalWeight);

  const PRIO = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => PRIO[a.priority] - PRIO[b.priority]);
  // Action plan: highest priority first, then the categories with the most points still available.
  const byCat = new Map(categories.map((c) => [c.key, c]));
  const plan = [...findings].sort((a, b) => {
    const d = PRIO[a.priority] - PRIO[b.priority];
    if (d !== 0) return d;
    return (byCat.get(b.category)?.pointsLost ?? 0) - (byCat.get(a.category)?.pointsLost ?? 0);
  });

  return {
    method: ATS_METHOD,
    mode,
    modeLabel: mode === "job" ? "Job-specific ATS readiness" : "General ATS readiness",
    overall,
    label: BAND(overall),
    jobTitle: jobTitle ?? null,
    targetRole: targetRole ?? null,
    templateId,
    atsSafeRender,
    categories,
    findings,
    actionPlan: plan.map((f, i) => ({ rank: i + 1, ...f })),
    headroom: scoreHeadroom({ categories }),
    keywordCoverage,
    skills: { listed: uniqueSkills, demonstrated, listedNotDemonstrated: listedOnly, roleBaseline: baselineReport },
    sectionCompleteness: completeness,
    formattingIssues,
    parsingGuarantees: guarantees,
    counts: { words: totalWords, bullets: allBullets.length, entries: allEntries.length, sections: sections.length },
    weights,
    disclaimer: ATS_DISCLAIMER,
    checkedAt: new Date().toISOString(),
  };
}

function category(key, weight, score, applicable, explanation) {
  const s = applicable ? clamp(score ?? 0) : null;
  return {
    key,
    label: ATS_CATEGORY_LABELS[key],
    weight,
    score: s,
    applicable,
    pointsEarned: applicable ? Math.round((s / 100) * weight * 10) / 10 : 0,
    pointsLost: applicable ? Math.round((1 - s / 100) * weight * 10) / 10 : 0,
    explanation,
  };
}

function duplicates(items) {
  const seen = new Map();
  for (const i of items) { const k = norm(i); if (!k) continue; seen.set(k, (seen.get(k) ?? 0) + 1); }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

const titleCase = (s) => String(s).split(" ").map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

/** Obvious link problems — spaces, no dot, a mistyped scheme. Nothing is fetched. */
export function linkProblems(personal, content) {
  const out = [];
  const check = (field, label, value) => {
    const v = String(value ?? "").trim();
    if (!v) return;
    if (/\s/.test(v)) return out.push({ field, label, value: v, reason: "it contains a space" });
    if (/^https?:\/{0,2}$/i.test(v)) return out.push({ field, label, value: v, reason: "it is only a scheme" });
    if (!/\./.test(v)) return out.push({ field, label, value: v, reason: "it has no domain" });
    if (/^(htp|htps|ttp)s?:/i.test(v) || /^https?:\/[^/]/i.test(v)) return out.push({ field, label, value: v, reason: "the scheme looks mistyped" });
  };
  check("linkedin", "LinkedIn", personal.linkedin);
  check("github", "GitHub", personal.github);
  check("website", "website", personal.website);
  for (const s of content?.sections ?? []) {
    for (const e of s.entries ?? []) if (e.link) check("link", `${s.title} → ${e.name || e.degree || e.role || "entry"}`, e.link);
  }
  return out;
}

/** Points each category could still add, highest first — "where to spend effort". */
export function scoreHeadroom(assessment) {
  return (assessment.categories ?? [])
    .filter((c) => c.applicable && c.pointsLost > 0)
    .sort((a, b) => b.pointsLost - a.pointsLost)
    .map((c) => ({ key: c.key, label: c.label, pointsAvailable: c.pointsLost, score: c.score }));
}
