# Phase 10 — Advanced Analytics, Gamification & Career Progress Intelligence

Analytics, a transparent Career Progress Score, points / levels / achievements / streaks,
personal goals, weekly & monthly progress reports and an in-app notification + activity feed —
all derived from the records Phases 1–9 already persist. Nothing is accepted from the client:
points, unlocks and scores are always recomputed on the server from stored rows.

## Database changes (`backend/prisma/migrations/20261023000000_phase10_progress_intelligence/`, additive, 32 statements, 8 tables)

| Model (table) | Purpose / constraints |
|---|---|
| `CareerProgressSnapshot` (`api_career_progress_snapshots`) | One progress score per user per local day (`@@unique(userId, dayKey)`) for trends. |
| `GamificationProfile` (`api_gamification_profiles`) | `userId` unique; totals (always re-derived), level, IANA `timezone`, streaks, `notificationPreferences`, `lastReconciledAt`. |
| `PointTransaction` (`api_point_transactions`) | Auditable ledger: `eventKey` (= `<type>:<rowId>`), `kind` award \| reversal, `cycle`, `points`; `@@unique(userId, eventKey, kind, cycle)` blocks duplicate rewards. |
| `UserAchievement` (`api_user_achievements`) | `@@unique(userId, achievementKey)`; `unlockedAt`, progress at unlock, evidence. Definitions live in code (`progressConfig.ACHIEVEMENTS`). |
| `UserGoal` (`api_user_goals`) | title, `goalType`, `linkKey`, `targetValue`, `currentValue` (recomputed), `targetDate`, status active \| paused \| completed \| archived. |
| `ActivityEvent` (`api_activity_events`) | Activity history, one row per `eventKey` (`@@unique(userId, eventKey)`), with points as awarded. |
| `ProgressReport` (`api_progress_reports`) | `@@unique(userId, periodType, periodStart)`; deterministic `metrics`, optional `narrative` (`source: ai | deterministic`), `aiUsed`. |
| `UserNotification` (`api_user_notifications`) | `@@unique(userId, dedupeKey)` prevents duplicate notifications; `readAt`. |

Generated with the read-only diff (`prisma migrate diff --from-url … --to-schema-datamodel …`)
and applied with `prisma migrate deploy` on 2026-10-24. No existing table was altered or reset.

```bash
cd backend && npx prisma generate && npx prisma migrate deploy
```

## How it works (`backend/src/services/progress/`)

**`progressConfig.js`** holds every tunable: point values + daily caps, level thresholds,
progress-score weights, achievement criteria, streak rules, goal types. Nothing else hardcodes them.

**Reconcile-on-read (`progressController.sync`)** — every gamification / analytics / notification
read loads one owner-scoped snapshot (`progressRepository.loadProgressSnapshot`, no resume or JD
text), derives the eligible events, plans ledger changes, evaluates achievements, streaks and level,
and writes only what changed, inside one transaction. Repeated reads are idempotent.

