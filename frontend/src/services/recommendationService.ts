/**
 * recommendationService.ts — Phase 16: the one cross-feature "what next" list.
 *
 * Before this, three different surfaces told a user what to do next and none of
 * them agreed. This client talks to the single engine; the career page's own
 * `/api/career/recommendations` still exists and returns the same rows, so
 * nothing that already worked was moved.
 */
import { api } from "./api";

export const RECOMMENDATION_TYPES = [
  "profile",
  "resume",
  "skill",
  "learning",
  "interview",
  "application",
  "project",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export type RecommendationPriority = "high" | "medium" | "low";
export type RecommendationStatus = "open" | "done" | "dismissed";

export interface Recommendation {
  id: string;
  key: string;
  type: RecommendationType;
  title: string;
  /** What to actually do. */
  explanation: string;
  /** Why this is being shown — always derived from the user's own records. */
  reason: string;
  evidence: string[];
  priority: RecommendationPriority;
  effortMinutes: number | null;
  href: string;
  status: RecommendationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationFeed {
  method: string;
  targetRole: string | null;
  recommendations: Recommendation[];
  groups: Array<{ type: RecommendationType; items: Recommendation[] }>;
  counts: { open: number; high: number; resolvedThisRun: number };
  basis: string;
  note: string;
}

/** Reads the stored list; recomputes only when there is nothing to show. */
export async function listRecommendations(params: { limit?: number } = {}): Promise<RecommendationFeed> {
  const { data } = await api.get("/api/recommendations", { params });
  return data;
}

/**
 * Recomputes from the user's current records. Worth calling after something
 * that changes the advice — a resume edit, a completed interview — and not on
 * every page load, because it walks the whole career snapshot.
 */
export async function refreshRecommendations(params: { limit?: number } = {}): Promise<RecommendationFeed> {
  const { data } = await api.get("/api/recommendations", { params: { ...params, refresh: true } });
  return data;
}

export async function updateRecommendation(id: string, status: RecommendationStatus): Promise<Recommendation> {
  const { data } = await api.patch(`/api/recommendations/${encodeURIComponent(id)}`, { status });
  return data.recommendation;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export const TYPE_LABELS: Record<RecommendationType, string> = {
  profile: "Profile",
  resume: "Resume",
  skill: "Skills",
  learning: "Learning",
  interview: "Interviews",
  application: "Applications",
  project: "Projects",
};

export const PRIORITY_TONE: Record<RecommendationPriority, string> = {
  high: "bg-red-50 text-red-800 border-red-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
};

/** "40 min" / "4 h" — an honest estimate, not a promise. */
export function formatEffort(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
}
