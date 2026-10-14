/**
 * jobDescriptionParser.ts
 * Rule-based, dictionary-driven job description analysis.
 *
 * IMPORTANT: this is a DEMO heuristic. It only recognises terms that exist in
 * `skillDictionary.ts` and only classifies required/preferred when the text
 * contains supporting wording. Every result carries `isDemoAnalysis: true`
 * and a `warnings` list describing what could not be detected confidently.
 *
 * The public surface (`parseJobDescription`, `JobAnalysis`) is designed so a
 * future AI-powered backend can return the same shape.
 */

import {
  ACTION_WORDS,
  CERTIFICATION_PATTERNS,
  DEGREE_FIELDS,
  DEGREE_PATTERNS,
  INDUSTRY_TERMS,
  PREFERRED_CUES,
  REQUIRED_CUES,
  ROLE_TERMS,
  SECTION_HEADINGS,
  SENIORITY_PATTERNS,
  SKILL_DEFINITIONS,
  STOP_WORDS,
  type SectionType,
  type SkillCategory,
  type SkillDefinition,
} from "./skillDictionary";

export type { SkillCategory } from "./skillDictionary";

// ─── Public types ────────────────────────────────────────────────────────────

export type SkillPriority = "required" | "preferred" | "unclear";

export interface JobSkill {
  id: string;
  name: string;
  category: SkillCategory;
  priority: SkillPriority;
  /** Sentence (trimmed) that supports the priority classification, if any. */
  priorityEvidence: string | null;
  /** True when no supporting wording was found and the priority is a guess. */
  priorityInferred: boolean;
  /** Number of times the skill (any alias) appears in the text. */
  mentions: number;
  /** Exact alias text matched in the description (empty for manual skills). */
  matchedText: string[];
  source: "detected" | "manual";
}

export interface ExperienceRequirement {
  minYears: number | null;
  maxYears: number | null;
  evidence: string | null;
  seniority: string | null;
  seniorityEvidence: string | null;
  industries: string[];
  /** Set by the user when they confirm or correct the extracted value. */
  userConfirmed: boolean;
}

export interface EducationRequirement {
  degrees: string[];
  fields: string[];
  /** "required" | "preferred" | null when the text gives no priority wording */
  priority: SkillPriority | null;
  evidence: string | null;
  userConfirmed: boolean;
}

export type ResponsibilityType = "role" | "technical" | "collaboration";

export interface Responsibility {
  id: string;
  text: string;
  type: ResponsibilityType;
}

export interface Keyword {
  term: string;
  count: number;
  /** exact = the term appears verbatim in the description; inferred = related term suggested by the dictionary */
  matchType: "exact" | "inferred";
  /** For inferred keywords, which exact term it was derived from */
  derivedFrom?: string;
}

export interface KeywordAnalysisResult {
  technical: Keyword[];
  roleTerms: Keyword[];
  actionWords: Keyword[];
  repeated: Keyword[];
  suggested: Keyword[];
}

export interface JobAnalysis {
  id: string;
  isDemoAnalysis: true;
  parserVersion: string;
  createdAt: string;
  updatedAt: string;
  /** User-editable display name (defaults to the job title). */
  name: string;
  jobTitle: string;
  companyName: string | null;
  targetRole: string;
  jobUrl: string | null;
  /** The job description text, capped in length by the storage layer. */
  description: string;
  descriptionLength: number;
  summary: string;
  skills: JobSkill[];
  experience: ExperienceRequirement;
  education: EducationRequirement;
  certifications: string[];
  responsibilities: Responsibility[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  keywords: KeywordAnalysisResult;
  warnings: string[];
  /** Skill names the user has confirmed they have (for resume comparison review). */
  confirmedResumeSkills: string[];
  /** Skill names the user has confirmed they do NOT have. */
  rejectedResumeSkills: string[];
}

export interface ParseJobDescriptionInput {
  jobTitle: string;
  companyName?: string;
  targetRole: string;
  description: string;
  jobUrl?: string;
}

export const PARSER_VERSION = "demo-rules-1.0";
export const MIN_DESCRIPTION_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 20000;

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: "jobTitle" | "targetRole" | "description" | "jobUrl";
  message: string;
}

