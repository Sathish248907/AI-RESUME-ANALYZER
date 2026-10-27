# Operations — backup, restore and disaster recovery

What is automated, what is not, and what has actually been tested. Every claim here is marked.

> **Status: documented, not verified.** No restore has been executed for this project. The
> procedures below are written to be run; until someone runs the drill in §5 and records the result,
> treat recovery as unproven. Saying otherwise would be the one failure mode a recovery plan cannot
> afford.

---

## 1. What has to survive

| Data | Where | Replaceable? |
|---|---|---|
| Accounts, resumes, analyses, applications, interviews, roadmaps | Neon, schema `public` (55 `api_*` tables) | **No** |
| Legacy `/analyze` records | Neon, schema `legacy` (3 tables) | No, but low value |
| Sealed OAuth tokens | `api_external_integrations` | Regenerable — users reconnect |
| Original uploaded files | Nowhere (`STORAGE_DRIVER=none`) or an ephemeral container disk | **Already not durable.** See deployment.md → Storage |
| Secrets | The host's environment / a password manager | No — keep a copy outside the platform |

`INTEGRATION_ENCRYPTION_KEY` deserves its own line: **a database restore without that key leaves
every stored OAuth token undecryptable.** Back it up separately from the database, or accept that
recovery means every user reconnects their calendar and Drive.

---

## 2. Backups

### Automated (Neon)

Neon keeps continuous WAL history and supports point-in-time restore to any moment inside the
retention window of the plan. On the free tier that window is short (hours to a day); paid tiers
extend it. **Check the project's actual retention in the Neon console and write it down here** —
the recovery objectives below assume it.

Nothing in this repository configures Neon. Retention and PITR are set in the Neon console, and
there are no credentials in this environment with which to configure them.

### Manual, portable (run this too)

A platform-independent dump protects against losing the platform account itself.

```bash
# Whole database, custom format, compressed. Takes a consistent snapshot.
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl \
        --file="resume-analyzer-$(date +%Y%m%d-%H%M%S).dump"

# Schema only — useful to diff against prisma/migrations
pg_dump "$DATABASE_URL" --schema-only --no-owner > schema-$(date +%Y%m%d).sql
```

Encrypt before it leaves the machine; a dump is every user's resume in one file.

```bash
gpg --symmetric --cipher-algo AES256 resume-analyzer-20260101-030000.dump
```

**Suggested schedule** (not configured anywhere — set it up in your scheduler of choice):

| What | Frequency | Retention |
|---|---|---|
| Neon PITR | continuous | plan window |
| Encrypted `pg_dump` | daily | 30 days |
| Monthly archive dump | monthly | 12 months |
| `INTEGRATION_ENCRYPTION_KEY` + `JWT_SECRET` | on change | forever, in a password manager |

Access control: the dump store is as sensitive as the database. Restrict it to the people who
already have production database access, and no one else.

---

## 3. Objectives

These are **targets**, not measurements. Nothing here has been timed.

| | Target | Depends on |
|---|---|---|
| **RPO** (data you can afford to lose) | ≤ 5 minutes | Neon PITR window. Falls back to ≤ 24 h if only the daily dump survives |
| **RTO** (time to serving again) | ≤ 1 hour | Neon branch restore is minutes; a `pg_restore` of a large dump is longer |

A `JWT_SECRET` rotation during recovery signs every user out, which is usually the right call after
an incident. Budget for the support load, not for the compute.

---

## 4. Restore

### 4a. Point-in-time (Neon) — preferred

1. In the Neon console, create a **branch** from the target timestamp. This does not touch the
   current database.
2. Point a *staging* backend at the branch's connection string and verify (§5).
3. Only when verified, repoint production `DATABASE_URL` at the branch and redeploy.

Restoring onto a branch rather than over the primary means a wrong timestamp costs a branch, not
the data.

### 4b. From a dump

