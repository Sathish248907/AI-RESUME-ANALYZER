# Phase 14 — Career Platform Integrations & Smart Workflow Automation

Real OAuth connections to the user's own Google Calendar and Google Drive, a server-configured email
transport, the Phase 12 job providers surfaced in one honest picture, and a workflow engine whose
every run is previewed before it happens and approved before anything leaves the app.

> **Naming note.** The repository already had a Phase 13 (application workspace and cover letters —
> [phase13.md](phase13.md)). This specification was also labelled "Phase 13"; it is documented here
> as Phase 14 so neither phase's history is overwritten. The same off-by-one applies to
> [phase12.md](phase12.md) and [phase13.md](phase13.md).

## The two rules this phase is built on

1. **Nothing is shown as connectable unless the server could actually complete the flow.** When
   `GOOGLE_CLIENT_ID` is missing, Google Calendar reports `readiness: "needs_setup"`, lists the exact
   variables that are absent, prints the redirect URI to paste into the provider console — and shows
   **no Connect button**. There are no buttons that lead nowhere and no simulated connections.
2. **Nothing that leaves the app happens without an explicit approval.** Every workflow is off until
   switched on; running one returns a plan first; and an action marked `external` is skipped with
   `skipped_needs_approval` unless the caller sent `approved: true` for that specific run.

## What was reused rather than rebuilt

| Need | Existing thing used |
|---|---|
| Job provider integrations | The Phase 12 registry. Phase 14 **surfaces** it read-only and links to `/dashboard/jobs/preferences`; it defines no second notion of a connected provider. |
| Interview rounds to put on a calendar | `ApplicationInterview` (Phase 13). |
| Deadlines and follow-ups | `ApplicationReminder` / `JobApplication.applicationDeadline` (Phase 13). |
| In-app notifications | `UserNotification` (Phase 10), including its `(userId, dedupeKey)` uniqueness. |
| Documents to export | `ResumeVersion` (Phase 8) and `CoverLetter` (Phase 13), rendered by the existing pdfkit renderers. |
| Resume findings for the review workflow | Phase 8 suggestions and ATS issues. |
| Timezones | `isValidTimeZone` / `localDayKey` / `addDays` (Phase 10). |
| Rate limiting | `createAnalysisLimiter` (Phase 3), reused at three tiers. |

## Database changes (`backend/prisma/migrations/20261027120000_phase14_integrations_automation/`, additive, 8 tables)

| Model (table) | Purpose / constraints |
|---|---|
| `ExternalIntegration` (`api_external_integrations`) | One connection per user per provider, `@@unique(userId, provider)`. Holds the **sealed** credential envelope, granted scopes, status and preferences. |
| `PendingAuthorization` (`api_pending_authorizations`) | A single-use `state` with its PKCE verifier and `returnTo`, expiring after 10 minutes. Deleted on use. |
| `IntegrationSyncLog` (`api_integration_sync_logs`) | Every action this app took at a provider, so the user can read the whole history. |
| `ExternalCalendarEvent` (`api_external_calendar_events`) | Links one app record to the event it created, `@@unique(integrationId, sourceKind, sourceId)` plus a `contentHash`. This is what makes syncing twice a no-op. |
| `ExternalFileExport` (`api_external_file_exports`) | Same idea for Drive: re-exporting a document updates the file it made before. |
| `AutomationRule` (`api_automation_rules`) | A user's settings for one workflow, `@@unique(userId, workflowKey)`. Created disabled. |
| `AutomationExecution` (`api_automation_executions`) | The plan, the approval, and what every action actually did. |
| `EmailDelivery` (`api_email_deliveries`) | Every message, delivered or merely recorded. `@@unique(userId, dedupeKey)` makes a repeated event send once. |

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

No existing table was altered and no data was reset.

## Credential storage

`tokenVault.js` seals every token with **AES-256-GCM** into `v1.<iv>.<tag>.<ciphertext>`, all
base64url, keyed from `INTEGRATION_ENCRYPTION_KEY`. Three consequences:

- **It refuses rather than degrades.** Without the key, `assertReady()` throws and no OAuth flow can
  start. There is no plaintext fallback.
- **No raw secret is ever a readable JSON field.** The envelope is opaque; `describe()` returns only
  a short fingerprint, which exists so two connections can be told apart.
- **The browser never sees a token.** `/connect` returns an authorization *URL*; the provider
  redirects to the backend callback; the token is sealed server-side. The frontend's typed client
  has no field that could hold one.

## The OAuth flow

