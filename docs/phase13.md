# Phase 13 — Application Workspace, Cover Letters & Application Automation

A workspace for every job application: a preparation checklist that distinguishes what this product
can verify from what only the user can, grounded AI cover letters, secure document attachments, an
auditable activity timeline, timezone-correct reminders, interview rounds, and an optional readiness
review that never blocks.

> **Naming note.** The repository already had a Phase 12 (job discovery and matching —
> [phase12.md](phase12.md)). This specification was also labelled "Phase 12"; it is documented here
> as Phase 13 so neither phase's history is overwritten.

## What was reused rather than rebuilt

| Need | Existing thing used |
|---|---|
| The application record | `JobApplication` (Phase 5). Phase 13 creates none and owns none. |
| Status changes | `PATCH /api/applications/:id` (Phase 5), now also validating transitions and writing an activity row. |
| Resume content for letters | `ResumeVersion.content` (Phase 8). |
| Resume-to-job match | `JobMatchReport` (Phase 12), read for the checklist and the readiness review. |
| Interview history | `InterviewSession` (Phase 6), linkable to a real interview round. |
| Notifications | `UserNotification` (Phase 10), including its `(userId, dedupeKey)` constraint. |
| File storage | `createStorage` (Phase 5), widened to the new document types. |
| PDF rendering | `pdfkit`, as in the Phase 8 resume export. |
| Grounding guard | `fabricationCheck` (Phase 8). |
| Timezone helpers | `isValidTimeZone` / `localDayKey` / `addDays` (Phase 10). |

## Database changes (`backend/prisma/migrations/20261027000000_phase13_application_workspace/`, additive, 6 tables + 2 nullable columns)

| Model (table) | Purpose / constraints |
|---|---|
| `ApplicationChecklistItem` (`api_application_checklist_items`) | One preparation step. Template steps carry a stable `key` (`@@unique(applicationId, key)`) so re-seeding is idempotent; custom steps have `key = null`. `completionSource` records `in_app` vs `external`. |
| `CoverLetter` (`api_cover_letters`) | A draft per application, `@@unique(applicationId, versionNumber)`. `status` stays `draft` until approved; `groundingNotes` records what the guard found; `source` tracks `ai` / `manual` / `edited`. |
| `ApplicationDocument` (`api_application_documents`) | A file or a link. `storageKey` is an opaque handle that never leaves the backend; `@@unique(applicationId, checksum)` stops the same bytes being stored twice. |
| `ApplicationActivity` (`api_application_activities`) | The audit trail. `@@unique(applicationId, dedupeKey)` makes a repeated real event idempotent; `source` is `user` or `system`. |
| `ApplicationReminder` (`api_application_reminders`) | `dueAt` (an absolute instant) plus `timezone` (the IANA zone it was entered in). `@@unique(userId, dedupeKey)` prevents duplicates derived from the same record. |
| `ApplicationInterview` (`api_application_interviews`) | One real interview round: stage, time, mode, voluntarily-given interviewers, preparation notes, an optional link to a Phase 6 mock session, outcome and feedback. |

`JobApplication` gained two nullable columns: `outcome` (`accepted` \| `declined`) and
`applicationDeadline`. **The `ApplicationStatus` enum was deliberately not extended** — see below.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## The ten stages, without new statuses

The brief lists ten stages; the enum has seven, and the Phase 9 career services (`ACTIVE_STATUSES`)
and the Phase 10 application funnel (`STAGE_RANK`) both enumerate its values. Adding members would
silently change what those count, so the extra stages are expressed differently:

| Brief stage | Representation |
|---|---|
| Saved | `INTERESTED` |
| Preparing | `INTERESTED` + some checklist progress (**derived**, never stored) |
| Ready to Apply | `INTERESTED` + every required step done (**derived**) |
| Applied / Assessment / Interview / Offer | the matching enum value |
| Accepted | `OFFER` + `outcome = "accepted"` |
| Rejected | `REJECTED`, or `OFFER` + `outcome = "declined"` |
| Withdrawn | `WITHDRAWN` |

`describeStage()` turns the pair into the ten-stage label the UI shows, and Phases 1–12 see exactly
the statuses they always saw.

**Transitions are validated, not enforced.** `evaluateTransition` classifies a move as ordinary,
unusual, or not a status at all. An unusual move (backwards, or out of a closed application) is
refused with `409 UNUSUAL_STATUS_TRANSITION` and succeeds when the caller sends
`confirmUnusual: true` — because the user always knows more about their application than this
product does. Setting the current status again is treated as a no-op, not an error, and writes no
event. **Nothing detects employer activity**; every change is something a person recorded.

