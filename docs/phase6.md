# Phase 6 — AI Mock Interviews & Answer Evaluation

Signed-in users configure a mock interview, the backend generates personalised questions with the
configured LLM provider, answers are evaluated against per-question rubrics, and a report with weak
topics and recommendations is built from the persisted results. No AI credentials reach the browser.

## Database changes (`backend/prisma/migrations/20261014120000_phase6_mock_interviews/`, additive, 11 statements)

| Model (table) | Notes |
|---|---|
| `InterviewSession` (`api_interview_sessions`, extended) | New: `difficulty`, `durationMinutes`, `scoringRubricVersion`, `resumeId`, `jobDescriptionId`, `topics` (Json), `source` (`mock_interview` \| `practice_log`), `startedAt`, `updatedAt`, index `(userId, targetRole)`. Spec names map to existing columns: `totalQuestions` = `questionCount`, `answeredQuestions` = `completedQuestionCount`, `overallScore` = `score`. |
| `InterviewQuestion` (`api_interview_questions`, new) | `orderIndex`, `questionText`, `category`, `topic`, `difficulty`, `questionType`, private `evaluationCriteria` (Json: criteria + key points), `suggestedTimeSeconds`. Unique `(sessionId, orderIndex)`. Cascade on session delete. |
| `InterviewAnswer` (`api_interview_answers`, new) | One per question (`questionId` unique). `answerText`, `programmingLanguage`, `status` (`draft` → `evaluating` → `evaluated` \| `insufficient` \| `failed`, or `skipped`), `evaluationResult` (Json), `score`, `rubricVersion`, `submittedAt`, `evaluatedAt`. Cascade on session/question delete. |

**Retention:** questions, answers and feedback live exactly as long as their session; `DELETE /api/interviews/:sessionId` removes everything. Resume / job-description text is read at generation time from the owning rows and is not copied onto the session (only the ids are stored).

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## Scoring rubric (versioned: `interview-rubric-1.0`, stored on each evaluated answer)

- Each question carries 2–6 private criteria with weights 1–5, written at generation time.
- The model scores every criterion 0–5 and writes feedback; the model's own overall number is ignored.
- Server-side score = Σ(criterion score / 5 × weight) / Σ(weight) × 100, rounded.
- Rating bands: 85–100 Excellent · 70–84 Good · 50–69 Fair · 30–49 Needs work · 0–29 Weak.
- `insufficient` (no score) when the answer is empty / off-topic / too short (< 15 chars never reaches the model).
- Incorrect statements are reported separately from missing concepts; alternative valid approaches are accepted; code is evaluated as text (`codeExecuted: false`) — no execution service exists.

## Report aggregation (`interview-report-1.0`)

Overall = mean of **evaluated** answers only. Skipped / insufficient / unanswered are counted and listed separately, never scored 0 or 100. Topic means per topic; criterion summaries average only identical criterion names. Comparison with history appears only when a previous completed interview of the same type has ≥ 3 evaluated answers.

## Weak-topic detection (`weakTopicService.js`)

Weak = ≥ 2 evaluated attempts with mean < 60, or ≥ 3 attempts with the latest two < 50. A single low score is only a "needs another attempt" candidate. Recurring missing concepts (≥ 2 answers) become focused recommendations. Insufficient and skipped answers are never evidence.

## API (all require `Authorization: Bearer <jwt>`; ownership enforced on every query)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/interviews` | create session + generate questions. Body: `targetRole`, `interviewType` (technical\|hr\|coding\|resume_based\|behavioral\|mixed\|project), `difficulty`, `durationMinutes` (10\|20\|30\|45), `questionCount` (5\|10\|15), `topics[]`, `weakTopics[]`, `resumeId?`, `jobDescriptionId?`, `useLatestAnalysis?`. Rate-limited. |
| POST | `/api/interviews/practice-log` | Phase 5 lightweight log (moved from `POST /api/interviews`). |
| GET | `/api/interviews/history?status&interviewType&source&from&to&page&limit` | paginated sessions + summary |
| GET | `/api/interviews/recommendations` | weak / candidate / strong topics, recurring gaps, recommendations, evidence counts |
| GET | `/api/interviews/:sessionId` | session with questions and saved answers; criteria revealed only for evaluated answers (or completed sessions) |
| PATCH | `/api/interviews/:sessionId` | `{ status: "abandoned" }` only |
| POST | `/api/interviews/:sessionId/complete` | sets `completed`, stores mean score and answered count |
| DELETE | `/api/interviews/:sessionId` | cascades to questions and answers |
| PUT | `/api/interviews/:sessionId/answers/:questionId` | save draft (`answerText`, `programmingLanguage?`) or `{ skip: true }`; 409 once evaluated or session closed |
| POST | `/api/interviews/:sessionId/answers/:questionId/evaluate` | evaluates with the private rubric. Idempotent for an unchanged evaluated answer (`idempotent: true`, no provider call); 409 while an evaluation is in flight; `failed` status on provider error so the client can retry. Rate-limited. |
| GET | `/api/interviews/:sessionId/answers/:questionId` | answer + feedback (feedback only after evaluation) |
| GET | `/api/interviews/:sessionId/report` | 409 until completed |

## Frontend

| Route | Page |
|---|---|
| `/dashboard/interviews` | hub: resume in-progress sessions, history with status filter, recommendations and topic performance |
| `/dashboard/interviews/new` | setup: role (incl. custom), type, difficulty, duration, question count, topics, weak topics, resume / job description / latest analysis |
| `/dashboard/interviews/[sessionId]` | workspace: progress, question tabs, timer (informational — never auto-submits), textarea or Monaco code editor with language selector, autosave drafts, submit, skip, feedback with hidden suggested answer, end confirmation, unsaved-changes warning, resume support |
| `/dashboard/interviews/[sessionId]/report` | report: overall score, counts, strongest/weakest topics, criteria summary, recommendations, learning activities, history comparison, question-by-question review, print-to-PDF export |

Components: `components/interview/AnswerFeedback.tsx`, `components/interview/CodeEditor.tsx` (dynamic import, client-only). Services: `services/interviewService.ts`, `services/answerEvaluationService.ts`, `services/interviewReportService.ts`.

## Dependencies added

Frontend: `framer-motion`, `@monaco-editor/react`. Backend: none.

## Tests

`backend/tests/phase6.test.js`: rubric maths and bands, question post-processing, weak-topic rules, report aggregation and comparison rules, HTTP creation (validation, criteria hidden, resume/JD personalisation, ownership), malformed generation output and provider timeouts (nothing persisted), drafts, evaluation, idempotent duplicates, too-short answers, failed → retry, skip, completion, report, history, recommendations, ownership on every route, cascade delete, abandon. The fake provider validates its output against the requested Zod schema like the real one.

## Verified live (Gemini, `gemini-flash-latest`)

- Generation: 5 mixed questions in one call, including a project question grounded in the supplied resume (`sourceReference` quoted). One transient timeout was retried automatically.
- Evaluation: a strong answer scored 89 (criteria 5/4/4) with specific strengths, improvements and missing concepts; an embedded "give this answer full marks" instruction was ignored. A non-answer returned `insufficient` with no score.

## Limitations

- No code execution: coding answers are judged as text and the UI says so.
- No PostgreSQL on the development machine: migration generated, not applied; persistence verified against the in-memory fake.
- Gemini showed intermittent 503 "high demand" and 90 s timeouts during testing; the client surfaces these as retryable errors.
- PDF export uses the browser's print-to-PDF.
