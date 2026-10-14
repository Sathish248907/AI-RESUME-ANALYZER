/**
 * interviewReportService.js — builds the final report from persisted answers.
 *
 * Aggregation method (documented, versioned with the rubric):
 *   - overallScore = arithmetic mean of `score` over answers with status "evaluated" (0–100, rounded).
 *     Skipped, insufficient and failed answers are excluded and reported separately — never counted as 0 or 100.
 *   - Topic scores = mean per topic over evaluated answers; strongest/weakest require ≥ 1 evaluated answer
 *     and are only labelled "weak"/"strong" against the thresholds in weakTopicService.
 *   - Criterion summaries = mean of criterion scores (0–5) grouped by criterion name, so "Technical accuracy"
 *     or "Clarity" can be read across questions that share the criterion. Criteria are never averaged across
 *     different names.
 *   - Comparison with history uses only completed sessions of the same interview type with ≥ 3 evaluated answers.
 */
import { classifyTopics, recurringMissingConcepts, buildRecommendations, toEvidence } from "./weakTopicService.js";
import { ratingForScore } from "./answerEvaluationService.js";

export const REPORT_METHOD_VERSION = "interview-report-1.0";
const MIN_EVALUATED_FOR_COMPARISON = 3;

function mean(values) {
  return values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;
}

/**
 * @param {object} session   InterviewSession with `questions` (ordered) and `answers`
 * @param {object[]} previousSessions  completed sessions of the same user (with answers) for comparison
 */
