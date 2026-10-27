# Deployment

Target chosen for this project: **frontend on Vercel, backend on Render, database on Neon.**
Nothing below has been executed against a live production environment — these are the procedures
and the files to run them with. See [phase15.md](phase15.md) for what *was* verified.

---

## Architecture

```
  Browser
     │  https
     ▼
  Vercel ─────────────── Next.js 13 App Router (frontend/)
     │                   · static pages + 3 legacy route handlers
     │                   · /api/analyze, /api/history → the `legacy` schema
     │  https (CORS allowlist, bearer JWT)
     ▼
  Render ─────────────── Express + Prisma (backend/)
     │                   · all `/api/*` product endpoints
     │                   · AI provider calls (keys never leave here)
     │                   · OAuth token vault (AES-256-GCM)
     ▼
  Neon ───────────────── PostgreSQL
                         · schema `public` — 55 `api_*` tables (backend owns these)
                         · schema `legacy` — 3 tables (the Phase 1 /analyze flow)
```

Two independent Prisma schemas point at the same database. **`backend/prisma/schema.prisma` is the
only one with migrations.** `frontend/prisma/schema.prisma` describes the `legacy` schema and has
deliberately no `db:push` or `db:migrate` script — see *Database* below.

---

## Prerequisites

| Thing | Version / note |
|---|---|
| Node.js | 18.12 or newer (CI pins 18.20.4). Next 14+ would require ≥18.17 — see *Known upgrade path* |
| PostgreSQL | 14+ (Neon serverless is what this project uses) |
| An AI provider key | Anthropic or Gemini; the backend returns 503 on AI routes without one |

---

## Environment variables

### Backend (`backend/.env`, or the host's environment)

Validated at startup by `backend/src/config/env.js`. **A missing or malformed required variable
stops the process**; in production a placeholder value or a plain-http origin does too.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | — | `development` | `production` enables the strict configuration guards |
| `PORT` | — | `4000` | Listen port. Render sets this |
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **yes** | — | ≥32 chars. Production refuses the example value |
| `JWT_EXPIRES_IN` | — | `7d` | Token lifetime |
| `FRONTEND_URL` | **yes** | — | Comma-separated CORS allowlist. Production requires https and rejects localhost |
| `APP_BASE_URL` | — | `http://localhost:4000` | Public URL of the backend; the OAuth redirect base. Production requires https |
| `LLM_PROVIDER` | — | `anthropic` | `anthropic` or `gemini` |
| `LLM_API_KEY` | — | — | Unset ⇒ AI endpoints return 503, rest of the app works |
| `LLM_MODEL` | — | per provider | Override the default model |
| `LLM_TIMEOUT_MS` | — | `90000` | Per provider attempt |
| `LLM_MAX_RETRIES` | — | `2` | Transient failures only |
| `ANALYSIS_RATE_LIMIT` | — | `10` | AI requests per 15 min, per user or IP |
| `AUTH_RATE_LIMIT` | — | `20` | Sign-in/registration attempts per 15 min per IP |
| `HEALTH_TOKEN` | — | — | Bearer token for `/api/health/details`. Unset ⇒ that route 404s |
| `STORE_RESUME_TEXT` | — | `false` | Whether extracted resume text is persisted |
| `STORAGE_DRIVER` | — | `none` | `none` discards original files; `local` keeps them. See *Storage* |
| `STORAGE_LOCAL_DIR` | — | `uploads/private` | Only used by the `local` driver |
| `JOB_PROVIDERS` | — | *(empty)* | e.g. `remotive,arbeitnow`. Empty ⇒ no external job listings |
| `JOB_PROVIDER_TIMEOUT_MS` | — | `8000` | |
| `JOB_CACHE_TTL_MINUTES` | — | `30` | |
| `JOB_RETENTION_DAYS` | — | `30` | Cached third-party listings are deleted after this |
| `JOB_PROVIDER_RATE_LIMIT_PER_MIN` | — | `20` | Outbound calls per provider |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` / `ADZUNA_COUNTRY` | — | — | Only if Adzuna is in `JOB_PROVIDERS` |
| `JOOBLE_API_KEY` | — | — | Only if Jooble is in `JOB_PROVIDERS` |
| `INTEGRATION_ENCRYPTION_KEY` | — | — | 32 bytes base64. Unset ⇒ no OAuth integration can connect |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | — | Calendar + Drive. Unset ⇒ shown as "needs setup" |
| `EMAIL_TRANSPORT` | — | `log` | `log` records and delivers nothing |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | — | — | Required before `smtp` counts as configured |

### Frontend (Vercel project environment)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | Public https URL of the backend. Reaches the browser — never put a secret behind a `NEXT_PUBLIC_` name |
| `BACKEND_INTERNAL_URL` | — | Server-only override used by the legacy route handlers to verify tokens. Defaults to `NEXT_PUBLIC_API_URL` |
| `DATABASE_URL` | only for `/analyze` + `/history` | Must end with `?schema=legacy`. Omit it and those two routes fail; everything else is unaffected |
| `GEMINI_API_KEY` | only for `/analyze` | The legacy public analysis page calls Gemini directly |
| `GEMINI_MODEL` | — | Defaults to `gemini-flash-latest` |

> `NEXTAUTH_SECRET`, `GITHUB_CLIENT_ID/SECRET` and the frontend's `GOOGLE_CLIENT_ID/SECRET` were
> **removed in Phase 15** along with NextAuth. If they are still set in a Vercel project, delete
> them — nothing reads them, and the Google names collided with the backend's OAuth client.

Verify a configuration before deploying:

```bash
cd backend && NODE_ENV=production npm run check:env
```

---

## Deploy

### 1. Database (Neon)

Nothing to create: migrations build the schema.

```bash
cd backend
npx prisma migrate deploy      # applies pending migrations, never resets
npx prisma migrate status      # must print "Database schema is up to date!"
```

`migrate deploy` is the only migration command that belongs anywhere near production.
**Never run** `prisma migrate dev`, `prisma db push`, or `prisma migrate reset` against it.

### 2. Backend (Render)

`render.yaml` at the repository root is a Blueprint. Either point a new Blueprint at the repo or
create the service manually with:

- **Root directory** `backend`
- **Build** `npm ci && npx prisma generate && npx prisma migrate deploy`
- **Start** `npm start`
- **Health check path** `/api/health/ready`

Set every `sync: false` variable in the dashboard before the first deploy. The service will refuse
to boot with a placeholder `JWT_SECRET` or a non-https `FRONTEND_URL`, which is the intended
behaviour — fix the variable rather than the guard.

### 3. Frontend (Vercel)

- **Root directory** `frontend`
- **Build** `prisma generate && next build` (already in `frontend/vercel.json`)
- **Install** `npm ci`

Set `NEXT_PUBLIC_API_URL` to the Render URL. After the first deploy, put the Vercel domain into the
backend's `FRONTEND_URL` and redeploy the backend — CORS is an allowlist, so the browser gets a
blocked request until that is done.

### 4. HTTPS and domains

Both platforms terminate TLS and issue certificates automatically. The backend sets
`trust proxy = 1` so rate limiting sees the real client address through the platform proxy. The
frontend sends `Strict-Transport-Security` (see `next.config.js`).

### 5. OAuth redirect (only if Google integrations are used)

Register `<APP_BASE_URL>/api/integrations/callback` in the Google Cloud console, exactly. The
integrations dashboard prints the value it expects, with a copy button.

---

## Health checks

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /api/health` | public | `{ status: "ok", time }` — liveness only, describes nothing |
| `GET /api/health/ready` | public | 200 `ready` / 503 `not_ready` with one word per dependency |
| `GET /api/health/details` | `Bearer $HEALTH_TOKEN` | Uptime, AI provider, storage driver, integration state. 404s when `HEALTH_TOKEN` is unset |

Point the platform's health check at **`/api/health/ready`**. Liveness answers even while the
database is down, which is what you want for a restart decision but not for routing traffic.

---

## Rollback

1. **Application.** Render keeps previous deploys; "Rollback" on the service redeploys the prior
   image. Vercel: promote the previous deployment. Neither touches the database.
2. **Database.** Migrations in this project are additive — every Phase 12–14 migration adds tables
   or nullable columns and alters nothing existing. An application rollback therefore does **not**
   require a schema rollback: the older code ignores the newer tables.
3. If a migration must be undone, write a new forward migration that reverses it and deploy that.
   Do not hand-edit `_prisma_migrations`. See [operations.md](operations.md).

**Order matters.** Deploy the backend before the frontend when an API contract changes, and roll
back in the opposite order.

---

## Storage

`STORAGE_DRIVER=none` is the production default and means original PDFs/DOCX are discarded after
text extraction. Nothing is lost that the product needs — parsed text and analyses are in the
database.

`local` writes to the container filesystem, which on Render and Vercel is **ephemeral**: files
disappear on every deploy and are not shared between instances. Do not set `local` in production
without a persistent disk. Object storage (S3/GCS/R2) is the correct driver and is not implemented;
`storageService.js` documents the four methods a driver must provide.

---

## Known upgrade path

Recorded here because both are deliberate deferrals, not oversights:

- **Next.js is pinned to 13.5.11**, the last 13.5.x security patch. Clearing the remaining `next`
  advisories needs 14.2.x or 15.x, which require **Node ≥ 18.17**; this project's floor is 18.12.
  Raise the Node floor first, then upgrade Next, then re-run the frontend build and `tsc`.
- **zod is on 3.25.76.** The advisory for oversized collection validation is only fixed in zod 4,
  a breaking change across every validator in both packages. The mitigating control today is the
  512 KB JSON body cap in `app.js` plus explicit `.max()` bounds on request schemas.
