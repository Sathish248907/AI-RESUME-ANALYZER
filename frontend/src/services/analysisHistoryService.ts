/**
 * analysisHistoryService.ts — list/filter the signed-in user's AI analyses (Phase 5).
 * Single-record calls (get, delete, regenerate) live in resumeAnalysisService.ts.
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

export interface AnalysisHistoryItem {
  id: string;
  jobTitle: string;
  targetRole: string;
  companyName: string | null;
  fileName: string | null;
  resumeId: string | null;
  resumeName: string | null;
  jobDescriptionId: string | null;
  analysisMode: "ai" | "demo";
  matchScore: number;
  scoreAvailable: boolean;
  provider: string | null;
  model: string | null;
  skillCounts: { matched: number; partial: number; missing: number };
  createdAt: string;
  updatedAt: string;
}

export type AnalysisSort = "newest" | "oldest" | "score_desc" | "score_asc";

export interface AnalysisHistoryFilters {
  targetRole?: string;
  resumeId?: string;
  jobDescriptionId?: string;
  mode?: "ai" | "demo";
  from?: string;
  to?: string;
  sort?: AnalysisSort;
  page?: number;
  limit?: number;
}

export async function listAnalysisHistory(filters: AnalysisHistoryFilters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const { data } = await api.get<{ analyses: AnalysisHistoryItem[] } & PageMeta>("/api/analysis", { params });
  return data;
}