export function validateJobDescriptionInput(input: ParseJobDescriptionInput): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!input.jobTitle.trim()) errors.push({ field: "jobTitle", message: "Job title is required." });
  if (!input.targetRole) errors.push({ field: "targetRole", message: "Please select a target role." });

  const text = input.description.trim();
  if (!text) {
    errors.push({ field: "description", message: "Please paste a job description to analyze." });
  } else if (text.length < MIN_DESCRIPTION_LENGTH) {
    errors.push({
      field: "description",
      message: `The description is too short to analyze. Add at least ${MIN_DESCRIPTION_LENGTH - text.length} more characters (minimum ${MIN_DESCRIPTION_LENGTH}).`,
    });
  } else if (text.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({
      field: "description",
      message: `The description is too long. Please keep it under ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`,
    });
  } else if (countWords(text) < 15) {
    errors.push({ field: "description", message: "The description needs at least 15 words to analyze." });
  }

  if (input.jobUrl && input.jobUrl.trim()) {
    try {
      const url = new URL(input.jobUrl.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol");
    } catch {
      errors.push({ field: "jobUrl", message: "Enter a valid http(s) URL or leave the field empty." });
    }
  }
  return errors;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createId(prefix = "job"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build a boundary-aware regex for an alias. Handles tokens like C#, C++, .NET, Node.js. */
function aliasRegex(alias: string, caseSensitive: boolean | undefined): RegExp {
  const body = escapeRegex(alias);
  // Not preceded/followed by an alphanumeric or a symbol that is part of a tech token.
  return new RegExp(`(^|[^A-Za-z0-9+#.])(${body})(?![A-Za-z0-9+#])`, caseSensitive ? "g" : "gi");
}

interface CompiledSkill extends SkillDefinition {
  regexes: RegExp[];
}

let compiledSkills: CompiledSkill[] | null = null;
function getCompiledSkills(): CompiledSkill[] {
  if (!compiledSkills) {
    compiledSkills = SKILL_DEFINITIONS.map((d) => ({
      ...d,
      regexes: d.aliases.map((a) => aliasRegex(a, d.caseSensitive)),
    }));
  }
  return compiledSkills;
}

export function getSkillDefinition(name: string): SkillDefinition | undefined {
  const lower = name.toLowerCase();
  return SKILL_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === lower || d.aliases.some((a) => a.toLowerCase() === lower)
  );
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z•\-–*])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function cleanBullet(line: string): string {
  return line.replace(/^[\s•\-–—*·●▪◦>]+|^\d+[.)]\s*/g, "").trim();
}

function isHeadingLine(line: string): boolean {
  const l = cleanBullet(line).replace(/[:：]\s*$/, "").trim();
  if (!l || l.length > 60) return false;
  return SECTION_HEADINGS.some((h) => h.pattern.test(l));
}

function detectSection(line: string): SectionType | null {
  const l = cleanBullet(line).replace(/[:：]\s*$/, "").trim();
  if (!l || l.length > 60) return null;
  const hit = SECTION_HEADINGS.find((h) => h.pattern.test(l));
  return hit ? hit.section : null;
}

function truncate(text: string, len: number): string {
  return text.length <= len ? text : text.slice(0, len - 1).trimEnd() + "…";
}

function containsCue(sentence: string, cues: string[]): string | null {
  const lower = sentence.toLowerCase();
  return cues.find((c) => lower.includes(c)) ?? null;
}

// ─── Sectioning ──────────────────────────────────────────────────────────────

interface SectionedLine {
  raw: string;
  text: string; // cleaned bullet text
  section: SectionType;
  isBullet: boolean;
}

function sectionLines(description: string): SectionedLine[] {
  const lines = description.replace(/\r/g, "").split("\n");
  let current: SectionType = "other";
  const out: SectionedLine[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const sec = detectSection(trimmed);
    if (sec) {
      current = sec;
      // A heading line followed by inline content ("Requirements: React, Node") keeps the content.
      const after = trimmed.replace(/^[^:：]*[:：]\s*/, "");
      if (after && after !== trimmed && after.length > 10) {
        out.push({ raw: trimmed, text: after, section: current, isBullet: false });
      }
      continue;
    }
    out.push({
      raw: trimmed,
      text: cleanBullet(trimmed),
      section: current,
      isBullet: /^[\s•\-–—*·●▪◦>]|^\d+[.)]\s/.test(trimmed),
    });
  }
  return out;
}

