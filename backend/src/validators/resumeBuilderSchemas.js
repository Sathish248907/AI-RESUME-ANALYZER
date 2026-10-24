import { z } from "zod";
import { cuidLike, pagination } from "./common.js";
import { contentSchema, formattingSchema, TEMPLATE_IDS } from "../services/resumeBuilder/resumeContentSchema.js";
import { ATS_WEIGHTS } from "../services/resumeBuilder/atsScoringService.js";
import { AUTO_FIX_KINDS } from "../services/resumeBuilder/resumeValidationService.js";
import { INTENT_KEYS } from "../services/resumeBuilder/resumeAssistantService.js";
import { SUGGESTION_GROUPS, PRIORITIES } from "../services/resumeBuilder/resumeImprovementService.js";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), cuidLike.optional());
const name = z.string().trim().min(1).max(120);

export const resumeParams = z.object({ resumeId: cuidLike });
export const versionParams = z.object({ versionId: cuidLike });
export const improvementParams = z.object({ versionId: cuidLike, improvementId: cuidLike });

export const versionCreateSchema = z.object({
  name: name.optional(),
  /** heuristic (default) | ai — how to structure the uploaded text. */
  structure: z.enum(["heuristic", "ai"]).default("heuristic"),
  templateId: z.enum(TEMPLATE_IDS).optional(),
  /** Start from an existing version instead of the uploaded text. */
  fromVersionId: optionalId,
  /** Start from a blank document (no resumeId needed). */
  blank: z.coerce.boolean().default(false),
  jobDescriptionId: optionalId,
});

export const versionListQuerySchema = z.object({ resumeId: optionalId, ...pagination });

export const versionUpdateSchema = z
  .object({
    name: name.optional(),
    content: contentSchema.optional(),
    templateId: z.enum(TEMPLATE_IDS).optional(),
    formatting: formattingSchema.partial().optional(),
    jobDescriptionId: z.preprocess((v) => (v === "" ? null : v), cuidLike.nullable().optional()),
    targetJobTitle: z.string().trim().max(120).nullable().optional(),
    targetCompany: z.string().trim().max(120).nullable().optional(),
    /** Optimistic concurrency: reject when the row changed since the client loaded it. */
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "expectedUpdatedAt" && v[k] !== undefined), { message: "Nothing to update." });

export const duplicateSchema = z.object({ name: name.optional(), jobDescriptionId: optionalId });

export const improveSchema = z.object({
  sectionIds: z.array(z.string().min(1).max(40)).max(25).optional(),
  userNotes: z.string().trim().max(1200).optional(),
});

export const tailorSchema = z
  .object({
    jobDescriptionId: optionalId,
    jobDescription: z.string().trim().min(50, "Paste at least 50 characters of the job description.").max(20000).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(120).optional(),
    analysisId: optionalId,
    /** Save a pasted job description for reuse. */
    saveJobDescription: z.coerce.boolean().default(false),
  })
  .refine((v) => v.jobDescriptionId || v.jobDescription, { message: "Select a saved job description or paste one.", path: ["jobDescription"] });

export const improvementResolveSchema = z.object({
  action: z.enum(["accept", "reject", "edit", "reset"]),
  /** Final text for "edit" (also allowed for "accept" to tweak before applying). */
  text: z.string().trim().min(1).max(1500).optional(),
}).refine((v) => v.action !== "edit" || v.text, { message: "Provide the edited text.", path: ["text"] });

export const improvementListQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "rejected", "edited"]).optional(),
  batchId: z.string().max(40).optional(),
  group: z.enum(SUGGESTION_GROUPS).optional(),
  priority: z.enum(PRIORITIES).optional(),
});

/** Ask for a different take on one suggestion's field. */
export const regenerateSchema = z.object({
  /** Optional steer, e.g. "shorter" or "mention the migration". */
  instruction: z.string().trim().max(500).optional(),
});

// ─── Phase 11: ATS readiness, validation, roles, assistant ───────────────────

/** Category weight overrides. Each is a share of 100; the engine re-normalises. */
const weightsSchema = z.object(
  Object.fromEntries(Object.keys(ATS_WEIGHTS).map((k) => [k, z.coerce.number().min(0).max(100).optional()]))
).strict().partial();

export const atsCheckSchema = z
  .object({
    /** Score against a job: saved description, pasted text, or a prior analysis. */
    jobDescriptionId: optionalId,
    jobDescription: z.string().trim().min(50, "Paste at least 50 characters of the job description.").max(20000).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    companyName: z.string().trim().max(120).optional(),
    analysisId: optionalId,
    /** Used for baseline skills when no job description is supplied. */
    targetRole: z.string().trim().max(80).optional(),
    weights: weightsSchema.optional(),
    /** Persist the result as a history snapshot (default on). */
    save: z.coerce.boolean().default(true),
    saveJobDescription: z.coerce.boolean().default(false),
  })
  .refine((v) => !(v.jobTitle && !v.jobDescription && !v.jobDescriptionId && !v.analysisId) || true, { message: "Provide a job description to score against a job." });

export const atsHistoryQuerySchema = z.object({
  mode: z.enum(["general", "job"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const validateQuerySchema = z.object({ jobDescriptionId: optionalId, targetRole: z.string().trim().max(80).optional() });

/** Apply one safe, mechanical fix. */
export const applyFixSchema = z
  .object({
    kind: z.enum(AUTO_FIX_KINDS),
    /** Required by rename_heading. */
    sectionId: z.string().min(1).max(40).optional(),
    /** The new heading (rename_heading) or the one misspelling to correct (fix_spelling). */
    value: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.kind !== "rename_heading" || Boolean(v.sectionId), { message: "rename_heading needs the sectionId of the section to rename.", path: ["sectionId"] });

export const roleRecommendationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(6),
  save: z.coerce.boolean().default(true),
});

/** Adopt one recommended role as a target role on the career profile. */
export const selectRoleSchema = z.object({
  role: z.string().trim().min(2).max(80),
  recommendationId: optionalId,
  /** Also switch this version to the role's recommended template. */
  applyTemplate: z.coerce.boolean().default(false),
  /** Also reorder this version's sections the way the role card suggests. */
  applySectionOrder: z.coerce.boolean().default(false),
});

export const assistantSchema = z
  .object({
    intent: z.enum(INTENT_KEYS),
    question: z.string().trim().max(1000).optional(),
    sectionId: z.string().min(1).max(40).optional(),
    entryId: z.string().min(1).max(40).optional(),
    field: z.string().min(1).max(40).optional(),
    targetRole: z.string().trim().max(80).optional(),
    jobDescriptionId: optionalId,
    /** Recent turns so follow-up questions keep their context. */
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).default([]),
  })
  .refine((v) => v.intent !== "freeform" || Boolean(v.question), { message: "Type your question for the assistant.", path: ["question"] })
  .refine((v) => !v.field || Boolean(v.sectionId), { message: "A field needs its sectionId.", path: ["sectionId"] });

export const compareSchema = z.object({ otherVersionId: cuidLike });
export const restoreSchema = z.object({ fromVersionId: cuidLike });
export const qualityQuerySchema = z.object({ jobDescriptionId: optionalId });
export const exportSchema = z.object({ templateId: z.enum(TEMPLATE_IDS).optional(), formatting: formattingSchema.partial().optional() });
export const preferenceSchema = z.object({ templateId: z.enum(TEMPLATE_IDS), formatting: formattingSchema.partial().default({}) });
