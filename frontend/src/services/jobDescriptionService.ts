/**
 * jobDescriptionService.ts — saved job descriptions (Phase 5).
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

export interface ExtractedRequirements {
  skills?: { name: string; category?: string; priority?: string }[];
  experience?: Record<string, unknown>;
  education?: Record<string, unknown>;
  certifications?: string[];
  responsibilities?: string[];
  keywords?: string[];
  parserVersion?: string;
}

export interface SavedJobDescription {
  id: string;
  jobTitle: string;
  companyName: string | null;
  targetRole: string;
  sourceUrl: string | null;
  description?: string;
  descriptionPreview: string;
  extractedRequirements: ExtractedRequirements | null;
  skillCount: number;
  analysisCount: number;
  applicationCount: number;
  analyses?: { id: string; matchScore: number; analysisMode: "ai" | "demo"; createdAt: string; resumeId: string | null; resumeName: string | null }[];
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionInput {
  jobTitle: string;
  companyName?: string | null;
  targetRole: string;
  description: string;
  sourceUrl?: string | null;
  extractedRequirements?: ExtractedRequirements | null;
}

export type JobDescriptionSort = "newest" | "oldest" | "title" | "company";

export async function listJobDescriptions(params: { q?: string; targetRole?: string; sort?: JobDescriptionSort; page?: number; limit?: number } = {}) {
  const { data } = await api.get<{ jobDescriptions: SavedJobDescription[] } & PageMeta>("/api/job-descriptions", { params });
  return data;
}

export async function getJobDescription(id: string): Promise<SavedJobDescription> {
  const { data } = await api.get<{ jobDescription: SavedJobDescription }>(`/api/job-descriptions/${encodeURIComponent(id)}`);
  return data.jobDescription;
}

export async function createJobDescription(input: JobDescriptionInput): Promise<SavedJobDescription> {
  const { data } = await api.post<{ jobDescription: SavedJobDescription }>("/api/job-descriptions", input);
  return data.jobDescription;
}

export async function updateJobDescription(id: string, patch: Partial<JobDescriptionInput>): Promise<SavedJobDescription> {
  const { data } = await api.patch<{ jobDescription: SavedJobDescription }>(`/api/job-descriptions/${encodeURIComponent(id)}`, patch);
  return data.jobDescription;
}

export async function deleteJobDescription(id: string): Promise<void> {
  await api.delete(`/api/job-descriptions/${encodeURIComponent(id)}`);
}
