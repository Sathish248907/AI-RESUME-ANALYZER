/**
 * jobSchemas.js — request validation for Phase 12.
 *
 * Search parameters are the only place where a user's input reaches an outbound
 * provider request, so they are capped tightly: short free text, a bounded page
 * and limit, and enums for every structured filter. Ranking weights are bounded
 * numbers, which is what stops a weight of 1e9 making one factor the whole
 * score.
 *
 * `jobRef` accepts either a provider listing id (a cuid) or `jd:<cuid>` for one
 * of the user's own saved job descriptions, so every job endpoint takes one id
 * shape regardless of where the job came from.
 */
import { z } from "zod";
import { cuidLike, pagination, optionalDate } from "./common.js";
import { WORK_ARRANGEMENTS, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS } from "../services/jobs/jobNormalizer.js";
import { DEFAULT_RANKING_WEIGHTS } from "../services/jobs/jobRankingService.js";
import { ALERT_FREQUENCIES } from "../services/jobs/jobAlertService.js";
import { APPLICATION_STATUSES } from "../models/applicationRepository.js";

/** Filter enums exclude "unknown": a user filters for what a listing states. */
const arrangement = z.enum(WORK_ARRANGEMENTS.filter((a) => a !== "unknown"));
const employment = z.enum(EMPLOYMENT_TYPES.filter((a) => a !== "unknown"));
const level = z.enum(EXPERIENCE_LEVELS.filter((a) => a !== "unknown"));

const blank = (schema) => z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** A listing id, or `jd:<id>` for one of the user's own job descriptions. */
export const jobRef = z.string().regex(/^(jd:)?[a-z0-9]{20,32}$/i, "Invalid job id.");
export const jobParams = z.object({ jobId: jobRef });
export const savedJobParams = z.object({ savedJobId: cuidLike });
export const alertParams = z.object({ alertId: cuidLike });

/** Ranking weight overrides: 0–100 each, so no single factor can dominate. */
const rankingWeights = z
  .object(Object.fromEntries(Object.keys(DEFAULT_RANKING_WEIGHTS).map((k) => [k, z.coerce.number().min(0).max(100).optional()])))
  .partial()
  .optional();

/**
 * `weights.match=50` style query parameters arrive flat; accept both that and a
 * nested object so the same schema serves the query string and a JSON body.
 */
const weightsFromQuery = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    // "match:50,freshness:0"
    const out = {};
    for (const part of v.split(",")) {
      const [k, n] = part.split(":");
      if (k && n !== undefined && k.trim() in DEFAULT_RANKING_WEIGHTS) out[k.trim()] = Number(n);
    }
    return Object.keys(out).length ? out : undefined;
  }
  return undefined;
}, rankingWeights);

export const discoverQuerySchema = z.object({
  q: blank(z.string().trim().max(120)),
  location: blank(z.string().trim().max(80)),
  workArrangement: blank(arrangement),
  employmentType: blank(employment),
  experienceLevel: blank(level),
  minSalary: blank(z.coerce.number().int().min(0).max(100_000_000)),
  // Honoured only for listings whose provider supplies a reliable timestamp.
  postedWithinDays: blank(z.coerce.number().int().min(1).max(365)),
  sort: z.enum(["relevance", "newest", "match"]).default("relevance"),
  source: z.enum(["all", "provider", "own"]).default("all"),
  resumeVersionId: blank(cuidLike),
  includeHidden: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  refresh: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  weights: weightsFromQuery,
  ...pagination,
});

export const refreshSchema = z.object({
  q: blank(z.string().trim().max(120)),
  location: blank(z.string().trim().max(80)),
});

export const matchSchema = z.object({
  resumeVersionId: blank(cuidLike),
  /** Compare every version and return the best, for the "recommended version" card. */
  compareAllVersions: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  save: z.preprocess((v) => v === undefined ? true : v === true || v === "true", z.boolean()).default(true),
});

export const matchReportQuerySchema = z.object({ resumeVersionId: blank(cuidLike) });

export const savedJobListQuerySchema = z.object({
  state: blank(z.enum(["saved", "interested", "hidden"])),
});

export const saveJobSchema = z
  .object({
    jobId: jobRef,
    state: z.enum(["saved", "interested", "hidden"]).default("saved"),
    notes: blank(z.string().trim().max(2000)),
  });

export const updateSavedJobSchema = z
  .object({
    state: blank(z.enum(["saved", "interested", "hidden"])),
    notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(2000).nullable().optional()),
  })
  .refine((v) => v.state !== undefined || v.notes !== undefined, { message: "Nothing to update." });

/** Starting an application record. The record itself is a Phase 5 JobApplication. */
export const startApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).default("INTERESTED"),
  applicationDate: optionalDate,
  nextFollowUpDate: optionalDate,
  notes: blank(z.string().trim().max(2000)),
  resumeVersionId: blank(cuidLike),
  /** Create a second record for a job that already has one. */
  allowDuplicate: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

const stringList = (max, itemMax) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().trim().min(1).max(itemMax)).max(max).default([])
  );

export const preferenceSchema = z.object({
  titles: stringList(10, 80),
  skills: stringList(40, 60),
  locations: stringList(10, 80),
  workArrangements: z.array(arrangement).max(3).default([]),
  employmentTypes: z.array(employment).max(5).default([]),
  experienceLevel: z.preprocess((v) => (v === "" ? null : v), level.nullable().optional()),
  minSalary: z.preprocess((v) => (v === "" || v === null ? null : v), z.coerce.number().int().min(0).max(100_000_000).nullable().optional()),
  salaryCurrency: z.preprocess((v) => (v === "" ? null : v), z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code.").nullable().optional()),
  excludedCompanies: stringList(30, 120),
  keywords: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(200).nullable().optional()),
  rankingWeights: rankingWeights.nullable(),
});

/** An alert's saved filters: the preference shape without the weights. */
const alertQuery = z.object({
  titles: stringList(10, 80),
  skills: stringList(40, 60),
  locations: stringList(10, 80),
  workArrangements: z.array(arrangement).max(3).default([]),
  employmentTypes: z.array(employment).max(5).default([]),
  experienceLevel: z.preprocess((v) => (v === "" ? undefined : v), level.optional()),
  minSalary: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().int().min(0).max(100_000_000).optional()),
  keywords: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(200).optional()),
});

export const alertCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    query: alertQuery,
    frequency: z.enum(ALERT_FREQUENCIES).default("manual"),
    isActive: z.boolean().default(true),
  })
  .refine(
    (v) => Boolean(v.query.keywords) || v.query.titles.length > 0 || v.query.skills.length > 0,
    { message: "An alert needs at least a keyword, a job title or a skill to search for.", path: ["query"] }
  );

export const alertUpdateSchema = z
  .object({
    name: blank(z.string().trim().min(2).max(80)),
    query: alertQuery.optional(),
    frequency: blank(z.enum(ALERT_FREQUENCIES)),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const tailorSchema = z.object({
  resumeVersionId: blank(cuidLike),
  /** Save the job as a JobDescription so the Phase 8 tailoring flow can use it. */
  saveJobDescription: z.preprocess((v) => (v === undefined ? true : v === true || v === "true"), z.boolean()).default(true),
});
