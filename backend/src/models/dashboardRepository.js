/**
 * dashboardRepository.js — loads one user's records for metric calculation.
 * Only the fields the metric functions need are selected; resume/JD text is never loaded.
 */
export function createDashboardRepository(prisma) {
  return {
    async loadForUser(userId) {
      const [resumes, analyses, applications, interviews, jobDescriptions] = await Promise.all([
        prisma.resume.findMany({ where: { userId }, select: { id: true, name: true, targetRole: true, createdAt: true } }),
        prisma.analysis.findMany({
          where: { userId },
          select: { id: true, jobTitle: true, companyName: true, targetRole: true, analysisMode: true, matchScore: true, provider: true, model: true, resumeId: true, fileName: true, createdAt: true, result: true, resume: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.jobApplication.findMany({
          where: { userId },
          select: { id: true, companyName: true, jobTitle: true, status: true, applicationDate: true, nextFollowUpDate: true, updatedAt: true, analysis: { select: { matchScore: true } } },
          orderBy: { applicationDate: "desc" },
        }),
        prisma.interviewSession.findMany({
          where: { userId },
          select: { id: true, targetRole: true, interviewType: true, questionCount: true, completedQuestionCount: true, score: true, status: true, createdAt: true, completedAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.jobDescription.findMany({ where: { userId }, select: { id: true, jobTitle: true, companyName: true, targetRole: true, createdAt: true } }),
      ]);
      return { resumes, analyses, applications, interviews, jobDescriptions };
    },
  };
}