Authorization code + **PKCE (S256)**, with a cryptographically random, single-use `state` stored
server-side and compared in constant time. The callback is the only unauthenticated route in the
phase — by necessity, since the provider's redirect carries no Bearer token — and the `state` row is
what ties it to a user. It always redirects back into the app
(`/dashboard/integrations?connected=…` or `?error=…&message=…`), so the browser never lands on a raw
API response.

**Partial grants are reported, not hidden.** If the user unticks a permission, the callback adds
`partialScopes=1` and the UI says which features stay unavailable rather than failing later.

Scopes are the narrowest that can do the job: `calendar.events` (not full calendar access) and
`drive.file`, which lets the app touch **only files it created itself** — connecting Drive does not
give this product a view of the user's documents.

## Calendar sync

- Events are created on the user's own calendar **with no attendees field, ever**, so nobody is
  invited or emailed.
- `contentHashOf` means an unchanged item is not re-sent: syncing repeatedly creates no duplicates.
- **Dry run first.** `POST …/sync` with `dryRun: true` returns exactly what would be created,
  updated or left alone, and writes nothing. The UI's Preview button is this call.
- Event types (`interviews`, `deadlines`, `reminders`) are opt-in per user.
- A revoked grant surfaces as `409 REAUTH_REQUIRED` at the account level rather than being buried in
  a per-item result.

## Drive export

One document at a time, always in response to a press. Nothing is uploaded on a schedule. Files are
created with default (private) permissions and **no sharing call is ever made**. A re-export updates
the file this app created before; if the user deleted it in Drive, a new one is created. Quota,
rate-limit and permission failures are reported with the provider's own reason.

## Email

`EMAIL_TRANSPORT` defaults to `log`, and the build ships **no mail dependency on purpose** —
`createSmtpTransport` throws until someone implements it against the client library their deployment
chooses. In `log` mode messages are recorded so the user can read exactly what would have been sent,
and every surface says plainly that **nothing is delivered**: `delivers: false`, a note on the
status, and a banner above the preference toggles. Preferences are still saved and still checked at
send time, so they take effect the moment a transport exists.

Mail only ever goes to the address on the user's own account. **No mailbox read permission is
requested anywhere in this product**, and no employer, recruiter or interviewer is ever contacted.

## The automation engine

Four workflows, every one off by default:

| Workflow | Trigger | External action |
|---|---|---|
| Interview preparation | A recorded round is within the chosen lead time | Optional calendar event |
| Application follow-up | A follow-up date arrives, or a pending reminder is due | None |
| Weekly career summary | The user runs it, on or after their chosen day | Optional email |
| Resume improvement review | The user runs it, when a version has unresolved findings | None |

Each action declares a `consequence`: `in_app` (a notification, a checklist step, a draft, a
summary) or `external` (a calendar event, an email). The engine enforces the difference:

- `preview` evaluates the trigger and returns the plan. **It changes nothing**, and it is a GET.
- `run` without approval executes the in-app actions and records each external one as
  `skipped_needs_approval`; the execution ends `awaiting_approval` with the plan intact.
- An option whose integration is not connected is reported in `unavailableOptions` with a reason, so
  a switch is never silently a no-op.
- A failed run retries up to **3** times with a 5 / 30 / 180-minute backoff, and only the failed
  actions are repeated. A failure classified `needs_reconnect` is not retried blindly — the user is
  told to reconnect.
- Notifications are deduplicated by an explicit existence check, not only by the database
  constraint.

The engine never sends a message to an employer, submits an application, or edits a resume. Those
are not configuration options that happen to be off; no code path exists for them.

## API