// ─── Skills ──────────────────────────────────────────────────────────────────

function extractSkills(description: string, lines: SectionedLine[], warnings: string[]): JobSkill[] {
  const sentences = splitSentences(description);
  const skills = new Map<string, JobSkill>();

  for (const def of getCompiledSkills()) {
    let mentions = 0;
    const matched = new Set<string>();
    for (const rx of def.regexes) {
      rx.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(description)) !== null) {
        mentions += 1;
        matched.add(m[2]);
        if (m[0].length === 0) rx.lastIndex++;
      }
    }
    if (mentions === 0) continue;

    // Decide priority from the sentences the skill appears in.
    let priority: SkillPriority = "unclear";
    let evidence: string | null = null;
    let inferred = true;

    const skillSentences = sentences.filter((s) => def.regexes.some((rx) => { rx.lastIndex = 0; return rx.test(s); }));

    for (const s of skillSentences) {
      const req = containsCue(s, REQUIRED_CUES);
      const pref = containsCue(s, PREFERRED_CUES);
      if (pref && !req) {
        // "required" wins and breaks the loop below, so this never downgrades a required skill.
        priority = "preferred"; evidence = truncate(s, 180); inferred = false;
      } else if (req && !pref) {
        priority = "required"; evidence = truncate(s, 180); inferred = false;
        break;
      } else if (req && pref) {
        // Mixed wording: "Required: React. Nice to have: Vue" on one line → unclear, but keep evidence.
        if (priority === "unclear") { evidence = truncate(s, 180); }
      }
    }

    // Fall back to the section the skill appears in (explicit heading = supporting wording).
    if (priority === "unclear") {
      const sectionsHit = new Set(
        lines
          .filter((l) => def.regexes.some((rx) => { rx.lastIndex = 0; return rx.test(l.text); }))
          .map((l) => l.section)
      );
      if (sectionsHit.has("required") && !sectionsHit.has("preferred")) {
        priority = "required"; inferred = false;
        evidence = "Listed under a requirements / qualifications heading.";
      } else if (sectionsHit.has("preferred") && !sectionsHit.has("required")) {
        priority = "preferred"; inferred = false;
        evidence = "Listed under a preferred / nice-to-have heading.";
      } else if (sectionsHit.has("required") && sectionsHit.has("preferred")) {
        evidence = "Appears under both required and preferred headings.";
      }
    }

    skills.set(def.name, {
      id: createId("skill"),
      name: def.name,
      category: def.category,
      priority,
      priorityEvidence: evidence,
      priorityInferred: inferred,
      mentions,
      matchedText: [...matched],
      source: "detected",
    });
  }

  const list = [...skills.values()].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
  if (list.length === 0) {
    warnings.push("No skills from the built-in dictionary were detected. The description may use terms the demo parser does not know — add skills manually.");
  } else if (list.filter((s) => s.category !== "Soft Skills").length < 3) {
    warnings.push("Only a few technical skills were recognised. The demo dictionary may not cover this role well — review and add skills manually.");
  }
  if (list.length > 0 && list.every((s) => s.priorityInferred)) {
    warnings.push("No wording such as 'required' or 'nice to have' was found, so skill priority could not be classified.");
  }
  return list;
}

// ─── Experience ──────────────────────────────────────────────────────────────

