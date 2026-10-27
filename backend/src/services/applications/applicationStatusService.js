/**
 * applicationStatusService.js — the status workflow (`application-status-1.0`).
 * Pure.
 *
 * The brief lists ten stages; this product's `ApplicationStatus` enum has seven
 * and is read by the Phase 9 career services (`ACTIVE_STATUSES`) and the
 * Phase 10 funnel (`STAGE_RANK`). Extending the enum would silently change what
 * those count, so the extra stages are expressed without new enum values:
 *
 *   | Brief stage      | How it is represented                              |
 *   |------------------|----------------------------------------------------|
 *   | Saved            | `INTERESTED`                                       |
 *   | Preparing        | `INTERESTED` + some checklist progress (derived)   |
 *   | Ready to Apply   | `INTERESTED` + all required steps done (derived)   |
 *   | Applied          | `APPLIED`                                          |
 *   | Assessment       | `ASSESSMENT`                                       |
 *   | Interview        | `INTERVIEW`                                        |
 *   | Offer            | `OFFER`                                            |
 *   | Accepted         | `OFFER` + `outcome = "accepted"`                   |
 *   | Rejected         | `REJECTED` (or `OFFER` + `outcome = "declined"`)   |
 *   | Withdrawn        | `WITHDRAWN`                                        |
 *
 * Transitions are *validated, not enforced*: an unusual move is refused with an
 * explanation and a flag the caller can set to proceed anyway, because the user
 * always knows more about their own application than this product does. Nothing
 * here detects employer activity — every change is something a person recorded.
 */
import { APPLICATION_STATUSES } from "../../models/applicationRepository.js";

export const STATUS_METHOD = "application-status-1.0";

export const OUTCOMES = ["accepted", "declined"];

export const STATUS_LABELS = Object.freeze({
  INTERESTED: "Saved",
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
});

/** The ordinary forward path. Anything else is "unusual", not forbidden. */
const FORWARD = Object.freeze({
  INTERESTED: ["APPLIED", "WITHDRAWN"],
  APPLIED: ["ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"],
  ASSESSMENT: ["INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"],
  OFFER: ["REJECTED", "WITHDRAWN"],
  REJECTED: [],
  WITHDRAWN: [],
});

/**
 * Is this transition an ordinary one?
 * @param {string} from
 * @param {string} to
 */
export function evaluateTransition(from, to) {
  if (!APPLICATION_STATUSES.includes(to)) {
    return { ok: false, unusual: false, reason: `“${to}” is not a status this tracker uses.` };
  }
  if (from === to) {
    return { ok: false, unusual: false, reason: `This application is already at ${STATUS_LABELS[to]}.`, sameStatus: true };
  }
  if ((FORWARD[from] ?? []).includes(to)) return { ok: true, unusual: false, reason: null };

  // Everything else is allowed, but the caller must mean it.
  const closed = from === "REJECTED" || from === "WITHDRAWN";
  return {
    ok: false,
    unusual: true,
    reason: closed
      ? `This application is already ${STATUS_LABELS[from]}. Moving it to ${STATUS_LABELS[to]} is unusual — confirm if the employer came back to you.`
      : `Moving from ${STATUS_LABELS[from]} back to ${STATUS_LABELS[to]} is unusual. Confirm if you are correcting the record.`,
  };
}

/** Transitions a UI can offer without a confirmation step. */
export function allowedNext(from) {
  return (FORWARD[from] ?? []).map((s) => ({ status: s, label: STATUS_LABELS[s] }));
}

/**
 * The ten-stage view of one application, for display only.
 * @param {{ status: string, outcome: string|null }} application
 * @param {string} preparationStage from the checklist summary
 */
