# Phase 7 — Personalized Learning Roadmap & Skill Gap Tracking

Signed-in users turn their real records (AI resume analyses, saved job descriptions, mock-interview
results) into a prioritised skill-gap list and an AI-generated, validated learning roadmap with
milestones, tasks, verified resources and knowledge checkpoints. Progress, weekly plans and
recommendations are derived from task state on every read; regeneration creates a new version and
keeps history. No AI credentials reach the browser.

## Database changes (`backend/prisma/migrations/20261015000000_phase7_learning_roadmaps/`, additive, 24 statements, no drops)

| Model (table) | Notes |
|---|---|
| `LearningRoadmap` (`api_learning_roadmaps`) | Setup (`targetRole`, `objective`, `currentSkillLevel`, `weeklyStudyHours`, `preferredSchedule`, `preferredFormat`, `targetCompletionDate`), estimates, `status` (`active` \| `archived` \| `superseded`), versioning (`version`, `previousVersionId`, `changeSummary` Json), `skillGapSummary` Json, evidence ids (`sourceResumeId`, `sourceJobDescriptionId`, `sourceAnalysisId`, `sourceInterviewSessionIds`), `provider`, `model`. Cascade on user delete. |
| `RoadmapMilestone` (`api_roadmap_milestones`) | `sequenceNumber` (unique per roadmap), `requiredSkills`, `learningObjectives`, `prerequisiteSequences` (Json), `estimatedHours`, `completionCriteria`, stored `status` + `completedAt`. Cascade on roadmap delete. |
| `LearningTask` (`api_learning_tasks`) | `sequenceNumber` (unique per milestone), `skillName`, `taskType`, `difficulty`, `estimatedMinutes`, `isRequired`, `scheduledDate`, `completionCriteria`, `status` (`not_started` \| `in_progress` \| `paused` \| `completed` \| `skipped`), `notes`, `actualStudyMinutes`, `checkpoint` (Json, private answers), `checkpointAttempts` (Json), `startedAt`, `completedAt`. Cascade on milestone delete. |
| `LearningResource` (`api_learning_resources`) | `title`, `resourceType`, `url` (**only stored when verified**), `urlVerified`, `provider` (`official` \| `third_party` \| `search`), `description`, `difficulty`. Cascade on task delete. |
| `SkillGap` (`api_skill_gaps`) | One row per `(userId, skillName)`: `category`, `proficiencyStatus`, `priority`, `priorityScore`, `evidenceSources` (Json), `explanation`, `whyItMatters`, `targetProficiency`, `relatedTopics`, `userConfirmed`, `userNote`, `lastAssessedAt`, optional `roadmapId` (SetNull on roadmap delete). |
| `RecommendationDismissal` (`api_recommendation_dismissals`) | `(userId, recommendationKey)` unique. |

