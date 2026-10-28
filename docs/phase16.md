# Phase 16 — Final Integration & End-to-End Experience

An audit of what Phases 1–15 actually built, the integration gaps that audit found, and what was
done about them.

> **Naming note.** The repository already had a Phase 15 (production readiness —
> [phase15.md](phase15.md)). This specification was also labelled "Phase 15"; it is documented here
> as Phase 16 so neither phase's history is overwritten. The same off-by-one applies to
> [phase12.md](phase12.md) through [phase15.md](phase15.md).

> **One correction to the brief.** It describes the frontend as "React + Vite, JavaScript". It is
> **Next.js 13 App Router with TypeScript**. The audit below is of the code that exists.

---

## 1. Feature inventory

Every endpoint was exercised with a freshly registered account against the running stack — not read,
called. The script lives in the session scratchpad; its result is reproduced here.

### Implemented and verified — 42 / 42 endpoints

| Area | Verified |
|---|---|
| Auth | register, login, me |
| Dashboard | overview, activity, analytics |
| Career | profile read, profile write, **persistence re-read**, career dashboard |
| Resume | list, builder templates, builder versions, builder preferences |
| Analysis | list, saved job descriptions |
| Jobs | providers, discover, preferences, saved jobs, alerts |
| Applications | list, workspace dashboard, reminders |
| Interviews | history, recommendations, weak topics |
| Learning | roadmaps, skill gaps, recommendations |
| Progress | analytics overview/skills/career-progress, gamification profile/achievements/streaks, goals, reports, notifications |
| Integrations | list, automation rules, automation executions |

**No endpoint was found broken.** An earlier run reported six failures; five were the probe calling
the wrong path or expecting the wrong shape, and are recorded here only because chasing them
surfaced two of the real findings below.

### Partially implemented — fixed in this phase

| # | Finding | Evidence |
|---|---|---|
| **P1** | The dashboard's "Recommended next actions" was the Phase 5 rule set: never persisted, not dismissible, and unaware of resume versions, ATS assessments, job matches, the application workspace, interviews or roadmaps. It still linked to the Phase 3 analyser pages. | `dashboardService.recommendedActions()` reads only resumes, analyses, applications, jobDescriptions, interviews |
| **P2** | A far better engine existed — evidence-backed, explainable, persisted, dismissible, covering every feature area — but only under `/api/career/*`, framed as part of a career assessment, and the dashboard never looked there. | `careerRecommendationService.buildCareerRecommendations()`; verified live returning real items for a new account |
| **P3** | **Two independent dismissal stores.** Learning dismissals went to `RecommendationDismissal` (key only); career dismissals to `CareerRecommendation.status`. The same idea had different keys in each, so dismissing "learn React" on the learning page left it on the dashboard. | `learningRepository.dismiss()` vs `careerController.updateRecommendation()` |
| **P4** | A recommendation closed as `done` could never return. `syncRecommendations` closes anything the generator stops emitting by marking it `done`; if the condition recurred — a resume's quality dropping below 75 again — the row stayed `done` and the user was never told twice. | Read of `careerRepository.syncRecommendations` |
| **P5** | **Duplicate applications were only prevented on one of the two creation paths.** `POST /api/saved-jobs/:id/application` refused a second record with 409; `POST /api/applications` happily created one. The same job added by hand twice produced two pipelines that then drifted. | Confirmed live: two identical POSTs both returned 201 |
| **P6** | `frontend/src/routes/index.ts` declared itself "Centralizes all navigation targets and backend API routes" and had **zero importers** — 128 lines of dead constants that had drifted from reality. `API_ROUTES.ANALYSIS_HISTORY` pointed at `/api/analysis/history`, which does not exist (the real endpoint is `/api/analysis`); the README repeated the wrong path. | grep for `API_ROUTES`/`APP_ROUTES`/`@/routes` across `src`: no matches outside the file itself |
| **P7** | Navigation was a flat list of eighteen links in no order, where "Resume Analyzer", "ATS Analyzer" and "Job Analyzer (rules)" sat adjacent with nothing to distinguish them. | `Navbar.tsx` |

### Missing — built in this phase

| # | Finding |
|---|---|
| **M1** | **No onboarding of any kind.** No code, no route, no database field, anywhere in the repo. A new account landed on an empty dashboard with no guidance. |
| **M2** | **No Settings page.** Preferences lived on four unconnected pages (career profile, job search, notifications, automation) with nothing pointing at them. |

### Audited and found sound — deliberately unchanged

