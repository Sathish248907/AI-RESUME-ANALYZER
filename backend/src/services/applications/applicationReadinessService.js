/**
 * applicationReadinessService.js — the optional pre-submission review
 * (`application-readiness-1.0`). Pure, no AI.
 *
 * Three design decisions follow from the brief and are worth stating:
 *
 *   1. **It never blocks.** There is no pass mark and no gate. The review
 *      returns items; whether to apply is the user's call, and `verdict` says
 *      so in words rather than returning a score to argue with.
 *   2. **Missing is not deficient.** Every item is `ready`, `attention` or
 *      `unknown`. "You have no cover letter" is a deficiency the user can fix;
 *      "this listing states no degree requirement" is simply unknown and is
 *      never counted against them.
 *   3. **Every item explains itself.** `because` cites the record the check
 *      read — a match report, a checklist row, a document — so nothing is a
 *      bare assertion.
 */
export const READINESS_METHOD = "application-readiness-1.0";

const READY = "ready";
const ATTENTION = "attention";
const UNKNOWN = "unknown";

/**
 * @param {object} input
 * @param {object} input.application
 * @param {object} input.checklist      summary from applicationChecklistService
 * @param {object|null} input.match     stored match report row, or null
 * @param {Array} input.coverLetters
 * @param {Array} input.documents
 * @param {Array} input.interviews
 * @param {object|null} input.resumeVersion
 * @param {number} input.mockInterviewCount completed mock interviews for the role
 */