## The checklist and the verification boundary

Eleven template steps, each declaring who can verify it:

- **`in_app`** — the app can see evidence in the user's own records (a match report exists, a cover
  letter was written, a document is attached, a mock interview was completed).
- **`external`** — only the user knows (they read the description, they pressed submit).

`deriveAutoCompletions` surfaces the `in_app` steps that have real evidence, as *suggestions*; it
never ticks a box, and it can never touch the two submission steps. Completing an `external` step
asks for confirmation first and records `completionSource: "external"`, so the stored record shows
the difference between something observed and something asserted.

Ticking "record that you submitted it" returns a `submissionPrompt` offering the status change.
**It does not make it.** Opening an employer's page is explicitly described in the step itself as not
a submission.

## Cover letters (`cover-letter-1.0`)

The model gets exactly three things: a resume version, the job description, and anything the user
typed. What comes back is checked before display:

- **Grounding.** Every paragraph goes through `fabricationCheck` against the resume *and* the job
  description. A paragraph introducing a number or technology found in neither is **withheld**, with
  its reason, and never reaches the letter. Restating something the listing itself says is not
  fabrication.
- **No company research.** The prompt forbids referencing a company's mission, culture, funding or
  reputation, because the model has no source for any of it.
- **Questions over invention.** Facts that would strengthen the letter but are not in the resume come
  back in `questions` for the user to answer.
- **Clichés** are detected after the fact and reported, because a prompt is not a guarantee.

Letters are versioned per application, stay `draft` until approved, become `source: "edited"` the
moment the user changes an AI draft, and export to A4 PDF with real selectable text. A single
paragraph can be rewritten; an ungrounded rewrite is rejected with `422 UNGROUNDED_PARAGRAPH` and
**nothing is saved** — the replacement is returned for the user to accept.

## Documents

- **Content decides the type.** `sniffType` reads magic bytes; a renamed script, or a PDF declared as
  PNG, is rejected. Accepted: PDF, DOCX, DOC, PNG, JPEG, TXT, up to 10 MB.
- **No storage means no pretending.** With `STORAGE_DRIVER=none` the driver discards bytes, so an
  upload is refused with `503 STORAGE_NOT_CONFIGURED` naming the setting to change — rather than
  reporting a success that did not happen. Links still work.
- **Keys never leave the backend.** `presentDocument` omits `storageKey`; files are streamed from
  `GET /api/application-documents/:id/download` after an ownership check, with `nosniff` and a
  sanitised `Content-Disposition`.
- `@@unique(applicationId, checksum)` refuses a byte-identical duplicate, and deleting a document
  removes the stored file only when no other row references it.

## Reminders

Stored as an absolute `dueAt` plus the IANA `timezone` it was entered in, so "Friday 09:00" stays
Friday 09:00 in the user's calendar across DST and server moves. `groupReminders` buckets into
overdue / today / this week / later **on the viewer's calendar days**, and a reminder read from a
different zone shows both readings. An invalid zone falls back to UTC rather than shifting silently.

**There is no scheduler in this deployment.** `schedulerContract` reports
`active: false, deliveryMode: "on_read"`: reminders surface when the workspace or the reminder list
is opened, and the contract documents precisely what a background runner would call and why it would
be idempotent (`UserNotification` is unique on `(userId, dedupeKey)`). No email, push or SMS is sent
and the UI says so.

## Readiness review (`application-readiness-1.0`)

Pure, no AI. Every item is `ready`, `attention` or `unknown`, and the three are kept distinct:
"you have no cover letter" is *unknown* (many applications need none), while "you have drafts but
none approved" is *attention*. Each item carries a `because` citing the record it read.
`blocking` is always `false`, there is no score, and the disclaimer states that items marked unknown
mean the product has no information — not that something is wrong.

## API