export function describeStage(application, preparationStage) {
  const { status, outcome } = application;
  if (status === "OFFER" && outcome === "accepted") return { stage: "accepted", label: "Accepted", basis: "Offer status with an accepted outcome recorded." };
  if (status === "OFFER" && outcome === "declined") return { stage: "declined", label: "Offer declined", basis: "Offer status with a declined outcome recorded." };
  if (status === "INTERESTED") {
    if (preparationStage === "ready_to_apply") return { stage: "ready_to_apply", label: "Ready to apply", basis: "Saved, with every required checklist step complete." };
    if (preparationStage === "preparing") return { stage: "preparing", label: "Preparing", basis: "Saved, with some checklist progress." };
    return { stage: "saved", label: "Saved", basis: "Saved, with no preparation recorded yet." };
  }
  return { stage: status.toLowerCase(), label: STATUS_LABELS[status], basis: `Tracker status ${STATUS_LABELS[status]}.` };
}

/** Title and detail for the activity row a status change produces. */
export function statusActivity(from, to, { note = "", source = "user" } = {}) {
  return {
    type: "status_changed",
    title: `Status changed from ${STATUS_LABELS[from] ?? from} to ${STATUS_LABELS[to] ?? to}`,
    detail: note || null,
    source,
    fromStatus: from,
    toStatus: to,
  };
}

/**
 * What the user should probably do next. Derived from real state only; when
 * there is nothing to say it says so rather than inventing urgency.
 *
 * @param {object} input
 * @param {object} input.application
 * @param {object} input.checklist    summary from applicationChecklistService
 * @param {Array} input.reminders     pending reminders
 * @param {Array} input.interviews
 * @param {boolean} input.hasCoverLetter
 * @param {Date} [input.now]
 */
export function nextAction({ application, checklist, reminders = [], interviews = [], hasCoverLetter = false, now = new Date() }) {
  const overdue = reminders
    .filter((r) => r.status === "pending" && new Date(r.dueAt) < now)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  if (overdue.length) {
    return { key: "overdue_reminder", title: `Overdue: ${overdue[0].title}`, detail: `Due ${new Date(overdue[0].dueAt).toLocaleDateString()}.`, href: "/dashboard/applications/reminders" };
  }

  const upcomingInterview = interviews
    .filter((i) => i.scheduledAt && new Date(i.scheduledAt) >= now && i.outcome === "scheduled")
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  if (upcomingInterview) {
    return { key: "prepare_interview", title: `Prepare for your ${upcomingInterview.stage.replace(/_/g, " ")} interview`, detail: `Scheduled for ${new Date(upcomingInterview.scheduledAt).toLocaleString()}.`, href: `/dashboard/applications/${application.id}` };
  }

  const pastInterviewWithoutOutcome = interviews.filter((i) => i.scheduledAt && new Date(i.scheduledAt) < now && i.outcome === "scheduled");
  if (pastInterviewWithoutOutcome.length) {
    return { key: "record_interview_outcome", title: "Record how the interview went", detail: "The round is in the past but has no outcome yet.", href: `/dashboard/applications/${application.id}` };
  }

  if (application.status === "INTERESTED") {
    if (checklist.remainingRequired.length) {
      return { key: "finish_checklist", title: `Next step: ${checklist.remainingRequired[0]}`, detail: `${checklist.requiredCompleted} of ${checklist.required} required steps are done.`, href: `/dashboard/applications/${application.id}` };
    }
    return { key: "apply", title: "Everything required is ticked — apply when you are ready", detail: "Record the submission here afterwards so the tracker stays accurate.", href: application.jobUrl ?? `/dashboard/applications/${application.id}` };
  }

  if (application.status === "APPLIED" && !application.nextFollowUpDate) {
    return { key: "set_follow_up", title: "Set a follow-up date", detail: "Applications without a follow-up date tend to go quiet.", href: `/dashboard/applications/${application.id}` };
  }

  if (application.status === "OFFER" && !application.outcome) {
    return { key: "record_outcome", title: "Record whether you accepted the offer", detail: "This closes the application in your history.", href: `/dashboard/applications/${application.id}` };
  }

  if (!hasCoverLetter && ["INTERESTED", "APPLIED"].includes(application.status)) {
    return { key: "cover_letter", title: "Write a cover letter", detail: "Optional, but some employers read them.", href: `/dashboard/applications/${application.id}` };
  }

  return { key: "none", title: "Nothing needs your attention on this application", detail: "No overdue reminders, no unscheduled interviews and no missing required steps.", href: null };
}
