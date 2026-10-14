import { analyticsMetrics, overviewMetrics, recommendedActions, skillGaps } from "../services/dashboard/dashboardService.js";
import { serializeAnalysisListRow } from "../models/analysisRepository.js";

export function createDashboardController({ dashboardRepo }) {
  return {
    /** GET /api/dashboard/overview */
    async overview(req, res, next) {
      try {
        const data = await dashboardRepo.loadForUser(req.user.id);
        const metrics = overviewMetrics(data);
        metrics.totals.jobDescriptions = data.jobDescriptions.length;
        res.json({
          ...metrics,
          skillGaps: skillGaps(data.analyses, 8),
          recommendedActions: recommendedActions(data),
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/dashboard/activity — recent items for the dashboard lists. */
    async activity(req, res, next) {
      try {
        const limit = req.query.limit ?? 5;
        const { analyses, applications } = await dashboardRepo.loadForUser(req.user.id);
        const now = Date.now();
        const upcoming = applications
          .filter((a) => a.nextFollowUpDate && ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER"].includes(a.status))
          .sort((a, b) => new Date(a.nextFollowUpDate) - new Date(b.nextFollowUpDate))
          .slice(0, limit)
          .map((a) => ({ id: a.id, companyName: a.companyName, jobTitle: a.jobTitle, status: a.status, nextFollowUpDate: a.nextFollowUpDate, overdue: new Date(a.nextFollowUpDate).getTime() < now }));
        res.json({
          recentAnalyses: analyses.slice(0, limit).map(serializeAnalysisListRow),
          recentApplications: applications
            .slice()
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
            .slice(0, limit)
            .map((a) => ({ id: a.id, companyName: a.companyName, jobTitle: a.jobTitle, status: a.status, applicationDate: a.applicationDate, matchScore: a.analysis?.matchScore ?? null, updatedAt: a.updatedAt })),
          upcomingFollowUps: upcoming,
        });
      } catch (err) {
        next(err);
      }
    },

    /** GET /api/dashboard/analytics?range=90d&granularity=week */
    async analytics(req, res, next) {
      try {
        const data = await dashboardRepo.loadForUser(req.user.id);
        res.json(analyticsMetrics({ ...data, range: req.query.range, granularity: req.query.granularity }));
      } catch (err) {
        next(err);
      }
    },
  };
}