1. **`activityEventService.deriveEvents`** — eligible events from persisted rows only, keyed
   `<type>:<rowId>` (stable → idempotent). Eligibility rules: a mock interview needs ≥ 3 evaluated
   answers (coding ≥ 2); a resume version counts as *improved* only when its quality score is ≥ 5
   points above the original (or parent) version, or ≥ 70 with no baseline; applications count when
   their status moved past Interested (withdrawn excluded); superseded roadmaps are skipped and tasks
   copied between roadmap versions are de-duplicated by signature; demo analyses earn nothing.
   **Daily caps** (per type, in the user's timezone) zero the points of further events the same day;
   future-dated rows earn nothing.
2. **`gamificationService.planLedger`** — one award per `eventKey` per cycle; an event that
   disappears (task reopened, session deleted, status moved back) gets a reversal of the same size;
   when it is valid again a new cycle is awarded, so toggling nets exactly one award. Totals are Σ
   transactions. `levelFor` maps points to levels (1 Career Explorer 0 · 2 Skill Builder 200 ·
   3 Interview Ready 600 · 4 Career Achiever 1200 · 5 Professional Growth 2000, then +1000 per level).
   Levels carry the disclaimer that they describe app activity, not qualification.
3. **Achievements** (`evaluateAchievements`) — 14 criteria (`metric ≥ threshold`), progress shown
   before unlock, unlocked once, never revoked.
4. **`streakService`** — learning days = local calendar days (Intl, DST-safe) with a qualifying event;
   current streak counts consecutive days ending today *or yesterday*; longest streak and total days
   kept forever; 16-week calendar and weekly summary. Streaks are derived on every read, so no server
   error can reset them. Timezone comes from the browser (`tz` query) and is stored on the profile.
5. **`progressScoreService`** — six dimensions (weights 20/20/15/15/15/15): resume improvement
   (`0.6 × bestQuality + 0.4 × clamp(50 + 2.5 × Δquality)`), interview performance (mean of last 5
   scored interviews with ≥ 3 evaluated answers), skill development (Σ skill weights / tracked:
   demonstrated 1, learning 0.5, needs improvement 0.35), learning completion (required-task %),
   application activity (`min(100, 12 × submitted90d + 15 × advanced90d)`), career readiness (latest
   assessment). A dimension without evidence is **excluded** and weights re-normalised; < 2
   dimensions → no score. Snapshotted once per day; comparison against the snapshot ≥ 7 days old.
6. **`analyticsService`** — ranges 7d / 30d / 90d / all, previous-period comparison only when the
   previous window has data; `null` means no data (never zero). Resume quality & match trends,
   interview trend / by type / weak & strong topics, learning completion, readiness history, weekly &
   monthly activity, skill growth (status per skill with every source + date, incompatible-method
   notes, "missing keyword ≠ absent skill"), and the application funnel (stages Saved → Applied →
   Assessment → Interview → Offer; response / interview / offer rates with explicit denominators,
   hidden below 5 submitted; interview→offer needs ≥ 3 interviews; response time approximated from
   the last status update and caveated).
7. **`goalService`** — goal types mock_interviews, learning_tasks, roadmap_completion,
   resume_quality, skill_practice, applications (measured; only records created after the goal count,
   absolute goals read current state) and custom (manual `+1`). Reaching the target completes the goal
   and notifies.
8. **`progressReportService`** — weekly (Monday-based) / monthly periods in the user's timezone,
   deterministic metrics (`buildReportMetrics`), AI narrative (`schemaName: "progress_report"`) that
   may only restate the supplied numbers — a reply containing a number not present in the metrics is
   discarded — with a rule-based narrative fallback when the provider fails, and a pdfkit PDF export.
   Reports are on demand; no scheduler exists in this deployment (`backend/src/jobs/README.md`).
9. **Notifications** — created server-side for achievement unlocks, level-ups, streak milestones,
   milestone / assessment completions (last 14 days only), report generation and goal completion;
   de-duplicated by `dedupeKey`, filtered by per-category preferences. In-app only.

## API

All routes require `Authorization: Bearer <jwt>`; everything is owner-scoped and validated (Zod).
`tz` is an optional IANA timezone query parameter.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/analytics/overview?range=&tz=` | KPIs + all widgets + progress score (snapshots it) + gamification summary |
| GET | `/api/analytics/career-progress?tz=` | score, comparison, daily history, weights |
| GET | `/api/analytics/skills` · `/interviews?range=` · `/resume?range=` · `/applications?range=&tz=` | |
| GET / PATCH | `/api/gamification/profile` | PATCH only accepts `timezone` |
| GET | `/api/gamification/points/history?page=&limit=&eventType=` · `/achievements` · `/streaks` · `/activity?category=` · `/rules` | |
| GET / POST | `/api/goals` | POST validates type / linkKey / target |
| PATCH / DELETE | `/api/goals/:goalId` | `currentValue` only for custom goals (409 otherwise) |
| POST | `/api/progress-reports/generate` (`periodType`, `offset`, `force`) | AI route budget + AI limiter |
| GET | `/api/progress-reports[?periodType=]` · `/:reportId` · `/:reportId/pdf` | |
| GET | `/api/notifications?unread=&page=` | also reconciles → fresh |
| PATCH | `/api/notifications/:id/read` · POST `/read-all` | |
| GET / PATCH | `/api/notifications/preferences` | booleans per category |

No endpoint accepts points, XP, unlocks or scores from the client.

## Frontend (Next.js App Router)

`/dashboard/progress` (hub: score, XP, streak calendar, badges, goals, activity),
`/progress/analytics` (date filter persisted in localStorage, trends, doughnut, activity bars,
progress-score history), `/progress/skills`, `/progress/applications` (funnel, rates with
denominators), `/progress/achievements` (badges, "how XP is earned", points history),
`/progress/goals` (create / edit / pause / complete / archive / delete, presets),
`/progress/reports` (generate, history, PDF download), `/progress/notifications` (read state,
preferences, activity history). Components in `frontend/src/components/progress/` (MetricCard,
ProgressCharts, DateRangeFilter, XpProgressBar, AchievementBadge, GoalCard, ActivityTimeline,
StreakCalendar, ReportPreview, ProgressScoreCard, NotificationBell, ProgressNav, ProgressPageShell);
service `frontend/src/services/progressService.ts`; Navbar entry "Progress & Achievements" and a
notification bell (polls every 90 s); dashboard quick link.

## Tests

- `backend/tests/phase10.test.js` (15 tests): event derivation + caps; ledger award / reversal /
  re-award cycles; level thresholds; achievement progress & single unlock; streaks incl. timezone and
  DST-safe arithmetic; progress score with missing dimensions; analytics ranges, comparisons, funnel
  denominators and small-sample caveats; goals; report metrics, no-AI narrative and invented-number
  rejection; HTTP: reconcile idempotency, client-supplied points ignored, reopen → reversal → redo,
  analytics endpoints + daily snapshot, goals CRUD / ownership / completion notification, reports
  (AI, AI-failure fallback, reuse, PDF text), notification read state, preferences, auth.
- Full backend suite: 12/12 files pass. Frontend: `tsc` clean, `next build` succeeded (41 routes).
- `backend/tests/live-e2e-phase10.mjs` — passed 2026-10-24 against Neon + Gemini: empty states →
  analysis → interview → roadmap → 35 points / 2 badges → reopen (25) → redo (35) → analytics →
  goals → weekly report with Gemini narrative → PDF → notifications.

## Limitations (honest)

- Achievements are never revoked when the underlying activity is reversed (the unlock is history);
  points are.
- Coding practice is represented by `interviewType = "coding"` sessions; there is no separate
  coding-practice feature to draw from.
- Response time in the funnel is approximated from the last status update (no per-status timestamps).
- Reports are on demand only; weekly e-mails / scheduled generation need a job runner that does not
  exist here. Notifications are in-app only.
- The progress score, like all Phase 10 numbers, measures recorded activity; it is not comparable
  across users and does not predict employment outcomes.
- Frontend has no test runner (unchanged); pages are verified by `tsc`, `next build` and the backend
  HTTP tests of the same endpoints.
