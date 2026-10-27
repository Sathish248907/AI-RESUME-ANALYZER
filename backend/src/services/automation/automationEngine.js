/**
 * automationEngine.js — plan, approve, execute (`automation-engine-1.0`).
 *
 * The shape of every run is the same, and the separation is the point:
 *
 *   evaluate → plan → [approval, if anything leaves the app] → execute
 *
 *   - **evaluate** reads the user's real records and decides whether the
 *     trigger fired. It writes nothing. A workflow with nothing to do says so
 *     rather than manufacturing work.
 *   - **plan** turns that into an ordered list of actions, each with a preview
 *     the user can read *before* anything happens.
 *   - **execute** runs them. In-app actions run immediately; an action marked
 *     `external` runs only when this specific execution has been approved, and
 *     is otherwise recorded as `skipped_needs_approval`.
 *
 * Failure is per action, not per run: one failed step leaves the others' work
 * intact and marks the execution `partial`. Retrying re-runs only what failed,
 * so a retry cannot duplicate a calendar event or a notification — every action
 * carries a `dedupeKey` that its sink honours.
 */
import { ApiError } from "../../utils/errors.js";
import { ACTION_TYPES, WORKFLOW_BY_KEY, resolveConfig } from "./automationCatalog.js";

export const ENGINE_METHOD = "automation-engine-1.0";

export const EXECUTION_STATUSES = ["planned", "awaiting_approval", "succeeded", "partial", "failed", "skipped"];
/** Backoff for retries, in minutes, by attempt. */
const RETRY_BACKOFF_MINUTES = [5, 30, 180];
export const MAX_RETRIES = RETRY_BACKOFF_MINUTES.length;