`User` gained `roadmaps`, `skillGaps`, `dismissals` relations. Nothing existing was altered.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy   # applied to the Neon database on 2026-10-15
```

## Skill gap engine (`skill-gap-1.0`, `backend/src/services/learning/skillGapService.js`, pure)

Inputs: job-description skills (`extractedRequirements.skills` or the analysis result), analysis
matched / partial / missing skills, interview weak / candidate / strong topics and recurring missing
concepts (via the Phase 6 `weakTopicService`), user-confirmed skills, user goal skills, role baseline.

Classification (first match wins): active roadmap task → `learning_in_progress`; user-confirmed →
`demonstrated`; interview-weak or recurring gap → `needs_improvement`; resume-matched → `demonstrated`;
resume-partial or one low interview score → `needs_improvement`; required/missing → `not_demonstrated`;
otherwise `not_assessed`. **A skill is never called a weakness without evidence** — the explanation
and `evidenceSources` are stored with each row.

Priority score: required by job +40 · preferred +20 · mentioned +15 · role baseline +10 · weak in
interviews +25 · one low score +10 · no evidence +20 · partial evidence +10 · foundation for other
listed skills +10 · user goal +5; demonstrated skills are capped at 25. High ≥ 60, medium 35–59, low < 35.
User corrections (`PATCH /skill-gaps/:id`) set `userConfirmed` and survive regeneration.

## Roadmap generation (`learning-roadmap-1.0`, `learningRoadmapService.js`)

1. Gaps → `selectRoadmapSkills` (non-demonstrated, priority bands, foundations first, max 12).
2. One structured LLM call (`schemaName: "learning_roadmap"`) with the Zod schema: 3–10 milestones,
   2–8 tasks each, task types `learn_concept | read_docs | tutorial | coding_exercise | mini_project |
   review_interview_questions | explain_concept | knowledge_checkpoint`, optional checkpoint
   (`mcq | conceptual | coding | project | checklist`). Empty arrays / null fields from the provider are
   tolerated; `passScore` is clamped to 50–100.
3. Post-processing: drop milestones that only teach demonstrated skills, renumber, prune forward or
   self prerequisites, round minutes to a 15-minute grid, attach **catalog resources only**
   (`learningResourceService.js`: official docs for ~45 skills; unknown skills get a `search_suggestion`
   with no URL), normalise checkpoints (MCQ with < 3 usable questions degrades to `conceptual`),
   compute `estimatedHours` / `estimatedWeeks`. Fewer than 3 milestones → `502 LLM_INVALID_OUTPUT`,
   nothing persisted.
4. Persistence in one transaction (batched `createMany`, 120 s budget). Previous active roadmap →
   `superseded`; skill gaps are upserted for the user.

## Progress, plan, recommendations (pure, derived on read)

- `learningProgressService.js` (`learning-progress-1.0`): milestone status is derived — `locked`
  while any `prerequisiteSequences` milestone is unfinished, `completed` when all required tasks are
  completed (skipped does not count). Roadmap percent = completed required / required tasks.
  `buildWeeklyPlan` splits `weeklyStudyHours` over the next 7 days according to `preferredSchedule`
  and fills unlocked tasks in roadmap order; `nextAction` prefers in-progress, then priority/time fit.
- `learningRecommendationService.js`: ≤ 8 keyed recommendations — continue in-progress, interview weak
  topics (review), highest gaps with an available task, mini-project after ≥ 2 completions this week,
  revisit a skill completed > 14 days ago that interviews still flag, quick win for small budgets,
  create / regenerate. Dismissals are persisted per key.
- Regeneration: `apply=false` returns a preview + `changes` (milestones/tasks before/after, carried
  completed tasks matched by skill + task type or title, added/removed skills, reason). `apply=true`
  creates version N+1 with `previousVersionId`, supersedes the old one; checkpoints are never carried.

## API (`/api/learning/*`, all `requireAuth`, owner-scoped; generation routes use the AI limiter and the AI request budget)

| Method & path | Purpose |
|---|---|
| `POST /roadmaps` | Generate + store a roadmap (body: `targetRole`, `currentSkillLevel`, `weeklyStudyHours` 1–60, `preferredSchedule`, `objective`, `preferredFormat`, `targetCompletionDate?`, `resumeId?`, `jobDescriptionId?`, `analysisId?`, `interviewSessionIds[]`, `useInterviewHistory`, `goalSkills[]`, `confirmedSkills[]`). 201 → `{ roadmap, sources, skillGaps }`. 400 when nothing is left to plan. |
| `GET /roadmaps?status=&page=&limit=` | List with derived progress. |
| `GET /roadmaps/:id` | Full roadmap: milestones (derived status, unmet prerequisites), tasks (locked flag, public checkpoint without answers until attempted), resources. |
| `PATCH /roadmaps/:id` | `title`, `weeklyStudyHours`, `preferredSchedule`, `preferredFormat`, `targetCompletionDate`, `status` (`active` \| `archived`; activating supersedes others). |
| `DELETE /roadmaps/:id` | Removes the version (cascade). Skill gaps keep their rows (`roadmapId` nulled). |
| `POST /roadmaps/:id/regenerate` | `apply` (default false → preview), overrides (`targetRole`, `currentSkillLevel`, `objective`, `weeklyStudyHours`, `preferredFormat`, `jobDescriptionId`, `resumeId`, `analysisId`, `goalSkills`, `confirmedSkills`), `reason`. |
| `GET /roadmaps/:id/progress?availableMinutes=` | `{ progress, weeklyPlan, nextAction }`. |
| `GET /roadmaps/:id/tasks?status=&milestoneId=` | Flat task list with milestone info. |
| `PATCH /tasks/:taskId` | `status` (`not_started` \| `in_progress` \| `paused` \| `skipped`), `notes`, `scheduledDate`, `actualStudyMinutes`, `addStudyMinutes`. 409 `TASK_COMPLETED` if completed (reopen first), 409 `ROADMAP_INACTIVE` on non-active versions. |
| `POST /tasks/:taskId/complete` | `notes`, `actualStudyMinutes`; checkpoint tasks need a passed MCQ attempt (409 `CHECKPOINT_NOT_PASSED`) or self-reported evidence (`checkpointNotes` / `projectLink` / `checkedItems`, 409 `CHECKPOINT_EVIDENCE_REQUIRED`). 409 `MILESTONE_LOCKED` when prerequisites are unfinished. Returns task, progress, milestone status. |
| `POST /tasks/:taskId/reopen` | Completed/skipped → `in_progress`; dependants re-lock. |
| `GET /tasks/:taskId/resources` | Stored resources (or catalog lookup when none stored). |
| `POST /tasks/:taskId/checkpoints/:checkpointId/submit` | 409 `MILESTONE_LOCKED` while prerequisites are unfinished. MCQ: `answers {questionId: optionIndex}` → graded server-side (`score`, per-question `correctIndex` + `explanation` revealed, auto-completes on pass). Other types: `notes` / `projectLink` / `checkedItems` recorded as a **manual, unverified** attempt. |
| `GET /skill-gaps` | Rows + summary; skills with an active in-progress task show `learning_in_progress`. |
| `PATCH /skill-gaps/:id` | `proficiencyStatus`, `userConfirmed`, `userNote`. |
| `GET /recommendations?availableMinutes=` | `{ recommendations, nextAction, roadmapId }`. |
| `POST /recommendations/:key/dismiss` | Idempotent, 204. |

`app.js`: `AI_ROUTE` now also matches `POST /api/learning/roadmaps` and `/api/learning/roadmaps/:id/regenerate`
so they get the long AI request budget.

## Frontend (Next.js App Router)

- `/dashboard/learning` — roadmap dashboard: `RoadmapOverview` (stats, version, actions), next
  action + `WeeklyLearningPlan`, `RecommendationList` (dismissable), `LearningProgressChart`,
  `RoadmapTimeline` → `MilestoneCard` → `LearningTaskCard` (start / pause / complete / reopen / skip /
  reschedule / log study time / resources / checkpoint), `TaskCompletionModal`, `CheckpointModal` (quiz or self-report),
  `RegenerateModal` (preview → apply), version history (`?roadmap=<id>` views superseded/archived
  versions read-only), archive / activate / delete.
- `/dashboard/learning/new` — setup: role, objective, level, format, weekly hours, schedule, target
  date, evidence sources (AI analysis, saved JD, stored resume, interview history) with a live summary of
  how each selected source shapes the plan, goal and confirmed skills; backend validation errors map to fields; AI-unavailable notice.
- `/dashboard/learning/skill-gaps` — grouped by proficiency, filter by status/category, evidence and
  priority explanation per skill, inline correction (persisted), scoring method card.
- Services: `learningRoadmapService.ts`, `learningTaskService.ts`, `learningRecommendationService.ts`.
  Navbar: "Learning Roadmap", "Skill Gap Analysis"; dashboard quick link; `APP_ROUTES` / `API_ROUTES` constants.

## Tests

- `backend/tests/phase7.test.js` (13 tests, fake Prisma + fake LLM): gap classification/scoring/
  selection, baseline fallback, post-processing (renumber, prune, resources, checkpoint hiding, MCQ
  grading, too-few-milestones 502), unknown-skill search suggestion, locking/percent/weekly plan/next
  action, recommendations + dismissal, merge-carry-over, HTTP create (validation, evidence, prompt
  content, persistence, hidden answers), failure paths (nothing to plan 400, schema-invalid 5xx,
  timeout 504, useless plan 502 — nothing persisted), full task lifecycle, checkpoints, milestone
  completion/unlock/relock, skip semantics, progress endpoint, recommendations/in-progress marker/
  confirmation persistence across regeneration, regenerate preview vs apply + versions + archive/
  activate, ownership and cascade/SetNull.
- `backend/tests/live-e2e-phase7.mjs` — live probe (one Gemini call); passed on 2026-10-15 against
  Neon + `gemini-flash-lite-latest`: 5 milestones / 14 tasks, 31 verified resources, locking, task
  lifecycle, recommendations, dismissal, skill-gap confirmation, persistence across re-login, delete.

## Limitations (honest)

- Resource "verification" is a curated catalog of official documentation URLs, not live link checking.
  Skills outside the catalog get search suggestions, never invented links.
- MCQ checkpoints are graded server-side; conceptual / coding / project / checklist checkpoints are
  self-reported and stored with `verified: false`. No code is executed and no free-text is AI-graded.
- Checkpoint type mix depends on the provider. The prompt now requires the first milestone's
  checkpoint to be an MCQ; `backend/tests/live-e2e-phase7-checkpoint.mjs` verified live grading on
  2026-10-21 (wrong answers 25 %, corrected answers 100 %, task auto-completed, answers revealed only
  after an attempt). Checkpoint submissions on locked milestones return `409 MILESTONE_LOCKED`.
- Skill gaps with no job description or analysis fall back to the role baseline and are all `low`
  priority — the plan is only as personalised as the evidence selected.
- Weekly plan dates use the server's local day boundary; there is no calendar export.
- Interview history is used as a whole from the UI; per-session selection exists in the API
  (`interviewSessionIds`) but has no picker yet.
- The frontend has no test runner (none existed in earlier phases either). Frontend behaviour is
  verified by `tsc`, page compilation and the live API probes; backend HTTP tests cover the task
  update and error paths the UI relies on.
- Roadmap generation takes 10–30 s on Gemini Flash Lite and is subject to the provider's free-tier quota.
