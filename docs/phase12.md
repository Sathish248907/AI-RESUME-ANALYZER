# Phase 12 — Job Discovery & Intelligent Job Matching

Real job listings from configurable providers, matched against the user's own resume versions with
the Phase 11 evidence engine, ranked with explainable and configurable weights, and wired into the
existing application tracker, resume builder, interview practice and learning roadmap.

Nothing here is simulated. When no provider is configured the app says so and searches only the job
descriptions the user entered themselves; it never shows example vacancies.

> **Naming note.** The repository already had a Phase 11 (ATS readiness, validation, role fit,
> writing assistant — [phase11.md](phase11.md)). The job-discovery specification was also labelled
> "Phase 11"; it is documented here as Phase 12 so neither phase's history is overwritten.

## Database changes (`backend/prisma/migrations/20261026000000_phase12_job_discovery/`, additive, 30 statements, 6 tables)

| Model (table) | Purpose / constraints |
|---|---|
| `JobProvider` (`api_job_providers`) | Bookkeeping per code-defined adapter: `displayName`, `attribution`, `termsUrl`, `lastFetchedAt`, `lastStatus`, `lastError`, `lastJobCount`, `requestCount`. **Credentials are never stored here** — they live in environment variables. Primary key is the slug. |
| `ExternalJob` (`api_external_jobs`) | One normalized listing. Deliberately **not** user-scoped: it is cached third-party data under `JOB_RETENTION_DAYS`. `@@unique(providerSlug, externalId)` makes refetching idempotent; `fingerprint` indexes the cross-provider duplicate key. Carries `postedAtReliable`, `salaryIsEstimate` and `isSponsored` so the UI can qualify what it shows. |
| `SavedJob` (`api_saved_jobs`) | The user's state on one job — `state` (`saved` \| `interested` \| `hidden`), `notes`, optional `applicationId`. Exactly one of `externalJobId` / `jobDescriptionId` is set. `@@unique(userId, externalJobId)` and `@@unique(userId, jobDescriptionId)` make saving idempotent. Cascades on user delete. |
| `JobSearchPreference` (`api_job_search_preferences`) | One row per user: titles, skills, locations, arrangements, employment types, level, minimum salary + currency, excluded companies, default keywords, and `rankingWeights` overrides. |
| `JobMatchReport` (`api_job_match_reports`) | A computed match per `(job, resumeVersion)`, updated in place. `matchScore`, `label`, `scoringVersion` and `details` (the per-dimension evidence), so a stored number can always be explained. |
| `JobAlert` (`api_job_alerts`) | A saved search: `query`, `frequency`, `isActive`, `lastRunAt`, `lastResultCount`, `lastNewCount`. `@@unique(userId, name)`. |

**Reused, not rebuilt:** manually entered jobs are `JobDescription` rows (Phase 5), application
records are `JobApplication` rows (Phase 5), alert notifications are `UserNotification` rows
(Phase 10), and matching reads `ResumeVersion.content` (Phase 8). No second application tracker and
no duplicate job-description model exist.

No column of an existing table is altered or dropped.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## Provider architecture (`backend/src/services/jobs/providers/`)

An adapter declares *what* to request and how to read the answer; it performs no I/O, reads no
environment variables directly and touches no database. `jobProviderRegistry.js` performs every
outbound call, so timeouts, rate limiting, error classification and normalisation are identical for
all of them. Adding a provider is one file plus its slug in `JOB_PROVIDERS`.

| Slug | Credentials | Dates usable for freshness | Notes |
|---|---|---|---|
| `remotive` | none | yes (`publication_date`) | Remote roles. No server-side pagination, no salary numbers. |
| `arbeitnow` | none | yes (`created_at`) | Paginated feed, no server-side text search (filtered locally). |
| `adzuna` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | yes (`created`) | Salary may be *predicted*; carried through as `salaryIsEstimate`. |
| `jooble` | `JOOBLE_API_KEY` | **no** | Supplies an *update* time, not a publication time, so it never drives freshness ranking or date filters. Salary is prose and is only used when real numbers parse out of it. |

Only official, documented endpoints are used. Nothing scrapes HTML.

**Failure handling.** `search` never throws: each provider returns `ok` / `timeout` /
`rate_limited` / `error` with a human-readable reason, and the response carries `partial: true` so
the UI states that results are incomplete. A provider listed in `JOB_PROVIDERS` without its
credentials is reported as misconfigured rather than silently skipped, and an unknown slug is named.

**Rate limiting.** A per-provider sliding window (`JOB_PROVIDER_RATE_LIMIT_PER_MIN`) is checked
*before* the request, so a refresh loop cannot burn a shared quota. HTTP routes that can trigger a
fetch sit behind an additional Express limiter.