const hoursBetween = (a, b) => (new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;

/**
 * @param {{ repo, progressRepo, workspaceRepo, calendar, email, logger? }} deps
 */
export function createAutomationEngine({ repo, progressRepo, workspaceRepo, calendar, email, logger = { info() {}, warn() {} } }) {
  // ── Evaluation: do the user's records say this workflow has something to do? ──

  const evaluators = {
    async interview_preparation(userId, config, now) {
      const interviews = await repo.upcomingInterviews(userId);
      const due = interviews.filter((i) =>
        i.scheduledAt &&
        i.outcome === "scheduled" &&
        new Date(i.scheduledAt) > now &&
        hoursBetween(i.scheduledAt, now) <= config.leadTimeHours);
      if (!due.length) {
        return { fired: false, reason: `No interview round is scheduled within the next ${config.leadTimeHours} hours.` };
      }
      const round = due.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
      const application = await repo.applicationFor(round.applicationId, userId);
      return {
        fired: true,
        reason: `A ${round.stage.replace(/_/g, " ")} round at ${application?.companyName ?? "an employer"} is ${Math.round(hoursBetween(round.scheduledAt, now))} hours away.`,
        subject: { kind: "interview", id: round.id, applicationId: round.applicationId, round, application },
      };
    },

    async application_follow_up(userId, config, now) {
      const [applications, reminders] = await Promise.all([repo.activeApplications(userId), repo.pendingReminders(userId)]);
      const dueApps = applications.filter((a) => a.nextFollowUpDate && new Date(a.nextFollowUpDate) <= now);
      const dueReminders = reminders.filter((r) => r.type === "follow_up" && new Date(r.dueAt) <= now);
      if (!dueApps.length && !dueReminders.length) {
        return { fired: false, reason: "No application has a follow-up date that has arrived." };
      }
      const application = dueApps[0] ?? await repo.applicationFor(dueReminders[0].applicationId, userId);
      if (!application) return { fired: false, reason: "The due reminder is not attached to an application." };
      return {
        fired: true,
        reason: `Follow-up for ${application.jobTitle} at ${application.companyName} is due.`,
        subject: { kind: "application", id: application.id, application, reminder: dueReminders[0] ?? null },
      };
    },

    async weekly_summary(userId, config, now) {
      const since = new Date(now.getTime() - 7 * 86_400_000);
      const activity = await repo.weeklyActivity(userId, since);
      const total = activity.learningTasks + activity.interviews + activity.resumeEdits + activity.applications + activity.statusChanges;
      if (total === 0) {
        return { fired: true, reason: "Nothing changed in the last seven days.", subject: { kind: "week", id: since.toISOString().slice(0, 10), activity, empty: true } };
      }
      return { fired: true, reason: `${total} things changed in the last seven days.`, subject: { kind: "week", id: since.toISOString().slice(0, 10), activity, empty: false } };
    },

    async resume_improvement(userId, config) {
      const review = await repo.resumeReviewMaterial(userId);
      if (!review.version) return { fired: false, reason: "You have no editable resume version yet." };
      const issues = review.pendingSuggestions + review.atsFindings;
      if (issues < config.minimumIssues) {
        return { fired: false, reason: `Only ${issues} unresolved item${issues === 1 ? "" : "s"}, below your threshold of ${config.minimumIssues}.` };
      }
      return { fired: true, reason: `${review.pendingSuggestions} unresolved suggestion(s) and ${review.atsFindings} ATS finding(s) on “${review.version.name}”.`, subject: { kind: "resume", id: review.version.id, review } };
    },
  };

  // ── Planning: turn a fired trigger into previewable actions ──

  function planActions(spec, config, evaluation, context) {
    const { subject } = evaluation;
    const plan = [];
    const add = (type, preview, payload = {}, opts = {}) => {
      const meta = ACTION_TYPES[type];
      plan.push({
        type,
        label: meta.label,
        consequence: meta.consequence,
        description: meta.description,
        preview,
        payload,
        dedupeKey: opts.dedupeKey ?? null,
        skipReason: opts.skipReason ?? null,
      });
    };

    if (spec.key === "interview_preparation") {
      const { round, application } = subject;
      const when = new Date(round.scheduledAt).toLocaleString();
      add("notify", `Notify you that the ${round.stage.replace(/_/g, " ")} round at ${application?.companyName} is on ${when}.`,
        { title: `Interview coming up: ${application?.jobTitle ?? "your application"}`, body: `${round.stage.replace(/_/g, " ")} round at ${application?.companyName} on ${when}.`, href: `/dashboard/applications/${round.applicationId}` },
        { dedupeKey: `automation:interview_prep:${round.id}` });
      add("prepare_checklist", `Add preparation steps to the checklist for ${application?.jobTitle ?? "this application"}.`,
        { applicationId: round.applicationId, stage: round.stage },
        { dedupeKey: `automation:prep_steps:${round.id}` });
      add("recommend_mock_interview", `Suggest a mock interview for ${application?.jobTitle ?? "this role"}. It does not start one.`,
        { applicationId: round.applicationId, targetRole: application?.jobTitle ?? null });
      if (config.addToCalendar) {
        const connected = context.calendarConnected;
        add("calendar_event", `Create a calendar event “${round.stage.replace(/_/g, " ")} — ${application?.companyName}” at ${when}, with no attendees.`,
          { kind: "interview", id: round.id },
          {
            dedupeKey: `automation:calendar:${round.id}`,
            skipReason: connected ? null : "Google Calendar is not connected, so this step will be skipped.",
          });
      }
    }

    if (spec.key === "application_follow_up") {
      const { application } = subject;
      add("notify", `Notify you that the follow-up for ${application.jobTitle} at ${application.companyName} is due.`,
        { title: `Follow-up due: ${application.companyName}`, body: `You planned to follow up on ${application.jobTitle}.`, href: `/dashboard/applications/${application.id}` },
        { dedupeKey: `automation:follow_up:${application.id}:${new Date(application.nextFollowUpDate ?? Date.now()).toISOString().slice(0, 10)}` });
      if (config.includeDraft) {
        add("draft_follow_up", `Write a ${config.tone} follow-up draft for you to copy. Nothing is sent.`,
          { applicationId: application.id, tone: config.tone });
      }
    }

    if (spec.key === "weekly_summary") {
      const { activity, empty } = subject;
      add("summarise", empty ? "Build a summary saying there was no recorded activity this week." : `Summarise ${activity.learningTasks} learning task(s), ${activity.interviews} interview(s), ${activity.resumeEdits} resume edit(s) and ${activity.applications} application change(s).`,
        { activity, empty }, { dedupeKey: `automation:weekly:${subject.id}` });
      add("notify", "Notify you that the weekly summary is ready.",
        { title: "Your weekly career summary", body: evaluation.reason, href: "/dashboard/progress" },
        { dedupeKey: `automation:weekly_notify:${subject.id}` });
      if (config.emailIt) {
        add("send_email", `Email the summary to the address on your account${context.emailDelivers ? "" : " — recorded only, because no mail transport is configured"}.`,
          { category: "weekly_summary", subject: "Your weekly career summary" },
          { dedupeKey: `automation:weekly_email:${subject.id}` });
      }
    }

    if (spec.key === "resume_improvement") {
      const { review } = subject;
      add("review_resume", `Collect ${review.pendingSuggestions} suggestion(s) and ${review.atsFindings} ATS finding(s) on “${review.version.name}” into a review. Your resume is not changed.`,
        { versionId: review.version.id }, { dedupeKey: `automation:resume_review:${review.version.id}` });
      add("notify", `Notify you that a resume review is ready for “${review.version.name}”.`,
        { title: "Resume review ready", body: evaluation.reason, href: `/dashboard/resume-builder/${review.version.id}` },
        { dedupeKey: `automation:resume_notify:${review.version.id}` });
    }

    return plan;
  }

  // ── Execution: one function per action type ──

  const runners = {
    async notify(userId, action) {
      if (!progressRepo) return { status: "skipped", detail: "Notifications are unavailable." };
      const created = await progressRepo.createNotification(userId, {
        type: "automation",
        title: action.payload.title,
        body: action.payload.body,
        href: action.payload.href ?? null,
        dedupeKey: action.dedupeKey,
      });
      return created
        ? { status: "ok", detail: "Notification created." }
        : { status: "ok", detail: "Already notified; nothing duplicated." };
    },

    async prepare_checklist(userId, action) {
      const added = await repo.addPreparationSteps(userId, action.payload.applicationId, action.payload.stage);
      return { status: "ok", detail: added === 0 ? "Preparation steps were already present." : `${added} preparation step(s) added.` };
    },

    async recommend_mock_interview(userId, action) {
      return {
        status: "ok",
        detail: "Mock interview suggested.",
        result: { href: `/dashboard/interviews/new${action.payload.targetRole ? `?role=${encodeURIComponent(action.payload.targetRole)}` : ""}`, note: "Suggestion only — no session was started." },
      };
    },

    async draft_follow_up(userId, action) {
      const draft = await repo.buildFollowUpDraft(userId, action.payload.applicationId, action.payload.tone);
      return { status: "ok", detail: "Draft written.", result: { draft, note: "Copy it if you want it. This product never sends a message to an employer." } };
    },

    async summarise(userId, action) {
      const summary = await repo.buildWeeklySummary(userId, action.payload.activity, action.payload.empty);
      return { status: "ok", detail: action.payload.empty ? "Summary built: no activity this week." : "Summary built.", result: summary };
    },

    async review_resume(userId, action) {
      const review = await repo.buildResumeReview(userId, action.payload.versionId);
      return { status: "ok", detail: `${review.items.length} item(s) to review.`, result: review };
    },

    async calendar_event(userId, action) {
      if (!calendar) return { status: "skipped", detail: "Calendar integration is unavailable in this build." };
      const source = await repo.calendarSourceFor(userId, action.payload.kind, action.payload.id);
      if (!source) return { status: "skipped", detail: "The record this event was for no longer exists." };
      const result = await calendar.syncOne(userId, source);
      return { status: "ok", detail: `Calendar event ${result.action}.`, result: { externalEventId: result.externalEventId, action: result.action } };
    },

    async send_email(userId, action, context) {
      if (!email) return { status: "skipped", detail: "Email is unavailable in this build." };
      const body = context.emailBody ?? "Your weekly career summary is ready in the app.";
      const res = await email.send(userId, {
        category: action.payload.category,
        subject: action.payload.subject,
        body,
        dedupeKey: action.dedupeKey,
      });
      if (res.skipped === "preference_off") return { status: "skipped", detail: res.reason };
      if (res.skipped === "duplicate") return { status: "ok", detail: "Already handled; nothing sent twice." };
      return {
        status: "ok",
        // Recording is not delivering, and the detail says which happened.
        detail: res.delivered ? `Delivered to ${res.recipient}.` : res.reason ?? "Recorded only; nothing was delivered.",
        result: { delivered: res.delivered, deliveryId: res.deliveryId },
      };
    },
  };

  // ── Public surface ──

  /** Evaluate one rule without writing anything. */
  async function preview(userId, rule, { now = new Date() } = {}) {
    const spec = WORKFLOW_BY_KEY[rule.workflowKey];
    if (!spec) throw new ApiError(400, `“${rule.workflowKey}” is not a workflow this build has.`, { code: "UNKNOWN_WORKFLOW" });
    const config = resolveConfig(spec, rule.config);

    const context = {
      calendarConnected: await repo.isConnected(userId, "google_calendar"),
      emailDelivers: Boolean(email?.status().delivers),
    };

    const evaluation = await evaluators[spec.key](userId, config, now);
    if (!evaluation.fired) {
      return { workflow: spec.key, fired: false, reason: evaluation.reason, actions: [], requiresApproval: false, context };
    }

    const actions = planActions(spec, config, evaluation, context);
    const external = actions.filter((a) => a.consequence === "external" && !a.skipReason);
    return {
      workflow: spec.key,
      fired: true,
      reason: evaluation.reason,
      subject: { kind: evaluation.subject.kind, id: evaluation.subject.id },
      actions,
      requiresApproval: external.length > 0,
      externalActions: external.map((a) => ({ type: a.type, preview: a.preview })),
      context,
      note: external.length
        ? "This run would do something outside the app. It will not run until you approve it."
        : "Every step stays inside this app.",
    };
  }

  /**
   * Run a rule. External actions execute only when `approved` is true for this
   * execution; otherwise they are recorded as skipped and the execution waits.
   */
  async function run(userId, rule, { approved = false, now = new Date(), retryOf = null } = {}) {
    const spec = WORKFLOW_BY_KEY[rule.workflowKey];
    if (!spec) throw new ApiError(400, `“${rule.workflowKey}” is not a workflow this build has.`, { code: "UNKNOWN_WORKFLOW" });
    if (!rule.isEnabled) throw new ApiError(409, `“${spec.name}” is paused.`, { code: "RULE_DISABLED" });

    const plan = await preview(userId, rule, { now });
    if (!plan.fired) {
      const execution = await repo.createExecution(userId, rule.id, {
        status: "skipped",
        trigger: plan.reason,
        plannedActions: [],
        results: [],
      });
      return { execution, plan, ran: false };
    }

    // Decide up front, so the record shows what the user agreed to.
    const needsApproval = plan.requiresApproval && !approved;
    const results = [];
    let failures = 0;
    let skipped = 0;

    const context = { ...plan.context };
    for (const action of plan.actions) {
      if (action.skipReason) {
        results.push({ type: action.type, status: "skipped", detail: action.skipReason });
        skipped += 1;
        continue;
      }
      if (action.consequence === "external" && !approved) {
        results.push({ type: action.type, status: "skipped_needs_approval", detail: "Waiting for your approval before anything leaves the app." });
        skipped += 1;
        continue;
      }
      if (retryOf && retryOf.succeededTypes?.includes(action.type)) {
        results.push({ type: action.type, status: "skipped", detail: "Already succeeded on an earlier attempt." });
        skipped += 1;
        continue;
      }
      try {
        const outcome = await runners[action.type](userId, action, context);
        results.push({ type: action.type, ...outcome });
        // The summary feeds the email step in the same run.
        if (action.type === "summarise" && outcome.result?.text) context.emailBody = outcome.result.text;
      } catch (err) {
        failures += 1;
        results.push({
          type: action.type,
          status: "failed",
          detail: err instanceof ApiError ? err.message : "This step failed.",
          errorCode: err?.code ?? "UNKNOWN",
          /** A revoked grant is worth surfacing differently from a transient error. */
          needsAttention: err?.code === "REAUTH_REQUIRED" || err?.code === "NOT_CONNECTED",
        });
      }
    }

    const ran = results.filter((r) => r.status === "ok").length;
    const status = needsApproval && skipped > 0 && failures === 0
      ? "awaiting_approval"
      : failures === 0
        ? "succeeded"
        : ran > 0
          ? "partial"
          : "failed";

    const retryable = failures > 0 && (rule.retryCount ?? 0) < MAX_RETRIES;
    const execution = await repo.createExecution(userId, rule.id, {
      status,
      trigger: plan.reason,
      plannedActions: plan.actions.map((a) => ({ type: a.type, consequence: a.consequence, preview: a.preview })),
      results,
      approved,
      retryOfId: retryOf?.id ?? null,
      retryCount: retryOf ? (retryOf.retryCount ?? 0) + 1 : 0,
      nextRetryAt: retryable ? new Date(now.getTime() + RETRY_BACKOFF_MINUTES[Math.min(retryOf?.retryCount ?? 0, RETRY_BACKOFF_MINUTES.length - 1)] * 60_000) : null,
      errorCategory: failures ? (results.find((r) => r.needsAttention) ? "needs_reconnect" : "transient") : null,
    });

    await repo.touchRule(rule.id, { lastRunAt: now, lastStatus: status });
    logger.info?.("automation run", { meta: { userId, workflow: spec.key, status, ran, failures, skipped } });

    return { execution, plan, ran: true, status, counts: { ok: ran, failed: failures, skipped } };
  }

  /** Retry a failed execution, skipping the steps that already succeeded. */
  async function retry(userId, executionId, { now = new Date() } = {}) {
    const execution = await repo.findExecution(executionId, userId);
    if (!["failed", "partial"].includes(execution.status)) {
      throw new ApiError(409, "Only a failed or partial run can be retried.", { code: "NOT_RETRYABLE" });
    }
    if ((execution.retryCount ?? 0) >= MAX_RETRIES) {
      throw new ApiError(409, `This run has already been retried ${MAX_RETRIES} times. Fix the underlying problem — often a disconnected integration — and run the workflow again.`, { code: "RETRY_LIMIT" });
    }
    const rule = await repo.findRule(execution.ruleId, userId);
    const succeededTypes = (execution.results ?? []).filter((r) => r.status === "ok").map((r) => r.type);
    return run(userId, rule, {
      approved: Boolean(execution.approved),
      now,
      retryOf: { id: execution.id, retryCount: execution.retryCount ?? 0, succeededTypes },
    });
  }

  return { method: ENGINE_METHOD, preview, run, retry, MAX_RETRIES };
}
