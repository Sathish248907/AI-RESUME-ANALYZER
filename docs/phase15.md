# Phase 15 — Production Readiness, Security, Performance

An audit of the whole repository, the fixes that followed, and an honest account of what is still
outstanding.

> **Naming note.** The repository already had a Phase 14 (integrations and automation —
> [phase14.md](phase14.md)). This specification was also labelled "Phase 14"; it is documented here
> as Phase 15 so neither phase's history is overwritten. The same off-by-one applies to
> [phase12.md](phase12.md), [phase13.md](phase13.md) and [phase14.md](phase14.md).

> **One correction to the brief.** It describes the frontend as "React + Vite, JavaScript". It is
> **Next.js 13 App Router with TypeScript**, and has been since Phase 1. The audit below is of the
> code that exists.

---

## 1. Audit findings

Severity is about what an attacker or an outage could actually do, not about how hard it was to fix.

### Critical — fixed

| # | Finding | Evidence |
|---|---|---|
| **C1** | `GET /api/history` returned up to 50 analyses **to anyone, unauthenticated** — full job-description text and analysis results. With no `userId` parameter the filter was `{}`, so it returned every user's records. | Probed live: `curl http://localhost:3001/api/history` → `200` with real resume data |
| **C2** | `DELETE /api/history?id=` deleted **any row by id**, unauthenticated, with no ownership check. | Probed live: route accepted an arbitrary id |
| **C3** | `POST /api/analyze` accepted a `userId` in the request body and wrote rows owned by it — a write-side IDOR letting anyone plant records in another account. | Code read + live probe |
| **C4** | The same route called Gemini with **unbounded input, unauthenticated and unmetered**. One loop was an unbounded provider bill. | Live probe: 200 with no limit of any kind |
| **C5** | NextAuth (`next-auth` + `@auth/prisma-adapter`) shipped two **critical** advisories, required `NEXTAUTH_SECRET`, `GITHUB_*` and a *second* `GOOGLE_CLIENT_ID/SECRET` in the web tier, and its `GOOGLE_*` names collided with the backend's Phase 14 OAuth client. It had **0 users**, was unreachable from any link, and `strategy: "database"` meant any sign-in attempt threw. | `npm audit`; `legacy."User"` row count = 0; grep for inbound links |

### High — fixed

| # | Finding |
|---|---|
| **H1** | `frontend/package.json` had `db:push` and `db:migrate` scripts. `frontend/prisma/schema.prisma` knows nothing of the backend's 55 `api_*` tables, so running either against the production URL would have offered to **reset the database**. |
| **H2** | `GET /api/health` published the AI provider, the model and the storage driver to anonymous callers — reconnaissance with no operational need. |
| **H3** | `body-parser` DoS advisory (backend) and `dicer`/`busboy` crash advisory via `multer@1.4.4`. |
| **H4** | Next.js pinned at 13.5.7, four security patches behind the last 13.5.x release. |
| **H5** | No CI at all. No lint, no type-check, no test and no migration validation ran before a merge. |
| **H6** | ESLint was configured in flat (`eslint.config.mjs`) form against ESLint 8, which cannot read it — `next lint` prompted for first-time setup instead of linting. Lint had therefore never run. |

### Medium — fixed

| # | Finding |
|---|---|
| **M1** | No request correlation id. A 500 was untraceable without logging request bodies, which the logger deliberately refuses to do. |
| **M2** | No readiness probe. A platform health check could only ask "is the process up", not "can it serve". |
| **M3** | Production configuration was unvalidated beyond presence: an http CORS origin, a leftover `localhost` origin, or the example `JWT_SECRET` would all have started happily. |
| **M4** | No `unhandledRejection` / `uncaughtException` handlers — a crash left no record of why. |
| **M5** | No security headers on frontend documents; `X-Powered-By` advertised the framework. |
| **M6** | `metadataBase` unset, so shared links resolved Open Graph images against `localhost:3000`. |
| **M7** | Keyboard focus was invisible on links and any control that did not set `focus:ring-*` itself — Tailwind's preflight removes the default outline. |
| **M8** | Heading levels skipped on every page (`h1→h3`, `h2→h4`), so heading navigation gave a false structure. The footer's `<h4>`s caused the final skip everywhere. |
| **M9** | react-dropzone's file input had no accessible name. |
| **M10** | `/api/analyze` echoed the raw provider error message to the client. |

### Accepted, with a documented upgrade path