```bash
# 1. Restore into a NEW, empty database. Never into the live one.
createdb resume_analyzer_restore
pg_restore --dbname="$RESTORE_URL" --no-owner --no-acl resume-analyzer-20260101.dump

# 2. Check the schema is where the code expects it
cd backend
DATABASE_URL="$RESTORE_URL" npx prisma migrate status   # expect "up to date"

# 3. Verify (§5), then repoint and redeploy
```

### What never to run

```
prisma migrate reset      # drops everything
prisma db push            # silently alters production to match a schema file
pg_restore --clean        # drops objects before restoring
```

The frontend package has **no** `db:push` or `db:migrate` script for exactly this reason: its schema
knows nothing of the 55 `api_*` tables, and pushing it would offer to drop them.

---

## 5. Verifying a restore

A restore is not finished when the command exits. Run all of these against the restored database
before any traffic reaches it:

```bash
# 1. Schema matches the code
cd backend && DATABASE_URL="$RESTORE_URL" npx prisma migrate status

# 2. The app boots against it and reports ready
DATABASE_URL="$RESTORE_URL" npm start &
curl -fsS localhost:4000/api/health/ready    # expect {"status":"ready",...}

# 3. Row counts are in the right order of magnitude
psql "$RESTORE_URL" -c "select
  (select count(*) from api_users)        as users,
  (select count(*) from api_resumes)      as resumes,
  (select count(*) from api_analyses)     as analyses,
  (select count(*) from api_applications) as applications;"

# 4. A real user journey works: sign in, open the dashboard, open one resume.
```

Step 4 is the one that catches a restore that is technically complete and practically broken.

### Recovery drill

Run this quarterly, against a scratch database, never against production:

1. Take a fresh dump.
2. Restore it into a throwaway database.
3. Run steps 1–4 above and **record the wall-clock time** — that is the real RTO.
4. Note the timestamp of the newest row recovered — that is the real RPO.
5. Write both numbers into §3, replacing the targets with measurements.

---

## 6. Migration safety

Every migration in `backend/prisma/migrations/` so far is **additive**: new tables, new nullable
columns, new indexes. None drops or renames anything. That property is what makes an application
rollback safe without a schema rollback, and it is worth keeping.

Before adding a migration that is not additive:

1. Write it as two deploys — add the new shape, backfill, switch the code, remove the old shape in a
   later release. A single destructive migration cannot be rolled back by redeploying old code.
2. Test `migrate deploy` against a restored copy of production, not against an empty database. CI
   only proves migrations apply from empty.
3. Take a dump immediately before the deploy that runs it.

---

## 7. Incident checklist

1. **Is it up?** `curl https://<api>/api/health` — liveness. Answers even when the database is down.
2. **Can it serve?** `curl https://<api>/api/health/ready` — 503 names the failing dependency.
3. **What broke?** Every response carries `x-request-id`; a 500 body repeats it as
   `error.requestId`. Search the platform logs for that id to find the exact request, with no need
   for request bodies to have been logged.
4. **Is it the database?** `api/health/ready` saying `database: unavailable` plus `503
   DATABASE_UNAVAILABLE` in responses points at Neon, not the app.
5. **Is it the AI provider?** AI routes return `503` with a retryable code; everything else keeps
   working by design.
6. **Suspected credential compromise:** rotate `JWT_SECRET` (signs everyone out),
   `INTEGRATION_ENCRYPTION_KEY` (see the warning in §1 — rotating it invalidates stored OAuth
   tokens; users reconnect), and the AI provider key. Redeploy.

---

## 8. What is not covered

- **No monitoring integration is configured.** There is structured JSON logging on stdout and the
  health endpoints; there is no Sentry, no APM, no alerting, and no credentials here with which to
  set one up. Wiring one in means adding a client to `backend/src/utils/logger.js` and a DSN to the
  environment.
- **No log aggregation.** Logs live wherever the platform keeps stdout. Request ids make them
  searchable once they are somewhere searchable.
- **No uptime alerting.** `/api/health/ready` is ready to be polled by an external monitor; nothing
  polls it today.
- **Uploaded files are not backed up** because they are not durably stored. See deployment.md.
