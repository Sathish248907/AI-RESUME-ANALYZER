# Phase 5 — Persistent Dashboard, Resume History & Job Application Tracking

PostgreSQL (via Prisma) is the source of truth for signed-in users. localStorage is used only for
the browser-only demo analyses and the rule-based job analyzer from Phase 3, which stay clearly
labelled as such.

## Database schema changes (`backend/prisma/schema.prisma`)

Migration: `backend/prisma/migrations/20261014000000_phase5_resumes_jobs_applications/` — additive only
(29 statements, no `DROP`), so existing `api_users` / `api_analyses` rows are preserved.

| Model (table) | Purpose | Notes |
|---|---|---|
| `Resume` (`api_resumes`) | Uploaded resume per user | `extractedText` is retained so the resume can be re-analysed; returned only to its owner and only as a 600-char preview outside analysis. `storageKey` references the original file when `STORAGE_DRIVER=local`. Indexes: `(userId, createdAt)`, `(userId, name)`. |
| `JobDescription` (`api_job_descriptions`) | Saved, reusable job description | `extractedRequirements` JSON from the Phase 3 rule-based parser. Indexes: `(userId, createdAt)`, `(userId, targetRole)`. |
| `Analysis` (`api_analyses`, = *ResumeAnalysis*) | One analysis run | New nullable `resumeId`, `jobDescriptionId` (`onDelete: SetNull`) and indexes on `(userId, matchScore)`, `(userId, targetRole)`, `resumeId`, `jobDescriptionId`. History is append-only: regenerate inserts a new row. |
| `JobApplication` (`api_job_applications`) | Application tracker | `status` is the enum `ApplicationStatus` (INTERESTED, APPLIED, ASSESSMENT, INTERVIEW, OFFER, REJECTED, WITHDRAWN). Optional links to resume / job description / analysis are `SetNull` on delete. Indexes on `(userId, status)`, `(userId, applicationDate)`, `(userId, nextFollowUpDate)`, `(userId, companyName)`. |
| `InterviewSession` (`api_interview_sessions`) | Interview practice history | Recorded from the Interview tab of an AI analysis. |

All user-owned models cascade on user deletion.

### Applying the migration

```bash
cd backend
npx prisma generate
npx prisma migrate deploy        # production-safe; applies pending migrations only
# or during development:
npx prisma migrate dev           # never use `prisma migrate reset` on a database with user data
```

## New / changed API endpoints (all require `Authorization: Bearer <jwt>` unless noted)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/dashboard/overview` | totals, average match (AI only, with sample size), follow-ups, learning progress, skill gaps, recommended actions |
| GET | `/api/dashboard/activity?limit=5` | recent analyses, recent applications, upcoming follow-ups |
| GET | `/api/dashboard/analytics?range=7d\|30d\|90d\|12m\|all&granularity=week\|month` | score trend, applications/analyses/interviews over time, status distribution, skill gaps, weekly & monthly summaries |
| POST | `/api/resumes` (multipart `resume`, `name?`, `targetRole?`) | upload + parse + store |
| GET | `/api/resumes?q&targetRole&sort=newest\|oldest\|name\|role&page&limit` | list with latest analysis + counts (no text) |
| GET | `/api/resumes/:id` | detail (600-char preview) + analysis history |
| GET | `/api/resumes/:id/download` | original file; 404 unless `STORAGE_DRIVER=local` |
| PATCH | `/api/resumes/:id` | rename / target role |
| DELETE | `/api/resumes/:id` | removes row + stored file; analyses keep history with `resumeId = null` |
| POST | `/api/analysis/resume` | now accepts `resumeId` and/or `jobDescriptionId` instead of raw text, plus `saveJobDescription: true` |
| GET | `/api/analysis?targetRole&resumeId&jobDescriptionId&mode&from&to&sort=newest\|oldest\|score_desc\|score_asc&page&limit` | paginated history with skill counts |
| POST | `/api/analysis/:id/regenerate` | **creates a new record** (201, `previousId`) |
| GET/POST | `/api/job-descriptions` | list (`q`, `targetRole`, `sort=newest\|oldest\|title\|company`) / create |
| GET/PATCH/DELETE | `/api/job-descriptions/:id` | detail includes analyses per resume (compare view) |
| GET/POST | `/api/applications` | list (`q`, `status` (comma list), `targetRole`, `from`, `to`, `sort=newest\|oldest\|company\|followUp\|updated\|score`) + pipeline / create |
| GET | `/api/applications/pipeline` | counts per status |
| GET/PATCH/DELETE | `/api/applications/:id` | linked records must belong to the same user (400 otherwise) |
| GET | `/api/interviews/history?status&from&to` | sessions + summary |
| POST / PATCH / DELETE | `/api/interviews`, `/api/interviews/:id` | record / update / delete a practice session |

Ownership: every repository query is scoped by the user id from the verified JWT; cross-user access returns 404.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `STORAGE_DRIVER` | `none` | `none` discards original files after text extraction; `local` keeps them under `STORAGE_LOCAL_DIR` with random names (owner-only download) |
| `STORAGE_LOCAL_DIR` | `uploads/private` | git-ignored |

## Frontend pages

| Route | Page |
|---|---|
| `/dashboard` | Real metrics from `/api/dashboard/*` when signed in; empty states otherwise; Phase 3 local job analyses kept in a clearly labelled section |
| `/dashboard/my-resumes` | Resume management (upload, rename, delete, history, analyze) |
| `/dashboard/analysis-history` | AI + demo history with role/date/sort filters, reanalyze (new record), delete |
| `/dashboard/applications` | Tracker with table, card and drag-and-drop Kanban views, pipeline, filters, linking |
| `/dashboard/job-descriptions` | Saved descriptions with extraction preview, compare resumes against a job |
| `/dashboard/analytics` | Recharts: score trend, applications/analyses/interviews over time, status pie, skill gaps, weekly/monthly tables |
| `/dashboard/resume-analyzer` | Can now use a stored resume and/or a saved job description (`?resumeId=`, `?jobDescriptionId=`) |

## Tests

`npm test` in `backend/` (node:test, in-memory Prisma fake, fake LLM): `phase5.test.js` (resumes, job descriptions, analysis filters, applications, interviews, dashboard, ownership, linked-record deletion), `dashboard.test.js` (metric calculations), plus the earlier suites.

## Known limitations

- No PostgreSQL was available on the development machine, so the migration was generated but **not applied**, and persistence was verified against the in-memory fake only.
- Interview sessions are recorded from practised questions on an AI analysis; there is no standalone mock-interview feature yet.
- Saved job descriptions are entered manually; URLs are stored for reference and never fetched (no SSRF surface).
