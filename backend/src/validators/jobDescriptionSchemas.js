import { z } from "zod";
import { optionalUrl, pagination, TARGET_ROLE } from "./common.js";
import { MAX_JOB_DESCRIPTION_CHARS } from "../utils/sanitize.js";

/** Structured requirements come from the client-side Phase 3 parser; keep them bounded. */
const extractedRequirementsSchema = z
  .object({
    skills: z.array(z.object({ name: z.string().max(80), category: z.string().max(60).optional(), priority: z.string().max(20).optional() })).max(100).optional(),
    experience: z.record(z.unknown()).optional(),
    education: z.record(z.unknown()).optional(),
    certifications: z.array(z.string().max(120)).max(30).optional(),
    responsibilities: z.array(z.string().max(300)).max(40).optional(),
    keywords: z.array(z.string().max(80)).max(60).optional(),
    parserVersion: z.string().max(40).optional(),
  })
  .passthrough()
  .refine((v) => JSON.stringify(v).length <= 60_000, "extractedRequirements is too large.");

const base = {
  jobTitle: z.string().trim().min(2, "Job title is required.").max(120),
  companyName: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(120).nullable().optional()),
  targetRole: TARGET_ROLE,
  description: z.string().trim().min(100, "Job description must be at least 100 characters.").max(MAX_JOB_DESCRIPTION_CHARS),
  sourceUrl: z.preprocess((v) => (v === "" ? null : v), optionalUrl.nullable()),
  extractedRequirements: extractedRequirementsSchema.nullable().optional(),
};

export const jobDescriptionCreateSchema = z.object(base);

export const jobDescriptionUpdateSchema = z
  .object({
    jobTitle: base.jobTitle.optional(),
    companyName: base.companyName,
    targetRole: TARGET_ROLE.optional(),
    description: base.description.optional(),
    sourceUrl: base.sourceUrl,
    extractedRequirements: base.extractedRequirements,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const jobDescriptionListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  targetRole: TARGET_ROLE.optional(),
  sort: z.enum(["newest", "oldest", "title", "company"]).default("newest"),
  ...pagination,
});
