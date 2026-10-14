import { z } from "zod";
import { cuidLike, optionalDate, pagination, TARGET_ROLE } from "./common.js";
import { INTERVIEW_STATUSES, INTERVIEW_TYPES } from "../models/interviewRepository.js";
import { DIFFICULTIES, DURATIONS, QUESTION_COUNTS } from "../services/interview/interviewService.js";
import { MAX_ANSWER_CHARS } from "../services/interview/answerEvaluationService.js";

const optionalId = z.preprocess((v) => (v === "" || v === null ? undefined : v), cuidLike.optional());
const topicList = z.array(z.string().trim().min(2).max(60)).max(10).default([]);

/** POST /api/interviews — create a mock interview and generate questions. */
export const interviewCreateSchema = z.object({
  targetRole: TARGET_ROLE,
  interviewType: z.enum(INTERVIEW_TYPES),
  difficulty: z.enum(DIFFICULTIES).default("intermediate"),
  durationMinutes: z.coerce.number().int().refine((v) => DURATIONS.includes(v), `durationMinutes must be one of ${DURATIONS.join(", ")}`),
  questionCount: z.coerce.number().int().refine((v) => QUESTION_COUNTS.includes(v), `questionCount must be one of ${QUESTION_COUNTS.join(", ")}`),
  topics: topicList,
  weakTopics: topicList,
  resumeId: optionalId,
  jobDescriptionId: optionalId,
  /** Use the user's latest AI resume analysis (matched / missing skills) for personalisation. */
  useLatestAnalysis: z.coerce.boolean().default(false),
});

/** POST /api/interviews/practice-log — Phase 5 lightweight log from the analysis Interview tab. */
export const practiceLogSchema = z
  .object({
    targetRole: TARGET_ROLE,
    interviewType: z.enum(INTERVIEW_TYPES).default("mixed"),
    questionCount: z.coerce.number().int().min(1).max(100),
    completedQuestionCount: z.coerce.number().int().min(0).max(100).default(0),
    score: z.coerce.number().int().min(0).max(100).nullable().optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
    status: z.enum(INTERVIEW_STATUSES).default("in_progress"),
    analysisId: z.preprocess((v) => (v === "" ? null : v), cuidLike.nullable().optional()),
  })
  .refine((v) => v.completedQuestionCount <= v.questionCount, { message: "completedQuestionCount cannot exceed questionCount.", path: ["completedQuestionCount"] });

/** PATCH /api/interviews/:id — limited state changes. */
export const interviewUpdateSchema = z
  .object({
    status: z.enum(["abandoned"]).optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to update." });

export const interviewCompleteSchema = z.object({
  durationSeconds: z.coerce.number().int().min(0).max(86400).optional(),
});

export const interviewListQuerySchema = z.object({
  status: z.enum(INTERVIEW_STATUSES).optional(),
  interviewType: z.enum(INTERVIEW_TYPES).optional(),
  source: z.enum(["mock_interview", "practice_log"]).optional(),
  from: optionalDate,
  to: optionalDate,
  ...pagination,
});

export const sessionQuestionParams = z.object({ sessionId: cuidLike, questionId: cuidLike });
export const sessionParams = z.object({ sessionId: cuidLike });

export const PROGRAMMING_LANGUAGES = ["javascript", "typescript", "python", "java", "csharp", "cpp", "go", "rust", "sql", "other"];

/** PUT draft */
export const answerDraftSchema = z.object({
  answerText: z.string().max(MAX_ANSWER_CHARS, `Answer exceeds ${MAX_ANSWER_CHARS} characters.`).default(""),
  programmingLanguage: z.preprocess((v) => (v === "" ? null : v), z.enum(PROGRAMMING_LANGUAGES).nullable().optional()),
  /** Mark the question as skipped instead of saving text. */
  skip: z.coerce.boolean().optional(),
});

/** POST evaluate — the body never carries a rubric or score; those live on the server. */
export const answerEvaluateSchema = z.object({
  answerText: z.string().max(MAX_ANSWER_CHARS, `Answer exceeds ${MAX_ANSWER_CHARS} characters.`).optional(),
  programmingLanguage: z.preprocess((v) => (v === "" ? null : v), z.enum(PROGRAMMING_LANGUAGES).nullable().optional()),
});
