/**
 * automationCatalog.js — the workflows this product can run
 * (`automation-catalog-1.0`).
 *
 * Every workflow declares, explicitly, the four things the brief asks for:
 * its **trigger**, its **conditions**, its **actions**, and its **failure
 * behaviour**. Each action also declares a consequence level, and that is what
 * the approval gate keys on:
 *
 *   `in_app`   — changes only this product's own state (a notification, a
 *                checklist, a draft). Runs without asking.
 *   `external` — leaves this product (a calendar event, an email). Always needs
 *                explicit approval for that specific execution.
 *
 * There is deliberately no action that messages an employer, submits an
 * application, or acts on more than one record at a time. Those are not
 * switched off by default — they do not exist.
 */
export const CATALOG_METHOD = "automation-catalog-1.0";

export const CONSEQUENCE_LEVELS = ["in_app", "external"];

/** Actions a workflow may plan. Nothing outside this list can be executed. */
export const ACTION_TYPES = Object.freeze({
  notify: { key: "notify", label: "Show an in-app notification", consequence: "in_app", description: "Adds a notification in this app. Nothing leaves it." },
  prepare_checklist: { key: "prepare_checklist", label: "Prepare an interview checklist", consequence: "in_app", description: "Adds preparation steps to the application's checklist." },
  recommend_mock_interview: { key: "recommend_mock_interview", label: "Recommend a mock interview", consequence: "in_app", description: "Suggests a practice session; it does not start one." },
  draft_follow_up: { key: "draft_follow_up", label: "Draft a follow-up message", consequence: "in_app", description: "Writes a draft you can copy. It is never sent for you." },
  summarise: { key: "summarise", label: "Build a summary", consequence: "in_app", description: "Compiles your own activity into a summary in the app." },
  review_resume: { key: "review_resume", label: "Open a resume review", consequence: "in_app", description: "Collects unresolved suggestions and ATS issues for you to review. It never edits your resume." },
  calendar_event: { key: "calendar_event", label: "Add to your calendar", consequence: "external", description: "Creates an event on your connected calendar. Needs your approval each time." },
  send_email: { key: "send_email", label: "Email you", consequence: "external", description: "Sends to the address on your account only. Needs your approval each time." },
});

/**
 * @typedef {object} WorkflowSpec
 * @property {string} key
 * @property {string} name
 * @property {string} trigger          what starts it, in words
 * @property {string[]} conditions     what must be true
 * @property {string[]} actions        ACTION_TYPES keys, in order
 * @property {string} failureBehaviour what happens when a step fails
 * @property {object} defaultConfig
 */

export const WORKFLOWS = Object.freeze([
  {
    key: "interview_preparation",
    name: "Interview preparation",
    summary: "When an interview round is coming up, get it prepared and optionally on your calendar.",
    trigger: "An interview round you recorded is scheduled within the lead time you choose.",
    conditions: [
      "The round has a date in the future.",
      "Its outcome is still “scheduled”.",
      "It has not already been prepared by this workflow.",
    ],
    actions: ["notify", "prepare_checklist", "recommend_mock_interview", "calendar_event"],
    failureBehaviour: "Each action is independent. A failed calendar event leaves the in-app steps done and the execution marked partial, retryable without repeating the steps that worked.",
    defaultConfig: { leadTimeHours: 72, addToCalendar: false },
    configSchema: [
      { key: "leadTimeHours", label: "Start preparing this many hours before", type: "number", min: 1, max: 720, default: 72 },
      { key: "addToCalendar", label: "Also add the round to my calendar", type: "boolean", default: false, requires: "google_calendar" },
    ],
  },
  {
    key: "application_follow_up",
    name: "Application follow-up",
    summary: "When a follow-up date arrives, remind you and draft the message for you to send yourself.",
    trigger: "An application's follow-up date, or a pending follow-up reminder, is due.",
    conditions: [
      "The application is still active (not rejected or withdrawn).",
      "The follow-up date is today or in the past.",
      "No follow-up has already been drafted for this date.",
    ],
    actions: ["notify", "draft_follow_up"],
    failureBehaviour: "Drafting is local and cannot partially fail; a failed notification is retried on the next run.",
    defaultConfig: { tone: "polite", includeDraft: true },
    configSchema: [
      { key: "tone", label: "Draft tone", type: "enum", options: ["polite", "brief", "warm"], default: "polite" },
      { key: "includeDraft", label: "Include a message draft", type: "boolean", default: true },
    ],
    note: "The draft is yours to copy and send. This product never sends a message to an employer.",
  },
  {
    key: "weekly_summary",
    name: "Weekly career summary",
    summary: "A weekly round-up of learning, interviews, resume work and applications.",
    trigger: "You run it, on or after your chosen day of the week.",
    conditions: ["At least one record changed in the period, otherwise it says there was no activity rather than inventing some."],
    actions: ["summarise", "notify", "send_email"],
    failureBehaviour: "The summary is built first and kept even if the email step fails or is skipped, so the content is never lost.",
    defaultConfig: { dayOfWeek: 1, emailIt: false },
    configSchema: [
      { key: "dayOfWeek", label: "Week starts on", type: "enum", options: ["1", "0"], optionLabels: { 1: "Monday", 0: "Sunday" }, default: "1" },
      { key: "emailIt", label: "Also email it to me", type: "boolean", default: false, requires: "email" },
    ],
  },
  {
    key: "resume_improvement",
    name: "Resume improvement review",
    summary: "Collect unresolved AI suggestions and ATS issues into one review.",
    trigger: "You run it, when a resume version has unresolved suggestions or open ATS findings.",
    conditions: [
      "You have at least one editable resume version.",
      "That version has pending suggestions or a stored ATS assessment with findings.",
    ],
    actions: ["review_resume", "notify"],
    failureBehaviour: "Read-only: it compiles a review and can fail only by finding nothing, which it reports plainly.",
    defaultConfig: { minimumIssues: 1 },
    configSchema: [
      { key: "minimumIssues", label: "Only flag when there are at least this many issues", type: "number", min: 1, max: 50, default: 1 },
    ],
    note: "It never edits a resume. Every suggestion stays yours to accept or reject in the resume builder.",
  },
]);

export const WORKFLOW_BY_KEY = Object.freeze(Object.fromEntries(WORKFLOWS.map((w) => [w.key, w])));

/** Describe a workflow for the API, including which actions leave the app. */
export function describeWorkflow(spec) {
  const actions = spec.actions.map((key) => ACTION_TYPES[key]);
  return {
    ...spec,
    actionDetail: actions,
    externalActions: actions.filter((a) => a.consequence === "external").map((a) => a.key),
    requiresApproval: actions.some((a) => a.consequence === "external"),
    neverDoes: [
      "Sends a message to an employer, recruiter or any third party.",
      "Submits an application.",
      "Edits your resume, or changes an application's status.",
    ],
  };
}

/** Merge a stored rule's config over the workflow default. */
export function resolveConfig(spec, stored) {
  return { ...spec.defaultConfig, ...(stored ?? {}) };
}
