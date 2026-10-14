/**
 * interviewService.ts — mock interview sessions (Phase 6) and the lightweight
 * practice log from the analysis Interview tab (Phase 5).
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

export const INTERVIEW_TYPES = ["technical", "hr", "coding", "resume_based", "behavioral", "mixed", "project"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  technical: "Technical Interview",
  hr: "HR Interview",
  coding: "Coding Interview",
  resume_based: "Resume-Based Interview",
  behavioral: "Behavioral Interview",
  mixed: "Mixed Interview",
  project: "Project Deep-Dive",
};
export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DURATIONS = [10, 20, 30, 45] as const;
export const QUESTION_COUNTS = [5, 10, 15] as const;
export const PROGRAMMING_LANGUAGES = ["javascript", "typescript", "python", "java", "csharp", "cpp", "go", "rust", "sql", "other"] as const;
export type ProgrammingLanguage = (typeof PROGRAMMING_LANGUAGES)[number];

export type InterviewStatus = "in_progress" | "completed" | "abandoned";
export type AnswerStatus = "draft" | "submitted" | "evaluating" | "evaluated" | "insufficient" | "skipped" | "failed";
export type QuestionType = "conceptual" | "technical" | "project" | "scenario" | "behavioral" | "coding";

export interface CriterionFeedback {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export interface AnswerEvaluation {
  rubricVersion: string;
  evaluable: boolean;
  insufficientReason: string | null;
  score: number | null;
  rating: string;
  strengths: string[];
  improvements: string[];
  missingConcepts: string[];
  incorrectStatements: string[];
  criterionFeedback: CriterionFeedback[];
  suggestedAnswer: string;
  nextPracticeTopics: string[];
  communicationNote: string | null;
  codeExecuted: boolean;
  evaluatedAt: string;
}

export interface InterviewAnswer {
  id: string;
  questionId: string;
  answerText: string;
  programmingLanguage: ProgrammingLanguage | null;
  status: AnswerStatus;
  score: number | null;
  rubricVersion: string | null;
  evaluation: AnswerEvaluation | null;
  submittedAt: string | null;
  evaluatedAt: string | null;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  orderIndex: number;
  questionText: string;
  category: string;
  topic: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  suggestedTimeSeconds: number;
  /** Only present once the answer has been evaluated (or the session completed). */
  evaluationCriteria?: { criterion: string; description: string; weight: number }[];
  answer: InterviewAnswer | null;
}

export interface InterviewSession {
  id: string;
  targetRole: string;
  interviewType: InterviewType;
  difficulty: Difficulty;
  durationMinutes: number | null;
  totalQuestions: number;
  answeredQuestions: number;
  overallScore: number | null;
  status: InterviewStatus;
  source: "mock_interview" | "practice_log";
  scoringRubricVersion: string | null;
  topics: string[];
  resumeId: string | null;
  jobDescriptionId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  questions?: InterviewQuestion[];
}

export interface InterviewHistory extends PageMeta {
  sessions: InterviewSession[];
  summary: { completed: number; questionsPracticed: number };
}

export interface CreateInterviewInput {
  targetRole: string;
  interviewType: InterviewType;
  difficulty: Difficulty;
  durationMinutes: number;
  questionCount: number;
  topics?: string[];
  weakTopics?: string[];
  resumeId?: string;
  jobDescriptionId?: string;
  useLatestAnalysis?: boolean;
}

export async function createInterview(input: CreateInterviewInput): Promise<InterviewSession> {
  const { data } = await api.post<{ session: InterviewSession }>("/api/interviews", input, { timeout: 330_000 });
  return data.session;
}

export async function getInterview(sessionId: string): Promise<InterviewSession> {
  const { data } = await api.get<{ session: InterviewSession }>(`/api/interviews/${encodeURIComponent(sessionId)}`);
  return data.session;
}

export async function getInterviewHistory(params: { status?: InterviewStatus; interviewType?: InterviewType; source?: "mock_interview" | "practice_log"; page?: number; limit?: number } = {}): Promise<InterviewHistory> {
  const { data } = await api.get<InterviewHistory>("/api/interviews/history", { params });
  return data;
}

export async function abandonInterview(sessionId: string): Promise<InterviewSession> {
  const { data } = await api.patch<{ session: InterviewSession }>(`/api/interviews/${encodeURIComponent(sessionId)}`, { status: "abandoned" });
  return data.session;
}

export async function completeInterview(sessionId: string, durationSeconds?: number): Promise<InterviewSession> {
  const { data } = await api.post<{ session: InterviewSession }>(`/api/interviews/${encodeURIComponent(sessionId)}/complete`, durationSeconds !== undefined ? { durationSeconds } : {});
  return data.session;
}

export async function deleteInterview(sessionId: string): Promise<void> {
  await api.delete(`/api/interviews/${encodeURIComponent(sessionId)}`);
}

export async function saveAnswerDraft(sessionId: string, questionId: string, input: { answerText: string; programmingLanguage?: ProgrammingLanguage | null }): Promise<InterviewAnswer> {
  const { data } = await api.put<{ answer: InterviewAnswer }>(`/api/interviews/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(questionId)}`, input);
  return data.answer;
}

export async function skipQuestion(sessionId: string, questionId: string): Promise<InterviewAnswer> {
  const { data } = await api.put<{ answer: InterviewAnswer }>(`/api/interviews/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(questionId)}`, { skip: true, answerText: "" });
  return data.answer;
}

export async function getAnswer(sessionId: string, questionId: string): Promise<{ question: InterviewQuestion; answer: InterviewAnswer | null }> {
  const { data } = await api.get<{ question: InterviewQuestion; answer: InterviewAnswer | null }>(`/api/interviews/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(questionId)}`);
  return data;
}

/** Phase 5 compatibility: lightweight practice log recorded from an analysis' Interview tab. */
export async function recordInterviewSession(input: {
  targetRole: string;
  interviewType?: "technical" | "behavioral" | "project" | "mixed";
  questionCount: number;
  completedQuestionCount: number;
  status?: InterviewStatus;
  score?: number | null;
  durationSeconds?: number | null;
  analysisId?: string | null;
}): Promise<InterviewSession> {
  const { data } = await api.post<{ session: InterviewSession }>("/api/interviews/practice-log", input);
  return data.session;
}

export async function deleteInterviewSession(id: string): Promise<void> {
  await deleteInterview(id);
}
