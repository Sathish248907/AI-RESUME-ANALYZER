/**
 * learningRoadmapService.ts — Phase 7 personalised learning roadmaps.
 * Generation and regeneration call the AI provider through the backend and can
 * take several minutes, so they use the long AI timeout.
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

const AI_TIMEOUT_MS = 330_000;

export const OBJECTIVES = ["job_readiness", "interview_prep", "project_development", "skill_improvement"] as const;
export type Objective = (typeof OBJECTIVES)[number];
export const OBJECTIVE_LABELS: Record<Objective, string> = {
  job_readiness: "Job readiness",
  interview_prep: "Interview preparation",
  project_development: "Project development",
  skill_improvement: "General skill improvement",
};
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const SCHEDULES = ["weekdays", "weekends", "flexible"] as const;
export type Schedule = (typeof SCHEDULES)[number];
export const FORMATS = ["documentation", "tutorials", "exercises", "projects", "mixed"] as const;
export type LearningFormat = (typeof FORMATS)[number];

export type RoadmapStatus = "active" | "archived" | "superseded";
export type MilestoneStatus = "locked" | "not_started" | "in_progress" | "completed";
export type TaskStatus = "not_started" | "in_progress" | "paused" | "completed" | "skipped";
export type TaskType = "learn_concept" | "read_docs" | "tutorial" | "coding_exercise" | "mini_project" | "review_interview_questions" | "explain_concept" | "knowledge_checkpoint";
export type CheckpointType = "mcq" | "conceptual" | "coding" | "project" | "checklist";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  learn_concept: "Learn concept",
  read_docs: "Read documentation",
  tutorial: "Tutorial",
  coding_exercise: "Coding exercise",
  mini_project: "Mini project",
  review_interview_questions: "Interview questions",
  explain_concept: "Explain the concept",
  knowledge_checkpoint: "Knowledge checkpoint",
};

export interface LearningResource {
  id: string | null;
  title: string;
  resourceType: string;
  url: string | null;
  urlVerified: boolean;
  provider: "official" | "third_party" | "search";
  description: string;
  difficulty: string;
}

export interface CheckpointQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
}

export interface Checkpoint {
  id: string;
  type: CheckpointType;
  title: string;
  instructions: string;
  passScore: number;
  questions?: CheckpointQuestion[];
  items?: string[];
}

export interface CheckpointAttempt {
  at: string;
  type: CheckpointType;
  passed: boolean;
  verified: boolean;
  score?: number;
  correct?: number;
  total?: number;
  manual?: boolean;
  notes?: string | null;
  projectLink?: string | null;
  checkedItems?: number[];
}

export interface LearningTask {
  id: string;
  milestoneId: string;
  sequenceNumber: number;
  title: string;
  description: string;
  skillName: string;
  taskType: TaskType;
  difficulty: string;
  estimatedMinutes: number;
  isRequired: boolean;
  scheduledDate: string | null;
  completionCriteria: string;
  status: TaskStatus;
  locked: boolean;
  notes: string | null;
  actualStudyMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  checkpoint: Checkpoint | null;
  checkpointAttempts: CheckpointAttempt[];
  resources: LearningResource[];
  updatedAt: string;
  milestone?: { id: string; title: string; sequenceNumber: number };
}

export interface MilestoneProgress {
  totalTasks: number;
  requiredTasks: number;
  completedRequired: number;
  completedOptional: number;
  inProgress: number;
  skipped: number;
  percent: number;
  remainingMinutes: number;
  criteriaSatisfied: boolean;
}

export interface RoadmapMilestone {
  id: string;
  sequenceNumber: number;
  title: string;
  description: string;
  requiredSkills: string[];
  learningObjectives: string[];
  estimatedHours: number;
  prerequisiteSequences: number[];
  completionCriteria: string;
  status: MilestoneStatus;
  unmetPrerequisites: number[];
  completedAt: string | null;
  progress?: MilestoneProgress;
  tasks: LearningTask[];
}

export interface RoadmapProgress {
  method: string;
  totalMilestones: number;
  completedMilestones: number;
  lockedMilestones: number;
  totalTasks: number;
  requiredTasks: number;
  completedTasks: number;
  completedOptionalTasks: number;
  remainingTasks: number;
  inProgressTasks: number;
  skippedTasks: number;
  percent: number;
  studiedMinutes: number;
  remainingMinutes: number;
  remainingWeeksEstimate: number;
  milestones: Array<{ id: string; sequenceNumber: number; status: MilestoneStatus; unmetPrerequisites: number[]; progress: MilestoneProgress }>;
}

export interface ChangeSummary {
  milestonesBefore: number;
  milestonesAfter: number;
  tasksBefore: number;
  tasksAfter: number;
  completedCarriedOver: number;
  completedNotCarried: number;
  addedSkills: string[];
  removedSkills: string[];
  reason: string | null;
  previousVersion: number;
  generatedAt: string;
}

export interface LearningRoadmap {
  id: string;
  title: string;
  targetRole: string;
  objective: Objective;
  currentSkillLevel: SkillLevel;
  weeklyStudyHours: number;
  preferredSchedule: Schedule;
  preferredFormat: LearningFormat;
  targetCompletionDate: string | null;
  estimatedHours: number;
  estimatedWeeks: number;
  status: RoadmapStatus;
  version: number;
  previousVersionId: string | null;
  changeSummary: ChangeSummary | null;
  skillGapSummary: { summary: string; overview: string; notes: string[] } | null;
  sources: { resumeId: string | null; jobDescriptionId: string | null; analysisId: string | null; interviewSessionIds: string[] | null };
  provider: string | null;
  model: string | null;
  schemaVersion: string;
  createdAt: string;
  updatedAt: string;
  progress: RoadmapProgress;
  milestones: RoadmapMilestone[];
}

export interface RoadmapListItem {
  id: string;
  title: string;
  targetRole: string;
  objective: Objective;
  currentSkillLevel: SkillLevel;
  status: RoadmapStatus;
  version: number;
  estimatedHours: number;
  estimatedWeeks: number;
  weeklyStudyHours: number;
  createdAt: string;
  updatedAt: string;
  progress: RoadmapProgress;
}

export interface EvidenceSource { type: "job_description" | "resume_analysis" | "resume" | "mock_interviews"; id: string | null; label: string }

export interface SkillGapEntry {
  skillName: string;
  category: string;
  proficiencyStatus: ProficiencyStatus;
  priority: "high" | "medium" | "low";
  priorityScore: number;
  priorityReasons: string[];
  evidenceSources: string[];
  explanation: string;
  whyItMatters: string;
  targetProficiency: string;
  relatedTopics: string[];
  foundationFor: string[];
  dependsOn: string | null;
}
export type ProficiencyStatus = "demonstrated" | "needs_improvement" | "not_demonstrated" | "not_assessed" | "learning_in_progress";
export interface SkillGapAnalysis { targetRole: string; skills: SkillGapEntry[]; summary: Record<string, number>; method: string }

export interface CreateRoadmapInput {
  targetRole: string;
  currentSkillLevel: SkillLevel;
  weeklyStudyHours: number;
  preferredSchedule: Schedule;
  objective: Objective;
  preferredFormat: LearningFormat;
  targetCompletionDate?: string | null;
  resumeId?: string;
  jobDescriptionId?: string;
  analysisId?: string;
  interviewSessionIds?: string[];
  useInterviewHistory?: boolean;
  goalSkills?: string[];
  confirmedSkills?: string[];
}

export interface PlanEntry { taskId: string; title: string; skillName: string; taskType: TaskType; estimatedMinutes: number; status: TaskStatus; milestoneId: string; milestoneTitle: string; isRequired: boolean; suggested?: boolean; reason?: string }
export interface WeeklyPlan {
  weeklyTargetMinutes: number;
  schedule: Schedule;
  sessions: Array<{ date: string; weekday: string; studyDay: boolean; targetMinutes: number; tasks: PlanEntry[]; plannedMinutes: number }>;
  completedThisWeek: number;
  completedMinutesThisWeek: number;
  weeklyCompletionPercent: number;
  plannedMinutes?: number;
  unscheduledCount?: number;
}

export async function createRoadmap(input: CreateRoadmapInput): Promise<{ roadmap: LearningRoadmap; sources: EvidenceSource[]; skillGaps: SkillGapAnalysis }> {
  const { data } = await api.post("/api/learning/roadmaps", input, { timeout: AI_TIMEOUT_MS });
  return data;
}

export async function listRoadmaps(params: { status?: RoadmapStatus; page?: number; limit?: number } = {}): Promise<{ roadmaps: RoadmapListItem[] } & PageMeta> {
  const { data } = await api.get("/api/learning/roadmaps", { params });
  return data;
}

export async function getRoadmap(id: string): Promise<LearningRoadmap> {
  const { data } = await api.get<{ roadmap: LearningRoadmap }>(`/api/learning/roadmaps/${encodeURIComponent(id)}`);
  return data.roadmap;
}

export async function updateRoadmap(id: string, input: { title?: string; weeklyStudyHours?: number; preferredSchedule?: Schedule; preferredFormat?: LearningFormat; targetCompletionDate?: string | null; status?: "active" | "archived" }): Promise<LearningRoadmap> {
  const { data } = await api.patch<{ roadmap: LearningRoadmap }>(`/api/learning/roadmaps/${encodeURIComponent(id)}`, input);
  return data.roadmap;
}

export async function deleteRoadmap(id: string): Promise<void> {
  await api.delete(`/api/learning/roadmaps/${encodeURIComponent(id)}`);
}

export interface RegenerateInput { apply?: boolean; targetRole?: string; currentSkillLevel?: SkillLevel; objective?: Objective; weeklyStudyHours?: number; preferredFormat?: LearningFormat; jobDescriptionId?: string; resumeId?: string; analysisId?: string; goalSkills?: string[]; confirmedSkills?: string[]; reason?: string }
export interface RegeneratePreview {
  preview: true;
  changes: ChangeSummary;
  roadmap: { title: string; summary: string; estimatedHours: number; estimatedWeeks: number; milestones: Array<{ sequenceNumber: number; title: string; requiredSkills: string[]; estimatedHours: number; tasks: Array<{ title: string; skillName: string; taskType: TaskType; estimatedMinutes: number; status: TaskStatus }> }> };
  skillGaps: SkillGapAnalysis;
  sources: EvidenceSource[];
}
export async function previewRegeneration(id: string, input: Omit<RegenerateInput, "apply"> = {}): Promise<RegeneratePreview> {
  const { data } = await api.post(`/api/learning/roadmaps/${encodeURIComponent(id)}/regenerate`, { ...input, apply: false }, { timeout: AI_TIMEOUT_MS });
  return data;
}
export async function applyRegeneration(id: string, input: Omit<RegenerateInput, "apply"> = {}): Promise<{ roadmap: LearningRoadmap; changes: ChangeSummary; sources: EvidenceSource[] }> {
  const { data } = await api.post(`/api/learning/roadmaps/${encodeURIComponent(id)}/regenerate`, { ...input, apply: true }, { timeout: AI_TIMEOUT_MS });
  return data;
}

export async function getRoadmapProgress(id: string, availableMinutes?: number): Promise<{ progress: RoadmapProgress; weeklyPlan: WeeklyPlan; nextAction: PlanEntry | null }> {
  const { data } = await api.get(`/api/learning/roadmaps/${encodeURIComponent(id)}/progress`, { params: availableMinutes ? { availableMinutes } : {} });
  return data;
}

/** The user's current active roadmap, or null when none exists. */
export async function getActiveRoadmap(): Promise<LearningRoadmap | null> {
  const list = await listRoadmaps({ status: "active", limit: 1 });
  if (!list.roadmaps.length) return null;
  return getRoadmap(list.roadmaps[0].id);
}
