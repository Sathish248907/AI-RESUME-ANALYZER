/**
 * skillComparisonService.ts
 * Compares the skills extracted from a job description against skills
 * extracted from a resume (Phase 2 upload) using the shared dictionary.
 *
 * Results are an APPLICATION-DEFINED ESTIMATE, not a hiring probability.
 * A skill that the parser did not find in the resume is reported as
 * "missing or unverified" — never as definitively absent.
 */

import { extractSkillNames, getSkillDefinition, type JobSkill } from "./jobDescriptionParser";
import type { SkillCategory } from "./skillDictionary";

export interface ResumeSkill {
  name: string;
  category: SkillCategory;
  mentions: number;
}

export interface ResumeSkillSnapshot {
  fileName: string;
  extractedAt: string;
  /** Only skill names are kept — never the resume text. */
  skills: ResumeSkill[];
  source: "upload" | "manual";
}

export type ComparisonStatus = "matched" | "partial" | "missing" | "review";

export interface ComparisonItem {
  skill: JobSkill;
  status: ComparisonStatus;
  /** Human-readable reason for the status. */
  reason: string;
  /** For partial matches: the related resume skill that triggered it. */
  relatedResumeSkill?: string;
  /** True when the status comes from a user confirmation rather than the parser. */
  userOverride: boolean;
}

export interface ComparisonResult {
  matched: ComparisonItem[];
  partial: ComparisonItem[];
  missing: ComparisonItem[];
  review: ComparisonItem[];
  /** Resume skills that are not asked for by the job (informational). */
  extraResumeSkills: string[];
  estimate: {
    percent: number;
    weightedEarned: number;
    weightedTotal: number;
    explanation: string;
  };
}

export interface ComparisonOverrides {
  /** Skill names the user confirmed they possess. */
  confirmed: string[];
  /** Skill names the user confirmed they do not possess. */
  rejected: string[];
}

/** Extract resume skills from parsed resume text. The text itself is discarded. */
export function extractResumeSkills(resumeText: string, fileName: string): ResumeSkillSnapshot {
  return {
    fileName,
    extractedAt: new Date().toISOString(),
    skills: extractSkillNames(resumeText),
    source: "upload",
  };
}

const PRIORITY_WEIGHT: Record<JobSkill["priority"], number> = {
  required: 2,
  preferred: 1,
  unclear: 1,
};

function lower(s: string) {
  return s.trim().toLowerCase();
}

export function compareSkills(
  jobSkills: JobSkill[],
  resume: ResumeSkillSnapshot | null,
  overrides: ComparisonOverrides = { confirmed: [], rejected: [] }
): ComparisonResult {
  const resumeNames = new Set((resume?.skills ?? []).map((s) => lower(s.name)));
  const confirmed = new Set(overrides.confirmed.map(lower));
  const rejected = new Set(overrides.rejected.map(lower));

  const items: ComparisonItem[] = jobSkills.map((skill) => {
    const key = lower(skill.name);

    if (confirmed.has(key)) {
      return { skill, status: "matched", reason: "You confirmed you have this skill.", userOverride: true };
    }
    if (rejected.has(key)) {
      return { skill, status: "missing", reason: "You confirmed this skill is not on your resume.", userOverride: true };
    }

    // Soft skills and manually added job skills cannot be verified from keyword matching.
    if (skill.category === "Soft Skills") {
      return {
        skill,
        status: "review",
        reason: resumeNames.has(key)
          ? "The phrase appears in your resume, but soft skills need manual confirmation."
          : "Soft skills cannot be verified by keyword matching — confirm manually.",
        userOverride: false,
      };
    }
    if (skill.source === "manual" && !getSkillDefinition(skill.name)) {
      return {
        skill,
        status: "review",
        reason: "This skill was added manually and is not in the demo dictionary, so the resume could not be scanned for it.",
        userOverride: false,
      };
    }

    if (resumeNames.has(key)) {
      return { skill, status: "matched", reason: "Found in your resume text (exact dictionary match).", userOverride: false };
    }

    // Partial: a dictionary-related skill appears in the resume.
    const def = getSkillDefinition(skill.name);
    const related = (def?.related ?? []).find((r) => resumeNames.has(lower(r)));
    if (related) {
      return {
        skill,
        status: "partial",
        reason: `Not found directly, but the related skill "${related}" is on your resume.`,
        relatedResumeSkill: related,
        userOverride: false,
      };
    }

    return {
      skill,
      status: "missing",
      reason: "Not detected in your resume. This may be a real gap or a term the demo parser does not recognise.",
      userOverride: false,
    };
  });

  const matched = items.filter((i) => i.status === "matched");
  const partial = items.filter((i) => i.status === "partial");
  const missing = items.filter((i) => i.status === "missing");
  const review = items.filter((i) => i.status === "review");

  const jobNames = new Set(jobSkills.map((s) => lower(s.name)));
  const extraResumeSkills = (resume?.skills ?? [])
    .filter((s) => !jobNames.has(lower(s.name)) && s.category !== "Soft Skills")
    .map((s) => s.name)
    .slice(0, 20);

  // Estimate: required skills weigh double; partial matches earn half; "review" items are excluded.
  const scoreable = items.filter((i) => i.status !== "review");
  const weightedTotal = scoreable.reduce((sum, i) => sum + PRIORITY_WEIGHT[i.skill.priority], 0);
  const weightedEarned = scoreable.reduce((sum, i) => {
    const w = PRIORITY_WEIGHT[i.skill.priority];
    if (i.status === "matched") return sum + w;
    if (i.status === "partial") return sum + w / 2;
    return sum;
  }, 0);
  const percent = weightedTotal === 0 ? 0 : Math.round((weightedEarned / weightedTotal) * 100);

  const explanation = resume
    ? `Application-defined estimate: required skills count double, preferred and unclear skills count once, partial matches earn half credit, and ${review.length} skill${review.length === 1 ? "" : "s"} needing manual review ${review.length === 1 ? "is" : "are"} excluded. This is a keyword overlap score, not a hiring probability.`
    : "No resume skills are available for this session, so no estimate can be calculated.";

  return { matched, partial, missing, review, extraResumeSkills, estimate: { percent, weightedEarned, weightedTotal, explanation } };
}
