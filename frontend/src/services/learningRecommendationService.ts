/**
 * learningRecommendationService.ts — "what to study next" and skill-gap tracking (Phase 7).
 */
import { api } from "./api";
import type { PlanEntry, ProficiencyStatus } from "./learningRoadmapService";

export type RecommendationType = "continue" | "review" | "study" | "build" | "setup";

export interface LearningRecommendation {
  key: string;
  type: RecommendationType;
  title: string;
  reason: string;
  skillName: string | null;
  taskId: string | null;
  milestoneId: string | null;
  priority: "high" | "medium" | "low";
  action?: "create" | "regenerate";
}

export interface SkillGap {
  id: string;
  roadmapId: string | null;
  skillName: string;
  category: string;
  proficiencyStatus: ProficiencyStatus;
  priority: "high" | "medium" | "low";
  priorityScore: number;
  evidenceSources: string[];
  explanation: string;
  whyItMatters: string;
  targetProficiency: string;
  relatedTopics: string[] | null;
  userConfirmed: boolean;
  userNote: string | null;
  lastAssessedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillGapSummary { total: number; demonstrated: number; needsImprovement: number; notDemonstrated: number; notAssessed: number; learningInProgress: number; highPriority: number }

export const PROFICIENCY_META: Record<ProficiencyStatus, { label: string; cls: string; help: string }> = {
  demonstrated: { label: "Demonstrated", cls: "bg-green-50 text-green-800 border-green-200", help: "Evidence found in your resume analysis, interviews or your own confirmation." },
  needs_improvement: { label: "Needs improvement", cls: "bg-amber-50 text-amber-800 border-amber-200", help: "Partial evidence, or low mock-interview scores on this topic." },
  not_demonstrated: { label: "Not demonstrated", cls: "bg-red-50 text-red-800 border-red-200", help: "Required or preferred by the job, but no evidence in your records yet." },
  not_assessed: { label: "Not assessed", cls: "bg-gray-100 text-gray-700 border-gray-200", help: "No evidence either way — included as a baseline for the role." },
  learning_in_progress: { label: "Learning in progress", cls: "bg-blue-50 text-blue-800 border-blue-200", help: "You have an active roadmap task on this skill." },
};

export const EVIDENCE_LABELS: Record<string, string> = {
  job_description: "Job description",
  role_baseline: "Role baseline",
  resume_analysis: "Resume analysis",
  mock_interview: "Mock interviews",
  user_confirmed: "You confirmed",
  user_goal: "Your goal",
};

export async function getLearningRecommendations(availableMinutes?: number): Promise<{ recommendations: LearningRecommendation[]; nextAction: PlanEntry | null; roadmapId: string | null }> {
  const { data } = await api.get("/api/learning/recommendations", { params: availableMinutes ? { availableMinutes } : {} });
  return data;
}

export async function dismissRecommendation(key: string): Promise<void> {
  await api.post(`/api/learning/recommendations/${encodeURIComponent(key)}/dismiss`);
}

export async function getSkillGaps(): Promise<{ skillGaps: SkillGap[]; summary: SkillGapSummary; method: string }> {
  const { data } = await api.get("/api/learning/skill-gaps");
  return data;
}

export async function updateSkillGap(id: string, input: { proficiencyStatus?: ProficiencyStatus; userConfirmed?: boolean; userNote?: string | null }): Promise<SkillGap> {
  const { data } = await api.patch<{ skillGap: SkillGap }>(`/api/learning/skill-gaps/${encodeURIComponent(id)}`, input);
  return data.skillGap;
}
