/**
 * learningTaskService.ts — task lifecycle, checkpoints and resources (Phase 7).
 */
import { api } from "./api";
import type { LearningResource, LearningTask, RoadmapProgress, TaskStatus } from "./learningRoadmapService";

export interface TaskUpdateInput {
  status?: Exclude<TaskStatus, "completed">;
  notes?: string | null;
  scheduledDate?: string | null;
  actualStudyMinutes?: number;
  addStudyMinutes?: number;
}

export interface TaskCompleteInput {
  notes?: string | null;
  actualStudyMinutes?: number;
  checkpointNotes?: string;
  projectLink?: string;
  checkedItems?: number[];
}

export interface CheckpointSubmitInput {
  answers?: Record<string, number>;
  notes?: string;
  projectLink?: string;
  checkedItems?: number[];
}

export interface CheckpointResult {
  attempt: { at: string; type: string; passed: boolean; verified: boolean; score?: number; correct?: number; total?: number };
  results?: Array<{ questionId: string; chosen: number | null; correctIndex: number; correct: boolean; explanation: string }>;
  passed: boolean;
  verified?: boolean;
  score?: number;
  note?: string;
  task: LearningTask;
  progress: RoadmapProgress;
}

export async function listTasks(roadmapId: string, params: { status?: TaskStatus; milestoneId?: string } = {}): Promise<LearningTask[]> {
  const { data } = await api.get<{ tasks: LearningTask[] }>(`/api/learning/roadmaps/${encodeURIComponent(roadmapId)}/tasks`, { params });
  return data.tasks;
}

export async function updateTask(taskId: string, input: TaskUpdateInput): Promise<LearningTask> {
  const { data } = await api.patch<{ task: LearningTask }>(`/api/learning/tasks/${encodeURIComponent(taskId)}`, input);
  return data.task;
}

export async function startTask(taskId: string): Promise<LearningTask> {
  return updateTask(taskId, { status: "in_progress" });
}

export async function completeTask(taskId: string, input: TaskCompleteInput = {}): Promise<{ task: LearningTask; progress: RoadmapProgress; milestoneStatus: { status: string } | null }> {
  const { data } = await api.post(`/api/learning/tasks/${encodeURIComponent(taskId)}/complete`, input);
  return data;
}

export async function reopenTask(taskId: string): Promise<{ task: LearningTask; progress: RoadmapProgress }> {
  const { data } = await api.post(`/api/learning/tasks/${encodeURIComponent(taskId)}/reopen`);
  return data;
}

export async function getTaskResources(taskId: string): Promise<LearningResource[]> {
  const { data } = await api.get<{ resources: LearningResource[] }>(`/api/learning/tasks/${encodeURIComponent(taskId)}/resources`);
  return data.resources;
}

export async function submitCheckpoint(taskId: string, checkpointId: string, input: CheckpointSubmitInput): Promise<CheckpointResult> {
  const { data } = await api.post(`/api/learning/tasks/${encodeURIComponent(taskId)}/checkpoints/${encodeURIComponent(checkpointId)}/submit`, input);
  return data;
}
