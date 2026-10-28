# AI Resume Analyzer

A production-grade, full-stack AI Resume Analyzer architected with strictly separated `frontend/` and `backend/` services. The application evaluates resumes against target job descriptions, computes deterministic ATS readiness and skill match scores, surfaces missing skills and keyword gaps, generates actionable improvements, and creates tailored technical interview preparation questions.

---

## Features

- **Resume Upload & Text Extraction**: In-memory parsing of PDF and DOCX documents with magic-byte format validation and sanitization.
- **Job Description Parsing & Requirement Extraction**: Automatic classification of required vs. preferred skills, education, and years of experience.
- **Deterministic Match & ATS Scoring**: Evidence-backed scoring computed on the backend from verified extractions (not opaque model hallucinations).
- **Skill Alignment Breakdown**: Visual mapping of direct matches, inferred skills, missing competencies, and keyword gaps.
- **Actionable Suggestions**: Prioritized suggestions categorized by content, impact, and formatting.
- **AI-Powered Technical Interview Preparation**: Role-tailored questions categorized by topic, difficulty, and rationale.
- **Progress Tracking & Analytics**: User dashboard with analysis history, weak-topic identification, and saved resumes.
- **Dual Flow**: Demo mode (local in-browser storage) and authenticated mode (PostgreSQL persistence via Prisma ORM).

---

## Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 13 (App Router), React 18, TypeScript, Tailwind CSS, Lucide React, Axios |
| **Backend** | Node.js, Express, Prisma ORM, Multer, Helmet, CORS, Express-Rate-Limit, Zod |
| **Database** | PostgreSQL |
| **AI Providers** | Anthropic Claude (`@anthropic-ai/sdk`), Google Gemini (`@google/generative-ai`) |
| **Document Parsing**| `pdf-parse`, `mammoth` |
| **Testing** | Node test runner (`node:test`, `node:assert/strict`) |

---

## Final Project Directory Structure

```
AI-RESUME-ANALYZER/
│
├── frontend/                          # Client application (Next.js 13 / React 18)
│   ├── public/                        # Static assets, SVG icons, and favicons
│   ├── src/
│   │   ├── app/                       # Next.js App Router pages and route handlers
│   │   │   ├── analyze/               # Interactive upload & analysis page
│   │   │   ├── auth/                  # Authentication pages (login, signin)
│   │   │   ├── dashboard/             # User dashboard, job analyzer & history
│   │   │   ├── history/               # Analysis records history
│   │   │   ├── layout.tsx             # Root application shell (Navbar, Footer)
│   │   │   └── page.tsx               # Marketing landing page
│   │   ├── assets/                    # Asset documentation and component assets
│   │   ├── components/
│   │   │   ├── common/                # Reusable UI primitives (Badge, Button, Card, ProgressBar)
│   │   │   ├── layout/                # Layout components (Navbar, Footer)
│   │   │   ├── resume/                # ResumeDropzone component
│   │   │   ├── analyzer/              # FilePreview, JobDescriptionForm, AnalysisLoading
│   │   │   ├── interview/             # InterviewQuestionsList
│   │   │   ├── job-analysis/          # JobOverviewCard, ExperienceEducationCard, KeywordAnalysisCard
│   │   │   ├── dashboard/             # ScoreGauge, SkillsPanel, SuggestionsList
│   │   │   └── results/               # ATSReadinessCard, MatchScoreCard, SkillsComparison
│   │   ├── context/                   # React Context providers (AuthContext)
│   │   ├── hooks/                     # Custom hooks (useAuth)
│   │   ├── layouts/                   # Reusable page layouts (DashboardLayout)
│   │   ├── routes/                    # Centralized route & API constants
│   │   ├── services/                  # API client (api.ts), authService, resumeParser
│   │   ├── store/                     # Client cache and storage utilities
│   │   ├── types/                     # Shared TypeScript interfaces
│   │   └── utils/                     # Formatting and utility functions
│   ├── .env.example                   # Frontend environment configuration template
│   ├── package.json                   # Frontend scripts and dependencies
│   ├── tsconfig.json                  # TypeScript configuration
│   └── README.md                      # Frontend-specific documentation
│
├── backend/                           # API service (Node.js / Express / Prisma)
│   ├── src/
│   │   ├── config/                    # Environment validation (env.js) and Prisma client
│   │   ├── controllers/               # Request controllers (authController, analysisController, resumeController)
│   │   ├── routes/                    # Express routers (authRoutes, analysisRoutes, resumeRoutes)
│   │   ├── models/                    # Data access layer (analysisRepository.js)
│   │   ├── services/
│   │   │   ├── ai/                    # LLM provider abstraction (llmProvider.js)
│   │   │   ├── resume/                # ATS engine, scoring, and text parsing services
│   │   │   ├── interview/             # Technical interview question generator
│   │   │   └── authService.js         # User registration and JWT issuance
│   │   ├── middleware/                # Auth token verification, rate limiting, error handlers
│   │   ├── validators/                # Request & AI output schemas (Zod)
│   │   ├── utils/                     # Errors, redaction logger, prompt sanitizer
│   │   ├── jobs/                      # Background task definitions
│   │   ├── app.js                     # Express application factory
│   │   └── server.js                  # HTTP server entry point
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema definitions
│   │   └── migrations/                # Database migrations
│   ├── tests/                         # Node:test test suites (api, parsing, scoring, validation)
│   ├── uploads/                       # Ephemeral upload staging (.gitkeep)
│   ├── .env.example                   # Backend environment configuration template
│   ├── package.json                   # Backend scripts and dependencies
│   └── README.md                      # Backend-specific documentation
│
├── docs/                              # Project architecture & API specifications
│   ├── architecture.md                # System design, data flow, security model
│   ├── api.md                         # Complete REST API reference
│   └── setup.md                       # Comprehensive setup guide
│
├── .gitignore                         # Root Git ignore rules (protects credentials & builds)
├── package.json                       # Monorepo task runner
├── README.md                          # Root project documentation
└── LICENSE                            # MIT License
```

