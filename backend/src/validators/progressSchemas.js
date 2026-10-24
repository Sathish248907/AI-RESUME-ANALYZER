import { z } from "zod";
import { cuidLike, nullableDate, pagination } from "./common.js";
import { GOAL_TYPES, ANALYTICS_RANGES, DEFAULT_NOTIFICATION_PREFERENCES } from "../services/progress/progressConfig.js";
import { isValidTimeZone } from "../services/progress/streakService.js";

/** IANA timezone from the client (Intl.DateTimeFormat().resolvedOptions().timeZone); invalid → ignored. */
export const tz = z.preprocess((v) => (typeof v === "string" && isValidTimeZone(v) ? v : undefined), z.string().max(64).optional());
export const rangeQuerySchema = z.object({ range: z.enum(Object.keys(ANALYTICS_RANGES)).default("30d"), tz });
export const tzQuerySchema = z.object({ tz });
export const pointsHistoryQuerySchema = z.object({ ...pagination, eventType: z.string().trim().max(60).optional(), tz });
export const activityQuerySchema = z.object({ ...pagination, category: z.enum(["learning", "interview", "resume", "application", "career", "gamification"]).optional(), tz });
export const gamificationProfileUpdateSchema = z.object({ timezone: z.string().trim().max(64).refine(isValidTimeZone, "Unknown timezone.").optional() });

export const goalParams = z.object({ goalId: cuidLike });
export const goalCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(1000).optional()),
    goalType: z.enum(Object.keys(GOAL_TYPES)),
    linkKey: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(120).optional()),
    targetValue: z.coerce.number().int().min(1).max(100_000),
    targetDate: nullableDate,
  })
  .refine((v) => v.goalType !== "skill_practice" || Boolean(v.linkKey), { message: "Skill practice goals need the skill name in linkKey.", path: ["linkKey"] })
  .refine((v) => !["roadmap_completion", "resume_quality"].includes(v.goalType) || v.targetValue <= 100, { message: "Percent / score goals cannot exceed 100.", path: ["targetValue"] });
export const goalUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(1000).nullable().optional()),
    targetValue: z.coerce.number().int().min(1).max(100_000).optional(),
    targetDate: nullableDate,
    status: z.enum(["active", "paused", "completed", "archived"]).optional(),
    /** Only honoured for custom (manually tracked) goals. */
    currentValue: z.coerce.number().int().min(0).max(100_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");
export const goalsQuerySchema = z.object({ status: z.enum(["active", "paused", "completed", "archived"]).optional(), tz });

export const reportGenerateSchema = z.object({ periodType: z.enum(["weekly", "monthly"]).default("weekly"), offset: z.coerce.number().int().min(0).max(12).default(0), tz, force: z.coerce.boolean().default(false) });
export const reportsQuerySchema = z.object({ ...pagination, periodType: z.enum(["weekly", "monthly"]).optional() });
export const reportParams = z.object({ reportId: cuidLike });

export const notificationsQuerySchema = z.object({ ...pagination, unread: z.coerce.boolean().default(false), tz });
export const notificationParams = z.object({ notificationId: cuidLike });
export const notificationPreferencesSchema = z.object(Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).map((k) => [k, z.boolean().optional()]))).refine((v) => Object.keys(v).length > 0, "Nothing to update.");
