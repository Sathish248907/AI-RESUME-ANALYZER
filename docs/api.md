# Backend REST API Reference

The backend exposes a structured, RESTful API mounted at `/api`.

All endpoints return JSON responses with standardized error envelopes.

---

## Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error description",
    "details": [
      { "field": "email", "message": "Invalid email address format" }
    ],
    "retryable": false
  }
}
```

---

## 1. System Health

### `GET /api/health`
Checks server readiness, database connectivity state, and configured LLM provider status.

- **Auth Required**: No
- **Response** (`200 OK`):
  ```json
  {
    "status": "ok",
    "ai": {
      "configured": true,
      "provider": "anthropic",
      "model": "claude-opus-5-5"
    },
    "time": "2026-10-13T10:00:00.000Z"
  }
  ```

---

## 2. Authentication

### `POST /api/auth/register`
Creates a new user account with hashed password.

- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "name": "Jane Doe"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe",
      "createdAt": "2026-10-13T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### `POST /api/auth/login`
Authenticates existing credentials and issues a JWT token.

- **Auth Required**: No
- **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

### `GET /api/auth/me`
Fetches the currently authenticated profile.

- **Auth Required**: Yes (`Authorization: Bearer <token>`)
- **Response** (`200 OK`):
  ```json
  {
    "user": {
      "id": "cly12345...",
      "email": "user@example.com",
      "name": "Jane Doe"
    }
  }
  ```

---

## 3. Resume Processing

### `POST /api/resume/parse`
Extracts raw text and metadata from uploaded PDF or Word document in memory.

- **Auth Required**: No (supports demo uploads)
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `resume`: File (`.pdf`, `.docx`, `.doc`, max 5 MB)
- **Response** (`200 OK`):
  ```json
  {
    "text": "Extracted text content from the resume...",
    "charCount": 2450,
    "mimeType": "application/pdf",
    "fileName": "resume.pdf",
    "fileSize": 124500
  }
  ```

---

## 4. Resume & Job Analysis

### `POST /api/analysis/run`
Executes full AI-powered analysis comparing a resume against a target job description.

- **Auth Required**: Optional (logged-in users have results automatically persisted)
- **Rate Limit**: 10 requests per 15 minutes per IP
- **Request Body**:
  ```json
  {
    "resumeText": "Full plain text of the resume...",
    "jobDescription": "Full job description text...",
    "jobTitle": "Senior Frontend Engineer",
    "targetRole": "frontend"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "id": "cly67890...",
    "matchScore": 84,
    "atsScore": 88,
    "summary": "Strong alignment with frontend requirements...",
    "matchedSkills": [
      {
        "name": "React",
        "category": "Frontend",
        "priority": "required",
        "evidence": "Built design system in React 18",
        "evidenceType": "direct"
      }
    ],
    "missingOrUnverifiedSkills": [
      {
        "name": "GraphQL",
        "category": "Backend",
        "priority": "required",
        "reason": "Not found in resume text"
      }
    ],
    "strengths": [
      "Quantified lighthouse optimization"
    ],
    "improvementSuggestions": [
      {
        "title": "Add state management details",
        "description": "Specify experience with Redux or Zustand",
        "type": "content",
        "priority": "high"
      }
    ],
    "interviewQuestions": [
      {
        "question": "How do you optimize React render cycles?",
        "topic": "React Performance",
        "type": "technical",
        "difficulty": "hard"
      }
    ]
  }
  ```

### `GET /api/analysis/history`
Returns previously saved analyses for the authenticated user.

- **Auth Required**: Yes (`Authorization: Bearer <token>`)
- **Query Params**:
  - `limit`: Integer (default: 20, max: 50)
  - `cursor`: Pagination cursor

### `GET /api/analysis/:id`
Retrieves a single analysis by its ID.

- **Auth Required**: Yes
- **Response** (`200 OK`): Full analysis object.

### `DELETE /api/analysis/:id`
Deletes an analysis owned by the authenticated user.

- **Auth Required**: Yes
- **Response** (`204 No Content`)

## Learning roadmaps (Phase 7)

All routes live under `/api/learning` and require `Authorization: Bearer <jwt>`; every record is scoped to the owner (404 otherwise). The full request/response reference, status codes and derivation rules are in [phase7.md](phase7.md).

| Method | Path | Notes |
|---|---|---|
| POST | `/api/learning/roadmaps` | AI generation (long request budget, AI rate limiter) |
| GET | `/api/learning/roadmaps` | `status`, `page`, `limit` |
| GET / PATCH / DELETE | `/api/learning/roadmaps/:id` | |
| POST | `/api/learning/roadmaps/:id/regenerate` | `apply=false` preview (default) / `apply=true` new version |
| GET | `/api/learning/roadmaps/:id/progress` | progress, weekly plan, next action |
| GET | `/api/learning/roadmaps/:id/tasks` | `status`, `milestoneId` |
| PATCH | `/api/learning/tasks/:taskId` | status / notes / schedule / study minutes |
| POST | `/api/learning/tasks/:taskId/complete` · `/reopen` | |
| GET | `/api/learning/tasks/:taskId/resources` | |
| POST | `/api/learning/tasks/:taskId/checkpoints/:checkpointId/submit` | MCQ graded server-side; other types self-reported |
| GET | `/api/learning/skill-gaps` · PATCH `/api/learning/skill-gaps/:id` | |
| GET | `/api/learning/recommendations` · POST `/api/learning/recommendations/:key/dismiss` | |

## Resume builder (Phase 8)

All routes live under `/api/resume-builder` and require `Authorization: Bearer <jwt>`; records are owner-scoped (404 otherwise). Full reference in [phase8.md](phase8.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/resume-builder/templates` · GET/PUT `/preferences` | |
| GET | `/api/resume-builder/:resumeId` | creates the read-only original version on first access |
| POST | `/api/resume-builder/:resumeId/versions` · `/versions` | from upload (`structure` heuristic/ai), from version, or blank |
| GET / PATCH / DELETE | `/api/resume-builder/versions/:id` | PATCH = autosave with `expectedUpdatedAt` |
| POST | `/api/resume-builder/versions/:id/duplicate` · `/restore` · `/compare` | |
| POST | `/api/resume-builder/versions/:id/improve` · `/tailor` | AI (long budget, AI limiter) |
| GET / POST | `/api/resume-builder/versions/:id/improvements[/:improvementId]` | accept / edit / reject / reset |
| GET | `/api/resume-builder/versions/:id/quality-check` | deterministic quality report |
| POST | `/api/resume-builder/versions/:id/export/pdf` | `application/pdf`, `X-Resume-Pages` |

