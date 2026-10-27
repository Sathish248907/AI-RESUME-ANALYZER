/**
 * applicationChecklistService.js — the per-application preparation checklist
 * (`application-checklist-1.0`). Pure.
 *
 * The template is the same eleven steps for every application, but each item
 * declares who can *verify* it:
 *
 *   - `in_app`    — this product can see whether it happened (a match report
 *                   exists, a cover letter was written, a document was attached).
 *   - `external`  — only the user knows (they read the job description, they
 *                   pressed submit on the employer's site).
 *
 * That distinction is the point of the feature. Opening an employer's
 * application page is not evidence that an application was submitted, so the
 * submission step is never auto-completed — `deriveAutoCompletions` only ever
 * suggests items whose evidence exists in the user's own records.
 */
export const CHECKLIST_METHOD = "application-checklist-1.0";

export const CHECKLIST_CATEGORIES = ["research", "resume", "cover_letter", "documents", "interview", "submission"];
export const COMPLETION_SOURCES = ["in_app", "external"];

/**
 * @typedef {object} ChecklistTemplateItem
 * @property {string} key          stable id, so re-seeding never duplicates
 * @property {string} title
 * @property {string} description
 * @property {string} category
 * @property {boolean} isRequired  required items drive "ready to apply"
 * @property {"in_app"|"external"} verifiableBy
 * @property {string} [evidence]   what makes it auto-completable (in_app only)
 */

/** The default steps, in the order they are worth doing. */
export const CHECKLIST_TEMPLATE = Object.freeze([
  { key: "review_jd", title: "Read the job description in full", description: "Skim-reading is where mismatched applications start.", category: "research", isRequired: true, verifiableBy: "external" },
  { key: "match_report", title: "Check your resume-to-job match", description: "See which required skills you evidence and which you do not.", category: "resume", isRequired: true, verifiableBy: "in_app", evidence: "match_report" },
  { key: "select_resume", title: "Choose the resume version to send", description: "The workspace records which version this application used.", category: "resume", isRequired: true, verifiableBy: "in_app", evidence: "resume_selected" },
  { key: "tailor_resume", title: "Tailor that version to this job", description: "Use the resume builder's tailoring flow; every suggestion is yours to accept or reject.", category: "resume", isRequired: false, verifiableBy: "in_app", evidence: "tailored_version" },
  { key: "cover_letter", title: "Write a cover letter", description: "Draft one here, or attach your own.", category: "cover_letter", isRequired: false, verifiableBy: "in_app", evidence: "cover_letter" },
  { key: "contact_details", title: "Check your contact details are current", description: "Email, phone and links on the version you are sending.", category: "resume", isRequired: true, verifiableBy: "external" },
  { key: "qualifications", title: "Review the stated requirements", description: "Degrees, years of experience and anything the listing calls mandatory.", category: "research", isRequired: true, verifiableBy: "external" },
  { key: "documents", title: "Prepare supporting documents", description: "Portfolio link, certificates or transcripts the employer asks for.", category: "documents", isRequired: false, verifiableBy: "in_app", evidence: "document" },
  { key: "interview_prep", title: "Practise the likely interview topics", description: "The job's preparation plan lists topics drawn from this listing.", category: "interview", isRequired: false, verifiableBy: "in_app", evidence: "mock_interview" },
  { key: "open_application", title: "Open the employer's application page", description: "Opening the page is only a step — it is not a submission.", category: "submission", isRequired: true, verifiableBy: "external" },
  { key: "record_submission", title: "Record that you submitted it", description: "Only you can confirm this. Marking it sets the application to Applied.", category: "submission", isRequired: true, verifiableBy: "external" },
]);

export const TEMPLATE_BY_KEY = Object.freeze(Object.fromEntries(CHECKLIST_TEMPLATE.map((t) => [t.key, t])));

/** Rows to seed for a new application. */
export function seedItems() {
  return CHECKLIST_TEMPLATE.map((t, i) => ({
    key: t.key,
    title: t.title,
    description: t.description,
    category: t.category,
    isRequired: t.isRequired,
    isCustom: false,
    sortOrder: i,
  }));
}