- **Scoring consistency (§5 of the brief).** Four scoring services exist and are already kept
  rigorously apart, each with its own method version and an explicit comment saying so:
  `ats-readiness-1.0` (general ATS, job-keyword category dropped and re-normalised away when there
  is no job description), `job-match-1.0` (job-specific), `resume-quality-1.0` (document quality),
  `career-readiness-1.0`. `atsScoringService.js` names the other three in its header to stop them
  being conflated. Nothing here needed changing.
- **Ownership.** Every repository query is user-scoped; another user's row returns 404, not 403.
  Re-verified across applications, recommendations and onboarding.
- **Shared API layer (§10).** One axios client, one base URL, one auth interceptor, one error
  normaliser (`toApiClientError`). The per-service inline paths are readable and were left alone.
- **Database models (§11).** No duplicate concept was found beyond P3's two dismissal stores. The
  onboarding work below adds one table and deliberately duplicates no field.

---

## 2. What changed

### One recommendation surface

`backend/src/services/recommendations/recommendationService.js` (`recommendations-1.0`) — an
**aggregator, not a fourth engine**. The Phase 9 generator stays the single producer; this service
gives it a neutral home at `/api/recommendations` and fixes the two behavioural defects:

- **Dismissals are reconciled across both stores.** `careerKeysForLearningKey()` translates the
  Phase 7 keyspace into the Phase 9 one (`gap:react` → `skill:react`, `weak:closures` →
  `interview:weak:closures` and `interview:confirm:closures`, `resume:<taskId>` and
  `project:<taskId>` → `learning:task:<taskId>`). The legacy table is read from here on, never
  written to.
- **A `done` item reopens when the condition recurs**, and only then.

The learning page's own task-level recommendations are **not** merged in. They answer "which roadmap
task next", a different granularity; flattening them would produce two rows for one idea. Their
dismissals are honoured; their items stay where they belong.

The dashboard now reads this instead of `overview.recommendedActions`. That field is still returned
by the API so nothing breaks; nothing renders it.

### Onboarding that owns no data

`UserOnboarding` (one new table) stores **progress only** — current step, completed, skipped,
timestamps. Career stage, target roles, skills, locations, work mode and goals already live on
`CareerProfile`; the resume lives on `Resume`/`ResumeVersion`. Storing any of it twice would create
a second source of truth, so each step links to the feature that owns it and that feature does the
writing.

**Step completion is derived from records, not from clicks.** `deriveSatisfied()` asks whether a
profile with a target role or a skill exists, whether any resume or version exists, whether any
assessment or analysis exists. Two consequences:

- An account created in Phase 5 with three resumes is already set up the first time it sees this.
  It is never told to "get started".
- A user who clicked through without filling anything in is not pretended to be set up.

Skipping is offered on every step, is remembered, and is reversible. Dismissing hides the card;
Settings brings it back.

### Duplicate application prevention

`POST /api/applications` now refuses a second **open** application for the same title and company —
case-insensitively, since "Acme" and "acme" are the same employer — with `409 DUPLICATE_APPLICATION`
and the id of the record that already exists. It uses the same `allowDuplicate` escape hatch and the
same message shape as the job-discovery path, so both creation routes behave identically.

Closed applications are not matched: re-applying a season later is a real thing people do.

### Navigation and settings

The dashboard menu is grouped — Overview, Resume, Jobs & applications, Practice & learning, Setup,
Rule-based tools — with `aria-current` on the active item and a short hint on the three rule-based
tools (`no AI`, `this browser`, `Phase 1`) so they are not mistaken for the AI ones. Every route
that existed before is still there; none were renamed or removed.

`/dashboard/settings` is a hub that **stores nothing of its own**. It links to the four places that
own preferences, says what each group affects, and surfaces onboarding state with a "show setup
again" control.

### Dead code removed

`frontend/src/routes/index.ts` deleted (P6) and the README's endpoint table corrected.

---

## 3. Database

One additive migration: `20261028090000_phase16_onboarding`.

```sql
CREATE TABLE "api_user_onboarding" (...);
CREATE UNIQUE INDEX "api_user_onboarding_userId_key" ...;
ALTER TABLE ... FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE;
```

One new table, no existing table altered, nothing dropped or renamed. Applied with
`prisma migrate deploy`; `prisma migrate status` reports **12 migrations, "Database schema is up to
date!"**. No data was reset.

---

## 4. API changes