All routes require `Authorization: Bearer <jwt>` and are owner-scoped, except the OAuth callback.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/integrations` | Every integration with its real readiness, blockers, scopes and limits |
| GET | `/api/integrations/callback` | The provider's redirect. Unauthenticated; `state` authenticates it |
| GET | `/api/integrations/:provider/status` | Includes merged preferences; `email` is accepted here |
| POST | `/api/integrations/:provider/connect` | Returns an authorization URL. Refuses if the vault or credentials are missing |
| POST | `/api/integrations/:provider/disconnect` | Deletes the sealed credentials; reports whether the provider also revoked |
| POST | `/api/integrations/:provider/sync` | `dryRun: true` previews and writes nothing |
| GET | `/api/integrations/:provider/sync-history` | Everything this app did at the provider |
| PUT | `/api/integrations/google_calendar/preferences` | Which event types sync |
| PUT | `/api/integrations/email/preferences` | Which categories the user wants |
| GET | `/api/integrations/google_drive/folders` | Only folders this app can see under `drive.file` |
| POST | `/api/integrations/google_drive/export` | One document; a cover letter must be approved first |
| GET | `/api/integrations/email/history` | Delivered and recorded-only messages |
| GET | `/api/automation/rules` | The catalogue, each with the user's rule and its unavailable options |
| POST | `/api/automation/rules` | Create or update by `workflowKey` |
| PATCH / DELETE | `/api/automation/rules/:ruleId` | |
| POST | `/api/automation/pause-all` | One switch that stops everything |
| GET | `/api/automation/rules/:ruleId/preview` | The plan. Changes nothing |
| POST | `/api/automation/rules/:ruleId/run` | `approved: true` is required for any external action |
| GET | `/api/automation/executions` | What ran, what it planned, what each action did |
| POST | `/api/automation/executions/:executionId/retry` | Only the failed actions, up to 3 times |

## Configuration

| Variable | Default | Effect when unset |
|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | — | No OAuth integration can be connected. Reported on the dashboard |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Calendar and Drive show setup steps instead of a Connect button |
| `EMAIL_TRANSPORT` | `log` | Messages are recorded, not delivered, and every surface says so |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | — | Required before `EMAIL_TRANSPORT=smtp` is considered configured |
| `AUTH_RATE_LIMIT` | `20` | Per 15 minutes. Raised for seeding; the previous fixed limit is now configurable |

The redirect URI to register with the provider is
`<BACKEND_ORIGIN>/api/integrations/callback`, and the dashboard prints it with a copy button.

## Frontend (Next.js App Router)

`/dashboard/integrations` — one page for connections and automation, linked from the dashboard menu.
It reads the OAuth result out of the query string, reports it, and clears it from the URL so a
refresh does not re-announce it. No code, token or `state` is ever handled client-side.

Components in `frontend/src/components/integrations/`: `IntegrationsDashboard` (the orchestrator),
`IntegrationCard`, `IntegrationStatusBadge`, `IntegrationSettings`, `CalendarSyncSettings`,
`NotificationPreferences`, `DriveExportPanel`, `AutomationCenter`, `AutomationRuleEditor`,
`AutomationHistory`. Service: `frontend/src/services/integrationService.ts`.

The UI keeps the API's boundaries visible: every scope is explained in plain words next to what it
cannot do, a `needs_setup` card shows the missing variables and the redirect URI instead of a
button, each workflow action is tagged *in app* or *leaves the app*, a preview is shown before any
run, and an external step is put behind an explicit **Approve and run**.

## Tests

`backend/tests/phase14.test.js` — **38 tests, all passing.** Coverage: vault sealing, tamper
detection and refusal without a key; no token or secret in any response body; PKCE challenge
derivation; single-use `state`, expiry, and constant-time comparison; callback error mapping and
redirect targets; partial scope reporting; connect refused without credentials or vault; disconnect
deleting credentials; calendar dry run writing nothing; idempotent re-sync via content hash; no
attendees field; revoked grant surfacing as 409 at the account level; sync history; Drive export
creating then updating the same file, quota and rate-limit mapping, and unapproved cover letters
refused; email recorded-not-delivered semantics, per-category preferences and dedupe; workflow
catalogue shape and unavailable options; rules created disabled; preview changing nothing; external
actions skipped without approval and executed with it; pause-all; retry limited to failed actions
and capped at 3; authentication on every route; and cross-user isolation.

Full backend suite: **16/16 files pass** — Phases 1–13 unaffected.

Two defects were found by running the app rather than by the suite, and fixed: `syncAll` caught an
account-level `REAUTH_REQUIRED` per item and returned 200, and notification dedupe relied on a
database constraint the test double does not enforce.

## Known limitations

- **No scheduler, still.** Workflows run when the user runs them or when a page is opened. There is
  no background runner in this deployment; the retry schedule records when a retry *would* be due.
- **Email delivers nothing out of the box.** `log` is the default and no mail library is installed.
  This is deliberate: a recorded message is honest, a silently dropped one is not.
- **Google integrations need the user's own OAuth client.** Without `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` both stay disconnected and show their setup steps.
- Only Google Calendar and Google Drive are implemented. Outlook, iCloud, Dropbox and OneDrive are
  not present in any form, not even a disabled card.
- `drive.file` means the folder list shows only folders this app created or opened — not the user's
  whole Drive. The UI says so rather than appearing to have missed folders.
- Disconnecting deletes the stored credentials immediately; whether the grant is also revoked at the
  provider depends on the provider's revoke endpoint, and the response says which happened.
- Nothing created externally is cleaned up on disconnect: events already in a calendar and files
  already in a Drive belong to the user and are left alone.
