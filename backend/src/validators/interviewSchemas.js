import { z } from "zod";
import { cuidLike, optionalDate, pagination, TARGET_ROLE } from "./common.js";
import { INTERVIEW_STATUSES, INTERVIEW_TYPES } from "../models/interviewRepository.js";

export const interviewCreateSchema = z.object({
  targetRole: TARGET_ROLE,
  interviewType: z.enum(INTERVIEW_TYPES).default("mixed"),
  questionCount: z.coerce.number().int().min(1).max(100),
  completedQuestionCount: z.coerce.number().int().min(0).max(100).default(0),
  score: z.coerce.number().int().min(0).max(100).nullable().optional(),
  durationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
  status: z.enum(INTERVIEW_STATUSES).default("in_progress"),
  analysisId: z.preprocess((v) => (v === "" ? null : v), cuidLike.nullable().optional()),
}).refine((v) => v.completedQuestionCount <= v.questionCount, { message: "completedQuestionCount cannot exceed questionCount.", path: ["completedQuestionCount"] });

export const interviewUpdateSchema = z
  .object({
    completedQuestionCount: z.coerce.number().int().min(0).max(100).optional(),
    score: z.coerce.number().int().min(0).max(100).nullable().optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
    status: z.enum(INTERVIEW_STATUSES).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const interviewListQuerySchema = z.object({
  status: z.enum(INTERVIEW_STATUSES).optional(),
  from: optionalDate,
  to: optionalDate,
  ...pagination,
});
