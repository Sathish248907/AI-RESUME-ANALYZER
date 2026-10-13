/**
 * Shared frontend constants. Values that drive forms and routing live here so
 * pages and components do not hard-code them.
 */
export { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
export { API_BASE_URL } from "@/services/api";

/** Dashboard/app routes used in navigation and redirects. */
export const ROUTES = {
  home: "/",
  login: "/auth/login",
  dashboard: "/dashboard",
  resumeAnalyzer: "/dashboard/resume-analyzer",
  resumeAnalysis: (id: string) => `/dashboard/resume-analysis/${id}`,
  resumeHistory: "/dashboard/my-resumes",
  jobAnalyzer: "/dashboard/job-analyzer",
  jobAnalysis: (id: string) => `/dashboard/job-analysis/${id}`,
  jobHistory: "/dashboard/job-history",
  legacyAiAnalyze: "/analyze",
  legacyAiHistory: "/history",
} as const;

/** Upload limits mirrored from the backend/Next parse routes (5 MB, PDF/DOCX). */
export const RESUME_UPLOAD = {
  maxBytes: 5 * 1024 * 1024,
  acceptedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ],
} as const;
