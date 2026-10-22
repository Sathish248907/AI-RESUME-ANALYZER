import { z } from "zod";
import { cuidLike, nullableDate, TARGET_ROLE } from "./common.js";

const strList = (max, len = 60) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);
export const CAREER_LEVELS = ["student", "fresher", "junior", "mid", "experienced"];
export const WORK_MODES = ["remote", "hybrid", "onsite", "any"];

export const profileSchema = z
  .object({
    careerLevel: z.enum(CAREER_LEVELS).default("fresher"),
    targetRoles: z.array(TARGET_ROLE).min(1, "Add at least one target role.").max(5),
    industries: strList(8),
    skills: strList(40),
    locations: strList(8, 80),
    workMode: z.enum(WORK_MODES).default("any"),
    salaryMin: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
    salaryMax: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
    salaryCurrency: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").nullable().optional()),
    goals: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable().optional()),
    learningInterests: strList(15),
  })
  .refine((v) => !(v.salaryMin && v.salaryMax) || v.salaryMin <= v.salaryMax, { message: "Minimum salary cannot exceed the maximum.", path: ["salaryMax"] });

export const assessmentCreateSchema = z.object({ targetRole: TARGET_ROLE.optional() });
export const assessmentListQuerySchema = z.object({ targetRole: TARGET_ROLE.optional(), limit: z.coerce.number().int().min(1).max(50).default(30) });
export const assessmentParams = z.object({ assessmentId: cuidLike });

export const recommendationUpdateSchema = z.object({ status: z.enum(["open", "done", "dismissed"]) });
export const recommendationParams = z.object({ id: cuidLike });
export const recommendationsQuerySchema = z.object({ status: z.enum(["open", "done", "dismissed"]).optional(), refresh: z.coerce.boolean().default(false) });

export const dashboardQuerySchema = z.object({ targetRole: TARGET_ROLE.optional() });
export const interviewPrepQuerySchema = z.object({ targetRole: TARGET_ROLE.optional() });

const weight = z.coerce.number().min(0).max(100).optional();
export const jobPriorityQuerySchema = z.object({ wMatch: weight, wSkills: weight, wRelevance: weight, wPreference: weight, wUrgency: weight, includeClosed: z.coerce.boolean().default(false) });

export const planGenerateSchema = z.object({ weeklyMinutes: z.coerce.number().int().min(60).max(4000).optional() });
export const taskParams = z.object({ taskId: cuidLike });
export const taskUpdateSchema = z
  .object({
    status: z.enum(["pending", "done", "skipped"]).optional(),
    dueDate: nullableDate,
    notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()),
    title: z.string().trim().min(2).max(160).optional(),
    estimatedMinutes: z.coerce.number().int().min(5).max(600).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });
export const taskCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(600).optional(),
  category: z.enum(["learning", "interview", "resume", "application", "personal"]).default("personal"),
  estimatedMinutes: z.coerce.number().int().min(5).max(600).default(30),
  dueDate: nullableDate,
  isOptional: z.coerce.boolean().default(false),
});

export const conversationCreateSchema = z.object({ title: z.string().trim().min(1).max(120).optional(), message: z.string().trim().min(1).max(2000).optional() });
export const conversationParams = z.object({ id: cuidLike });
export const messageSchema = z.object({ content: z.string().trim().min(1, "Type a question.").max(2000, "Keep messages under 2000 characters.") });
export const conversationRenameSchema = z.object({ title: z.string().trim().min(1).max(120) });