export function reviewReadiness({
  application, checklist, match = null, coverLetters = [], documents = [],
  interviews = [], resumeVersion = null, mockInterviewCount = 0,
}) {
  const items = [];
  const add = (key, label, state, because, action = null) => items.push({ key, label, state, because, action });

  // ── Resume ──
  if (!resumeVersion) {
    add("resume_selected", "Resume version chosen", ATTENTION,
      "No resume version is linked to this application, so there is nothing to send or to match against.",
      { label: "Choose a version", href: "/dashboard/resume-builder" });
  } else {
    add("resume_selected", "Resume version chosen", READY,
      `“${resumeVersion.name}” is linked to this application.`);
  }

  // ── Match ──
  if (!match) {
    add("match", "Resume-to-job match", UNKNOWN,
      "No match has been computed for this job yet, so how well your resume fits it is unknown — not poor.",
      { label: "Run the match", href: `/dashboard/jobs` });
  } else if (match.matchScore >= 70) {
    add("match", "Resume-to-job match", READY, `Your resume matches this listing at ${match.matchScore}% (${match.label}).`);
  } else {
    const missing = (match.details?.skills?.requiredNotFound ?? []).slice(0, 5);
    add("match", "Resume-to-job match", ATTENTION,
      `Your resume matches at ${match.matchScore}% (${match.label}).${missing.length ? ` Required skills not found in it: ${missing.join(", ")}.` : ""} A low match is not a reason not to apply; it is a reason to check your resume says what you actually did.`,
      { label: "Tailor your resume", href: "/dashboard/resume-builder" });
  }

  // ── Cover letter ──
  const approved = coverLetters.filter((c) => c.status === "approved");
  const drafts = coverLetters.filter((c) => c.status === "draft");
  if (approved.length) {
    add("cover_letter", "Cover letter", READY, `“${approved[0].title}” is approved and ready to send.`);
  } else if (drafts.length) {
    add("cover_letter", "Cover letter", ATTENTION,
      `You have ${drafts.length} draft${drafts.length === 1 ? "" : "s"} but none approved. A draft is not finished until you have read it.`,
      { label: "Review the draft", href: `/dashboard/applications/${application.id}` });
  } else {
    add("cover_letter", "Cover letter", UNKNOWN,
      "No cover letter exists. Many applications do not need one — this is only worth attention if this employer asked for one.");
  }

  // ── Documents ──
  const byCategory = new Set(documents.map((d) => d.category));
  if (documents.length === 0) {
    add("documents", "Supporting documents", UNKNOWN,
      "Nothing is attached. Whether this listing needs a portfolio, certificate or transcript is something only the listing says.");
  } else {
    add("documents", "Supporting documents", READY,
      `${documents.length} attached (${[...byCategory].join(", ")}).`);
  }

  // ── Checklist ──
  if (checklist.remainingRequired.length === 0 && checklist.required > 0) {
    add("checklist", "Preparation checklist", READY, `All ${checklist.required} required steps are ticked.`);
  } else {
    add("checklist", "Preparation checklist", ATTENTION,
      `${checklist.remainingRequired.length} required step${checklist.remainingRequired.length === 1 ? "" : "s"} outstanding: ${checklist.remainingRequired.slice(0, 3).join("; ")}${checklist.remainingRequired.length > 3 ? "…" : ""}`,
      { label: "Open the checklist", href: `/dashboard/applications/${application.id}` });
  }

  // ── Demonstrated skills ──
  const demonstrated = match?.details?.skills?.requiredDemonstrated ?? [];
  const needingEvidence = match?.details?.skills?.needingEvidence ?? [];
  if (!match) {
    add("skills", "Demonstrated skills", UNKNOWN, "Without a match report, which of this listing's skills you evidence is unknown.");
  } else if (needingEvidence.length) {
    add("skills", "Demonstrated skills", ATTENTION,
      `${demonstrated.length} required skill${demonstrated.length === 1 ? " is" : "s are"} demonstrated. These are listed on your resume but not shown in any role or project: ${needingEvidence.slice(0, 5).join(", ")}. Expect to be asked about them.`);
  } else {
    add("skills", "Demonstrated skills", READY, `${demonstrated.length} required skill${demonstrated.length === 1 ? " is" : "s are"} demonstrated in a role or project.`);
  }

  // ── Interview preparation ──
  if (mockInterviewCount > 0) {
    add("interview_prep", "Interview practice", READY, `${mockInterviewCount} completed mock interview${mockInterviewCount === 1 ? "" : "s"} on record.`);
  } else {
    add("interview_prep", "Interview practice", UNKNOWN,
      "No mock interviews recorded. This matters after you apply, not before.",
      { label: "Practise", href: "/dashboard/interviews/new" });
  }

  // ── Contact details ──
  const contactItem = checklist.byCategory?.find?.((c) => c.category === "resume");
  if (contactItem) {
    add("contact", "Contact details", UNKNOWN,
      "Only you can confirm the email, phone and links on the version you are sending are current.");
  }

  // ── Deadline ──
  if (application.applicationDeadline) {
    const days = Math.round((new Date(application.applicationDeadline).getTime() - Date.now()) / 86_400_000);
    if (days < 0) add("deadline", "Application deadline", ATTENTION, `The deadline you recorded passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`);
    else add("deadline", "Application deadline", READY, `${days} day${days === 1 ? "" : "s"} until the deadline you recorded.`);
  }

  const ready = items.filter((i) => i.state === READY);
  const attention = items.filter((i) => i.state === ATTENTION);
  const unknown = items.filter((i) => i.state === UNKNOWN);

  return {
    method: READINESS_METHOD,
    items,
    ready,
    attention,
    unknown,
    counts: { ready: ready.length, attention: attention.length, unknown: unknown.length, total: items.length },
    verdict: attention.length === 0
      ? "Nothing in your own records is obviously missing. Whether to apply is your call."
      : `${attention.length} item${attention.length === 1 ? "" : "s"} could be stronger before you send this. None of them stops you applying.`,
    blocking: false,
    disclaimer:
      "This review reads only your own records. It cannot see the employer's criteria, it does not score you, and it never prevents you from applying. " +
      "Items marked “unknown” mean this product has no information — not that something is wrong.",
    reviewedAt: new Date().toISOString(),
  };
}
