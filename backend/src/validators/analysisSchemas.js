/**
 * analysisSchemas.js — Zod schemas for (a) incoming analysis requests and
 * (b) the structured output we require from the LLM.
 *
 * The AI output schema is deliberately strict: every array is bounded, every
 * enum is closed, and evidence fields are required so the model cannot assert
 * a match without pointing at resume text.
 */
import { z } from "zod";
import { MAX_JOB_DESCRIPTION_CHARS, MAX_RESUME_CHARS } from "../utils/sanitize.js";

// ─── Request ─────────────────────────────────────────────────────────────────

export const TARGET_ROLES = [
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Analyst",
  "Software Engineer",
];

export const analysisRequestSchema = z.object({
  resumeText: z
    .string({ required_error: "resumeText is required" })
    .trim()
    .min(200, "Resume text is too short to analyze (minimum 200 characters). Make sure the file is not image-based.")
    .max(MAX_RESUME_CHARS, `Resume text exceeds ${MAX_RESUME_CHARS} characters.`),
  jobTitle: z.string({ required_error: "jobTitle is required" }).trim().min(2, "Job title is required.").max(120),
  targetRole: z.string({ required_error: "targetRole is required" }).trim().min(2, "Target role is required.").max(80),
  jobDescription: z
    .string({ required_error: "jobDescription is required" })
    .trim()
    .min(100, "Job description is too short to analyze (minimum 100 characters).")
    .max(MAX_JOB_DESCRIPTION_CHARS, `Job description exceeds ${MAX_JOB_DESCRIPTION_CHARS} characters.`),
  companyName: z.string().trim().max(120).optional().or(z.literal("")),
  fileName: z.string().trim().max(255).optional(),
});

export const idParamSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{20,32}$/i, "Invalid analysis id."),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().regex(/^[a-z0-9]{20,32}$/i).optional(),
});

// ─── AI output ───────────────────────────────────────────────────────────────

const shortText = z.string().min(1).max(400);
const sentence = z.string().min(1).max(1200);

export const SKILL_CATEGORIES = ["Frontend", "Backend", "Database", "Cloud/DevOps", "Testing", "Tools", "Data", "Soft Skill", "Other"];
export const PRIORITIES = ["required", "preferred", "unknown"];

const matchedSkillSchema = z.object({
  name: shortText,
  category: z.enum(SKILL_CATEGORIES),
  priority: z.enum(PRIORITIES),
  evidence: sentence.describe("Short quote or paraphrase from the resume proving the skill."),
  evidenceType: z.enum(["direct", "inferred"]).describe("direct = stated in the resume; inferred = reasonably implied."),
});

const partialSkillSchema = matchedSkillSchema.extend({
  gap: sentence.describe("What is missing or weaker than the job asks for."),
});

const missingSkillSchema = z.object({
  name: shortText,
  category: z.enum(SKILL_CATEGORIES),
  priority: z.enum(PRIORITIES),
  reason: sentence.describe("Why it is missing or unverified. Never claim certainty that the candidate lacks it."),
});

const suggestionSchema = z.object({
  title: shortText,
  description: sentence,
  type: z.enum(["keyword", "achievement", "project", "structure", "general"]),
  priority: z.enum(["high", "medium", "low"]),
});

const alignmentSchema = z.object({
  resumeEvidence: z.array(sentence).max(8),
  jobRequirements: z.array(sentence).max(8),
  assessment: sentence,
  meetsRequirement: z.enum(["yes", "partial", "no", "unknown"]),
});

const atsCheckSchema = z.object({
  name: shortText,
  status: z.enum(["pass", "warn", "fail"]),
  explanation: sentence,
  verifiability: z.enum(["text", "heuristic", "requires-original"]).describe(
    "text = verifiable from the extracted text; heuristic = estimate; requires-original = needs the original file (formatting, columns, images)."
  ),
});

const interviewQuestionSchema = z.object({
  question: sentence,
  category: z.enum(["Technical", "Project", "Behavioral"]),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  reason: sentence,
});

export const aiAnalysisOutputSchema = z.object({
  summary: sentence,
  matchedSkills: z.array(matchedSkillSchema).max(40),
  partiallyMatchedSkills: z.array(partialSkillSchema).max(25),
  missingOrUnverifiedSkills: z.array(missingSkillSchema).max(40),
  strengths: z.array(sentence).max(8),
  improvementSuggestions: z.array(suggestionSchema).max(10),
  keywordAnalysis: z.object({
    foundKeywords: z.array(shortText).max(40),
    missingOrUnverifiedKeywords: z.array(shortText).max(40),
    recommendedKeywords: z
      .array(shortText)
      .max(20)
      .describe("Only terms the resume already supports but phrases differently. Never skills the candidate lacks."),
  }),
  experienceAlignment: alignmentSchema,
  educationAlignment: alignmentSchema,
  atsChecks: z.array(atsCheckSchema).max(12),
  interviewQuestions: z.array(interviewQuestionSchema).min(3).max(15),
  limitations: z.array(sentence).max(8).describe("Anything that could not be assessed from the supplied text."),
});

/**
 * Validate raw LLM output. Returns { ok, data } or { ok, issues }.
 * @param {unknown} raw
 */
export function validateAiOutput(raw) {
  const parsed = aiAnalysisOutputSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.slice(0, 15).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** JSON-schema-ish description used in prompts for providers without native structured output. */
export const OUTPUT_FORMAT_DESCRIPTION = `{
  "summary": string,
  "matchedSkills": [{ "name": string, "category": ${JSON.stringify(SKILL_CATEGORIES)}, "priority": "required"|"preferred"|"unknown", "evidence": string, "evidenceType": "direct"|"inferred" }],
  "partiallyMatchedSkills": [{ ...same as matchedSkills, "gap": string }],
  "missingOrUnverifiedSkills": [{ "name": string, "category": string, "priority": "required"|"preferred"|"unknown", "reason": string }],
  "strengths": [string],
  "improvementSuggestions": [{ "title": string, "description": string, "type": "keyword"|"achievement"|"project"|"structure"|"general", "priority": "high"|"medium"|"low" }],
  "keywordAnalysis": { "foundKeywords": [string], "missingOrUnverifiedKeywords": [string], "recommendedKeywords": [string] },
  "experienceAlignment": { "resumeEvidence": [string], "jobRequirements": [string], "assessment": string, "meetsRequirement": "yes"|"partial"|"no"|"unknown" },
  "educationAlignment": { "resumeEvidence": [string], "jobRequirements": [string], "assessment": string, "meetsRequirement": "yes"|"partial"|"no"|"unknown" },
  "atsChecks": [{ "name": string, "status": "pass"|"warn"|"fail", "explanation": string, "verifiability": "text"|"heuristic"|"requires-original" }],
  "interviewQuestions": [{ "question": string, "category": "Technical"|"Project"|"Behavioral", "difficulty": "Beginner"|"Intermediate"|"Advanced", "reason": string }],
  "limitations": [string]
}`;