/**
 * Completion stats and the derived preparation stage.
 *
 * `preparationStage` is how the workspace shows the brief's "Preparing" and
 * "Ready to Apply" without adding statuses that the Phase 9/10 funnel would
 * then have to understand: it is computed from the checklist, never stored.
 *
 * @param {Array<{ isRequired: boolean, completedAt: Date|null }>} items
 * @param {string} status current ApplicationStatus
 */
export function summarise(items, status) {
  const total = items.length;
  const done = items.filter((i) => i.completedAt).length;
  const required = items.filter((i) => i.isRequired);
  const requiredDone = required.filter((i) => i.completedAt).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const requiredPercent = required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100);

  let preparationStage = "not_started";
  if (status !== "INTERESTED") preparationStage = "submitted";
  else if (required.length > 0 && requiredDone === required.length) preparationStage = "ready_to_apply";
  else if (done > 0) preparationStage = "preparing";

  const STAGE_LABELS = {
    not_started: "Not started",
    preparing: "Preparing",
    ready_to_apply: "Ready to apply",
    submitted: "Submitted",
  };

  return {
    method: CHECKLIST_METHOD,
    total,
    completed: done,
    percent,
    required: required.length,
    requiredCompleted: requiredDone,
    requiredPercent,
    preparationStage,
    preparationLabel: STAGE_LABELS[preparationStage],
    preparationExplanation:
      preparationStage === "submitted"
        ? "This application has moved beyond Interested, so preparation is no longer the open question."
        : preparationStage === "ready_to_apply"
          ? "Every required step is ticked. Whether to apply is your call."
          : preparationStage === "preparing"
            ? `${requiredDone} of ${required.length} required steps are done.`
            : "Nothing is ticked yet.",
    remainingRequired: required.filter((i) => !i.completedAt).map((i) => i.title),
    byCategory: CHECKLIST_CATEGORIES.map((c) => {
      const inCategory = items.filter((i) => i.category === c);
      return { category: c, total: inCategory.length, completed: inCategory.filter((i) => i.completedAt).length };
    }).filter((c) => c.total > 0),
  };
}

/**
 * Which `in_app` template steps have real evidence in the user's records.
 *
 * This only ever *suggests*: the caller shows them as "we can see you did
 * this" and the user still ticks them. Nothing here touches the two submission
 * steps, which no amount of evidence inside this product can establish.
 *
 * @param {object} evidence
 * @param {boolean} evidence.hasMatchReport
 * @param {boolean} evidence.hasResumeSelected
 * @param {boolean} evidence.hasTailoredVersion
 * @param {boolean} evidence.hasCoverLetter
 * @param {boolean} evidence.hasDocument
 * @param {boolean} evidence.hasMockInterview
 */
export function deriveAutoCompletions(evidence = {}) {
  const map = {
    match_report: evidence.hasMatchReport,
    select_resume: evidence.hasResumeSelected,
    tailor_resume: evidence.hasTailoredVersion,
    cover_letter: evidence.hasCoverLetter,
    documents: evidence.hasDocument,
    interview_prep: evidence.hasMockInterview,
  };
  return CHECKLIST_TEMPLATE.filter((t) => t.verifiableBy === "in_app" && map[t.evidence] === true).map((t) => ({
    key: t.key,
    title: t.title,
    reason: EVIDENCE_REASONS[t.evidence],
  }));
}

const EVIDENCE_REASONS = {
  match_report: "A match report exists for this job.",
  resume_selected: "A resume version is linked to this application.",
  tailored_version: "A tailored version exists for this job description.",
  cover_letter: "A cover letter is saved for this application.",
  document: "At least one supporting document is attached.",
  mock_interview: "You have completed a mock interview for this role.",
};

/** Describe an item for the API, including who can verify it. */
export function presentItem(row) {
  const template = row.key ? TEMPLATE_BY_KEY[row.key] : null;
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    category: row.category,
    isRequired: row.isRequired,
    isCustom: row.isCustom,
    completed: Boolean(row.completedAt),
    completedAt: row.completedAt,
    completionSource: row.completionSource,
    verifiableBy: template?.verifiableBy ?? "external",
    verificationNote:
      (template?.verifiableBy ?? "external") === "in_app"
        ? "This app can see evidence for this step in your own records."
        : "Only you can confirm this step; the app has no way to check it.",
    sortOrder: row.sortOrder,
  };
}