| # | Finding | Why it is not fixed here |
|---|---|---|
| **A1** | `next` still carries advisories at 13.5.11. | Clearing them needs Next ≥14, which needs **Node ≥18.17**; this project's floor is 18.12. Raising the Node floor is an environment decision, not a code change. Mitigation: no `next/middleware` exists, so CVE-2025-29927 (middleware auth bypass) is not reachable; no `next/image` optimizer is in use. |
| **A2** | `zod@3.25.76` — memory exhaustion validating oversized constrained collections. | Only fixed in zod 4, a breaking change across every validator in both packages. Mitigation: the 512 KB JSON body cap in `app.js` bounds any input before a schema sees it. |
| **A3** | `dompurify` (critical) via `@monaco-editor/react`. | Monaco is loaded dynamically and only inside the interview code editor, where the content is the user's own. No upgrade exists that does not change the editor major. |
| **A4** | No error-monitoring service, no log aggregation, no uptime alerting. | Requires credentials for a service that has not been chosen. The integration point is `backend/src/utils/logger.js`; see [operations.md §8](operations.md). |
| **A5** | No password reset, no email verification, no token revocation on logout. | JWTs are stateless with a 7-day expiry; "logout" clears the client's copy. Adding revocation means a token denylist or short-lived access tokens plus refresh. Out of scope for a hardening pass. |
| **A6** | Uploaded originals are not durably stored. | `STORAGE_DRIVER=none` is the production default and discards them; `local` writes to an ephemeral container disk. An object-storage driver is the fix — `storageService.js` documents the four methods. |

### Audited and found sound — no change needed

- **Backend authorisation.** Every repository query is owner-scoped; a row belonging to another user
  returns 404, not 403. Verified by the existing cross-user isolation tests in every phase suite.
- **Password handling.** bcrypt with per-user salt; `passwordHash` never appears in a response.
- **SQL injection.** All access is through Prisma's parameterised client. The two `$queryRaw`
  call sites are a literal `SELECT 1` readiness probe and tagged-template schema introspection.
- **Upload validation.** Content is sniffed by magic bytes, not filename or declared MIME; size and
  file-count limits are set at the multer layer; storage keys are 16 random bytes and never contain
  user input; download is owner-checked and streams with `nosniff`.
- **Secret hygiene.** `.gitignore` covers `.env*` except `.example`; no real credential is in a
  tracked file. The logger redacts `password`, `token`, `authorization`, `apiKey`, `secret`,
  `resumeText` and `jobDescription` keys before writing.
- **Error responses.** Stack traces are stripped outside development; Prisma connectivity errors
  become a 503 with no driver detail.
- **Indexes.** 79 `@@index`/`@@unique` declarations across 55 tables, including the composite
  indexes the dashboard and job-discovery queries need. No query was measured to be slow enough to
  justify adding more; adding indexes without a measured bottleneck is cost, not optimisation.
- **Rate limiting.** Global, auth and AI tiers already existed, keyed by user id where authenticated.

---

## 2. What changed

### Security

`frontend/src/lib/requireUser.ts` (new) identifies the caller of a legacy route handler by
forwarding the bearer token to the backend's `GET /api/auth/me`. The frontend verifies no
signature, so **`JWT_SECRET` never needs to exist in the web tier** — and a second authentication
system was not invented.

- `/api/history` — both verbs now require a verified caller and scope to that user. `DELETE` uses
  `deleteMany({ where: { id, userId } })`, so another user's row matches nothing and its existence
  is never disclosed.
- `/api/analyze` — `userId` removed from the accepted body; the owner is the verified caller or
  nobody. Input capped at 30 000 resume / 20 000 job-description characters. Rate limited.
  Provider errors are replaced with a generic 502.
- `frontend/src/lib/rateLimit.ts` (new) — a fixed-window limiter, 5 requests / 15 min anonymous and
  20 for a signed-in user. **Its limits are per process**, which on serverless means per instance;
  the module says so rather than implying a global guarantee, and the input caps are the control
  that always holds.
