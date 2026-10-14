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
} as const;
