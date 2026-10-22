# Phase 9 — AI Career Coach & Job Application Intelligence

A career profile, a transparent readiness assessment per target role, evidence-backed
recommendations, a prioritised job board, interview preparation, a weekly action plan, a progress
dashboard and a grounded coach chat — all derived from the signed-in user's own records from
Phases 1–8. Only the chat uses the AI provider; every score is deterministic and explains its
evidence. No AI credentials or prompts reach the browser.

## Database changes (`backend/prisma/migrations/20261022000000_phase9_career_coach/`, additive, 27 statements, 7 tables)

| Model (table) | Notes |
|---|---|
| `CareerProfile` (`api_career_profiles`) | One per user: `careerLevel`, `targetRoles`, `industries`, `skills` (self-reported), `locations`, `workMode`, optional salary range + currency, `goals`, `learningInterests`. Nothing is inferred. |
| `CareerAssessment` (`api_career_assessments`) | `targetRole`, `overallScore`, `readinessLabel`, `components`, `skills`, `strengths`, `improvements`, `missingEvidence`, `nextActions`, `sources`, `method`. History is kept (trend). |
| `CareerRecommendation` (`api_career_recommendations`) | `(userId, key)` unique so regeneration updates in place; `type`, `title`, `explanation`, `reason`, `evidence`, `priority`, `effortMinutes`, `href`, `status` (`open` \| `done` \| `dismissed`), `completedAt`, optional `assessmentId`. |
| `CareerActionPlan` (`api_career_action_plans`) | Week (`weekStart`–`weekEnd`, Monday-based), `status` (`active` \| `archived`), `summary`. |
| `CareerActionTask` (`api_career_action_tasks`) | `category` (`learning` \| `interview` \| `resume` \| `application` \| `personal`), `href`, `estimatedMinutes`, `dueDate`, `isOptional`, `sourceKey` (dedupe across regenerations; null for the user's own tasks), `status` (`pending` \| `done` \| `skipped`), `notes`. |
| `CareerCoachConversation` / `CareerCoachMessage` | Conversations with `title`; messages with `role`, `content`, `factsUsed`, `suggestions`, `links`, `clarifying`, provider/model. Cascade on delete. |

The migration was generated with a read-only diff against the live database (`prisma migrate diff
--from-url … --to-schema-datamodel …`) and applied with `prisma migrate deploy` on 2026-10-22.
Existing models (resumes, analyses, job descriptions, applications, interviews, roadmaps, skill gaps,
resume versions) are read through one owner-scoped snapshot loader (`careerRepository.loadSnapshot`);
resume and job-description text is never loaded.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## Engines (`backend/src/services/career/`, all pure except the coach)

- **careerReadinessService.js** (`career-readiness-1.0`) — six weighted components: resume quality 15
  (Phase 8 quality score, else an ATS-check proxy), required skills demonstrated 30 (role baseline ∪
  saved-JD requirements ∪ analysis skills; status per skill from skill-gap rows → analyses → roadmap
  tasks → resume versions / profile as *self-reported*), project relevance 15, mock interviews 20,
  roadmap progress 10, certifications & experience 10. **A component with no evidence is excluded from
  the weighted average and listed under `missingEvidence`**; fewer than two components → "Insufficient
  evidence" and no score. Labels: ≥80 Ready to apply · 65–79 Nearly ready · 45–64 Building · <45 Early stage.
- **careerRecommendationService.js** — keyed, evidence-backed items linking to existing pages
  (profile, resume upload/builder quality, tailored version for a pursued job, high-priority skill
  gaps, next roadmap task, interview weak topics / first interview / unfinished session, overdue
  follow-ups, apply when readiness ≥ 65, relevant project).
- **jobPriorityService.js** (`job-priority-1.0`) — per saved JD / application: match score (Phase 4),
  demonstrated required skills, target-role relevance (profile), location / work-mode fit (from
  application notes vs profile), urgency (status + follow-up date). Default weights 35/20/20/10/15,
  overridable per request; factors with no data are excluded and `confidence` reports the weight used.
  Also returns the recommended resume version (tailored or best quality) and an interview-prep hint.
- **careerActionPlanService.js** (`career-plan-1.0`) — weekly tasks from follow-ups due, high-priority
  recommendations, the roadmap's weekly plan, interview practice, resume work and optional medium
  items, fitted to a minute budget (overflow becomes optional). Regeneration replaces only pending
  generated tasks; done, skipped and user-added tasks are kept; a new week archives the old plan.
- **interviewPrepService.js** — recommended sessions (weak topics, untested requirements, behavioral,
  advanced), practice plan, related roadmap coding tasks, score trend, follow-ups for poor answers.
- **careerDashboardService.js** — readiness + trend, strengths / priority gaps, resume quality,
  job-match summary, interview trend, roadmap completion, application pipeline + upcoming follow-ups,
  achievements (last 14 days), next action, plan progress.
- **careerCoachService.js** (`career-coach-1.0`) — builds compact labelled **RECORDED FACTS** from the
  snapshot (≤ 700 chars each; no resume/JD text, no contact details), sends the last 10 messages plus the
  question fenced in `<user_message>`, validates the reply schema, filters links to an in-app allow-list,
  and demotes any "fact" the model cites that is not in the facts list to a suggestion.

## API (`/api/career/*`, all `requireAuth`, owner-scoped)

| Method & path | Purpose |
|---|---|
| `GET/PUT /profile` | Career profile (validated; saving refreshes recommendations). |
| `POST /assessments` · `GET /assessments?targetRole=` · `GET /assessments/:id` | Generate (target role from body or profile → `400` if none), history, detail. |
| `GET /recommendations?status=&refresh=` · `PATCH /recommendations/:id` | List (auto-generated when empty), set `open` \| `done` \| `dismissed`. |
| `GET /dashboard?targetRole=` | All dashboard widgets. |
| `GET /job-priorities?wMatch=&wSkills=&wRelevance=&wPreference=&wUrgency=&includeClosed=` | Ranked jobs with factor breakdown. |
| `GET /interview-prep?targetRole=` | Interview preparation derived from Phase 6 data. |
| `POST /action-plans/generate` (`weeklyMinutes?`) · `GET /action-plans/current` | Create / regenerate this week's plan; current plan + previous weeks. |
| `POST /action-tasks` · `PATCH /action-tasks/:id` · `DELETE /action-tasks/:id` | Personal tasks; status / due date / notes / title / minutes (completing a recommendation-sourced task completes the recommendation). |
| `POST /coach/conversations` (`message?`) · `GET /coach/conversations` · `GET /coach/conversations/:id` · `POST /coach/conversations/:id/messages` · `PATCH` (rename) · `DELETE` | Chat. Messages ≤ 2000 chars; AI limiter + long request budget; provider failures keep the user's message. |

## Frontend (Next.js App Router)

`/dashboard/career` (overview: stat cards, next action, recommendations, strengths & gaps, this
week, readiness / interview / pipeline charts via Recharts, roadmap, follow-ups, achievements),
`/dashboard/career/profile`, `/dashboard/career/assessment` (run per role, full report, interview
preparation, history), `/dashboard/career/jobs` (board with adjustable weights), `/dashboard/career/plan`
(weekly plan: complete / skip / reschedule / add / delete / regenerate, previous weeks),
`/dashboard/career/coach` (conversations list, starters, facts vs suggestions, links, clarifying
questions, delete). Components in `frontend/src/components/career/`; service
`frontend/src/services/careerService.ts`; Navbar "Career Coach"; dashboard quick link.

## AI integration

One structured call per chat message (`schemaName: "career_coach"`, Gemini via the existing
provider). Assessments, recommendations, priorities, plans and the dashboard use no AI.

## Tests

- `backend/tests/phase9.test.js` (11 tests): readiness with empty vs rich snapshots (missing evidence
  excluded, skill status precedence, required-skill merging), recommendations / priorities / plan /
  dashboard derivation (weights, budget, week bounds), coach grounding (facts compact, link filtering,
  invented facts demoted, prompt fencing); HTTP: profile validation + upsert, assessment generation /
  history / detail / per-role, recommendation status persistence across refresh, job priorities with
  custom weights, interview prep, dashboard incl. empty state, plan generation / task updates /
  personal tasks / regeneration preserving completed and personal work / week rollover, coach
  lifecycle incl. clarifying question, provider rate-limit and malformed output, history, rename,
  delete cascade, and ownership across all resources.
- `backend/tests/live-e2e-phase9.mjs` — live probe passed 2026-10-22 against Neon + Gemini: profile →
  analysis → JD → application → assessment (61, Building, 2/6 components) → recommendations → job
  priorities (77) → interview prep → plan → task done → regenerate (done + personal tasks kept) → coach
  reply that correctly stated it had no offer records and asked a clarifying question → dashboard.

## Limitations (honest)

- Location / work-mode fit can only be scored when the application notes mention them; job records
  carry no structured location field.
- Readiness "project relevance", "certifications" and the full resume-quality score need a resume
  builder version (Phase 8); without one those components are reported as missing evidence.
- Reminders are in-app only (overdue badges, follow-ups widget). No email / push / scheduled jobs.
- The coach answers from a snapshot summary, not from full documents; very long histories are
  truncated to the last 10 messages.
- No external job search integration; jobs are the user's saved descriptions and tracked applications.
- Frontend has no test runner (unchanged); verified by `tsc`, page compilation, the production build
  and backend HTTP tests of the same endpoints.
