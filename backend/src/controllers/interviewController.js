import { ApiError } from "../utils/errors.js";
import { pageMeta } from "../validators/common.js";
import { serializeAnswer, serializeSession } from "../models/interviewRepository.js";
import { generateInterviewQuestions, publicQuestion } from "../services/interview/interviewService.js";
import { evaluateAnswer, RUBRIC_VERSION } from "../services/interview/answerEvaluationService.js";
import { buildReport } from "../services/interview/interviewReportService.js";
import { buildRecommendations, toEvidence } from "../services/interview/weakTopicService.js";
import { logger } from "../utils/logger.js";

/**
 * @param {{ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm: Function }} deps
 */
export function createInterviewController({ repo, resumeRepo, jobDescriptionRepo, analysisRepo, getLlm }) {
  const view = (row, opts = {}) => serializeSession(row, { publicQuestion, ...opts });

  /** Gather authorised personalisation inputs (owner-checked by the repositories). */
  async function personalisation(userId, body) {
    let resumeText = null;
    let jobDescription = null;
    let analysisSummary = null;
    if (body.resumeId) resumeText = (await resumeRepo.findByIdForUser(body.resumeId, userId)).extractedText;
    if (body.jobDescriptionId) jobDescription = (await jobDescriptionRepo.findByIdForUser(body.jobDescriptionId, userId)).description;
    if (body.useLatestAnalysis) {
      const { items } = await analysisRepo.listForUser(userId, { mode: "ai", limit: 1, page: 1, sort: "newest" });
      if (items[0]) {
        const full = await analysisRepo.findByIdForUser(items[0].id, userId);
        analysisSummary = {
          matchedSkills: (full.result?.matchedSkills ?? []).map((s) => s.name),
          missingSkills: (full.result?.missingOrUnverifiedSkills ?? []).map((s) => s.name),
        };
        if (!resumeText && full.resume?.extractedText) resumeText = full.resume.extractedText;
        if (!jobDescription && full.jobDescription) jobDescription = full.jobDescription;
      }
    }
    return { resumeText, jobDescription, analysisSummary };
  }

  return {
    /** POST /api/interviews */
    async create(req, res, next) {
      try {
        const llm = getLlm();
        const body = req.body;
        const extra = await personalisation(req.user.id, body);
        const { questions, provider, model } = await generateInterviewQuestions(llm, {
          targetRole: body.targetRole,
          interviewType: body.interviewType,
          difficulty: body.difficulty,
          questionCount: body.questionCount,
          durationMinutes: body.durationMinutes,
          topics: body.topics,
          weakTopics: body.weakTopics,
          ...extra,
        });
        const session = await repo.createSession(
          req.user.id,
          {
            targetRole: body.targetRole,
            interviewType: body.interviewType,
            difficulty: body.difficulty,
            durationMinutes: body.durationMinutes,
            topics: [...body.topics, ...body.weakTopics],
            resumeId: body.resumeId ?? null,
            jobDescriptionId: body.jobDescriptionId ?? null,
            scoringRubricVersion: RUBRIC_VERSION,
          },
          questions
        );
        logger.info("interview created", { sessionId: session.id, questions: questions.length, provider, model });
        res.status(201).json({ session: view(session) });
      } catch (err) {
        next(err);
      }
    },

    /** POST /api/interviews/practice-log (Phase 5 compatibility) */
    async createPracticeLog(req, res, next) {
      try {
        const data = { ...req.body, questionCount: req.body.questionCount };
        if (data.status === "completed") data.completedAt = new Date();
        const row = await repo.createPracticeLog(req.user.id, data);
        res.status(201).json({ session: view(row, { includeQuestions: false }) });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/interviews/history */
    async history(req, res, next) {
      try {
        const { page, limit } = req.query;
        const { total, items } = await repo.listForUser(req.user.id, req.query);
        const completed = items.filter((s) => s.status === "completed");
        res.json({
          sessions: items.map((s) => view(s, { includeQuestions: false })),
          summary: { completed: completed.length, questionsPracticed: completed.reduce((s, i) => s + (i.completedQuestionCount ?? 0), 0) },
          ...pageMeta(page, limit, total),
        });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/interviews/recommendations */
    async recommendations(req, res, next) {
      try {
        const { answers, sessionCount } = await repo.loadEvaluatedAnswersForUser(req.user.id);
        res.json(buildRecommendations(toEvidence(answers), { sessionCount }));
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/interviews/:sessionId */
    async getOne(req, res, next) {
      try {
        const session = await repo.findByIdForUser(req.params.sessionId, req.user.id);
        res.json({ session: view(session, { revealCriteria: session.status === "completed" }) });
      } catch (err) {
        next(err);
      }
    },

    /** PATCH /api/interviews/:sessionId */
    async update(req, res, next) {
      try {
        const data = { ...req.body };
        if (data.status === "abandoned") data.completedAt = new Date();
        const session = await repo.updateSession(req.params.sessionId, req.user.id, data);
        res.json({ session: view(session) });
      } catch (err) {
        next(err);
      }
    },

    /** POST /api/interviews/:sessionId/complete */
    async complete(req, res, next) {
      try {
        const session = await repo.complete(req.params.sessionId, req.user.id, req.body ?? {});
        res.json({ session: view(session, { revealCriteria: true }) });
      } catch (err) {
        next(err);
      }
    },

    /** DELETE /api/interviews/:sessionId — removes the session, its questions and answers. */
    async remove(req, res, next) {
      try {
        await repo.deleteForUser(req.params.sessionId, req.user.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    /** PUT /api/interviews/:sessionId/answers/:questionId */
    async saveDraft(req, res, next) {
      try {
        const { sessionId, questionId } = req.params;
        const status = req.body.skip ? "skipped" : "draft";
        const answer = await repo.saveDraft(sessionId, questionId, req.user.id, { answerText: req.body.answerText, programmingLanguage: req.body.programmingLanguage, status });
        res.json({ answer: serializeAnswer(answer) });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/interviews/:sessionId/answers/:questionId */
    async getAnswer(req, res, next) {
      try {
        const { sessionId, questionId } = req.params;
        const { question, answer } = await repo.getQuestion(sessionId, questionId, req.user.id);
        const evaluated = answer && (answer.status === "evaluated" || answer.status === "insufficient");
        res.json({ question: publicQuestion(question, { revealCriteria: Boolean(evaluated) }), answer: answer ? serializeAnswer(answer) : null });
      } catch (err) {
        next(err);
      }
    },

    /** POST /api/interviews/:sessionId/answers/:questionId/evaluate */
    async evaluate(req, res, next) {
      const { sessionId, questionId } = req.params;
      let claimed = null;
      try {
        const llm = getLlm();
        const { question } = await repo.getQuestion(sessionId, questionId, req.user.id);
        const { answer, alreadyEvaluated } = await repo.beginEvaluation(sessionId, questionId, req.user.id, { answerText: req.body.answerText, programmingLanguage: req.body.programmingLanguage });
        if (alreadyEvaluated) {
          return res.json({ answer: serializeAnswer(answer), question: publicQuestion(question, { revealCriteria: true }), idempotent: true });
        }
        claimed = answer;
        const { result } = await evaluateAnswer(llm, question, { answerText: answer.answerText, programmingLanguage: answer.programmingLanguage });
        const saved = await repo.finishEvaluation(answer.id, { result, rubricVersion: RUBRIC_VERSION });
        res.json({ answer: serializeAnswer(saved), question: publicQuestion(question, { revealCriteria: true }) });
      } catch (err) {
        if (claimed) await repo.failEvaluation(claimed.id).catch(() => {});
        next(err instanceof ApiError ? err : err);
      }
    },

    /** GET /api/interviews/:sessionId/report */
    async report(req, res, next) {
      try {
        const session = await repo.findByIdForUser(req.params.sessionId, req.user.id);
        if (session.status !== "completed") throw new ApiError(409, "Complete the interview to view its report.", { code: "SESSION_NOT_COMPLETED" });
        const previous = await repo.loadCompletedForUser(req.user.id);
        res.json({ report: buildReport(session, previous) });
      } catch (err) {
        next(err);
      }
    },
  };
}
