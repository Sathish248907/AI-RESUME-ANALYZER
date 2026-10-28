/**
 * onboardingService.js — first-run setup (`onboarding-1.0`).
 *
 * The guiding rule: **onboarding owns no data of its own.** Every answer it
 * collects already has a home — career stage, target roles, skills, locations,
 * work mode and goals on `CareerProfile` (Phase 9); the resume on `Resume` and
 * `ResumeVersion` (Phases 3 and 8); the first assessment on `ResumeAtsAssessment`
 * or `Analysis`. This service writes none of them directly. It reads them to
 * work out where the user is, and hands each step off to the feature that
 * already owns it.
 *
 * Two consequences worth stating:
 *
 *   - **A step is satisfied by evidence, not by a flag.** Someone who signed up
 *     in Phase 5 and already has a profile and three resumes is past those
 *     steps the first time they load this, without having to click through
 *     them. Conversely a user who clicked "done" but whose profile is empty is
 *     not pretended to be set up.
 *   - **Skipping is real.** A skipped step stays skipped and stays reachable;
 *     it does not block the rest of the flow, and nothing is filled in on the
 *     user's behalf.
 */

export const ONBOARDING_METHOD = "onboarding-1.0";

/**
 * The four steps, in order. `optional` steps can be skipped without the flow
 * being considered incomplete.
 */
export const ONBOARDING_STEPS = Object.freeze([
  {
    key: "profile",
    title: "Your career profile",
    summary: "Career stage, the roles you are aiming at, and how you want to work.",
    detail:
      "Everything else is shaped by this: which jobs are surfaced, what a resume is measured against, and which skills count as gaps.",
    href: "/dashboard/career/profile",
    optional: false,
    collects: [
      "Career stage (student, fresher, experienced, changing field)",
      "Target job roles",
      "Skills you already have",
      "Preferred locations and work arrangement",
      "What you are working towards",
    ],
    ownedBy: "CareerProfile (Phase 9) — editable any time from your profile page",
  },
  {
    key: "resume",
    title: "Your resume",
    summary: "Upload a PDF or DOCX, or build one from scratch.",
    detail:
      "Uploading extracts the text so it can be analysed; nothing is changed or rewritten without you accepting it. You review what was extracted before anything is saved.",
    href: "/dashboard/my-resumes",
    optional: false,
    collects: ["An existing resume file, or a new one built in the editor"],
    ownedBy: "Resume / ResumeVersion (Phases 3 and 8) — the original file is never edited",
  },
  {
    key: "assessment",
    title: "First check",
    summary: "See how your resume reads, and how it matches a role.",
    detail:
      "General ATS readiness looks at structure and completeness. A job-specific match needs a job description, so it is offered only once you have one.",
    href: "/dashboard/resume-builder",
    optional: true,
    collects: [],
    ownedBy: "ResumeAtsAssessment (Phase 11) and JobMatchReport (Phase 12)",
  },
  {
    key: "next_steps",
    title: "What to do next",
    summary: "A short list built from what you just set up.",
    detail:
      "These come from your own records, each one saying why it is there. Nothing is a generic tip.",
    href: "/dashboard",
    optional: true,
    collects: [],
    ownedBy: "CareerRecommendation (Phase 9), surfaced by recommendations-1.0",
  },
]);

export const STEP_KEYS = ONBOARDING_STEPS.map((s) => s.key);
const REQUIRED_KEYS = ONBOARDING_STEPS.filter((s) => !s.optional).map((s) => s.key);

/** A profile counts as filled in only when it says something useful. */
export function profileIsUseful(profile) {
  if (!profile) return false;
  const roles = Array.isArray(profile.targetRoles) ? profile.targetRoles : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  return roles.length > 0 || skills.length > 0;
}

/**
 * Work out which steps the user's records already satisfy.
 *
 * This is deliberately evidence-based: it asks "does a profile with a target
 * role exist", not "did someone click Next".
 *
 * @param {{ profile: object|null, resumeCount: number, versionCount: number,
 *           assessmentCount: number, analysisCount: number }} evidence
 */
export function deriveSatisfied(evidence) {
  const { profile, resumeCount = 0, versionCount = 0, assessmentCount = 0, analysisCount = 0 } = evidence;
  return {
    profile: profileIsUseful(profile),
    resume: resumeCount > 0 || versionCount > 0,
    assessment: assessmentCount > 0 || analysisCount > 0,
    // There is nothing to "have done" here; it is a read-only summary, so it
    // counts as satisfied once there is something to summarise.
    next_steps: resumeCount > 0 || versionCount > 0 || profileIsUseful(profile),
  };
}