**Retention and caching.** Listings are served from the cache for `JOB_CACHE_TTL_MINUTES`; a search
with no fresh cached rows triggers one provider round, and `refresh=true` forces one. Listings first
seen more than `JOB_RETENTION_DAYS` ago are purged, except any a user has saved — those would
otherwise disappear from their list without warning.

### Normalisation (`job-normal-1.0`, `jobNormalizer.js`)

- Provider HTML becomes plain text (`script` / `style` bodies discarded, lists kept as bullets),
  then passes through the shared sanitizer: control and bidi characters stripped, length capped,
  prompt fences neutralised. Titles, company names, locations and tags are stripped of markup too.
- **Only absolute `http(s)` URLs are accepted.** `javascript:`, `data:`, relative and hostless URLs
  become `null`, so no provider can hand the browser a link it would render as a button.
- A listing with no id, title, company, usable description or any application link is **dropped**
  rather than shown half-empty.
- **Unstated fields stay unstated**: `"unknown"` or `null`, surfaced through `missingFields` so the
  UI prints "not provided by the source". The only derived values are read out of the provider's own
  title or tags (e.g. "Senior" → `senior`), which is parsing, not guessing. Ambiguous body text
  (mentioning both "remote" and "hybrid") yields `unknown`.
- A date is kept only when it parses and is neither in the future nor older than five years;
  `postedAtReliable` reflects the adapter's own claim about what the field means.
- Salary is reported only from real numbers, reversed ranges are corrected, and a non-ISO currency
  is dropped rather than invented.
- **De-duplication** is two-level: `(providerSlug, externalId)` within a provider, then a
  `sha1(title|company|city)` fingerprint across providers, where the more complete record wins
  (ties broken by the newer posting date) and the loser is recorded in `duplicateOf`.

## Matching (`job-match-1.0`, `jobMatchService.js`, pure, no AI)

This is not a second scoring system: skill evidence is the Phase 11 `classifySkillEvidence`,
keyword extraction is the Phase 8 `keywordsFromText`, and the career level is the Phase 11
`inferLevel`. A skill judged "demonstrated" here is judged "demonstrated" in the ATS panel too.

Seven dimensions, weights summing to 100 when all apply:

| Dimension | Weight |
|---|---|
| Required skills demonstrated | 30 |
| Job description keyword coverage | 20 |
| Relevant work experience | 15 |
| Preferred skills demonstrated | 10 |
| Relevant projects | 10 |
| Experience-level alignment | 10 |
| Education and certifications | 5 |

Rules:

- **Evidence is four-valued**: `demonstrated` (used in a role or project) → full credit,
  `mentioned` (listed but not shown anywhere) → 60%, `not_found` (absent from the document) → 0,
  `not_assessed` (nothing to compare). The wording is explicit that a missing keyword means it is
  missing from the resume, **not** that the user lacks the skill.
- **A dimension with nothing to assess is excluded** and the remaining weights re-normalise. A
  listing that states no level, or no degree requirement, simply drops those dimensions instead of
  scoring zero. A resume with no projects is not punished for it.
- Requirements are split into **required** and **preferred** by the listing's own headings
  ("Requirements" / "Nice to have"); a heading line that also carries content keeps that content.
  Years of experience and degree requirements are read from the text, and `or equivalent` wording
  downgrades a degree from required to merely mentioned.
- **Location, work arrangement and salary are not part of the match.** Fit ("can you do this job")
  and preference ("do you want it") are kept apart; preferences appear as `preferenceNotes` and in
  ranking. Changing where you want to work never changes how qualified you are.
- `mismatches` names the things worth knowing before applying — missing required skills, a stated
  degree requirement with no education entry, a level gap, a years-of-experience ask — each with its
  evidence and a note on how to read it.
- `MATCH_DISCLAIMER` is returned with every report: the score measures document overlap and is not a
  prediction of being shortlisted or hired.

## Ranking (`job-ranking-1.0`, `jobRankingService.js`, pure)

Configurable weights (per user, overridable per request, each bounded 0–100):
match 40 · target role 15 · demonstrated skills 15 · location 10 · arrangement 10 · salary 5 ·
freshness 5.

- **Relevance and freshness are reported separately.** `relevanceScore` excludes posting age
  entirely; `rankScore` includes it as its own factor, labelled "urgency, not fit", and only when
  the provider supplies a timestamp worth trusting. Sorting by `newest` puts undated listings last
  rather than guessing their age.
- **Missing data excludes a factor**; it is never a penalty. An unstated salary therefore outranks a
  stated poor one, and a currency mismatch is not scored because currencies are not converted.
- Every factor carries an `evidence` sentence, `reasons` explains why a job is recommended, and
  `excludedFactors` says what could not be assessed and why.
