/**
 * jobApplicationService.ts — job application tracker (Phase 5).
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

export const APPLICATION_STATUSES = ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  INTERESTED: "Interested",
  APPLIED: "Applied",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  INTERESTED: "bg-gray-100 text-gray-700 border-gray-200",
  APPLIED: "bg-blue-50 text-blue-800 border-blue-200",
  ASSESSMENT: "bg-indigo-50 text-indigo-800 border-indigo-200",
  INTERVIEW: "bg-purple-50 text-purple-800 border-purple-200",
  OFFER: "bg-green-50 text-green-800 border-green-200",
  REJECTED: "bg-red-50 text-red-800 border-red-200",
  WITHDRAWN: "bg-amber-50 text-amber-800 border-amber-200",
};

export interface JobApplication {
  id: string;
  companyName: string;
  jobTitle: string;
  jobUrl: string | null;
  applicationDate: string;
  status: ApplicationStatus;
  nextFollowUpDate: string | null;
  notes: string | null;
  jobDescriptionId: string | null;
  resumeId: string | null;
  analysisId: string | null;
  jobDescription: { id: string; jobTitle: string; companyName: string | null; targetRole: string } | null;
  resume: { id: string; name: string } | null;
  analysis: { id: string; matchScore: number; analysisMode: "ai" | "demo"; jobTitle: string } | null;
  matchScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pipeline {
  total: number;
  active: number;
  counts: Record<ApplicationStatus, number>;
}

export interface ApplicationInput {
  companyName: string;
  jobTitle: string;
  jobUrl?: string | null;
  applicationDate?: string;
  status?: ApplicationStatus;
  nextFollowUpDate?: string | null;
  notes?: string | null;
  jobDescriptionId?: string | null;
  resumeId?: string | null;
  analysisId?: string | null;
}

export type ApplicationSort = "newest" | "oldest" | "company" | "followUp" | "updated" | "score";

export interface ApplicationFilters {
  q?: string;
  status?: ApplicationStatus | ApplicationStatus[];
  targetRole?: string;
  from?: string;
  to?: string;
  sort?: ApplicationSort;
  page?: number;
  limit?: number;
}

export async function listApplications(filters: ApplicationFilters = {}) {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    params[k] = Array.isArray(v) ? v.join(",") : (v as string | number);
  }
  const { data } = await api.get<{ applications: JobApplication[]; pipeline: Pipeline } & PageMeta>("/api/applications", { params });
  return data;
}

export async function getApplication(id: string): Promise<JobApplication> {
  const { data } = await api.get<{ application: JobApplication }>(`/api/applications/${encodeURIComponent(id)}`);
  return data.application;
}

export async function createApplication(input: ApplicationInput): Promise<JobApplication> {
  const { data } = await api.post<{ application: JobApplication }>("/api/applications", input);
  return data.application;
}

export async function updateApplication(id: string, patch: Partial<ApplicationInput>): Promise<JobApplication> {
  const { data } = await api.patch<{ application: JobApplication }>(`/api/applications/${encodeURIComponent(id)}`, patch);
  return data.application;
}

export async function deleteApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${encodeURIComponent(id)}`);
}

export async function getPipeline(): Promise<Pipeline> {
  const { data } = await api.get<{ pipeline: Pipeline }>("/api/applications/pipeline");
  return data.pipeline;
}