/**
 * The first step that is neither satisfied by evidence nor explicitly skipped.
 * Returns `"done"` when there is nothing left to do.
 */
export function nextStep(satisfied, skipped = []) {
  const skippedSet = new Set(skipped);
  for (const step of ONBOARDING_STEPS) {
    if (satisfied[step.key]) continue;
    if (skippedSet.has(step.key)) continue;
    return step.key;
  }
  return "done";
}

/** Complete when every required step is satisfied or was deliberately skipped. */
export function isComplete(satisfied, skipped = []) {
  const skippedSet = new Set(skipped);
  return REQUIRED_KEYS.every((key) => satisfied[key] || skippedSet.has(key));
}

/**
 * @param {{ repo: object, careerRepo: object, recommendations: object, logger?: object }} deps
 */
export function createOnboardingService({ repo, careerRepo, recommendations, logger = { info() {} } }) {
  /**
   * The whole state of first-run setup for one user: where they are, what each
   * step wants, and which ones their existing records already answer.
   */
  async function getState(userId, { includeRecommendations = false } = {}) {
    const [row, evidence] = await Promise.all([repo.find(userId), repo.evidence(userId)]);

    const satisfied = deriveSatisfied(evidence);
    const skipped = Array.isArray(row?.skippedSteps) ? row.skippedSteps : [];
    const completed = Array.isArray(row?.completedSteps) ? row.completedSteps : [];
    const current = nextStep(satisfied, skipped);
    const complete = isComplete(satisfied, skipped);

    const steps = ONBOARDING_STEPS.map((step) => ({
      ...step,
      satisfied: satisfied[step.key],
      skipped: skipped.includes(step.key),
      completed: completed.includes(step.key),
      current: step.key === current,
    }));

    const state = {
      method: ONBOARDING_METHOD,
      started: Boolean(row),
      complete,
      dismissed: Boolean(row?.dismissedAt),
      currentStep: current,
      steps,
      progress: {
        satisfied: STEP_KEYS.filter((k) => satisfied[k]).length,
        total: STEP_KEYS.length,
        requiredRemaining: REQUIRED_KEYS.filter((k) => !satisfied[k] && !skipped.includes(k)).length,
      },
      evidence: {
        hasProfile: satisfied.profile,
        resumeCount: evidence.resumeCount,
        versionCount: evidence.versionCount,
        assessmentCount: evidence.assessmentCount,
        analysisCount: evidence.analysisCount,
      },
      note:
        "Nothing here stores a second copy of your answers — each step saves into the feature that owns it, and you can change any of it later.",
    };

    if (includeRecommendations) {
      state.recommendations = (await recommendations.list(userId, { limit: 5 })).recommendations;
    }
    return state;
  }

  /** Record that the user finished or skipped a step, and advance. */
  async function markStep(userId, step, action) {
    if (!STEP_KEYS.includes(step)) {
      const err = new Error(`"${step}" is not an onboarding step.`);
      err.status = 400;
      err.code = "UNKNOWN_STEP";
      throw err;
    }
    const row = await repo.ensure(userId);
    const completed = new Set(Array.isArray(row.completedSteps) ? row.completedSteps : []);
    const skipped = new Set(Array.isArray(row.skippedSteps) ? row.skippedSteps : []);

    if (action === "skip") {
      skipped.add(step);
      completed.delete(step);
    } else {
      completed.add(step);
      // Completing a step the user previously skipped clears the skip.
      skipped.delete(step);
    }

    const evidence = await repo.evidence(userId);
    const satisfied = deriveSatisfied(evidence);
    const current = nextStep(satisfied, [...skipped]);
    const complete = isComplete(satisfied, [...skipped]);

    await repo.update(userId, {
      completedSteps: [...completed],
      skippedSteps: [...skipped],
      currentStep: current,
      completedAt: complete ? (row.completedAt ?? new Date()) : null,
    });

    logger.info?.("onboarding step", { meta: { userId, step, action, current, complete } });
    return getState(userId, { includeRecommendations: current === "done" });
  }

  /** Stop offering the flow. Every step stays reachable from Settings. */
  async function dismiss(userId) {
    await repo.ensure(userId);
    await repo.update(userId, { dismissedAt: new Date() });
    return getState(userId);
  }

  /** Offer it again. */
  async function restart(userId) {
    await repo.ensure(userId);
    await repo.update(userId, { dismissedAt: null, completedAt: null });
    return getState(userId);
  }

  return { method: ONBOARDING_METHOD, getState, markStep, dismiss, restart };
}