- **Sponsored listings are flagged and never boosted**: `isSponsored` adds a note and nothing else.

## Preparation (`job-prep-1.0`, `jobPreparationService.js`)

Almost nothing of its own: skill gaps come from the Phase 7 `analyzeSkillGaps` (fed this listing's
requirements and the match's evidence states), interview history, weak topics, practice plan and
coding exercises from the Phase 9 `buildInterviewPrep` over Phase 6 records, and resources from the
Phase 7 verified catalogue. The job-specific part is turning requirements into topics ordered by
evidence — a *mentioned* skill is flagged as the most likely place to be probed, a *not found* skill
comes with advice to be honest about it. Behavioural topics are detected only from the listing's own
wording, and generic fallbacks are labelled as generic.

## API

All routes require `Authorization: Bearer <jwt>`, are owner-scoped and Zod-validated. `:jobId` is a
provider listing id, or `jd:<id>` for one of the user's own job descriptions. No route calls an LLM.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs/discover` | Filters (`q`, `location`, `workArrangement`, `employmentType`, `experienceLevel`, `minSalary`, `postedWithinDays`, `source`, `includeHidden`), `sort=relevance\|newest\|match`, `weights`, pagination, `refresh` |
| GET | `/api/jobs/providers` | Adapter list with configuration state, last result and attribution |
| POST | `/api/jobs/refresh` | Forces a provider round; 503 when none is configured |
| GET | `/api/jobs/:jobId` | Listing, requirements, match, ranking, preparation, saved/application state |
| POST | `/api/jobs/:jobId/match` | Computes and (by default) stores the match; `compareAllVersions` recommends the best version |
| GET | `/api/jobs/:jobId/match-report` | Stored report, or a fresh computation when none exists |
| GET | `/api/jobs/:jobId/interview-preparation` | Topics, questions, sessions, coding exercises, learning |
| POST | `/api/jobs/:jobId/tailor-resume` | Prepares the Phase 8 hand-off (saved description, recommended version, truthful keyword suggestions) |
| GET / POST | `/api/saved-jobs` | Saving is idempotent per (user, job) |
| PATCH / DELETE | `/api/saved-jobs/:savedJobId` | State and notes |
| POST | `/api/saved-jobs/:savedJobId/application` | Creates **one** `JobApplication`; 409 on a duplicate unless `allowDuplicate` |
| GET / PUT | `/api/job-preferences` | Weights bounded 0–100 each |
| GET / POST | `/api/job-alerts` | At most 20 per user; names unique |
| PATCH / DELETE | `/api/job-alerts/:alertId` | |
| POST | `/api/job-alerts/:alertId/run` | Runs the search and notifies about genuinely new matches |

Application status changes, follow-up dates and interview dates continue to go through
`/api/applications`; tailoring suggestions, accept/reject and PDF export through
`/api/resume-builder/*`. Phase 12 adds no second workflow for either.

## Alerts and the absence of a scheduler

There is no background job runner in this deployment (`backend/src/jobs/README.md`), so an alert is
delivered **when it is run** — by the user, or by a future scheduler calling `runAlert`.
`frequency` is stored as the user's intent and the API returns `deliveryMode: "manual"` with a note
saying nothing runs in the background and no email or push is sent, plus `requiresForAutomatic`
describing what would be needed. The UI repeats this rather than implying real-time alerts.

De-duplication is structural: each notification's key is `job-alert:<alertId>:<jobId>` and
`UserNotification` is unique on `(userId, dedupeKey)`. The service also checks existing keys before
creating, so a repeat run reports "nothing new" instead of relying on a swallowed constraint
violation. At most five notifications are created per run, and the response says how many further
new matches are waiting.

## Security

- Provider credentials live only in backend environment variables; the browser never receives them.
- External job text is untrusted: HTML-stripped, sanitised, length-capped and fence-neutralised, and
  rendered as text (never `dangerouslySetInnerHTML`). A prompt-injection attempt inside a
  description cannot change the match, which is deterministic and derived only from the resume's own
  evidence — a test asserts the score is identical with and without the injected text.
- Only absolute `http(s)` URLs are ever stored or linked; outbound links carry
  `rel="noopener noreferrer nofollow"`.
- Search parameters are capped (short free text, bounded page/limit, enum filters) and ranking
  weights bounded, so no input can turn one factor into the whole score or widen a provider request.
- Every saved job, preference, match report and alert is filtered by `userId`; a miss is a 404 so
  one user cannot discover that another's row exists. Cached provider listings are shared by design
  and contain nothing a user wrote.
- An expired or uncached listing id returns an explanatory 404; no endpoint substitutes data when a
  provider fails.

## Frontend (Next.js App Router)

`/dashboard/jobs` (search, filters, sort, pagination, save/hide, provider status and attribution),
`/dashboard/jobs/[jobId]` (full description, requirements, match report, preparation, tailoring
hand-off, start-application), `/dashboard/jobs/saved` (states, notes, tracker links),
`/dashboard/jobs/preferences` (preferences, ranking weight sliders, provider state),
`/dashboard/jobs/alerts` (create, run, pause, delete).

Components in `frontend/src/components/jobs/`: `JobCard`, `JobSearchFilters`, `JobResultsList`,
`JobDetails`, `JobMatchReport`, `JobInterviewPreparation`, `SavedJobs`, `JobSearchPreferences`,
`JobAlertSettings`, `ProviderSetupNotice`, `JobsNav`, `JobsPageShell`. Service:
`frontend/src/services/jobDiscoveryService.ts`. Navbar entry "Job Discovery".

The UI never computes a score and never fills in a missing field: absences read "not published",
"not provided by the source" or "not stated", and `ProviderSetupNotice` explains the configuration
when there is no provider instead of showing sample vacancies.

## Environment

```bash
JOB_PROVIDERS=                        # comma-separated slugs; empty = manual entry only
JOB_PROVIDER_TIMEOUT_MS=8000
JOB_CACHE_TTL_MINUTES=30
JOB_RETENTION_DAYS=30
JOB_PROVIDER_RATE_LIMIT_PER_MIN=20
ADZUNA_APP_ID=                        # developer.adzuna.com
ADZUNA_APP_KEY=
ADZUNA_COUNTRY=gb
JOOBLE_API_KEY=                       # jooble.org/api/about
```

`remotive` and `arbeitnow` need no credentials, so `JOB_PROVIDERS=remotive,arbeitnow` is enough to
get live listings. Restart the backend after changing these.

## Tests

- `backend/tests/phase12.test.js` (44 tests): HTML/entity conversion and script discarding; URL
  validation; listings dropped for missing essentials; unstated fields staying unstated; title/tag
  inference; salary and date parsing incl. reversed ranges, future dates and relative phrases;
  two-level de-duplication; each adapter's documented payload shape and declared capabilities;
  missing-credential and unknown-slug reporting; timeout / 429 / 500 / non-JSON degrading one
  provider only; the pre-request rate limit; the no-provider path returning a setup guide and no
  listings; requirement splitting; four-valued evidence; excluded dimensions and weight
  re-normalisation; the weighted-mean score; the no-resume path; preferences not affecting fit;
  ranking explanations with freshness separate from relevance; missing data excluding a factor;
  sponsored listings not boosted; all three sort orders; bounded and zeroable weights; evidence-led
  interview topics; and over HTTP: discovery with caching / filtering / pagination / sorting,
  partial-provider reporting, saved-job CRUD with hidden filtering, application creation with
  duplicate refusal and deliberate override, preference round-trip and validation, excluded
  companies, job detail, match computation / persistence / version comparison, the tailoring
  hand-off actually driving the Phase 8 endpoint, interview preparation, alert validation /
  manual-only delivery / notification de-duplication across three runs, authentication on all 20
  endpoints, cross-user isolation, manual job descriptions, retention purging that keeps saved
  listings, and prompt injection leaving the score unchanged.
- Full backend suite: **14/14 files pass** (Phases 1–11 unaffected).
- Frontend: `tsc` clean; `next build` succeeded with 46 routes.
- No test touches the network: the provider `fetch` is injected through `createApp({ jobFetch })`.

## Limitations (honest)

- **Live listings require a configured provider.** With none, discovery searches only the user's own
  job descriptions and says so; no sample data is ever shown.
- Alerts run on demand only. Daily/weekly frequencies are recorded as intentions — there is no job
  runner, and no email or push delivery exists. Notifications are in-app.
- Cross-provider de-duplication is a title/company/city fingerprint. Two genuinely distinct roles
  with the same title, company and city collapse into one; provider data rarely distinguishes them.
- Salary figures are shown only when published, are never converted between currencies, and an
  Adzuna "predicted" figure is labelled as an estimate rather than treated as the employer's offer.
- Posting dates come from the provider. Jooble's date is an update time and is deliberately never
  used for freshness or date filtering, so its listings sort last under "newest".
- Experience level and employment type are read from the listing's own title and tags; a listing
  that does not state them is `unknown` and is excluded by a filter for them rather than guessed.
- Years-of-experience requirements are surfaced but not evaluated: the resume's total years are not
  computed, so the user judges that one.
- The match score describes overlap between one resume version and one description. It does not
  predict shortlisting or hiring, and it cannot see anything the employer has not written down.
- Company details are shown exactly as the source supplied them. Nothing is verified, enriched or
  added, and no listing is presented as employer-verified.
- Nothing is ever submitted to an employer: the app only links out to the application page.