const YEARS_RX = /(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/gi;

function extractExperience(description: string, jobTitle: string, warnings: string[]): ExperienceRequirement {
  const sentences = splitSentences(description);
  let minYears: number | null = null;
  let maxYears: number | null = null;
  let evidence: string | null = null;

  for (const s of sentences) {
    if (!/experience|background|track record|working (with|in)/i.test(s)) continue;
    YEARS_RX.lastIndex = 0;
    const m = YEARS_RX.exec(s);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : null;
    if (Number.isNaN(a) || a > 40) continue;
    // Keep the first (usually the headline) requirement; prefer larger "min" only if unset.
    if (minYears === null) {
      minYears = a;
      maxYears = b !== null && b >= a ? b : null;
      evidence = truncate(s, 200);
    }
  }

  let seniority: string | null = null;
  let seniorityEvidence: string | null = null;
  const titleHit = SENIORITY_PATTERNS.find((p) => p.pattern.test(jobTitle));
  if (titleHit) {
    seniority = titleHit.label;
    seniorityEvidence = `Job title: "${jobTitle}"`;
  } else {
    // Look for seniority words near role words in the body, first 600 chars only (headline area).
    const head = description.slice(0, 600);
    const bodyHit = SENIORITY_PATTERNS.find((p) => p.pattern.test(head));
    if (bodyHit) {
      const m = head.match(bodyHit.pattern);
      seniority = bodyHit.label;
      seniorityEvidence = m ? `Mentioned near the top of the description ("${m[0]}").` : null;
    }
  }

  const industries = INDUSTRY_TERMS.filter((t) => new RegExp(`(^|[^A-Za-z])${escapeRegex(t)}(?![A-Za-z])`, "i").test(description))
    .map((t) => t.length <= 4 ? t : t.charAt(0).toUpperCase() + t.slice(1));

  if (minYears === null) warnings.push("No explicit years-of-experience requirement was detected.");
  if (!seniority) warnings.push("Seniority level is not stated in the title or opening lines.");

  return { minYears, maxYears, evidence, seniority, seniorityEvidence, industries, userConfirmed: false };
}

// ─── Education & certifications ─────────────────────────────────────────────

function extractEducation(description: string, warnings: string[]): EducationRequirement {
  const sentences = splitSentences(description).filter((s) => /degree|bachelor|master|phd|doctorate|diploma|bootcamp|b\.?sc|m\.?sc|b\.?tech|m\.?tech|education/i.test(s));
  const degrees = new Set<string>();
  const fields = new Set<string>();
  let evidence: string | null = null;
  let priority: SkillPriority | null = null;

  for (const s of sentences) {
    for (const d of DEGREE_PATTERNS) if (d.pattern.test(s)) degrees.add(d.label);
    for (const f of DEGREE_FIELDS) {
      if (new RegExp(`\\b${escapeRegex(f)}\\b`, "i").test(s)) fields.add(f.replace(/^a related field$/i, "Related field").replace(/^related field$/i, "Related field"));
    }
    if (!evidence && (degrees.size > 0 || /degree/i.test(s))) evidence = truncate(s, 200);
    if (priority === null) {
      const req = containsCue(s, REQUIRED_CUES);
      const pref = containsCue(s, PREFERRED_CUES) ?? (/or equivalent (practical )?experience/i.test(s) ? "or equivalent experience" : null);
      if (pref && !req) priority = "preferred";
      else if (req && !pref) priority = "required";
    }
  }

  if (degrees.size === 0) warnings.push("No education requirement was detected.");
  return { degrees: [...degrees], fields: [...fields], priority, evidence, userConfirmed: false };
}

function extractCertifications(description: string): string[] {
  const found = new Set<string>();
  for (const rx of CERTIFICATION_PATTERNS) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(description)) !== null) {
      const v = m[0].trim();
      if (v) found.add(v);
      if (m[0].length === 0) rx.lastIndex++;
    }
  }
  // Generic "X certification" phrases
  const generic = description.match(/\b[A-Z][A-Za-z+#. ]{2,40}?\s(?:certification|certificate|certified)\b/g) ?? [];
  for (const g of generic) found.add(g.trim());

  // Strip trailing priority wording ("… is a plus", "… preferred") and collapse overlapping matches.
  const cleaned = [...found]
    .map((c) => c.replace(/\s+(is|are|would|will|be|a plus|preferred|required|desirable|or equivalent).*$/i, "").replace(/[\s,.;:]+$/, "").trim())
    .filter((c) => c.length >= 3);
  const unique: string[] = [];
  for (const c of cleaned.sort((a, b) => a.length - b.length)) {
    const lc = c.toLowerCase();
    if (unique.some((u) => lc === u.toLowerCase() || lc.includes(u.toLowerCase()))) continue;
    unique.push(c);
  }
  return unique.slice(0, 12);
}

// ─── Responsibilities & qualifications ───────────────────────────────────────

const COLLAB_RX = /\b(collaborat|communicat|stakeholder|partner with|work (closely |together )?with|cross-functional|mentor|coach|present|liaise|coordinate|pair|team)/i;
const STARTS_WITH_ACTION = new RegExp(`^(${ACTION_WORDS.join("|")})(e|s|ing|ed)?\\b`, "i");

function classifyResponsibility(text: string): ResponsibilityType {
  if (COLLAB_RX.test(text)) return "collaboration";
  const hasTech = getCompiledSkills().some((d) => d.category !== "Soft Skills" && d.regexes.some((rx) => { rx.lastIndex = 0; return rx.test(text); }));
  return hasTech ? "technical" : "role";
}

function extractResponsibilities(lines: SectionedLine[], warnings: string[]): Responsibility[] {
  const seen = new Set<string>();
  const out: Responsibility[] = [];
  const push = (text: string) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length < 12 || t.length > 300) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: createId("resp"), text: t, type: classifyResponsibility(t) });
  };

  for (const l of lines.filter((l) => l.section === "responsibilities")) push(l.text);
  // If no explicit section, fall back to bullets that start with an action verb.
  if (out.length === 0) {
    for (const l of lines) {
      if (l.section === "benefits" || l.section === "about") continue;
      if (l.isBullet && STARTS_WITH_ACTION.test(l.text)) push(l.text);
    }
    if (out.length > 0) warnings.push("No responsibilities heading was found; bullet points starting with action verbs were used instead.");
  }
  if (out.length === 0) warnings.push("No responsibilities could be detected confidently.");
  return out.slice(0, 25);
}

