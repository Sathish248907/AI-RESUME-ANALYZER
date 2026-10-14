import { z } from "zod";
import { cuidLike, nullableDate, optionalDate, optionalUrl, pagination, TARGET_ROLE } from "./common.js";
import { APPLICATION_STATUSES } from "../models/applicationRepository.js";

export const statusSchema = z.enum(APPLICATION_STATUSES);

const nullableId = z.preprocess((v) => (v === "" ? null : v), cuidLike.nullable().optional());

const base = {
  companyName: z.string().trim().min(1, "Company is required.").max(120),
  jobTitle: z.string().trim().min(2, "Job title is required.").max(120),
  jobUrl: z.preprocess((v) => (v === "" ? null : v), optionalUrl.nullable()),
  applicationDate: optionalDate,
  status: statusSchema.default("INTERESTED"),
  nextFollowUpDate: nullableDate,
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(5000).nullable().optional()),
  jobDescriptionId: nullableId,
  resumeId: nullableId,
  analysisId: nullableId,
};

export const applicationCreateSchema = z.object(base);

export const applicationUpdateSchema = z
  .object({
    companyName: base.companyName.optional(),
    jobTitle: base.jobTitle.optional(),
    jobUrl: base.jobUrl,
    applicationDate: optionalDate,
    status: statusSchema.optional(),
    nextFollowUpDate: nullableDate,
    notes: base.notes,
    jobDescriptionId: nullableId,
    resumeId: nullableId,
    analysisId: nullableId,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const applicationListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z
    .preprocess((v) => (typeof v === "string" && v.includes(",") ? v.split(",").map((s) => s.trim()) : v), z.union([statusSchema, z.array(statusSchema).min(1)]))
    .optional(),
  targetRole: TARGET_ROLE.optional(),
  from: optionalDate,
  to: optionalDate,
  sort: z.enum(["newest", "oldest", "company", "followUp", "updated", "score"]).default("newest"),
  ...pagination,
});