All routes require `Authorization: Bearer <jwt>` and are owner-scoped: a row belonging to someone
else is a 404, never a 403 with a hint.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/application-workspaces` | Dashboard across applications, with the filter counts |
| GET | `/api/applications/:applicationId/workspace` | Everything about one application in one read (`tz` honoured) |
| GET / POST | `/api/applications/:applicationId/checklist` | Seeds the template once; POST adds a custom step |
| PATCH / DELETE | `…/checklist/:itemId` | Completing requires `completionSource`; template steps cannot be deleted |
| GET / POST | `/api/applications/:applicationId/activity` | Audit trail; POST adds the user's own note |
| GET / POST | `/api/applications/:applicationId/cover-letters` | POST drafts with AI, or stores text the user wrote |
| PATCH / DELETE | `/api/cover-letters/:coverLetterId` | Editing an AI draft marks it `edited` |
| POST | `/api/cover-letters/:id/regenerate-paragraph` | Returns a replacement; saves nothing |
| POST | `/api/cover-letters/:id/export` | `application/pdf` |
| GET / POST | `/api/applications/:applicationId/documents` | multipart `document` field, or a `url` for a link |
| GET | `/api/application-documents/:documentId/download` | Owner-checked stream; `?inline=true` to preview |
| DELETE | `/api/application-documents/:documentId` | Removes the stored file when nothing else references it |
| GET / POST | `/api/application-reminders` | `tz` honoured; duplicates prevented by `dedupeKey` |
| PATCH / DELETE | `/api/application-reminders/:reminderId` | |
| GET / POST | `/api/applications/:applicationId/interviews` | `createReminder: true` also schedules one |
| PATCH / DELETE | `/api/application-interviews/:interviewId` | A finished outcome writes an activity row |
| POST | `/api/applications/:applicationId/readiness-review` | Never blocking |

Status changes stay on `PATCH /api/applications/:id`, which now accepts `statusNote`,
`confirmUnusual`, `outcome` and `applicationDeadline`.

## Frontend (Next.js App Router)

`/dashboard/applications/[applicationId]` (the workspace) and
`/dashboard/applications/reminders` (reminders across applications). The existing applications list
links into the workspace.

Components in `frontend/src/components/applications/`: `ApplicationWorkspace` (header, status
control, next action, the listing text), `ApplicationChecklist`, `CoverLetterEditor`,
`ApplicationDocumentManager`, `ApplicationTimeline`, `ApplicationReminders`,
`ApplicationInterviewPlanner`, `ApplicationReadinessReview`. Service:
`frontend/src/services/applicationWorkspaceService.ts`.

The UI keeps the same boundaries as the API: steps show who can verify them, withheld paragraphs and
the model's questions are shown next to the draft, documents render no storage path, reminders show
the zone they were set in, and the status control offers ordinary moves while putting anything
unusual behind a confirmation.

## Tests

`backend/tests/phase13.test.js` — **33 tests, all passing.** Coverage: template verification
boundaries; auto-completion never touching submission steps; derived preparation stage; checklist
seeding once, completion source, reopening, custom items, template steps undeletable; the submission
prompt not changing status; the grounding guard withholding invented figures and technologies;
job-description claims counting as grounded; cliché detection; letter versioning, approval, editing
provenance and PDF export; ungrounded regeneration rejected and nothing saved; provider failure
writing no row; a user-written letter bypassing the model; content-based file sniffing; link
validation; storage-not-configured refusal; stored upload with duplicate rejection, owner-only
download and no key exposure; transition validation including unusual-with-confirmation and no-op;
the ten-stage mapping; activity written by the existing tracker endpoint with no fabricated history;
user notes; timezone grouping and cross-zone display; reminder dedupe; one-time notification;
reminder CRUD; interview rounds with an optional reminder; readiness separating unknown from
deficient and never blocking; workspace aggregation; next-action derivation; dashboard filters;
authentication on all 27 endpoints; cross-user isolation; and oversized/malformed input.

Full backend suite: **15/15 files pass** — Phases 1–12 unaffected.

Three defects were found by the tests and fixed: `applicationRoutes.js` dropped the `workspaceRepo`
it was given (so no status activity was ever written), the PDF page count was read after pdfkit had
flushed its buffer (always zero), and a test fixture's "grounded" paragraph itself contained an
invented figure.

## Known limitations

- **No scheduler.** Reminders are delivered when a page is opened. Daily or background delivery needs
  a job runner that does not exist here; `schedulerContract.toEnable` documents the integration
  point. No email, push or SMS exists anywhere in this product.
- **No employer integration.** Nothing submits an application, sends a message, creates a calendar
  invitation or detects a reply. Every status, submission and interview outcome is recorded by the
  user.
- **Uploads need `STORAGE_DRIVER=local`** (or a future cloud driver). With `none`, only links can be
  attached, and the UI says so.
- Document preview is limited to PDF, PNG, JPEG and TXT; other types download instead.
- The activity timeline starts when this phase did. Applications created earlier have no history, and
  none is invented for them.
- Cover letter grounding is lexical: it catches invented numbers and technologies, not a plausible
  but false sentence containing neither. The letter is a draft for the user to read.
- `outcome` is only meaningful at `OFFER`; the schema rejects setting it alongside another status.
- Interviewer names are stored only because the user typed them, and are never used to contact
  anyone.