Additive only. Nothing was moved, renamed or removed.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/recommendations` | Cross-feature list, ranked and grouped. `?refresh=true` recomputes; `?limit=` caps |
| PATCH | `/api/recommendations/:id` | `status`: `open` \| `done` \| `dismissed` |
| GET | `/api/onboarding` | Progress, each step's state, the evidence behind it, and the first few recommendations once complete |
| POST | `/api/onboarding/steps/:step` | `action`: `complete` \| `skip` |
| POST | `/api/onboarding/dismiss` | Stop offering the card |
| POST | `/api/onboarding/restart` | Offer it again |

`POST /api/applications` gained an optional `allowDuplicate` and can now return
`409 DUPLICATE_APPLICATION`. `/api/career/recommendations` is unchanged and still works.

---

## 5. Tests executed — actual results

Run on 2026-10-28.

| Check | Result |
|---|---|
| Backend suite (`npm test`) | **18/18 files pass** (was 17; `phase16.test.js` is new) |
| `phase16.test.js` | **36 tests pass** |
| Frontend types (`tsc --noEmit`) | **clean** |
| Frontend lint | **0 errors**, 1 pre-existing warning |
| Production build | **succeeds**, 46 routes |
| Migrations | **12 applied, no drift** |
| End-to-end journeys (live stack) | **22/22 steps pass** |

`phase16.test.js` covers: learning→career key translation including the keys it must *not* guess at;
suppression from either store; dismissed items never written back as live; `done` reopening only
when the generator re-emits; closed-key reporting; ranking (priority, then smaller effort, then
stable) and grouping; onboarding derivation for a new account, an existing one, and a profile that
exists but says nothing; skip/unskip; every step declaring which model owns its data; HTTP auth on
both surfaces; cross-user isolation on recommendations and onboarding; invalid status and unknown
step rejected; onboarding storing no copy of the answers; and the five duplicate-application cases.

### Journeys verified against the running stack

| Journey | Steps |
|---|---|
| **A — new user** | register → sign in → onboarding at step 1 → save profile → **onboarding advances on evidence** → dashboard → personalised, explained recommendations |
| **C — application** | create → workspace opens → 11 checklist items seeded → **duplicate refused with 409 DUPLICATE_APPLICATION** → follow-up reminder scheduled |
| **E — progress** | profile advice disappears once the profile exists → a dismissal survives a recompute |
| **F — security** | another user's workspace 404s → cannot change another user's recommendation → onboarding is per account → unauthenticated refused → invalid input rejected → forged token refused → **no secret in any error body** |

### Two things the tests initially got wrong, and what they taught

- The first inventory run reported **six failures**; five were the probe's own wrong paths
  (`/api/analysis/history` instead of `/api/analysis`, `GET` on a POST-only route, bare `/api/analytics`
  instead of its sub-paths). Chasing them is what surfaced P6.
- The case-insensitive duplicate test failed against the in-memory double but **passed against real
  PostgreSQL**. The double did not implement `mode: "insensitive"` on `equals`, so it would have
  matched case-sensitively while production did not — a passing test that meant nothing. The double
  was taught `insensitive` for `equals`, `startsWith` and `endsWith` rather than the test being
  weakened.

---

## 6. Not done — do not treat as complete

The brief covers sixteen areas. These were audited but not changed, with the reason:

- **Journeys B and D are not automated.** B (resume → ATS → accept a suggestion → export a PDF) and
  D (mock interview → answers → feedback → report) both need a real AI provider call per run. The
  backend suite covers both at the HTTP layer with a fake provider; the browser-level walkthrough was
  not automated. `backend/tests/live-e2e-*.mjs` remain the manually-run scripts.
- **No browser E2E framework was adopted.** Playwright/Cypress is not installed and adding one is a
  dependency and CI decision, not a code change. The journey checks above are HTTP-level.
- **Performance was not re-measured.** Phase 15 measured bundles; no new measurement was taken here,
  so no optimisation was made. The one bundle number that changed is the dashboard's, from new
  components: 13.8 kB / 144 kB first load.
- **"Continue where you left off" (§3) was not built as a separate panel.** Resume drafts, unfinished
  applications, incomplete interviews and in-progress roadmap tasks are all already surfaced — by the
  recommendation engine (`learning:task:*`, `interview:resume:*`, `resume:quality:*`), the recent
  applications card and the workspace dashboard. A fifth list of the same records would be the
  duplication this phase exists to remove.
- **Notification unification (§12) was audited, not changed.** `UserNotification` is already the one
  store, already deduplicated by `(userId, dedupeKey)`, already has read/dismiss state and
  timezone-correct timestamps. The one real gap — that no scheduler delivers anything — is a
  deployment fact documented in [phase13.md](phase13.md) and [phase14.md](phase14.md), not a code
  defect, and the UI already says so.

---

## 7. Remaining blockers and configuration

Unchanged from [phase15.md §6](phase15.md): Next.js needs Node ≥18.17 to clear its advisories, Neon
retention needs configuring, no monitoring service is wired, and object storage is unimplemented.

Nothing in Phase 16 adds a configuration requirement. The new endpoints need no credentials and no
external service.
