/**
 * weakTopicService.js — derives weak topics and practice recommendations from
 * persisted evaluation results. Pure functions; nothing is invented.
 *
 * A topic is "weak" only when the evidence supports it:
 *   - ≥ 2 evaluated attempts with mean score < 60, or
 *   - ≥ 3 attempts where the latest two are both < 50, or
 *   - a single attempt < 35 on a beginner/intermediate question → "candidate" (needs confirmation), never "weak".
 * Insufficient / skipped answers never count as attempts. Missing concepts that recur in ≥ 2
 * answers are surfaced as focused recommendations.
 */

export const WEAK_THRESHOLD = 60;
export const STRONG_THRESHOLD = 80;

const norm = (s) => String(s ?? "").trim().toLowerCase();
const title = (s) => String(s ?? "").trim();

/**
 * @param {Array<{ topic: string, difficulty: string, questionType: string, score: number|null, evaluable: boolean, missingConcepts: string[], evaluatedAt: string|Date }>} answers
 */
export function aggregateTopics(answers) {
  const topics = new Map();
  for (const a of answers) {
    if (!a.evaluable || typeof a.score !== "number") continue;
    const key = norm(a.topic);
    if (!key) continue;
    const t = topics.get(key) ?? { topic: title(a.topic), attempts: 0, scores: [], difficulties: [], latest: null };
    t.attempts += 1;
    t.scores.push(a.score);
    t.difficulties.push(a.difficulty);
    const at = new Date(a.evaluatedAt ?? 0).getTime();
    if (!t.latest || at > t.latest) t.latest = at;
    topics.set(key, t);
  }
  return [...topics.values()].map((t) => ({
    ...t,
    mean: Math.round(t.scores.reduce((s, v) => s + v, 0) / t.scores.length),
    best: Math.max(...t.scores),
    worst: Math.min(...t.scores),
  }));
}

export function classifyTopics(answers) {
  const agg = aggregateTopics(answers);
  const weak = [];
  const candidates = [];
  const strong = [];
  for (const t of agg) {
    const recent = t.scores.slice(-2);
    if (t.attempts >= 2 && t.mean < WEAK_THRESHOLD) weak.push(t);
    else if (t.attempts >= 3 && recent.every((s) => s < 50)) weak.push(t);
    else if (t.attempts === 1 && t.scores[0] < 35 && t.difficulties[0] !== "advanced") candidates.push(t);
    else if (t.attempts >= 2 && t.mean >= STRONG_THRESHOLD) strong.push(t);
  }
  const byMean = (a, b) => a.mean - b.mean;
  return { weak: weak.sort(byMean), candidates: candidates.sort(byMean), strong: strong.sort((a, b) => b.mean - a.mean), all: agg };
}

export function recurringMissingConcepts(answers, min = 2) {
  const counts = new Map();
  for (const a of answers) {
    if (!a.evaluable) continue;
    for (const c of a.missingConcepts ?? []) {
      const k = norm(c);
      if (!k) continue;
      const e = counts.get(k) ?? { concept: title(c), count: 0, topics: new Set() };
      e.count += 1;
      e.topics.add(title(a.topic));
      counts.set(k, e);
    }
  }
  return [...counts.values()].filter((c) => c.count >= min).sort((a, b) => b.count - a.count).map((c) => ({ concept: c.concept, count: c.count, topics: [...c.topics] }));
}

function verbFor(questionType) {
  switch (questionType) {
    case "coding": return "Practice coding problems on";
    case "project": return "Practice explaining your project work on";
    case "behavioral": return "Prepare STAR stories about";
    case "scenario": return "Work through scenarios involving";
    default: return "Review";
  }
}

/**
 * Build recommendations from the user's recorded performance (and optional explicit goals).
 * @returns {{ weakTopics, candidateTopics, strongTopics, recurringGaps, recommendations: {key, title, reason, topic, priority}[], evidence: {evaluatedAnswers: number, sessions: number} }}
 */
export function buildRecommendations(answers, { explicitTopics = [], sessionCount = 0 } = {}) {
  const { weak, candidates, strong } = classifyTopics(answers);
  const gaps = recurringMissingConcepts(answers);
  const typeByTopic = new Map();
  for (const a of answers) if (a.evaluable) typeByTopic.set(norm(a.topic), a.questionType);

  const recs = [];
  for (const t of weak) recs.push({ key: `weak:${norm(t.topic)}`, title: `${verbFor(typeByTopic.get(norm(t.topic)))} ${t.topic}`, reason: `Average ${t.mean}% over ${t.attempts} evaluated answers.`, topic: t.topic, priority: "high" });
  for (const g of gaps.slice(0, 5)) recs.push({ key: `gap:${norm(g.concept)}`, title: `Study ${g.concept}`, reason: `Marked missing in ${g.count} answers (${g.topics.slice(0, 3).join(", ")}).`, topic: g.topics[0] ?? g.concept, priority: "high" });
  for (const t of candidates) recs.push({ key: `confirm:${norm(t.topic)}`, title: `Re-attempt a question on ${t.topic}`, reason: `One low score (${t.scores[0]}%) is not enough evidence — try again to confirm.`, topic: t.topic, priority: "medium" });
  for (const g of explicitTopics) if (!recs.some((r) => norm(r.topic) === norm(g))) recs.push({ key: `goal:${norm(g)}`, title: `Practice ${g}`, reason: "You selected this topic as a practice goal.", topic: g, priority: "medium" });
  if (recs.length === 0 && answers.some((a) => a.evaluable)) recs.push({ key: "stretch", title: "Try an advanced-difficulty interview", reason: "No weak topics detected in your evaluated answers so far.", topic: null, priority: "low" });

  return {
    weakTopics: weak.map(({ topic, mean, attempts, worst, best }) => ({ topic, mean, attempts, worst, best })),
    candidateTopics: candidates.map(({ topic, mean, attempts }) => ({ topic, mean, attempts })),
    strongTopics: strong.map(({ topic, mean, attempts }) => ({ topic, mean, attempts })),
    recurringGaps: gaps,
    recommendations: recs.slice(0, 8),
    evidence: { evaluatedAnswers: answers.filter((a) => a.evaluable).length, sessions: sessionCount },
  };
}

/** Flatten persisted answers (with their questions) into the shape the functions above expect. */
export function toEvidence(answers) {
  return answers
    .filter((a) => a.question && (a.status === "evaluated" || a.status === "insufficient"))
    .map((a) => ({
      topic: a.question.topic,
      difficulty: a.question.difficulty,
      questionType: a.question.questionType,
      score: a.score,
      evaluable: a.status === "evaluated" && typeof a.score === "number",
      missingConcepts: a.evaluationResult?.missingConcepts ?? [],
      evaluatedAt: a.evaluatedAt ?? a.updatedAt,
    }));
}
