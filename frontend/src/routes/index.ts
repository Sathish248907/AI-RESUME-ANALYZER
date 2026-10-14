/**
 * Application route and API endpoint constants.
 * Centralizes all navigation targets and backend API routes.
 */

export const APP_ROUTES = {
  HOME: "/",
  ANALYZE: "/analyze",
  DASHBOARD: "/dashboard",
  JOB_ANALYZER: "/dashboard/job-analyzer",
  RESUME_ANALYZER: "/dashboard/resume-analyzer",
  MY_RESUMES: "/dashboard/my-resumes",
  ANALYSIS_HISTORY: "/dashboard/analysis-history",
  APPLICATIONS: "/dashboard/applications",
  JOB_DESCRIPTIONS: "/dashboard/job-descriptions",
  ANALYTICS: "/dashboard/analytics",
  JOB_HISTORY: "/dashboard/job-history",
  JOB_ANALYSIS_DETAIL: (jobId: string) => `/dashboard/job-analysis/${jobId}`,
  RESUME_ANALYSIS_DETAIL: (analysisId: string) => `/dashboard/resume-analysis/${analysisId}`,
  HISTORY: "/history",
  LOGIN: "/auth/login",
  SIGNIN: "/auth/signin",
} as const;

export const API_ROUTES = {
  HEALTH: "/api/health",
  AUTH_LOGIN: "/api/auth/login",
  AUTH_REGISTER: "/api/auth/register",
  AUTH_ME: "/api/auth/me",
  RESUME_PARSE: "/api/resume/parse",
  ANALYSIS: "/api/analysis",
  ANALYSIS_RUN: "/api/analysis/run",
  ANALYSIS_HISTORY: "/api/analysis/history",
  ANALYSIS_DETAIL: (id: string) => `/api/analysis/${id}`,
  ANALYSIS_RESUME: "/api/analysis/resume",
  RESUMES: "/api/resumes",
  JOB_DESCRIPTIONS: "/api/job-descriptions",
  APPLICATIONS: "/api/applications",
  INTERVIEWS: "/api/interviews",
  INTERVIEW_HISTORY: "/api/interviews/history",
  DASHBOARD_OVERVIEW: "/api/dashboard/overview",
  DASHBOARD_ACTIVITY: "/api/dashboard/activity",
  DASHBOARD_ANALYTICS: "/api/dashboard/analytics",
} as const;
