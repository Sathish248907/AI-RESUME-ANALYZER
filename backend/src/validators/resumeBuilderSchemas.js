import { z } from "zod";
import { cuidLike, pagination } from "./common.js";
import { contentSchema, formattingSchema, TEMPLATE_IDS } from "../services/resumeBuilder/resumeContentSchema.js";

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

export const improvementListQuerySchema = z.object({ status: z.enum(["pending", "accepted", "rejected", "edited"]).optional(), batchId: z.string().max(40).optional() });

export const compareSchema = z.object({ otherVersionId: cuidLike });
export const restoreSchema = z.object({ fromVersionId: cuidLike });
export const qualityQuerySchema = z.object({ jobDescriptionId: optionalId });
export const exportSchema = z.object({ templateId: z.enum(TEMPLATE_IDS).optional(), formatting: formattingSchema.partial().optional() });
export const preferenceSchema = z.object({ templateId: z.enum(TEMPLATE_IDS), formatting: formattingSchema.partial().default({}) });
