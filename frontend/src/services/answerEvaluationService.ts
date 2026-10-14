/**
 * answerEvaluationService.ts — submit an interview answer for AI evaluation (Phase 6).
 * The rubric and score never come from the browser; the backend evaluates against
 * the question's private criteria and returns the validated result.
 */
import { api } from "./api";
import type { InterviewAnswer, InterviewQuestion, ProgrammingLanguage } from "./interviewService";

export interface EvaluateResponse {
  answer: InterviewAnswer;
  question: InterviewQuestion;
  /** True when the same answer had already been evaluated and the stored result was returned. */
  idempotent?: boolean;
}

export async function evaluateAnswer(sessionId: string, questionId: string, input: { answerText: string; programmingLanguage?: ProgrammingLanguage | null }): Promise<EvaluateResponse> {
  const { data } = await api.post<EvaluateResponse>(
    `/api/interviews/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(questionId)}/evaluate`,
    input,
    { timeout: 330_000 }
  );
  return data;
}

/** Poll the stored answer until an in-flight evaluation finishes (used after a 409 EVALUATION_IN_PROGRESS). */
export async function waitForEvaluation(sessionId: string, questionId: string, { intervalMs = 5000, maxWaitMs = 330_000 } = {}): Promise<InterviewAnswer | null> {
  const { getAnswer } = await import("./interviewService");
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    const { answer } = await getAnswer(sessionId, questionId);
    if (answer && answer.status !== "evaluating") return answer;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/** Colour helpers shared by feedback and report views. */
export function scoreTone(score: number | null): "green" | "amber" | "red" | "gray" {
  if (score === null) return "gray";
  if (score >= 70) return "green";
  if (score >= 50) return "amber";
  return "red";
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
