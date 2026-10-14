/**
 * interviewReportService.ts — completed-interview reports and practice recommendations (Phase 6).
 */
import { api } from "./api";
import type { CriterionFeedback, Difficulty, InterviewType, QuestionType } from "./interviewService";

export interface ReportQuestionRow {
  questionId: string;
  orderIndex: number;
  questionText: string;
  topic: string;
  category: string;
  difficulty: Difficulty;
  questionType: QuestionType;
  status: string;
  score: number | null;
  rating: string | null;
  answerPreview: string | null;
  strengths: string[];
  improvements: string[];
  missingConcepts: string[];
  criterionFeedback: CriterionFeedback[];
  insufficientReason: string | null;
}

export interface TopicScore {
  topic: string;
  mean: number;
  attempts: number;
}

export interface CriterionSummary {
  criterion: string;
  mean: number | null;
  maxScore: number;
  count: number;
  notes?: string[];
}

export interface Recommendation {
  key: string;
  title: string;
  reason: string;
  topic: string | null;
  priority: "high" | "medium" | "low";
}

export interface InterviewReport {
  methodVersion: string;
  rubricVersion: string | null;
  session: { id: string; targetRole: string; interviewType: InterviewType; difficulty: Difficulty; durationMinutes: number | null; status: string; startedAt: string; completedAt: string | null };
  overallScore: number | null;
  overallRating: string;
  counts: { total: number; evaluated: number; insufficient: number; skipped: number; unanswered: number; failed: number; answered: number };
  topicScores: TopicScore[];
  strongestTopics: TopicScore[];
  weakestTopics: TopicScore[];
  confirmedWeakTopics: string[];
  confirmedStrongTopics: string[];
  technicalAccuracy: CriterionSummary | null;
  communication: CriterionSummary | null;
  criterionSummary: CriterionSummary[];
  recurringGaps: { concept: string; count: number; topics: string[] }[];
  questions: ReportQuestionRow[];
  recommendations: Recommendation[];
  learningActivities: { title: string; detail: string; topic: string | null }[];
  comparison: { previousSessions: number; previousAverage: number; previousBest: number; lastScore: number; delta: number; note: string } | null;
  notes: string[];
}

export interface PracticeRecommendations {
  weakTopics: { topic: string; mean: number; attempts: number; worst: number; best: number }[];
  candidateTopics: { topic: string; mean: number; attempts: number }[];
  strongTopics: { topic: string; mean: number; attempts: number }[];
  recurringGaps: { concept: string; count: number; topics: string[] }[];
  recommendations: Recommendation[];
  evidence: { evaluatedAnswers: number; sessions: number };
}

export async function getInterviewReport(sessionId: string): Promise<InterviewReport> {
  const { data } = await api.get<{ report: InterviewReport }>(`/api/interviews/${encodeURIComponent(sessionId)}/report`);
  return data.report;
}

export async function getPracticeRecommendations(): Promise<PracticeRecommendations> {
  const { data } = await api.get<PracticeRecommendations>("/api/interviews/recommendations");
  return data;
}
