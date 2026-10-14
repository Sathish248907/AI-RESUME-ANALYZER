/**
 * interviewRepository.js — sessions, questions and answers, scoped to the owner.
 * State transitions for answers are enforced here so duplicate evaluation
 * requests cannot produce inconsistent scores.
 */
import { notFound, ApiError } from "../utils/errors.js";

export const INTERVIEW_TYPES = ["technical", "hr", "coding", "resume_based", "behavioral", "mixed", "project"];
export const INTERVIEW_STATUSES = ["in_progress", "completed", "abandoned"];
export const ANSWER_STATUSES = ["draft", "submitted", "evaluating", "evaluated", "insufficient", "skipped", "failed"];
/** An "evaluating" claim older than this is treated as abandoned (e.g. the process died mid-call) and may be re-claimed. */
export const STALE_EVALUATION_MS = 6 * 60 * 1000;

const SESSION_LIST_SELECT = {
  id: true, targetRole: true, interviewType: true, difficulty: true, durationMinutes: true, questionCount: true, completedQuestionCount: true,
  score: true, status: true, source: true, scoringRubricVersion: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
};

export function createInterviewRepository(prisma) {
  async function loadSession(id, userId, { includeAnswers = true } = {}) {
    const row = await prisma.interviewSession.findFirst({
      where: { id, userId },
      include: {
        questions: { orderBy: { orderIndex: "asc" } },
        ...(includeAnswers ? { answers: true } : {}),
      },
    });
    if (!row) throw notFound("Interview session not found.");
    return row;
  }

  return {
    /** Phase 5 lightweight practice log (no questions). */
    async createPracticeLog(userId, data) {
      return prisma.interviewSession.create({ data: { userId, source: "practice_log", ...data } });
    },

    /** Full mock interview: session + generated questions in one transaction. */
    async createSession(userId, sessionData, questions) {
      return prisma.$transaction(async (tx) => {
        const session = await tx.interviewSession.create({ data: { userId, source: "mock_interview", ...sessionData, questionCount: questions.length } });
        for (const q of questions) {
          await tx.interviewQuestion.create({
            data: {
              sessionId: session.id,
              orderIndex: q.orderIndex,
              questionText: q.questionText,
              category: q.category,
              topic: q.topic,
              difficulty: q.difficulty,
              questionType: q.questionType,
              evaluationCriteria: { criteria: q.evaluationCriteria, keyPoints: q.keyPoints, sourceReference: q.sourceReference ?? null },
              suggestedTimeSeconds: q.suggestedTimeSeconds,
            },
          });
        }
        return tx.interviewSession.findFirst({ where: { id: session.id }, include: { questions: { orderBy: { orderIndex: "asc" } }, answers: true } });
      });
    },

    async listForUser(userId, { status, interviewType, source, from, to, page = 1, limit = 20 } = {}) {
      const where = {
        userId,
        ...(status ? { status } : {}),
        ...(interviewType ? { interviewType } : {}),
        ...(source ? { source } : {}),
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      };
      const [total, items] = await Promise.all([
        prisma.interviewSession.count({ where }),
        prisma.interviewSession.findMany({ where, select: SESSION_LIST_SELECT, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      ]);
      return { total, items };
    },

    findByIdForUser: loadSession,

    async updateSession(id, userId, data) {
      const result = await prisma.interviewSession.updateMany({ where: { id, userId }, data });
      if (result.count === 0) throw notFound("Interview session not found.");
      return loadSession(id, userId);
    },

    async deleteForUser(id, userId) {
      const result = await prisma.interviewSession.deleteMany({ where: { id, userId } });
      if (result.count === 0) throw notFound("Interview session not found.");
    },

    /** Ensure the question belongs to the session and the session to the user. */
    async getQuestion(sessionId, questionId, userId) {
      const session = await prisma.interviewSession.findFirst({ where: { id: sessionId, userId }, select: { id: true, status: true, questionCount: true } });
      if (!session) throw notFound("Interview session not found.");
      const question = await prisma.interviewQuestion.findFirst({ where: { id: questionId, sessionId } });
      if (!question) throw notFound("Question not found in this interview.");
      const answer = await prisma.interviewAnswer.findFirst({ where: { questionId } });
      return { session, question, answer };
    },

    /** Upsert a draft (or skip). Rejected once the answer is evaluated or the session closed. */
    async saveDraft(sessionId, questionId, userId, { answerText, programmingLanguage, status = "draft" }) {
      const { session, answer } = await this.getQuestion(sessionId, questionId, userId);
      if (session.status !== "in_progress") throw new ApiError(409, "This interview is no longer in progress.", { code: "SESSION_CLOSED" });
      if (answer && ["evaluated", "insufficient", "evaluating"].includes(answer.status)) {
        throw new ApiError(409, "This answer has already been submitted for evaluation.", { code: "ANSWER_LOCKED" });
      }
      const data = { answerText: answerText ?? "", programmingLanguage: programmingLanguage ?? null, status };
      const saved = answer
        ? await prisma.interviewAnswer.update({ where: { id: answer.id }, data })
        : await prisma.interviewAnswer.create({ data: { sessionId, questionId, ...data } });
      await this.recountAnswered(sessionId);
      return saved;
    },

    /**
     * Claim an answer for evaluation. Returns { answer, alreadyEvaluated } — when the stored answer
     * text is unchanged and already evaluated, the caller returns the existing result (idempotent).
     * A concurrent evaluation in flight yields 409.
     */
    async beginEvaluation(sessionId, questionId, userId, { answerText, programmingLanguage }) {
      const { session, answer } = await this.getQuestion(sessionId, questionId, userId);
      if (session.status !== "in_progress") throw new ApiError(409, "This interview is no longer in progress.", { code: "SESSION_CLOSED" });
      if (answer?.status === "evaluating") {
        const claimedAt = new Date(answer.submittedAt ?? answer.updatedAt).getTime();
        if (Date.now() - claimedAt < STALE_EVALUATION_MS) {
          throw new ApiError(409, "This answer is already being evaluated. Please wait for the result.", { code: "EVALUATION_IN_PROGRESS", retryable: true });
        }
        // stale claim → fall through and re-claim
      }
      if (answer && (answer.status === "evaluated" || answer.status === "insufficient") && answer.answerText === (answerText ?? answer.answerText)) {
        return { answer, alreadyEvaluated: true };
      }
      const text = answerText ?? answer?.answerText ?? "";
      const data = { answerText: text, programmingLanguage: programmingLanguage ?? answer?.programmingLanguage ?? null, status: "evaluating", submittedAt: new Date() };
      const claimed = answer
        ? await prisma.interviewAnswer.update({ where: { id: answer.id }, data })
        : await prisma.interviewAnswer.create({ data: { sessionId, questionId, ...data } });
      return { answer: claimed, alreadyEvaluated: false };
    },

    async finishEvaluation(answerId, { result, rubricVersion }) {
      const updated = await prisma.interviewAnswer.update({
        where: { id: answerId },
        data: { status: result.evaluable ? "evaluated" : "insufficient", evaluationResult: result, score: result.score, rubricVersion, evaluatedAt: new Date() },
      });
      await this.recountAnswered(updated.sessionId);
      return updated;
    },

    async failEvaluation(answerId) {
      return prisma.interviewAnswer.update({ where: { id: answerId }, data: { status: "failed" } });
    },

    async recountAnswered(sessionId) {
      const n = await prisma.interviewAnswer.count({ where: { sessionId, status: { in: ["evaluated", "insufficient", "skipped"] } } });
      await prisma.interviewSession.updateMany({ where: { id: sessionId }, data: { completedQuestionCount: n } });
      return n;
    },

    /** Mark as completed and store the overall score (mean of evaluated answers; null if none). */
    async complete(id, userId, { durationSeconds } = {}) {
      const session = await loadSession(id, userId);
      if (session.status === "completed") return session;
      const evaluated = session.answers.filter((a) => a.status === "evaluated" && typeof a.score === "number");
      const score = evaluated.length ? Math.round(evaluated.reduce((s, a) => s + a.score, 0) / evaluated.length) : null;
      const answered = session.answers.filter((a) => ["evaluated", "insufficient", "skipped"].includes(a.status)).length;
      await prisma.interviewSession.updateMany({
        where: { id, userId },
        data: { status: "completed", score, completedQuestionCount: answered, completedAt: new Date(), durationSeconds: durationSeconds ?? Math.max(0, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)) },
      });
      return loadSession(id, userId);
    },

    /** Completed sessions with answers+questions for history comparison and weak-topic detection. */
    async loadCompletedForUser(userId, { limit = 30 } = {}) {
      return prisma.interviewSession.findMany({
        where: { userId, status: "completed", source: "mock_interview" },
        include: { answers: true, questions: true },
        orderBy: { completedAt: "desc" },
        take: limit,
      });
    },

    async loadEvaluatedAnswersForUser(userId, { limit = 200 } = {}) {
      const sessions = await prisma.interviewSession.findMany({
        where: { userId, source: "mock_interview" },
        include: { answers: { where: { status: { in: ["evaluated", "insufficient"] } } }, questions: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const out = [];
      for (const s of sessions) {
        const qById = new Map(s.questions.map((q) => [q.id, q]));
        for (const a of s.answers) out.push({ ...a, question: qById.get(a.questionId), sessionId: s.id });
      }
      return { answers: out.slice(0, limit), sessionCount: sessions.length };
    },
  };
}

export function serializeSession(row, { includeQuestions = true, revealCriteria = false, publicQuestion } = {}) {
  const answers = new Map((row.answers ?? []).map((a) => [a.questionId, a]));
  return {
    id: row.id,
    targetRole: row.targetRole,
    interviewType: row.interviewType,
    difficulty: row.difficulty,
    durationMinutes: row.durationMinutes,
    totalQuestions: row.questionCount,
    answeredQuestions: row.completedQuestionCount,
    overallScore: row.score,
    status: row.status,
    source: row.source,
    scoringRubricVersion: row.scoringRubricVersion,
    topics: row.topics ?? [],
    resumeId: row.resumeId ?? null,
    jobDescriptionId: row.jobDescriptionId ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(includeQuestions && row.questions
      ? {
          questions: row.questions.map((q) => {
            const a = answers.get(q.id);
            const evaluated = a && (a.status === "evaluated" || a.status === "insufficient");
            return {
              ...publicQuestion(q, { revealCriteria: revealCriteria || Boolean(evaluated) }),
              answer: a ? serializeAnswer(a) : null,
            };
          }),
        }
      : {}),
  };
}

/** Feedback is only included once the answer has been evaluated. */
export function serializeAnswer(a) {
  const done = a.status === "evaluated" || a.status === "insufficient";
  return {
    id: a.id,
    questionId: a.questionId,
    answerText: a.answerText,
    programmingLanguage: a.programmingLanguage,
    status: a.status,
    score: done ? a.score : null,
    rubricVersion: a.rubricVersion,
    evaluation: done ? a.evaluationResult : null,
    submittedAt: a.submittedAt,
    evaluatedAt: a.evaluatedAt,
    updatedAt: a.updatedAt,
  };
}
