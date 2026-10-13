# AI Resume Analyzer — Backend (Phase 4)

Express + Prisma (PostgreSQL) + LLM API service that powers the real AI analysis in the Next.js frontend (`../resume-analyzer`).

- Provider-configurable LLM integration (`anthropic` with native structured outputs, or `gemini` with JSON mode) — the key lives only on this server.
- Every model response is validated with Zod before it is scored, stored or returned.
- The match score is **computed by the application** from the model's evidence-backed classifications (see `src/services/scoringService.js`), never taken from the model.
- JWT email/password auth, per-user ownership checks, rate limits, CORS restricted to the frontend origin, request timeouts, input size limits and prompt-injection hardening.

## Folder structure

```
backend/
  src/
    config/        env.js (validated env), prisma.js
    controllers/   authController.js, analysisController.js
    routes/        authRoutes.js, analysisRoutes.js
    services/      llmProvider.js, resumeAnalysisService.js, scoringService.js,
                   atsService.js, analysisRepository.js, authService.js
    middleware/    auth.js, validate.js, rateLimit.js, errorHandler.js
    validators/    analysisSchemas.js (request + AI output schemas), authSchemas.js
    utils/         errors.js, logger.js, sanitize.js
    app.js         Express app factory (dependencies injected — used by tests)
    server.js      Entry point
  prisma/
    schema.prisma
    migrations/    initial migration (generated from the schema)
  tests/           node:test suites (no database or network needed)
  .env.example
```

## Setup

```bash
cd backend
npm install
cp .env.example .env        # then edit values (see below)
npx prisma generate
npx prisma migrate deploy   # applies prisma/migrations to DATABASE_URL (or: npm run db:migrate for dev)
npm run dev                 # http://localhost:4000
```

Frontend (`../resume-analyzer`): add `NEXT_PUBLIC_API_URL=http://localhost:4000` to `.env` and run `npm run dev` (port 3001).

### Environment variables (`backend/.env`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | default `4000` |
| `FRONTEND_URL` | yes | CORS origin(s), comma-separated. e.g. `http://localhost:3001` |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | ≥ 32 chars. `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | no | default `7d` |
| `LLM_PROVIDER` | no | `anthropic` (default) or `gemini` |
| `LLM_API_KEY` | for AI | Provider key. If empty the server starts, but analysis endpoints return `503 LLM_NOT_CONFIGURED` and the frontend offers demo mode. |
| `LLM_MODEL` | no | default `claude-opus-5-5` (anthropic) / `gemini-flash-latest` (gemini) |
| `LLM_TIMEOUT_MS` | no | default `90000` |
| `LLM_MAX_RETRIES` | no | retries on 429/5xx/network, default `2` |
| `ANALYSIS_RATE_LIMIT` | no | analysis requests per user per 15 min, default `10` |
| `STORE_RESUME_TEXT` | no | default `false`. When `true`, resume text is stored so analyses can be regenerated server-side. |

The server refuses to start if a required variable is missing or malformed. Never commit `.env`.

## API

All responses are JSON. Errors have the shape `{ "error": { "code", "message", "details?", "retryable?" } }`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | `{ status, ai: { configured, provider, model } }` |
| POST | `/api/auth/register` | – | `{ email, password, name? }` → `{ user, token }` |
| POST | `/api/auth/login` | – | `{ email, password }` → `{ user, token }` |
| GET | `/api/auth/me` | Bearer | current user |
| POST | `/api/analysis/resume` | Bearer | run an AI analysis (body below) → `201 { analysis }` |
| GET | `/api/analysis` | Bearer | list the user's analyses (metadata only) → `{ analyses, nextCursor }` |
| GET | `/api/analysis/:id` | Bearer | one analysis incl. full `result` and `jobDescription` |
| DELETE | `/api/analysis/:id` | Bearer | `204` |
| POST | `/api/analysis/:id/regenerate` | Bearer | re-run; body `{ resumeText? }` (required unless `STORE_RESUME_TEXT=true`) |

`POST /api/analysis/resume` body:

```json
{
  "resumeText": "extracted text (200–30000 chars)",
  "jobTitle": "Frontend Developer",
  "targetRole": "Frontend Developer",
  "jobDescription": "100–20000 chars",
  "companyName": "optional",
  "fileName": "optional"
}
```

`analysis.result` (validated) contains: `analysisMode: "ai"`, `summary`, `matchScore` (0–100 or `null` when evidence is insufficient), `scoreExplanation`, `scoreBreakdown`, `lowEvidence`, `matchedSkills[]` / `partiallyMatchedSkills[]` (each with `evidence`, `evidenceType: direct|inferred`, `priority`), `missingOrUnverifiedSkills[]` (with `reason`), `strengths`, `improvementSuggestions`, `keywordAnalysis`, `experienceAlignment`, `educationAlignment`, `atsChecks[]` (each with `verifiability: text|heuristic|requires-original`), `interviewQuestions[]` (with `category`, `difficulty`, `reason`), `limitations[]`.

### Status codes

400 validation · 401 missing/invalid token · 404 not found or not owned · 409 duplicate email · 413 body too large · 422 provider refusal / resume text unavailable · 429 rate limited (app or provider) · 502 bad provider output · 503 provider/database unavailable or not configured · 504 provider timeout.

## Match score

`scoringService.js` — weights are documented there and returned in every result:

| Component | Weight | Credit |
|---|---|---|
| Required skills | 0.45 | matched 1 · partial 0.5 · missing/unverified 0 |
| Preferred / unknown-priority skills | 0.15 | same |
| Experience alignment | 0.25 | yes 1 · partial 0.5 · no 0 · unknown = not applicable |
| Education / certifications | 0.15 | same; not applicable when the job states no requirement |

Components that are not applicable are dropped and the remaining weights re-normalised. Fewer than 4 classified skills flags `lowEvidence`; no classifiable evidence returns `matchScore: null` with an explanation instead of a misleading number.

## Security notes

- The user id always comes from the signed JWT, never the body.
- Resume and job description are sanitised (control/zero-width chars stripped, fence tags neutralised, length-capped) and sent inside `<resume>` / `<job_description>` tags with a system prompt that treats them as untrusted data; detected injection phrases are reported in `limitations`.
- Helmet, CORS allow-list, global + auth + analysis rate limits, 512 KB JSON limit, 120 s request timeout, provider timeouts and bounded retries.
- Logs never include resume text, passwords, tokens or keys (`utils/logger.js` redacts common secret keys).
- Only derived results are persisted by default (`STORE_RESUME_TEXT=false`).

## Tests

```bash
npm test
```

Runs with `node --test` and needs no database or network: scoring, validation (request, AI output, env), ATS/sanitisation/prompt rules, and full HTTP tests of every endpoint with an in-memory data store and a fake provider (auth, ownership, delete, regenerate, provider timeout / rate limit / malformed output / unconfigured, CORS, oversized bodies).
