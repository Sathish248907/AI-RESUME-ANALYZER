/**
 * applicationWorkspaceSchemas.js — request validation for Phase 13.
 *
 * Free text is capped everywhere it reaches the database or a prompt, reminder
 * times must carry a real IANA zone (an invalid one would silently become UTC
 * and move the reminder), and the status-change schema requires an explicit
 * `confirmUnusual` for a transition the workflow calls unusual — so an odd move
 * is always deliberate rather than accidental.
 */
import { z } from "zod";
import { cuidLike, optionalDate, dateInput, httpUrl } from "./common.js";
import { APPLICATION_STATUSES } from "../models/applicationRepository.js";
import { CHECKLIST_CATEGORIES, COMPLETION_SOURCES } from "../services/applications/applicationChecklistService.js";
import { TONES, LENGTHS } from "../services/applications/coverLetterService.js";
import { DOCUMENT_CATEGORIES } from "../services/applications/applicationDocumentService.js";
import { REMINDER_TYPES, REMINDER_STATUSES } from "../services/applications/applicationReminderService.js";
import { OUTCOMES } from "../services/applications/applicationStatusService.js";
import { isValidTimeZone } from "../services/progress/streakService.js";

const blank = (schema) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());
const timezone = z.string().trim().max(64).refine(isValidTimeZone, "Unknown timezone.");

export const applicationParams = z.object({ applicationId: cuidLike });
export const checklistItemParams = z.object({ applicationId: cuidLike, itemId: cuidLike });
export const coverLetterParams = z.object({ coverLetterId: cuidLike });
export const documentParams = z.object({ documentId: cuidLike });
export const reminderParams = z.object({ reminderId: cuidLike });
export const interviewParams = z.object({ interviewId: cuidLike });

export const workspaceQuerySchema = z.object({ tz: blank(timezone) });

// ── Checklist ────────────────────────────────────────────────────────────────

export const checklistCreateSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: blank(z.string().trim().max(600)),
  category: z.enum(CHECKLIST_CATEGORIES).default("research"),
  isRequired: z.boolean().default(false),
});

export const checklistUpdateSchema = z
  .object({
    completed: z.boolean().optional(),
    /** Who verified it. Required when completing, so the distinction is explicit. */
    completionSource: blank(z.enum(COMPLETION_SOURCES)),
    title: blank(z.string().trim().min(2).max(160)),
    description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(600).nullable().optional()),
    isRequired: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." })
  .refine((v) => v.completed !== true || Boolean(v.completionSource), {
    message: "Say whether this was completed in the app or elsewhere.",
    path: ["completionSource"],
  });

// ── Cover letters ────────────────────────────────────────────────────────────

export const coverLetterCreateSchema = z.object({
  resumeVersionId: blank(cuidLike),
  jobDescriptionId: blank(cuidLike),
  title: blank(z.string().trim().min(2).max(160)),
  tone: z.enum(TONES).default("professional"),
  lengthTarget: z.enum(LENGTHS).default("standard"),
  userNotes: blank(z.string().trim().max(2000)),
  /** Improve this text rather than drafting from scratch. */
  existingText: blank(z.string().trim().max(8000)),
  /** Skip the model and store text the user wrote themselves. */
  content: blank(z.string().trim().max(12000)),
});

export const coverLetterUpdateSchema = z
  .object({
    title: blank(z.string().trim().min(2).max(160)),
    content: blank(z.string().trim().min(1).max(12000)),
    tone: blank(z.enum(TONES)),
    lengthTarget: blank(z.enum(LENGTHS)),
    status: blank(z.enum(["draft", "approved"])),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const coverLetterRegenerateSchema = z.object({
  paragraphText: z.string().trim().min(10).max(2000),
  instruction: blank(z.string().trim().max(400)),
});

// ── Documents ────────────────────────────────────────────────────────────────

export const documentCreateSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES).default("other"),
  note: blank(z.string().trim().max(500)),
  /** Present for a link-type document; a file arrives as multipart instead. */
  url: blank(httpUrl),
});

export const documentQuerySchema = z.object({
  /** Render inline (preview) rather than as a download. */
  inline: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

// ── Status ───────────────────────────────────────────────────────────────────

export const statusChangeSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: blank(z.string().trim().max(1000)),
  /** Required to accept a transition the workflow flags as unusual. */
  confirmUnusual: z.boolean().default(false),
  outcome: z.preprocess((v) => (v === "" ? null : v), z.enum(OUTCOMES).nullable().optional()),
});

export const activityCreateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  detail: blank(z.string().trim().max(2000)),
  type: z.enum(["note", "follow_up", "submitted", "interview_completed"]).default("note"),
  occurredAt: optionalDate,
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// ── Reminders ────────────────────────────────────────────────────────────────

export const reminderCreateSchema = z.object({
  applicationId: blank(cuidLike),
  interviewId: blank(cuidLike),
  type: z.enum(REMINDER_TYPES).default("custom"),
  title: z.string().trim().min(2).max(160),
  note: blank(z.string().trim().max(600)),
  dueAt: dateInput,
  timezone,
});

export const reminderUpdateSchema = z
  .object({
    title: blank(z.string().trim().min(2).max(160)),
    note: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(600).nullable().optional()),
    dueAt: z.preprocess((v) => (v === "" || v === null ? undefined : v), dateInput.optional()),
    timezone: blank(timezone),
    status: blank(z.enum(REMINDER_STATUSES)),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const reminderQuerySchema = z.object({
  status: blank(z.enum(REMINDER_STATUSES)),
  applicationId: blank(cuidLike),
  tz: blank(timezone),
});

// ── Interview rounds ─────────────────────────────────────────────────────────

const interviewerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: blank(z.string().trim().max(120)),
});

export const interviewCreateSchema = z.object({
  stage: z.enum(["screening", "technical", "system_design", "behavioral", "onsite", "final", "other"]).default("screening"),
  scheduledAt: optionalDate,
  timezone: blank(timezone),
  durationMinutes: blank(z.coerce.number().int().min(5).max(600)),
  mode: z.enum(["video", "phone", "onsite", "take_home"]).default("video"),
  /** A meeting link or address the user pastes; never used to contact anyone. */
  location: blank(z.string().trim().max(500)),
  interviewers: z.array(interviewerSchema).max(10).default([]),
  preparationNotes: blank(z.string().trim().max(4000)),
  mockSessionId: blank(cuidLike),
  /** Create a reminder for this round at the same time. */
  createReminder: z.boolean().default(false),
});

export const interviewUpdateSchema = z
  .object({
    stage: blank(z.enum(["screening", "technical", "system_design", "behavioral", "onsite", "final", "other"])),
    scheduledAt: z.preprocess((v) => (v === "" ? null : v), dateInput.nullable().optional()),
    timezone: blank(timezone),
    durationMinutes: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().int().min(5).max(600).nullable().optional()),
    mode: blank(z.enum(["video", "phone", "onsite", "take_home"])),
    location: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
    interviewers: z.array(interviewerSchema).max(10).optional(),
    preparationNotes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable().optional()),
    mockSessionId: z.preprocess((v) => (v === "" ? null : v), cuidLike.nullable().optional()),
    outcome: blank(z.enum(["scheduled", "completed", "passed", "rejected", "cancelled", "no_response"])),
    feedback: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(4000).nullable().optional()),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const readinessSchema = z.object({
  resumeVersionId: blank(cuidLike),
});
