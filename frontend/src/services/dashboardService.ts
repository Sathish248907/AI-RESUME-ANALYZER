/**
 * dashboardService.ts — dashboard overview / activity / analytics (Phase 5).
 */
import { api } from "./api";
import type { AnalysisHistoryItem } from "./analysisHistoryService";
import type { ApplicationStatus } from "./jobApplicationService";

export interface DashboardOverview {
  totals: {
    resumes: number;
    analyses: number;
    aiAnalyses: number;
    demoAnalyses: number;
    applications: number;
    activeApplications: number;
    interviewsCompleted: number;
    jobDescriptions: number;
  };
  averageMatchScore: { value: number | null; sampleSize: number; basis: string };
  bestMatchScore: number | null;
  followUps: { dueSoon: number; overdue: number };
  learningProgress: { questionsPracticed: number; averageScore: number | null } | null;
  skillGaps: { name: string; count: number; required: number }[];
  recommendedActions: { key: string; title: string; detail: string; href: string }[];
  generatedAt: string;
}

export interface DashboardActivity {
  recentAnalyses: AnalysisHistoryItem[];
  recentApplications: { id: string; companyName: string; jobTitle: string; status: ApplicationStatus; applicationDate: string; matchScore: number | null; updatedAt: string }[];
  upcomingFollowUps: { id: string; companyName: string; jobTitle: string; status: ApplicationStatus; nextFollowUpDate: string; overdue: boolean }[];
}

export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all";

export interface PeriodCount {
  period: string;
  count: number;
}

export interface DashboardAnalytics {
  range: AnalyticsRange;
  granularity: "week" | "month";
  from: string | null;
  sampleSizes: { aiAnalyses: number; analyses: number; applications: number };
  scoreTrend: { date: string; score: number; jobTitle: string; id: string; provider: string | null; model: string | null }[];
  scoreTrendNote: string;
  applicationsOverTime: PeriodCount[];
  analysesOverTime: PeriodCount[];
  interviewActivity: PeriodCount[];
  statusDistribution: { status: ApplicationStatus; count: number }[];
  skillGaps: { name: string; count: number; required: number }[];
  weekly: { analyses: PeriodCount[]; applications: PeriodCount[]; interviews: PeriodCount[] };
  monthly: { analyses: PeriodCount[]; applications: PeriodCount[]; interviews: PeriodCount[] };
  insufficientHistory: boolean;
}

export async function getDashboardOverview(): Promise<DashboardOverview> {
  const { data } = await api.get<DashboardOverview>("/api/dashboard/overview");
  return data;
}

export async function getDashboardActivity(limit = 5): Promise<DashboardActivity> {
  const { data } = await api.get<DashboardActivity>("/api/dashboard/activity", { params: { limit } });
  return data;
}

export async function getDashboardAnalytics(range: AnalyticsRange = "90d", granularity?: "week" | "month"): Promise<DashboardAnalytics> {
  const { data } = await api.get<DashboardAnalytics>("/api/dashboard/analytics", { params: { range, ...(granularity ? { granularity } : {}) } });
  return data;
}
