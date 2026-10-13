/**
 * analysisStorage.ts
 * Persists demo analysis metadata to localStorage.
 * Full resume text is never stored here — only analysis results and metadata.
 */

import type { MockAnalysisResult } from "./mockAnalysisService";

const STORAGE_KEY = "resumeai_demo_analyses";
const MAX_STORED = 20; // cap to avoid unbounded growth

export interface StoredAnalysisMeta {
  id: string;
  isDemoData: true;
  createdAt: string;
  jobTitle: string;
  targetRole: string;
  fileName: string;
  matchScore: number;
}

export function saveAnalysis(result: MockAnalysisResult): void {
  try {
    const existing = loadAllAnalyses();
    // Remove old entry with same id if re-saving
    const filtered = existing.filter((a) => a.id !== result.id);
    const updated = [result, ...filtered].slice(0, MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage may be unavailable (SSR, privacy mode, full quota)
  }
}

export function loadAnalysisById(id: string): MockAnalysisResult | null {
  try {
    const all = loadAllAnalyses();
    return all.find((a) => a.id === id) ?? null;
  } catch {
    return null;
  }
}

export function loadAllAnalyses(): MockAnalysisResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MockAnalysisResult[];
  } catch {
    return [];
  }
}

export function deleteAnalysis(id: string): void {
  try {
    const updated = loadAllAnalyses().filter((a) => a.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function clearAllAnalyses(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getAnalysisMetas(): StoredAnalysisMeta[] {
  return loadAllAnalyses().map(
    ({ id, isDemoData, createdAt, jobTitle, targetRole, fileName, matchScore }) => ({
      id,
      isDemoData,
      createdAt,
      jobTitle,
      targetRole,
      fileName,
      matchScore,
    })
  );
}
