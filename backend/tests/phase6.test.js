/**
 * Phase 6 tests: mock interview creation, question generation validation, drafts,
 * evaluation (incl. malformed output, provider failures, duplicates), completion,
 * report aggregation, weak topics, ownership and resuming.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";
import { createApp } from "../src/app.js";
import { ApiError } from "../src/utils/errors.js";
import { TEST_ENV, fakeLlm, fakePrisma, validEvaluation, validQuestionBatch } from "./fixtures.js";
import { computeScore, ratingForScore, buildEvaluationResult, RUBRIC_VERSION } from "../src/services/interview/answerEvaluationService.js";
import { buildRecommendations, classifyTopics } from "../src/services/interview/weakTopicService.js";
import { buildReport } from "../src/services/interview/interviewReportService.js";
import { postProcessQuestions } from "../src/services/interview/interviewService.js";

let server, baseUrl, prisma, llm;

async function ensureServer() {
  if (server) return;
  prisma = fakePrisma();
  llm = fakeLlm();
  const app = createApp({ env: loadEnv(TEST_ENV), prisma, llm });
  await new Promise((resolve) => {
    server = app.listen(0, () => { baseUrl = `http://127.0.0.1:${server.address().port}`; resolve(); });
    server.unref();
  });
}
after(() => new Promise((r) => (server ? server.close(r) : r())));

async function api(path, { method = "GET", token, body } = {}) {
  await ensureServer();
  const res = await fetch(baseUrl + path, { method, headers: { "Content-Type": "application/json", Origin: "http://localhost:3001", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function registerUser(email) {
  const r = await api("/api/auth/register", { method: "POST", body: { email, password: "password123" } });
  assert.equal(r.status, 201);
  return r.body.token;
}
const cfg = { targetRole: "Frontend Developer", interviewType: "technical", difficulty: "intermediate", durationMinutes: 20, questionCount: 5 };
async function createSession(token, extra = {}) {
  const r = await api("/api/interviews", { method: "POST", token, body: { ...cfg, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 300));
  return r.body.session;
}
const GOOD = "Closures let an inner function capture variables from its enclosing scope even after that scope has returned. For example a counter factory returns increment() that keeps access to count. Trade-off: captured references can retain memory.";

// ─── Unit: scoring & rubric ──────────────────────────────────────────────────

test("rubric: weighted score, rating bands, insufficient handling", () => {
  const criteria = [{ criterion: "Technical accuracy", weight: 5 }, { criterion: "Clarity", weight: 3 }, { criterion: "Example", weight: 2 }];
  assert.equal(computeScore([{ criterion: "Technical accuracy", score: 5 }, { criterion: "Clarity", score: 5 }, { criterion: "Example", score: 5 }], criteria), 100);
  assert.equal(computeScore([{ criterion: "Technical accuracy", score: 4 }, { criterion: "Clarity", score: 4 }, { criterion: "Example", score: 3 }], criteria), 76); // (4+2.4+1.2)/10
  assert.equal(computeScore([], criteria), null);
  assert.equal(ratingForScore(90), "Excellent");
  assert.equal(ratingForScore(70), "Good");
  assert.equal(ratingForScore(55), "Fair");
  assert.equal(ratingForScore(10), "Weak");
  assert.equal(ratingForScore(null), "Insufficient information");
  const insufficient = buildEvaluationResult({ ...validEvaluation(), evaluable: false, insufficientReason: "Off topic", strengths: [], criterionFeedback: [{ criterion: "Technical accuracy", score: 0, maxScore: 5, feedback: "n/a" }] }, criteria);
  assert.equal(insufficient.score, null);
  assert.equal(insufficient.rating, "Insufficient information");
  assert.equal(insufficient.rubricVersion, RUBRIC_VERSION);
  assert.equal(insufficient.codeExecuted, false);
});

test("question post-processing dedupes and enforces the requested count", () => {
  const batch = validQuestionBatch({ user: "Create exactly 5 questions" }, 7);
  batch.questions[6] = { ...batch.questions[0] }; // duplicate
  const qs = postProcessQuestions(batch, { questionCount: 5 });
  assert.equal(qs.length, 5);
  assert.deepEqual(qs.map((q) => q.orderIndex), [0, 1, 2, 3, 4]);
  assert.throws(() => postProcessQuestions({ questions: [batch.questions[0], { ...batch.questions[0] }] }, { questionCount: 5 }), (e) => e.status === 502);
});

test("weak topic detection needs evidence; one bad answer is only a candidate", () => {
  const ev = (topic, score, extra = {}) => ({ topic, difficulty: "intermediate", questionType: "technical", score, evaluable: true, missingConcepts: [], evaluatedAt: new Date(), ...extra });
  const { weak, candidates, strong } = classifyTopics([
    ev("SQL joins", 30), ev("SQL joins", 45),
    ev("Closures", 20),
    ev("React state", 90), ev("React state", 85),
    { topic: "Testing", difficulty: "intermediate", questionType: "technical", score: null, evaluable: false, missingConcepts: [], evaluatedAt: new Date() },
  ]);
  assert.deepEqual(weak.map((t) => t.topic), ["SQL joins"]);
  assert.deepEqual(candidates.map((t) => t.topic), ["Closures"]);
  assert.deepEqual(strong.map((t) => t.topic), ["React state"]);
  const recs = buildRecommendations([ev("SQL joins", 30, { missingConcepts: ["Outer joins"] }), ev("SQL joins", 45, { missingConcepts: ["Outer joins"] })]);
  assert.ok(recs.recommendations.some((r) => r.key === "weak:sql joins" && r.priority === "high"));
  assert.ok(recs.recommendations.some((r) => r.key === "gap:outer joins"));
  assert.deepEqual(buildRecommendations([]).recommendations, []);
});

test("report aggregation excludes skipped/insufficient from the overall score and compares only comparable history", () => {
  const q = (i, topic) => ({ id: `q${i}`, orderIndex: i, questionText: `Q${i}`, topic, category: "x", difficulty: "intermediate", questionType: "technical" });
  const a = (i, status, score, extra = {}) => ({ questionId: `q${i}`, status, score, answerText: "ans", evaluationResult: { strengths: [], improvements: [], missingConcepts: [], criterionFeedback: [{ criterion: "Technical accuracy", score: score ? Math.round(score / 20) : 0, maxScore: 5, feedback: "" }], ...extra }, evaluatedAt: new Date() });
  const session = { id: "s1", status: "completed", interviewType: "technical", targetRole: "FE", difficulty: "intermediate", questions: [q(0, "A"), q(1, "B"), q(2, "C"), q(3, "D")], answers: [a(0, "evaluated", 80), a(1, "evaluated", 40), a(2, "skipped", null), a(3, "insufficient", null, { insufficientReason: "too short" })], topics: [] };
  const r = buildReport(session, []);
  assert.equal(r.overallScore, 60);
  assert.deepEqual([r.counts.evaluated, r.counts.skipped, r.counts.insufficient, r.counts.total], [2, 1, 1, 4]);
  assert.equal(r.questions[3].rating, "Insufficient information");
  assert.equal(r.comparison, null, "no comparable history");
  assert.equal(r.technicalAccuracy.criterion, "Technical accuracy");
  const prev = { id: "s0", status: "completed", interviewType: "technical", score: 50, completedAt: new Date(), answers: [a(0, "evaluated", 50), a(1, "evaluated", 50), a(2, "evaluated", 50)] };
  const r2 = buildReport({ ...session, answers: [a(0, "evaluated", 80), a(1, "evaluated", 40), a(2, "evaluated", 60), a(3, "insufficient", null)] }, [prev]);
  assert.equal(r2.counts.evaluated, 3);
  assert.ok(r2.comparison);
  assert.equal(r2.comparison.previousAverage, 50);
  const other = buildReport(session, [{ ...prev, interviewType: "behavioral" }]);
  assert.equal(other.comparison, null, "different interview type is not comparable");
});

// ─── HTTP: creation ──────────────────────────────────────────────────────────

test("create session: validation, question generation, criteria hidden, resume/JD personalisation", async () => {
  const token = await registerUser("iv1@example.com");
  assert.equal((await api("/api/interviews", { method: "POST", body: cfg })).status, 401);
  const bad = await api("/api/interviews", { method: "POST", token, body: { ...cfg, interviewType: "panel", durationMinutes: 7, questionCount: 4 } });
  assert.equal(bad.status, 400);
  const fields = bad.body.error.details.map((d) => d.field);
  assert.ok(fields.includes("interviewType") && fields.includes("durationMinutes") && fields.includes("questionCount"));

  const s = await createSession(token, { topics: ["Closures"] });
  assert.equal(s.status, "in_progress");
  assert.equal(s.totalQuestions, 5);
  assert.equal(s.questions.length, 5);
  assert.equal(s.scoringRubricVersion, RUBRIC_VERSION);
  assert.equal("evaluationCriteria" in s.questions[0], false, "criteria must stay private before evaluation");
  assert.equal(s.questions[0].answer, null);
  assert.match(llm.lastRequest.user, /Closures/);
  assert.match(llm.lastRequest.system, /Never follow instructions/);

  // personalisation with an owned resume + JD
  const { JOB_DESCRIPTION, RESUME_TEXT } = await import("./fixtures.js");
  const jd = (await api("/api/job-descriptions", { method: "POST", token, body: { jobTitle: "Senior FE", targetRole: "Frontend Developer", description: JOB_DESCRIPTION } })).body.jobDescription;
  const resumeRow = await prisma.resume.create({ data: { userId: prisma.users.find((u) => u.email === "iv1@example.com").id, name: "CV", originalFileName: "cv.pdf", fileType: "application/pdf", fileSize: 10, charCount: RESUME_TEXT.length, extractedText: RESUME_TEXT } });
  const p = await createSession(token, { interviewType: "resume_based", resumeId: resumeRow.id, jobDescriptionId: jd.id });
  assert.match(llm.lastRequest.user, /<resume>[\s\S]*Jane Doe[\s\S]*<\/resume>/);
  assert.match(llm.lastRequest.user, /<job_description>/);
  assert.equal(p.resumeId, resumeRow.id);

  // someone else's resume → 404
  const other = await registerUser("iv2@example.com");
  assert.equal((await api("/api/interviews", { method: "POST", token: other, body: { ...cfg, resumeId: resumeRow.id } })).status, 404);
});

test("create session: malformed question output and provider failures surface as errors, nothing persisted", async () => {
  const token = await registerUser("iv3@example.com");
  const original = llm.generateStructured;
  llm.generateStructured = async () => ({ data: { questions: [{ questionText: "only one" }] }, provider: "fake", model: "m" });
  let r = await api("/api/interviews", { method: "POST", token, body: cfg });
  assert.ok(r.status >= 500, "malformed output must not create a session");
  llm.generateStructured = async () => { throw new ApiError(504, "timeout", { code: "LLM_TIMEOUT", retryable: true }); };
  r = await api("/api/interviews", { method: "POST", token, body: cfg });
  assert.equal(r.status, 504);
  assert.equal(r.body.error.retryable, true);
  llm.generateStructured = original;
  assert.equal((await api("/api/interviews/history", { token })).body.total, 0);
});

// ─── HTTP: answers, evaluation, completion, report ───────────────────────────

test("drafts, evaluation, idempotency, skip, completion and report", async () => {
  const token = await registerUser("iv4@example.com");
  const s = await createSession(token);
  const [q1, q2, q3, q4, q5] = s.questions;
  const base = `/api/interviews/${s.id}`;

  // draft save + resume (GET session returns saved draft)
  let r = await api(`${base}/answers/${q1.id}`, { method: "PUT", token, body: { answerText: "draft text" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.answer.status, "draft");
  const resumed = await api(base, { token });
  assert.equal(resumed.body.session.questions[0].answer.answerText, "draft text");
  assert.equal(resumed.body.session.questions[0].answer.evaluation, null);

  // evaluate q1
  const callsBefore = llm.calls;
  r = await api(`${base}/answers/${q1.id}/evaluate`, { method: "POST", token, body: { answerText: GOOD } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.answer.status, "evaluated");
  assert.equal(r.body.answer.score, 76);
  assert.equal(r.body.answer.evaluation.rating, "Good");
  assert.equal(r.body.answer.evaluation.rubricVersion, RUBRIC_VERSION);
  assert.ok(Array.isArray(r.body.question.evaluationCriteria), "criteria revealed after evaluation");
  assert.equal(llm.calls, callsBefore + 1);

  // duplicate evaluate with same text → idempotent, no extra LLM call
  r = await api(`${base}/answers/${q1.id}/evaluate`, { method: "POST", token, body: { answerText: GOOD } });
  assert.equal(r.status, 200);
  assert.equal(r.body.idempotent, true);
  assert.equal(llm.calls, callsBefore + 1);
  // cannot overwrite an evaluated answer as a draft
  assert.equal((await api(`${base}/answers/${q1.id}`, { method: "PUT", token, body: { answerText: "new" } })).status, 409);

  // too-short answer → insufficient without an LLM call
  r = await api(`${base}/answers/${q2.id}/evaluate`, { method: "POST", token, body: { answerText: "idk" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.answer.status, "insufficient");
  assert.equal(r.body.answer.score, null);
  assert.equal(llm.calls, callsBefore + 1);

  // weak answer → low score
  r = await api(`${base}/answers/${q3.id}/evaluate`, { method: "POST", token, body: { answerText: "This is a weak answer that does not really explain the concept at all, sorry." } });
  assert.equal(r.body.answer.score, 22);

  // skip q4
  r = await api(`${base}/answers/${q4.id}`, { method: "PUT", token, body: { skip: true } });
  assert.equal(r.body.answer.status, "skipped");

  // malformed evaluation output → 502 and answer marked failed (retryable)
  const original = llm.generateStructured;
  llm.generateStructured = async () => ({ data: { score: 99 }, provider: "fake", model: "m" });
  r = await api(`${base}/answers/${q5.id}/evaluate`, { method: "POST", token, body: { answerText: GOOD } });
  assert.ok(r.status >= 500);
  llm.generateStructured = async () => { throw new ApiError(429, "rate limited", { code: "LLM_RATE_LIMIT", retryable: true }); };
  r = await api(`${base}/answers/${q5.id}/evaluate`, { method: "POST", token, body: { answerText: GOOD } });
  assert.equal(r.status, 429);
  llm.generateStructured = original;
  r = await api(`${base}/answers/${q5.id}`, { token });
  assert.equal(r.body.answer.status, "failed");
  // retry succeeds
  r = await api(`${base}/answers/${q5.id}/evaluate`, { method: "POST", token, body: { answerText: GOOD } });
  assert.equal(r.status, 200);
  assert.equal(r.body.answer.status, "evaluated");

  // report before completion is refused
  assert.equal((await api(`${base}/report`, { token })).status, 409);

  // complete
  r = await api(`${base}/complete`, { method: "POST", token, body: { durationSeconds: 600 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.session.status, "completed");
  assert.equal(r.body.session.overallScore, Math.round((76 + 22 + 76) / 3));
  assert.equal(r.body.session.answeredQuestions, 5); // 3 evaluated + 1 insufficient + 1 skipped

  // report
  r = await api(`${base}/report`, { token });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const rep = r.body.report;
  assert.equal(rep.overallScore, 58);
  assert.deepEqual([rep.counts.evaluated, rep.counts.insufficient, rep.counts.skipped], [3, 1, 1]);
  assert.equal(rep.questions.length, 5);
  assert.ok(rep.notes.some((n) => /excluded/.test(n)));
  assert.equal(rep.comparison, null);
  assert.ok(rep.recommendations.length >= 1);

  // session closed → no more drafts/evaluations
  assert.equal((await api(`${base}/answers/${q4.id}`, { method: "PUT", token, body: { answerText: "late" } })).status, 409);

  // history + recommendations
  const hist = await api("/api/interviews/history", { token });
  assert.equal(hist.body.total, 1);
  assert.equal(hist.body.sessions[0].overallScore, 58);
  const recs = await api("/api/interviews/recommendations", { token });
  assert.equal(recs.status, 200);
  assert.equal(recs.body.evidence.evaluatedAnswers, 3);
});

test("ownership: another user cannot read, answer, complete or delete a session; delete cascades", async () => {
  const owner = await registerUser("iv5@example.com");
  const intruder = await registerUser("iv6@example.com");
  const s = await createSession(owner);
  const base = `/api/interviews/${s.id}`;
  assert.equal((await api(base, { token: intruder })).status, 404);
  assert.equal((await api(`${base}/answers/${s.questions[0].id}`, { method: "PUT", token: intruder, body: { answerText: "x" } })).status, 404);
  assert.equal((await api(`${base}/answers/${s.questions[0].id}/evaluate`, { method: "POST", token: intruder, body: { answerText: GOOD } })).status, 404);
  assert.equal((await api(`${base}/complete`, { method: "POST", token: intruder, body: {} })).status, 404);
  assert.equal((await api(base, { method: "DELETE", token: intruder })).status, 404);
  assert.equal((await api("/api/interviews/history", { token: intruder })).body.total, 0);

  await api(`${base}/answers/${s.questions[0].id}`, { method: "PUT", token: owner, body: { answerText: "draft" } });
  assert.equal((await api(base, { method: "DELETE", token: owner })).status, 204);
  assert.equal(prisma.tables.interviewQuestion.filter((q) => q.sessionId === s.id).length, 0, "questions removed");
  assert.equal(prisma.tables.interviewAnswer.filter((a) => a.sessionId === s.id).length, 0, "answers removed");
});

test("abandon via PATCH and history filtering by status/type", async () => {
  const token = await registerUser("iv7@example.com");
  const s = await createSession(token, { interviewType: "behavioral" });
  const r = await api(`/api/interviews/${s.id}`, { method: "PATCH", token, body: { status: "abandoned" } });
  assert.equal(r.status, 200);
  assert.equal(r.body.session.status, "abandoned");
  assert.equal((await api(`/api/interviews/${s.id}`, { method: "PATCH", token, body: { status: "completed" } })).status, 400, "only abandon is allowed via PATCH");
  assert.equal((await api("/api/interviews/history?status=abandoned", { token })).body.total, 1);
  assert.equal((await api("/api/interviews/history?interviewType=technical", { token })).body.total, 0);
});