## Career coach (Phase 9)

All routes live under `/api/career` and require `Authorization: Bearer <jwt>`; records are owner-scoped. Full reference in [phase9.md](phase9.md).

| Method | Path | Notes |
|---|---|---|
| GET / PUT | `/api/career/profile` | |
| POST / GET | `/api/career/assessments[/:assessmentId]` | deterministic readiness (no AI) |
| GET / PATCH | `/api/career/recommendations[/:id]` | status open / done / dismissed |
| GET | `/api/career/dashboard` · `/job-priorities` · `/interview-prep` | |
| POST / GET | `/api/career/action-plans/generate` · `/action-plans/current` | |
| POST / PATCH / DELETE | `/api/career/action-tasks[/:taskId]` | |
| POST / GET / PATCH / DELETE | `/api/career/coach/conversations[/:id]` · POST `/:id/messages` | AI chat (long budget, AI limiter) |

## Analytics, gamification, goals, reports & notifications (Phase 10)

All routes require `Authorization: Bearer <jwt>`; records are owner-scoped and no endpoint accepts points, XP, unlocks or scores from the client. Full reference in [phase10.md](phase10.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/analytics/overview?range=7d|30d|90d|all&tz=` | KPIs with previous-period comparison, all widgets, progress score |
| GET | `/api/analytics/career-progress` · `/skills` · `/interviews` · `/resume` · `/applications` | `null` = no data, never zero |
| GET / PATCH | `/api/gamification/profile` | reconciles ledger from records; PATCH accepts only `timezone` |
| GET | `/api/gamification/points/history` · `/achievements` · `/streaks` · `/activity` · `/rules` | paginated where applicable |
| GET / POST / PATCH / DELETE | `/api/goals[/:goalId]` | measured goals reject manual `currentValue` (409) |
| POST / GET | `/api/progress-reports/generate` · `/api/progress-reports[/:reportId]` · `/:reportId/pdf` | AI narrative optional, deterministic fallback |
| GET / PATCH / POST | `/api/notifications` · `/:notificationId/read` · `/read-all` · `/preferences` | in-app only, de-duplicated |

## ATS readiness, checks, roles & writing assistant (Phase 11)

All routes live under `/api/resume-builder/versions/:versionId` and require `Authorization: Bearer <jwt>`;
records are owner-scoped (404 otherwise). Only the assistant calls the model — everything else is
deterministic and sits under a generous rate limit. Full reference in [phase11.md](phase11.md).

| Method | Path | Notes |
|---|---|---|
| POST | `…/ats-check` | weighted ATS readiness; `jobDescriptionId` / `jobDescription` switches general → job mode; `save` snapshots it and returns the delta |
| GET | `…/ats-history?mode=&limit=` | past snapshots and the general / job trends, kept apart |
| POST | `…/validate` | deterministic findings: spelling, duplication, dates, links, symbols, headings; missing facts come back as questions |
| POST | `…/apply-fix` | one mechanical fix (`kind`), reports the real before/after score and `changed: false` for a no-op |
| POST | `…/role-recommendations` | evidence-based suitability per role; no salary, demand or hiring-probability claim |
| POST | `…/target-role` | saves the chosen role; optionally applies its template and section order |
| POST | `…/assistant` | AI (long budget, AI limiter); returns prose + editable drafts, writes nothing to the resume |

## Job discovery & matching (Phase 12)

All routes require `Authorization: Bearer <jwt>`; records are owner-scoped and no route calls an LLM.
`:jobId` is a provider listing id, or `jd:<id>` for one of your own saved job descriptions. Full
reference in [phase12.md](phase12.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/jobs/discover?q=&location=&workArrangement=&employmentType=&experienceLevel=&minSalary=&postedWithinDays=&source=&sort=&page=&limit=&refresh=` | Cached provider listings + your own job descriptions, matched and ranked; `sort=relevance\|newest\|match` |
| GET | `/api/jobs/providers` | Adapter configuration state, last result, attribution and setup guide |
| POST | `/api/jobs/refresh` | Forces one provider round (rate-limited); 503 when no provider is configured |
| GET | `/api/jobs/:jobId` | Listing, parsed requirements, match, ranking, preparation, saved / application state |
| POST | `/api/jobs/:jobId/match` | Deterministic match; `compareAllVersions` returns the recommended resume version |
| GET | `/api/jobs/:jobId/match-report` | Stored report, or computed when none exists |
| GET | `/api/jobs/:jobId/interview-preparation` | Topics, practice questions, sessions, coding exercises, learning tasks |
| POST | `/api/jobs/:jobId/tailor-resume` | Hands over to `/api/resume-builder/versions/:id/tailor` with a saved job description |
| GET / POST | `/api/saved-jobs` | `state` = saved \| interested \| hidden; saving is idempotent per job |
| PATCH / DELETE | `/api/saved-jobs/:savedJobId` | State and notes |
| POST | `/api/saved-jobs/:savedJobId/application` | Creates one `JobApplication` (Phase 5); 409 on a duplicate unless `allowDuplicate` |
| GET / PUT | `/api/job-preferences` | Filters plus ranking weights (each bounded 0–100) |
| GET / POST / PATCH / DELETE | `/api/job-alerts[/:alertId]` | Saved searches; max 20, names unique |
| POST | `/api/job-alerts/:alertId/run` | Runs the search; notifies only about listings not already announced |

Application status changes stay in `/api/applications`; tailoring suggestions stay in
`/api/resume-builder/*`. Phase 12 adds no second workflow for either.

## Application workspace (Phase 13)

All routes require `Authorization: Bearer <jwt>`; every record is owner-scoped and a row belonging to
another user returns 404. Status changes stay on `PATCH /api/applications/:id`, which now also
accepts `statusNote`, `confirmUnusual`, `outcome` and `applicationDeadline`, validates the transition
and writes the activity row. Full reference in [phase13.md](phase13.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/application-workspaces` | Dashboard across applications with filter counts (active, drafts, needs follow-up, upcoming interviews, offers, closed) |
| GET | `/api/applications/:applicationId/workspace?tz=` | Job, stage, checklist, letters, documents, activity, reminders, interviews and the next recommended action in one read |
| GET / POST | `/api/applications/:applicationId/checklist` | Template seeds once; POST adds a custom step |
| PATCH / DELETE | `…/checklist/:itemId` | Completing requires `completionSource` (`in_app` \| `external`); template steps are not deletable |
| GET / POST | `/api/applications/:applicationId/activity` | Audit trail; entries are written only when an operation succeeded |
| GET / POST | `/api/applications/:applicationId/cover-letters` | POST drafts with AI (grounded, paragraphs that invent facts are withheld) or stores your own text |
| PATCH / DELETE | `/api/cover-letters/:coverLetterId` | Editing an AI draft marks it `edited`; `status: "approved"` finishes it |
| POST | `/api/cover-letters/:id/regenerate-paragraph` | Returns a replacement paragraph; saves nothing. 422 when it invents facts |
| POST | `/api/cover-letters/:id/export` | `application/pdf`, selectable text |
| GET / POST | `/api/applications/:applicationId/documents` | multipart `document`, or `url` for a link. 503 when storage is not configured |
| GET | `/api/application-documents/:documentId/download` | Owner-checked stream; storage keys are never returned |
| DELETE | `/api/application-documents/:documentId` | Deletes the stored file only when nothing else references it |
| GET / POST | `/api/application-reminders?tz=` | Grouped overdue / today / this week / later in your own timezone |
| PATCH / DELETE | `/api/application-reminders/:reminderId` | |
| GET / POST | `/api/applications/:applicationId/interviews` | `createReminder: true` also schedules one |
| PATCH / DELETE | `/api/application-interviews/:interviewId` | |
| POST | `/api/applications/:applicationId/readiness-review` | Optional, never blocking, no score |

No endpoint submits an application, contacts an employer, creates a calendar invitation or detects
an employer response.

## Integrations & workflow automation (Phase 14)

All routes require `Authorization: Bearer <jwt>` and are owner-scoped, **except**
`GET /api/integrations/callback`, which the provider's redirect reaches without a Bearer token and
which is authenticated by a single-use, server-stored `state`. No access token, refresh token or
provider secret appears in any response body. Full reference in [phase14.md](phase14.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/api/integrations` | Every integration with its real readiness, blockers, scopes, limits and setup steps. `connectable` is true only when this server could complete the flow |
| GET | `/api/integrations/callback` | Provider redirect. Always redirects into the app with `?connected=` or `?error=&message=`; `partialScopes=1` when a permission was declined |
| GET | `/api/integrations/:provider/status` | Single provider, with merged preferences. Accepts `email` as well as the OAuth providers |
| POST | `/api/integrations/:provider/connect` | Returns `authorizationUrl`. 409 when the token vault or the provider credentials are not configured |
| POST | `/api/integrations/:provider/disconnect` | Deletes the sealed credentials; the response says whether the provider also revoked the grant |
| POST | `/api/integrations/:provider/sync` | `dryRun: true` returns exactly what would change and writes nothing. 409 `REAUTH_REQUIRED` when the grant was revoked |
| GET | `/api/integrations/:provider/sync-history` | Everything this app has done at the provider |
| PUT | `/api/integrations/google_calendar/preferences` | Which event types sync (`interviews`, `deadlines`, `reminders`) |
| PUT | `/api/integrations/email/preferences` | Which categories the user wants; saved whether or not a transport exists |
| GET | `/api/integrations/google_drive/folders` | Only folders visible under `drive.file` — not the whole Drive |
| POST | `/api/integrations/google_drive/export` | One document per request. A cover letter must be approved first (409 `NOT_APPROVED`) |
| GET | `/api/integrations/email/history` | Delivered and recorded-only messages, with the transport that handled each |
| GET | `/api/automation/rules` | Workflow catalogue, each with the user's rule and any options that cannot work yet, with the reason |
| POST | `/api/automation/rules` | Create or update by `workflowKey`. Rules are created disabled |
| PATCH / DELETE | `/api/automation/rules/:ruleId` | |
| POST | `/api/automation/pause-all` | Disables every rule in one call |
| GET | `/api/automation/rules/:ruleId/preview` | The plan the engine would execute. Changes nothing |
| POST | `/api/automation/rules/:ruleId/run` | Without `approved: true`, actions marked `external` are recorded as `skipped_needs_approval` and the run ends `awaiting_approval` |
| GET | `/api/automation/executions` | What ran, what was planned, what was approved and what each action did |
| POST | `/api/automation/executions/:executionId/retry` | Repeats only the failed actions; capped at 3 retries |

No endpoint submits an application, messages an employer, invites anyone to an event, or reads a
mailbox. Calendar events are created with no attendees, and email is sent only to the address on the
user's own account.
