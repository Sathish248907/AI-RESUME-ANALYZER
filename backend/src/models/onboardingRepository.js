/**
 * onboardingRepository.js — Phase 16.
 *
 * Two jobs: the one-row-per-user progress record, and the evidence query that
 * tells the service which steps the user's existing records already answer.
 *
 * The evidence query uses counts rather than loading rows: onboarding only
 * needs to know whether anything exists, and a new user's dashboard should not
 * pay for a full snapshot to find out.
 *
 * Lookups go through `findFirst` on `userId` and updates through the row's own
 * `id`, rather than `findUnique`/`update` keyed on the unique `userId`. Both
 * are equivalent given the unique constraint, and the explicit form works
 * identically against the in-memory client the tests use.
 */

/** @param {import("@prisma/client").PrismaClient} prisma */
export function createOnboardingRepository(prisma) {
  async function find(userId) {
    return prisma.userOnboarding.findFirst({ where: { userId } });
  }

  return {
    find,

    /** Create the progress row on first touch; never overwrite an existing one. */
    async ensure(userId) {
      const existing = await find(userId);
      if (existing) return existing;
      return prisma.userOnboarding.create({
        data: { userId, completedSteps: [], skippedSteps: [], currentStep: "profile" },
      });
    },

    async update(userId, data) {
      const row = await find(userId);
      if (!row) return null;
      return prisma.userOnboarding.update({ where: { id: row.id }, data });
    },

    /**
     * What the user already has. Counts only — no resume text, no analysis
     * payloads, nothing that would be wasteful or sensitive to load here.
     */
    async evidence(userId) {
      const [profile, resumeCount, versionCount, assessmentCount, analysisCount] = await Promise.all([
        prisma.careerProfile.findFirst({ where: { userId }, select: { targetRoles: true, skills: true, careerLevel: true } }),
        prisma.resume.count({ where: { userId } }),
        prisma.resumeVersion.count({ where: { userId } }),
        prisma.resumeAtsAssessment.count({ where: { userId } }),
        prisma.analysis.count({ where: { userId } }),
      ]);
      return { profile, resumeCount, versionCount, assessmentCount, analysisCount };
    },
  };
}