---

## Prerequisites

- **Node.js**: `v18.12.0` or newer
- **npm**: `v9.0.0` or newer
- **PostgreSQL**: Local database or hosted provider (Supabase / Neon / Railway)
- **AI Provider Key**: Anthropic API Key or Google Gemini API Key

---

## Installation & Setup

### 1. Install Dependencies
Run the install command from the project root:

```bash
npm run install:all
```

### 2. Configure Environment Variables

**Frontend (`frontend/.env`):**
```bash
cp frontend/.env.example frontend/.env
```
Ensure the API base URL is configured:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

**Backend (`backend/.env`):**
```bash
cp backend/.env.example backend/.env
```
Configure your database and AI provider:
```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/resume_analyzer?schema=public"

# Auth
JWT_SECRET="generate-a-secure-random-secret-key-at-least-32-chars"
JWT_EXPIRES_IN=7d

# AI Provider ("anthropic" or "gemini")
LLM_PROVIDER=anthropic
LLM_API_KEY="your-api-key"
LLM_MODEL="claude-opus-5-5"
```

### 3. Database Migration
```bash
npm run db:generate
npm run db:migrate
```

---

## Running the Application

### Start Frontend and Backend Together (Recommended)
```bash
npm run dev
```

### Start Services Individually
```bash
# Start frontend only (http://localhost:3001)
npm run dev:frontend

# Start backend only (http://localhost:4000)
npm run dev:backend
```

---

## Testing & Quality Assurance

These are the same checks CI runs on every push and pull request
(`.github/workflows/ci.yml`); a red run blocks the merge.

```bash
# Backend — unit, integration and full HTTP tests.
# Uses an in-memory database fake and a fake LLM: no credentials, no network.
npm test                                   # 17 files

# Backend — would this configuration start in production?
npm --prefix backend run check:env
NODE_ENV=production npm --prefix backend run check:env

# Backend — schema and migrations
npm --prefix backend exec prisma validate
npm --prefix backend exec prisma migrate status

# Frontend — lint, types, production build
npm --prefix frontend run lint
npm run typecheck
npm run build

# Dependency advisories (both packages)
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev
```