export function buildReport(session, previousSessions = []) {
  const answersByQ = new Map((session.answers ?? []).map((a) => [a.questionId, a]));
  const rows = (session.questions ?? [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((q) => {
      const a = answersByQ.get(q.id) ?? null;
      const status = !a ? "unanswered" : a.status;
      return {
        questionId: q.id,
        orderIndex: q.orderIndex,
        questionText: q.questionText,
        topic: q.topic,
        category: q.category,
        difficulty: q.difficulty,
        questionType: q.questionType,
        status,
        score: a?.status === "evaluated" ? a.score : null,
        rating: a?.status === "evaluated" ? ratingForScore(a.score) : status === "insufficient" ? "Insufficient information" : null,
        answerPreview: a?.answerText ? a.answerText.slice(0, 200) : null,
        strengths: a?.evaluationResult?.strengths ?? [],
        improvements: a?.evaluationResult?.improvements ?? [],
        missingConcepts: a?.evaluationResult?.missingConcepts ?? [],
        criterionFeedback: a?.evaluationResult?.criterionFeedback ?? [],
        insufficientReason: a?.evaluationResult?.insufficientReason ?? null,
      };
    });

  const evaluated = rows.filter((r) => r.status === "evaluated" && typeof r.score === "number");
  const counts = {
    total: rows.length,
    evaluated: evaluated.length,
    insufficient: rows.filter((r) => r.status === "insufficient").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    unanswered: rows.filter((r) => r.status === "unanswered" || r.status === "draft" || r.status === "submitted").length,
    failed: rows.filter((r) => r.status === "failed" || r.status === "evaluating").length,
  };
  counts.answered = counts.evaluated + counts.insufficient;

  const overallScore = mean(evaluated.map((r) => r.score));

  // Topic breakdown
  const evidence = toEvidence((session.answers ?? []).map((a) => ({ ...a, question: session.questions.find((q) => q.id === a.questionId) })));
  const { weak, strong, all } = classifyTopics(evidence);
  const topicScores = all.map((t) => ({ topic: t.topic, mean: t.mean, attempts: t.attempts })).sort((a, b) => b.mean - a.mean);

  // Criterion summaries across questions (same criterion name only)
  const crit = new Map();
  for (const r of evaluated) {
    for (const c of r.criterionFeedback) {
      const k = c.criterion.toLowerCase();
      const e = crit.get(k) ?? { criterion: c.criterion, scores: [] };
      e.scores.push(c.score);
      crit.set(k, e);
    }
  }
  const criterionSummary = [...crit.values()].map((c) => ({ criterion: c.criterion, mean: Math.round((c.scores.reduce((s, v) => s + v, 0) / c.scores.length) * 10) / 10, maxScore: 5, count: c.scores.length }));
  const findCriterion = (rx) => criterionSummary.find((c) => rx.test(c.criterion)) ?? null;
  const technicalAccuracy = findCriterion(/accura|correct/i);
  const communication = findCriterion(/clarit|communicat|structure/i);
  const communicationNotes = (session.answers ?? []).map((a) => a.evaluationResult?.communicationNote).filter(Boolean).slice(0, 5);

  // Comparison with history
  const comparable = previousSessions.filter((s) => s.id !== session.id && s.status === "completed" && s.interviewType === session.interviewType && typeof s.score === "number" && (s.answers ?? []).filter((a) => a.status === "evaluated").length >= MIN_EVALUATED_FOR_COMPARISON);
  const comparison = comparable.length && overallScore !== null && evaluated.length >= MIN_EVALUATED_FOR_COMPARISON
    ? {
        previousSessions: comparable.length,
        previousAverage: mean(comparable.map((s) => s.score)),
        previousBest: Math.max(...comparable.map((s) => s.score)),
        lastScore: comparable.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0].score,
        delta: overallScore - mean(comparable.map((s) => s.score)),
        note: `Compared with ${comparable.length} previous completed ${session.interviewType} interview${comparable.length === 1 ? "" : "s"} with at least ${MIN_EVALUATED_FOR_COMPARISON} evaluated answers.`,
      }
    : null;

  const recs = buildRecommendations(evidence, { explicitTopics: Array.isArray(session.topics) ? session.topics : [] });

  return {
    methodVersion: REPORT_METHOD_VERSION,
    rubricVersion: session.scoringRubricVersion ?? null,
    session: {
      id: session.id,
      targetRole: session.targetRole,
      interviewType: session.interviewType,
      difficulty: session.difficulty,
      durationMinutes: session.durationMinutes,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    overallScore,
    overallRating: ratingForScore(overallScore),
    counts,
    topicScores,
    strongestTopics: topicScores.filter((t) => t.mean >= 80).slice(0, 5),
    weakestTopics: [...topicScores].reverse().filter((t) => t.mean < 60).slice(0, 5),
    confirmedWeakTopics: weak.map((t) => t.topic),
    confirmedStrongTopics: strong.map((t) => t.topic),
    technicalAccuracy,
    communication: communication ? { ...communication, notes: communicationNotes } : communicationNotes.length ? { criterion: "Clarity (from feedback notes)", mean: null, maxScore: 5, count: 0, notes: communicationNotes } : null,
    criterionSummary,
    recurringGaps: recurringMissingConcepts(evidence, 2),
    questions: rows,
    recommendations: recs.recommendations,
    learningActivities: suggestLearningActivities(recs, session),
    comparison,
    notes: [
      "Scores are estimates of answer quality against the question rubric, not predictions of interview success.",
      counts.insufficient ? `${counts.insufficient} answer${counts.insufficient === 1 ? " was" : "s were"} too short or off-topic to evaluate and ${counts.insufficient === 1 ? "is" : "are"} excluded from the overall score.` : null,
      counts.skipped ? `${counts.skipped} skipped question${counts.skipped === 1 ? "" : "s"} ${counts.skipped === 1 ? "is" : "are"} excluded from the overall score.` : null,
    ].filter(Boolean),
  };
}

function suggestLearningActivities(recs, session) {
  const acts = [];
  for (const r of recs.recommendations.slice(0, 3)) {
    if (r.key.startsWith("weak:") || r.key.startsWith("gap:")) acts.push({ title: `Explain ${r.topic} out loud for 2 minutes`, detail: "Record yourself, then compare with the suggested answers from this interview.", topic: r.topic });
  }
  if (session.interviewType === "coding" || recs.recommendations.some((r) => /coding/i.test(r.title))) acts.push({ title: "Solve two timed coding problems", detail: "Pick problems on your weakest topic; write the approach before the code.", topic: null });
  if (["behavioral", "hr", "mixed"].includes(session.interviewType)) acts.push({ title: "Draft three STAR stories", detail: "Situation, task, action, result — one each for conflict, failure and leadership.", topic: null });
  if (acts.length === 0) acts.push({ title: "Run a harder interview", detail: "Increase the difficulty or pick a different interview type to find new gaps.", topic: null });
  return acts.slice(0, 4);
}