- **NextAuth removed**: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` and the
  unlinked `src/app/auth/signin/page.tsx` deleted; `next-auth` and `@auth/prisma-adapter`
  uninstalled; `Account`, `Session` and `VerificationToken` dropped from the legacy schema.
  **No database row was touched** — the `legacy` schema still holds its 3 analyses and 3 resumes.
- `frontend/package.json` lost `db:push`, `db:migrate` and `db:studio`. The backend owns migrations.
- `multer` 1.4.4 → 2.5.0, `body-parser` patched, `next` 13.5.7 → 13.5.11.

### Configuration

`productionProblems(env)` in `backend/src/config/env.js` refuses a production boot on: the example
`JWT_SECRET`, a non-https `FRONTEND_URL` origin, a leftover localhost origin, a non-https
`APP_BASE_URL`, an `INTEGRATION_ENCRYPTION_KEY` that is not 32 bytes, or `EMAIL_TRANSPORT=smtp`
without a host. Outside production the same findings print as warnings, so development stays
workable. `npm run check:env` runs the gate without starting a server.

### Observability

- `requestId` middleware: a UUID per request, echoed as `x-request-id`, carried into every log line
  and into a 500's body as `error.requestId`. An inbound id is honoured only if it matches
  `[A-Za-z0-9._-]{8,128}` — echoing an unvalidated header is response splitting.
- Health split three ways: `/api/health` (public liveness, says nothing else),
  `/api/health/ready` (public, 200/503, one word per dependency), `/api/health/details`
  (`Bearer $HEALTH_TOKEN`, constant-time compared; **404s** when the token is unset, so a
  deployment that never configured one does not advertise the route).
- `unhandledRejection` and `uncaughtException` log the reason, then shut down cleanly.

### Frontend hardening and accessibility

- `next.config.js`: `poweredByHeader: false`, plus `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy` and HSTS; `no-store` on `/api/*`. **No CSP yet** — the
  comment in that file explains what a real policy needs first, because a guessed one either breaks
  Monaco or is theatre.
- A global `:focus-visible` ring. Keyboard users could not see where they were.
- Heading levels corrected; `CardTitle` gained an `as` prop so a card that is a top-level section
  can be an `h2` instead of forcing every page to jump `h1→h3`.
- Both dropzone file inputs labelled.
- `metadataBase` derived from `NEXT_PUBLIC_SITE_URL` or Vercel's deployment URL.

### Performance

- `src/services/authToken.ts` (new) splits token storage out of `api.ts`. `/history` and `/analyze`
  use plain `fetch`; importing `getToken` from the axios module had pulled axios into both.
  **`/history` first-load JS: 125 kB → 104 kB.**
- No other bundle change was made, because none was measured to be needed. Shared first-load JS is
  80.6 kB across all 45 routes; the three heaviest routes (241–243 kB) are the Recharts analytics
  pages, where the chart library is the payload and is already route-split.

### CI

`.github/workflows/ci.yml` (new), two jobs on every push and PR to `main`:

- **backend** — `npm ci`, `prisma validate`, `prisma generate`, **`prisma migrate deploy` against a
  real PostgreSQL 16 service container**, `prisma migrate status`, `npm test`, `npm run check:env`,
  `npm audit`.
- **frontend** — `npm ci`, `prisma generate`, `npm run lint`, `tsc --noEmit`, `next build`,
  `npm audit`.

ESLint was repaired first (flat config → `.eslintrc.json` with `next/core-web-vitals`) and the four
errors it had never been able to report were fixed, so the lint step can actually gate.

No secret appears in the workflow; `${{ secrets.* }}` is the documented mechanism.

### Deployment

`render.yaml` (backend blueprint, health check on `/api/health/ready`, every secret `sync: false`),
`frontend/vercel.json`, [deployment.md](deployment.md) and [operations.md](operations.md).

---

## 3. Tests executed — actual results

Run on 2026-10-28.

| Check | Command | Result |
|---|---|---|
| Backend suite | `npm --prefix backend test` | **17/17 files pass** (was 16; `phase15.test.js` is new) |
| Phase 15 suite | `node --test backend/tests/phase15.test.js` | **20/20 pass** |
| Frontend types | `npx tsc --noEmit` | **clean** |
| Frontend lint | `npm run lint` | **0 errors**, 1 warning (`react-hooks/exhaustive-deps`) |
| Production build | `npx next build` | **succeeds**, 45 routes |
| Migrations | `npx prisma migrate status` | **"Database schema is up to date!"**, 11 migrations |
| Config gate | `npm run check:env` | correctly flags the dev `.env`'s localhost origin |
| Backend advisories | `npm audit --omit=dev` | 5 → **1** (zod, accepted — A2) |
| Frontend advisories | `npm audit --omit=dev` | 9 → **5** (next, zod, dompurify, postcss, monaco — A1/A2/A3) |

`backend/tests/phase15.test.js` covers: a clean production config passing; production refusing a
placeholder secret, an http origin, a leftover localhost origin, a non-https OAuth base, a wrong-size
vault key and misconfigured SMTP; the same problems being warnings outside production; readiness
returning 503 with no driver detail when the database is unreachable; liveness still answering while
it is; gated health details reporting the database honestly; token comparison rejecting both shorter
and longer values; request ids present, honoured when safe, replaced when not, and unique per
request; a structured 404 with no stack; CORS refusing an unlisted origin; helmet's headers present.

`fakePrisma()` gained `$queryRaw` and a `dbDown` switch — without it, "readiness fails when the
database is gone" could not be tested at all.

### Verified by running the app, not only by tests

Each of these was executed against the running stack:

| Attack | Before | After |
|---|---|---|
| `GET /api/history` anonymous | `200` + real resume data | `401` |
| `GET /api/history?userId=<other>` | `200` | `401` |
| `GET /api/history` with a forged token | — | `401` |
| `GET /api/history` with a valid token | — | `200`, caller's own rows only |
| `DELETE /api/history?id=<real row>` anonymous | would delete it | `401`, row intact |
| `DELETE` with a valid token, not the owner | would delete it | `404`, row intact |
| `POST /api/analyze` with `userId` in the body | wrote a row owned by it | ignored; `saved: false` |
| `POST /api/analyze` with a 40 000-char resume | sent to the provider | `400` before any provider call |
| `POST /api/analyze` ×7 anonymously | all `200` | `200,200,200,429,429,429,429` |

`legacy."Analysis"` row count was 3 before and 3 after.

### Accessibility and responsive

Audited in headless Chrome at 1440×1000, 834×1112 and 390×844 across `/`, `/analyze`,
`/auth/login`, `/dashboard`, `/dashboard/resume-builder` and `/dashboard/integrations` — 18
page × viewport combinations.

- Before: heading skips on all 18; an unlabelled file input on `/analyze`.
- After: **all 18 clean** — one `h1`, no level skips, no unlabelled control, no image without
  `alt`, no positive `tabindex`, `lang` present, and **zero horizontal overflow at any width**.
- Keyboard focus was checked by dispatching real `Tab` key events (a scripted `el.focus()` does not
  trigger `:focus-visible`, and that false negative is what the first run reported): **12/12 tab
  stops show a 2 px visible ring.**

---

## 4. Not verified — do not treat as done

- **Nothing has been deployed.** `render.yaml` and `vercel.json` are written and internally
  consistent; neither has been applied to a live platform.
- **No restore has been performed.** [operations.md](operations.md) carries the procedure and says
  the same thing at the top. The RPO/RTO figures there are targets, not measurements, until someone
  runs the drill in §5 of that document.
- **Neon backup retention is unconfirmed.** It is set in the Neon console; there are no credentials
  here to read or change it.
- **No monitoring is configured** (A4).
- **End-to-end tests for the ten critical journeys are not written.** The backend suite covers each
  journey's API at the HTTP layer with a database fake; the browser-level journeys were exercised
  by hand during this phase, not automated. `backend/tests/live-e2e-*.mjs` are the existing
  manually-run scripts.
- **Load and performance were not measured under concurrency.** The bundle numbers above are real
  build output; there is no throughput or latency measurement, and no claim of one.

---

## 5. Required environment variables

The full table is in [deployment.md](deployment.md). The ones a production deploy will refuse to
start without: `DATABASE_URL`, `JWT_SECRET` (not the example value), `FRONTEND_URL` (https, no
localhost), and — if the OAuth integrations are used — a https `APP_BASE_URL`.

Delete these from any environment that still has them: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and the **frontend's** `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET`. Nothing reads them any more.

---

## 6. Remaining blockers before a public launch

In the order they should be dealt with:

1. **Raise the Node floor to ≥18.17 and upgrade Next to 14.2.x** (A1). This is the only remaining
   critical-severity item with no mitigation beyond "the vulnerable features are unused".
2. **Configure Neon retention and run one restore drill** (operations.md §5). A backup nobody has
   restored is a hypothesis.
3. **Choose and wire an error-monitoring service** (A4).
4. **Decide on object storage** if original file retention matters (A6); otherwise leave
   `STORAGE_DRIVER=none` and the product is honest about not keeping them.
5. **Migrate to zod 4** (A2) — mechanical but wide.
6. **Write a Content-Security-Policy** once the Monaco CDN origin and Tailwind's inline styles are
   enumerated.
