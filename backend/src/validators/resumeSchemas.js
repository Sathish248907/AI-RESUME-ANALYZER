import { z } from "zod";
import { pagination, TARGET_ROLE } from "./common.js";

export const resumeListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  targetRole: TARGET_ROLE.optional(),
  sort: z.enum(["newest", "oldest", "name", "role"]).default("newest"),
  ...pagination,
});

/** Multipart text fields that accompany the upload. */
export const resumeUploadFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetRole: TARGET_ROLE.optional().or(z.literal("")),
});

export const resumeUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(120).optional(),
    targetRole: z.preprocess((v) => (v === "" ? null : v), TARGET_ROLE.nullable().optional()),
  })
  .refine((v) => v.name !== undefined || v.targetRole !== undefined, { message: "Nothing to update." });