function extractQualifications(lines: SectionedLine[]): { required: string[]; preferred: string[] } {
  const clean = (arr: SectionedLine[]) =>
    [...new Set(arr.map((l) => l.text.replace(/\s+/g, " ").trim()).filter((t) => t.length >= 8 && t.length <= 300))].slice(0, 20);
  return {
    required: clean(lines.filter((l) => l.section === "required")),
    preferred: clean(lines.filter((l) => l.section === "preferred")),
  };
}

// ─── Keywords ────────────────────────────────────────────────────────────────

function countOccurrences(text: string, term: string, caseSensitive = false): number {
  const rx = new RegExp(`(^|[^A-Za-z0-9+#.])(${escapeRegex(term)})(?![A-Za-z0-9+#])`, caseSensitive ? "g" : "gi");
  return (text.match(rx) ?? []).length;
}

function extractKeywords(description: string, skills: JobSkill[]): KeywordAnalysisResult {
  const technical: Keyword[] = skills
    .filter((s) => s.category !== "Soft Skills")
    .map((s) => ({ term: s.name, count: s.mentions, matchType: "exact" as const }));

  const roleTerms: Keyword[] = ROLE_TERMS
    .map((t) => ({ term: t, count: countOccurrences(description, t), matchType: "exact" as const }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const actionWords: Keyword[] = ACTION_WORDS
    .map((w) => ({ term: w, count: (description.match(new RegExp(`\\b${w}(e|s|ing|ed)?\\b`, "gi")) ?? []).length, matchType: "exact" as const }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Repeated terms: plain token frequency, minus stop words and very short tokens.
  const freq = new Map<string, number>();
  for (const tok of description.toLowerCase().replace(/[^a-z0-9+#.\-/ ]/g, " ").split(/\s+/)) {
    const t = tok.replace(/^[.\-/]+|[.\-/]+$/g, "");
    if (t.length < 3 || STOP_WORDS.has(t) || /^\d+$/.test(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const repeated: Keyword[] = [...freq.entries()]
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term, count]) => ({ term, count, matchType: "exact" as const }));

  // Suggested: exact technical + role terms, then dictionary-related terms flagged as inferred.
  const suggested: Keyword[] = [];
  const seen = new Set<string>();
  const add = (k: Keyword) => {
    const key = k.term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggested.push(k);
  };
  for (const k of technical) add(k);
  for (const k of roleTerms.slice(0, 8)) add(k);
  for (const s of skills) {
    const def = getSkillDefinition(s.name);
    for (const rel of def?.related ?? []) {
      if (!seen.has(rel.toLowerCase())) add({ term: rel, count: 0, matchType: "inferred", derivedFrom: s.name });
    }
  }

  return { technical, roleTerms, actionWords, repeated, suggested: suggested.slice(0, 30) };
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function buildSummary(description: string, lines: SectionedLine[]): string {
  // Prefer the first non-heading paragraph of 60+ chars from the top of the description.
  const intro = lines.find((l) => !l.isBullet && l.section !== "benefits" && l.text.length >= 60 && !isHeadingLine(l.raw));
  const source = intro ? intro.text : description.replace(/\s+/g, " ").trim();
  return truncate(source, 320);
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function parseJobDescription(input: ParseJobDescriptionInput): JobAnalysis {
  const description = input.description.replace(/\r/g, "").trim().slice(0, MAX_DESCRIPTION_LENGTH);
  const warnings: string[] = [];
  const lines = sectionLines(description);

  const skills = extractSkills(description, lines, warnings);
  const experience = extractExperience(description, input.jobTitle, warnings);
  const education = extractEducation(description, warnings);
  const certifications = extractCertifications(description);
  const responsibilities = extractResponsibilities(lines, warnings);
  const qualifications = extractQualifications(lines);
  const keywords = extractKeywords(description, skills);

  if (qualifications.required.length === 0 && qualifications.preferred.length === 0) {
    warnings.push("No requirements or qualifications heading was found; skill priority relies on sentence wording only.");
  }

  const now = new Date().toISOString();
  return {
    id: createId("job"),
    isDemoAnalysis: true,
    parserVersion: PARSER_VERSION,
    createdAt: now,
    updatedAt: now,
    name: input.jobTitle.trim(),
    jobTitle: input.jobTitle.trim(),
    companyName: input.companyName?.trim() || null,
    targetRole: input.targetRole,
    jobUrl: input.jobUrl?.trim() || null,
    description,
    descriptionLength: description.length,
    summary: buildSummary(description, lines),
    skills,
    experience,
    education,
    certifications,
    responsibilities,
    requiredQualifications: qualifications.required,
    preferredQualifications: qualifications.preferred,
    keywords,
    warnings,
    confirmedResumeSkills: [],
    rejectedResumeSkills: [],
  };
}

/** Lightweight skill-only extraction (used for resume text). Returns canonical names with mention counts. */
export function extractSkillNames(text: string): { name: string; category: SkillCategory; mentions: number }[] {
  const out: { name: string; category: SkillCategory; mentions: number }[] = [];
  for (const def of getCompiledSkills()) {
    let mentions = 0;
    for (const rx of def.regexes) {
      rx.lastIndex = 0;
      mentions += (text.match(rx) ?? []).length;
    }
    if (mentions > 0) out.push({ name: def.name, category: def.category, mentions });
  }
  return out.sort((a, b) => b.mentions - a.mentions);
}

/** Create a manual skill entry with a consistent shape. */
export function createManualSkill(name: string, category: SkillCategory, priority: SkillPriority = "unclear"): JobSkill {
  const def = getSkillDefinition(name);
  return {
    id: createId("skill"),
    name: def?.name ?? name.trim(),
    category: def?.category ?? category,
    priority,
    priorityEvidence: null,
    priorityInferred: priority === "unclear",
    mentions: 0,
    matchedText: [],
    source: "manual",
  };
}

/** Sample description used by the "Load example" action on the analyzer form. */
export const SAMPLE_JOB_DESCRIPTION = `Senior Frontend Developer — Northwind Health (Remote)

About the role
We are looking for a Senior Frontend Developer to join our patient portal team in the healthcare space. You will own the web experience used by thousands of clinicians every day and work closely with product managers, designers and backend engineers.

Responsibilities
- Build and maintain responsive, accessible web applications using React and TypeScript
- Collaborate with designers to translate Figma mockups into reusable components
- Write unit and integration tests with Jest and React Testing Library
- Review code, mentor junior developers and drive frontend best practices
- Optimize web performance and monitor production issues
- Participate in sprint planning and agile ceremonies

Requirements
- 5+ years of professional experience building web applications
- Strong experience with React, TypeScript and modern JavaScript (ES6+)
- Proficient in HTML, CSS and responsive design
- Experience consuming REST APIs and GraphQL
- Solid understanding of Git and CI/CD workflows
- Bachelor's degree in Computer Science or a related field, or equivalent practical experience
- Excellent communication skills and attention to detail

Nice to have
- Familiarity with Next.js and server-side rendering
- Exposure to Node.js, PostgreSQL or AWS
- Experience with Cypress or Playwright
- AWS Certified Developer certification is a plus

Benefits
- Competitive salary, remote-first culture and learning budget`;
