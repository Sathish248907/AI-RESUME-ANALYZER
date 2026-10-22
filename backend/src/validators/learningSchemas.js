import { z } from "zod";
import { cuidLike, optionalDate, nullableDate, pagination, TARGET_ROLE } from "./common.js";
import { OBJECTIVES, SKILL_LEVELS, SCHEDULES, FORMATS } from "../services/learning/learningRoadmapService.js";
import { PROFICIENCY } from "../services/learning/skillGapService.js";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), cuidLike.optional());
const idList = z.array(cuidLike).max(10).default([]);
const skillList = z.array(z.string().trim().min(2).max(60)).max(15).default([]);

export const roadmapCreateSchema = z.object({
  targetRole: TARGET_ROLE,
  currentSkillLevel: z.enum(SKILL_LEVELS),
  weeklyStudyHours: z.coerce.number().int().min(1, "At least 1 hour per week.").max(60, "At most 60 hours per week."),
  preferredSchedule: z.enum(SCHEDULES).default("flexible"),
  objective: z.enum(OBJECTIVES),
  preferredFormat: z.enum(FORMATS).default("mixed"),
  targetCompletionDate: nullableDate,
  resumeId: optionalId,
  jobDescriptionId: optionalId,
  analysisId: optionalId,
  interviewSessionIds: idList,
  useInterviewHistory: z.coerce.boolean().default(true),
  goalSkills: skillList,
  confirmedSkills: skillList,
}).refine((v) => !v.targetCompletionDate || v.targetCompletionDate.getTime() > Date.now(), { message: "Target completion date must be in the future.", path: ["targetCompletionDate"] });

export const roadmapUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    weeklyStudyHours: z.coerce.number().int().min(1).max(60).optional(),
    preferredSchedule: z.enum(SCHEDULES).optional(),
    preferredFormat: z.enum(FORMATS).optional(),
    targetCompletionDate: nullableDate,
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

/** Regenerate: preview (default) or apply. Any of the generation inputs may be overridden. */
export const roadmapRegenerateSchema = z.object({
  apply: z.coerce.boolean().default(false),
  targetRole: TARGET_ROLE.optional(),
  currentSkillLevel: z.enum(SKILL_LEVELS).optional(),
  objective: z.enum(OBJECTIVES).optional(),
  weeklyStudyHours: z.coerce.number().int().min(1).max(60).optional(),
  preferredFormat: z.enum(FORMATS).optional(),
  jobDescriptionId: optionalId,
  resumeId: optionalId,
  analysisId: optionalId,
  goalSkills: skillList,
  confirmedSkills: skillList,
  reason: z.string().trim().max(200).optional(),
});

export const roadmapListQuerySchema = z.object({ status: z.enum(["active", "archived", "superseded"]).optional(), ...pagination });
export const taskListQuerySchema = z.object({ status: z.enum(["not_started", "in_progress", "paused", "completed", "skipped"]).optional(), milestoneId: optionalId });

export const taskUpdateSchema = z
  .object({
    status: z.enum(["not_started", "in_progress", "paused", "skipped"]).optional(),
    notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable().optional()),
    scheduledDate: nullableDate,
    actualStudyMinutes: z.coerce.number().int().min(0).max(100000).optional(),
    addStudyMinutes: z.coerce.number().int().min(1).max(1440).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const taskCompleteSchema = z.object({
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable().optional()),
  actualStudyMinutes: z.coerce.number().int().min(0).max(100000).optional(),
  /** Required for checkpoint tasks of type conceptual / coding / project / checklist. */
  checkpointNotes: z.string().trim().max(4000).optional(),
  projectLink: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().url().max(2048).optional()),
  checkedItems: z.array(z.number().int().min(0).max(20)).max(20).optional(),
});

export const checkpointSubmitSchema = z.object({
  /** MCQ: { questionId: chosenOptionIndex } */
  answers: z.record(z.coerce.number().int().min(0).max(4)).optional(),
  notes: z.string().trim().max(4000).optional(),
  projectLink: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().url().max(2048).optional()),
  checkedItems: z.array(z.number().int().min(0).max(20)).max(20).optional(),
});

export const skillGapUpdateSchema = z
  .object({
    proficiencyStatus: z.enum(PROFICIENCY).optional(),
    userConfirmed: z.coerce.boolean().optional(),
    userNote: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const recommendationsQuerySchema = z.object({ availableMinutes: z.coerce.number().int().min(10).max(600).optional() });

export const taskParams = z.object({ taskId: cuidLike });
export const taskCheckpointParams = z.object({ taskId: cuidLike, checkpointId: z.string().regex(/^[a-z0-9_-]{1,40}$/i) });
export const roadmapParams = z.object({ id: cuidLike });
export const skillGapParams = z.object({ id: cuidLike });
export const recommendationParams = z.object({ id: z.string().min(1).max(120) });
export { optionalDate };