Known-accepted advisories and the reason each is accepted are listed in
[docs/phase15.md](docs/phase15.md#audit-findings).

---

## API Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | Liveness only — says nothing about the deployment | No |
| `GET` | `/api/health/ready` | Readiness: 200 `ready` / 503 `not_ready` per dependency | No |
| `GET` | `/api/health/details` | Uptime, AI provider, storage, integrations | `HEALTH_TOKEN` |
| `POST` | `/api/auth/register` | Create a new user account | No |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT | No |
| `GET` | `/api/auth/me` | Fetch authenticated user profile | Bearer Token |
| `POST` | `/api/resume/parse` | Parse uploaded PDF/DOCX into clean text | No |
| `POST` | `/api/analysis/run` | Execute resume vs. job analysis | Optional |
| `GET` | `/api/analysis` | List user analysis records | Bearer Token |
| `GET` | `/api/analysis/:id` | Fetch specific analysis result | Bearer Token |
| `DELETE`| `/api/analysis/:id` | Delete an analysis record | Bearer Token |
| `GET` | `/api/recommendations` | Cross-feature "what to do next", with reasons | Bearer Token |
| `GET` | `/api/onboarding` | First-run setup progress | Bearer Token |

Detailed request/response payloads are documented in [`docs/api.md`](docs/api.md).

---

## GitHub Workflow & Safety

1. **Protected Secrets**: `.env`, `.env.*`, and upload buffers are excluded by `.gitignore`.
   Never put a real value in a workflow file — use repository secrets.
2. **Branch Hygiene**: Never use destructive commands (`git push --force`, `git reset --hard`).
3. **Continuous Verification**: CI runs lint, types, tests, migrations and the production build.
4. **Never against a real database**: `prisma migrate dev`, `prisma db push` and
   `prisma migrate reset` can drop data. Production uses `prisma migrate deploy` only.
   The frontend package deliberately has no `db:*` migration script — its schema describes
   the small `legacy` schema and knows nothing of the backend's 55 tables.

---

## Deployment, backup and recovery

- [docs/deployment.md](docs/deployment.md) — architecture, the full environment-variable
  reference, the Vercel/Render/Neon procedure, health checks and rollback.
- [docs/operations.md](docs/operations.md) — backups, restore procedure, RPO/RTO targets, the
  recovery drill, migration safety and an incident checklist.
- [docs/phase15.md](docs/phase15.md) — the production audit: what was found, what was fixed,
  what was measured, and what is explicitly **not** verified.

Before any deploy:

```bash
NODE_ENV=production npm --prefix backend run check:env
```

The backend refuses to start in production with a placeholder `JWT_SECRET`, a plain-http CORS
origin, or a leftover `localhost` origin. Fix the variable rather than the guard.

---

## License

This project is licensed under the [MIT License](LICENSE).

## Phase 5 — Persistent dashboard, resume history, job tracking

See [docs/phase5.md](docs/phase5.md) for the schema changes, migration commands, new API endpoints, pages and known limitations.

## Phase 6 — AI mock interviews & answer evaluation

See [docs/phase6.md](docs/phase6.md) for the interview models, versioned scoring rubric, report aggregation method, endpoints and limitations.

## Phase 7 — Personalized learning roadmap & skill gap tracking

See [docs/phase7.md](docs/phase7.md) for the skill-gap scoring method, roadmap generation/validation pipeline, progress derivation, `/api/learning/*` endpoints, pages, tests and limitations.

## Phase 8 — AI resume improvement assistant & resume builder

See [docs/phase8.md](docs/phase8.md) for the content schema, grounded AI suggestion flow, quality checks, versioning, PDF export, `/api/resume-builder/*` endpoints, tests and limitations.

## Phase 9 — AI career coach & job application intelligence

See [docs/phase9.md](docs/phase9.md) for the readiness method, recommendation / priority / plan engines, grounded coach chat, `/api/career/*` endpoints, tests and limitations.

## Phase 10 — Advanced analytics, gamification & career progress intelligence

Analytics dashboard with date filters and period comparisons, a transparent six-dimension Career Progress Score (missing evidence excluded, never zeroed), an auditable points ledger with reversals, levels / XP, 14 achievements, timezone-aware learning streaks, personal goals measured from real records, on-demand weekly & monthly reports (AI narrative with deterministic fallback, PDF export) and an in-app notification + activity feed. See [docs/phase10.md](docs/phase10.md). Pages live under `/dashboard/progress`; API under `/api/analytics`, `/api/gamification`, `/api/goals`, `/api/progress-reports`, `/api/notifications`.

## Phase 11 — ATS readiness, resume validation, role fit & writing assistant

A transparent seven-category ATS readiness score with a ranked action plan and saved trends (general and job-specific kept apart), deterministic document checks with nine safe mechanical fixes that report their real before/after score, evidence-based suitability for ten roles (no salary, demand or hiring-probability claims), and an in-editor writing assistant that returns editable drafts and withholds any draft that invents a fact. See [docs/phase11.md](docs/phase11.md). Panels live in the resume editor at `/dashboard/resume-builder/[versionId]`; API under `/api/resume-builder/versions/:versionId/*`.

## Phase 12 — Job discovery & intelligent job matching

Real listings from configurable providers (Remotive and Arbeitnow need no credentials; Adzuna and Jooble take API keys), normalized and de-duplicated across sources, matched against your own resume versions with four-valued skill evidence (demonstrated / mentioned / not found / not assessed), ranked with explainable, configurable weights that keep relevance separate from posting freshness and exclude — never penalise — missing data, plus saved jobs, job-specific resume tailoring, interview preparation and in-app alerts. With no provider configured it searches the job descriptions you entered yourself and explains the setup instead of showing sample vacancies. See [docs/phase12.md](docs/phase12.md). Pages live under `/dashboard/jobs`; API under `/api/jobs`, `/api/saved-jobs`, `/api/job-preferences`, `/api/job-alerts`.

## Phase 13 — Application workspace, cover letters & application automation

A workspace for every application: an eleven-step preparation checklist that distinguishes steps this app can verify from steps only you can confirm (and never ticks a box for you, or treats opening an employer's page as a submission), grounded AI cover letters that withhold any paragraph inventing a figure or technology your resume does not support, secure document attachments validated by content rather than filename, an auditable activity timeline written only from operations that actually succeeded, timezone-correct reminders, interview rounds linkable to your mock interviews, and an optional readiness review that separates "missing information" from "a real problem" and never blocks you from applying. The brief's ten stages map onto the existing seven statuses — "Preparing" and "Ready to apply" are derived from the checklist — so the Phase 9/10 funnels keep their meaning. See [docs/phase13.md](docs/phase13.md). Pages live at `/dashboard/applications/[id]`; API under `/api/applications/:id/*`, `/api/cover-letters`, `/api/application-documents`, `/api/application-reminders`, `/api/application-interviews`.

## Phase 14 — Career platform integrations & smart workflow automation

Real OAuth connections to your own Google Calendar and Google Drive (authorization code + PKCE, tokens sealed with AES-256-GCM and never sent to the browser), a server-configured email transport, the Phase 12 job providers surfaced in the same picture, and a workflow engine built around two rules: an integration is shown as connectable only when the server could actually complete the flow — otherwise you get the exact missing environment variables and the redirect URI to register, not a button that fails — and nothing that leaves the app happens without an explicit approval. Calendar sync previews before it writes, creates events with no attendees so nobody is invited, and never duplicates on a second run; Drive uses `drive.file`, so this app can touch only the files it created itself; email defaults to recording mode and says plainly that nothing is delivered rather than implying mail is arriving. Four workflows (interview preparation, application follow-up, weekly summary, resume review) are off until you switch them on, each one previewable, each action labelled *in app* or *leaves the app*, with one switch that pauses everything. Nothing submits an application, contacts an employer, or reads your inbox. See [docs/phase14.md](docs/phase14.md). Page at `/dashboard/integrations`; API under `/api/integrations/*` and `/api/automation/*`.

## Phase 15 — Production readiness, security, performance

A full audit of the repository and the fixes that followed. The headline finding was live and
unauthenticated: the legacy `GET /api/history` route returned up to fifty analyses — full job
descriptions and resume-derived results — to **any** caller, and `DELETE /api/history?id=` removed
any row with no ownership check. Both are now authenticated against the backend's own JWT and
scoped to the caller, verified by re-running the attacks; no database row was touched. `/api/analyze`
no longer accepts a client-supplied `userId` (a write-side IDOR), caps its input, and is rate
limited, so an anonymous visitor can no longer run an unbounded bill at the AI provider. NextAuth —
zero users, unreachable from the UI, two critical advisories, and a second set of Google OAuth
secrets in the web tier — was removed, taking four of nine frontend advisories with it; the
frontend's `db:push`/`db:migrate` scripts went too, because its schema knows nothing of the
backend's 55 tables and pushing it at production would have offered to drop them.

Also: production configuration is now refused at boot when it is unsafe (placeholder secret, http
origin, leftover localhost) with `npm run check:env` as a pre-deploy gate; health is split into
public liveness, public readiness and token-gated detail so an anonymous caller learns nothing about
the deployment; every response carries an `x-request-id` that a 500 repeats back, so failures are
traceable without ever logging a resume; CI now runs lint, types, tests, `prisma migrate deploy`
against a real PostgreSQL and the production build on every push. Accessibility went from heading
skips on all eighteen page/viewport combinations to all eighteen clean, with a visible keyboard
focus ring confirmed by dispatching real Tab keys.

Backend advisories 5 → 1, frontend 9 → 5; the five that remain are documented with the reason each
is accepted and what unblocks it. **Nothing has been deployed and no restore has been performed** —
those procedures are written in [docs/deployment.md](docs/deployment.md) and
[docs/operations.md](docs/operations.md) and are explicitly marked unverified. See
[docs/phase15.md](docs/phase15.md) for the full audit, the measured results, and the remaining
blockers before a public launch.

## Phase 16 — Final integration & end-to-end experience

An audit of what Phases 1–15 actually built, verified by calling every endpoint with a fresh account
rather than reading code: **42 of 42 existing endpoints work.** The gaps were all compositional.

The dashboard's "recommended next actions" was still the Phase 5 rule set — never persisted, not
dismissible, and unaware of resume versions, job matches, the application workspace, interviews or
roadmaps, while a far better engine sat unused under `/api/career/*`. That engine is now the single
producer behind `/api/recommendations`, with two defects fixed: dismissals made on the learning page
were in a separate store with different keys and so never silenced the dashboard, and an item closed
as *done* could never return even when the condition recurred. Duplicate applications were prevented
on the job-discovery path but not when you added the same job by hand, so one job could become two
pipelines that drifted apart; both routes now behave identically. `frontend/src/routes/index.ts`
claimed to centralise every route, had zero importers, and pointed at an endpoint that does not
exist — deleted, and the README's endpoint table corrected.

Two things were missing entirely and were built: first-run onboarding, and a Settings hub. Onboarding
stores **progress only** — career stage, target roles and skills already live on `CareerProfile`, so
each step links to the feature that owns it and that feature does the writing. Step completion is
derived from real records, which means an account created in Phase 5 with three resumes is already
set up and is never told to "get started". Settings stores nothing of its own either; it points at
the four places that already own preferences.

**18/18 backend test files pass** (36 new tests), types and lint are clean, the production build
succeeds, the single additive migration applied with no reset, and **22/22 end-to-end journey steps
pass** against the live stack. Two test mistakes are recorded in the docs because they were
instructive: five of the first six "failures" were the probe's own wrong paths, and one duplicate
test passed against real PostgreSQL while failing against the in-memory double — the double was
taught `mode: "insensitive"` rather than the test being weakened. See
[docs/phase16.md](docs/phase16.md) for the inventory, what was deliberately left alone, and what is
explicitly not done.
