/**
 * resumeService.ts — stored resumes (Phase 5). All calls require a signed-in user.
 */
import { api } from "./api";
import type { AnalysisHistoryItem } from "./analysisHistoryService";

export interface LatestAnalysisSummary {
  id: string;
  matchScore: number;
  analysisMode: "ai" | "demo";
  jobTitle: string;
  createdAt: string;
}

export interface ResumeListItem {
  id: string;
  name: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  charCount: number;
  targetRole: string | null;
  hasStoredFile: boolean;
  analysisCount: number;
  applicationCount: number;
  latestAnalysis: LatestAnalysisSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeDetail {
  id: string;
  name: string;
  originalFileName: string;
  fileType: string;
  fileSize: number;
  charCount: number;
  targetRole: string | null;
  hasStoredFile: boolean;
  textPreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type ResumeSort = "newest" | "oldest" | "name" | "role";

export async function listResumes(params: { q?: string; targetRole?: string; sort?: ResumeSort; page?: number; limit?: number } = {}) {
  const { data } = await api.get<{ resumes: ResumeListItem[] } & PageMeta>("/api/resumes", { params });
  return data;
}

export async function uploadResume(file: File, opts: { name?: string; targetRole?: string } = {}): Promise<ResumeDetail> {
  const form = new FormData();
  form.append("resume", file);
  if (opts.name) form.append("name", opts.name);
  if (opts.targetRole) form.append("targetRole", opts.targetRole);
  const { data } = await api.post<{ resume: ResumeDetail }>("/api/resumes", form, { headers: { "Content-Type": "multipart/form-data" } });
  return data.resume;
}

export async function getResume(id: string): Promise<{ resume: ResumeDetail; analyses: AnalysisHistoryItem[] }> {
  const { data } = await api.get<{ resume: ResumeDetail; analyses: AnalysisHistoryItem[] }>(`/api/resumes/${encodeURIComponent(id)}`);
  return data;
}

export async function updateResume(id: string, patch: { name?: string; targetRole?: string | null }): Promise<ResumeDetail> {
  const { data } = await api.patch<{ resume: ResumeDetail }>(`/api/resumes/${encodeURIComponent(id)}`, patch);
  return data.resume;
}

export async function deleteResume(id: string): Promise<void> {
  await api.delete(`/api/resumes/${encodeURIComponent(id)}`);
}

/** Download URL is only usable when the server retains originals; the request carries the bearer token via axios. */
export async function downloadResume(id: string, fileName: string): Promise<void> {
  const { data } = await api.get<Blob>(`/api/resumes/${encodeURIComponent(id)}/download`, { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
