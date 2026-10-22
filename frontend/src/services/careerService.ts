/**
 * careerService.ts — Phase 9 career coach: profile, readiness assessments,
 * recommendations, job priorities, interview prep, weekly plan, dashboard, chat.
 */
import { api } from "./api";

const AI_TIMEOUT_MS = 330_000;

export const CAREER_LEVELS = ["student", "fresher", "junior", "mid", "experienced"] as const;
export type CareerLevel = (typeof CAREER_LEVELS)[number];
export const CAREER_LEVEL_LABELS: Record<CareerLevel, string> = { student: "Student", fresher: "Fresher", junior: "Junior", mid: "Mid-level", experienced: "Experienced" };
export const WORK_MODES = ["remote", "hybrid", "onsite", "any"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export interface CareerProfile { id: string; careerLevel: CareerLevel; targetRoles: string[]; industries: string[]; skills: string[]; locations: string[]; workMode: WorkMode; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null; goals: string | null; learningInterests: string[]; createdAt: string; updatedAt: string }
export type ProfileInput = Omit<CareerProfile, "id" | "createdAt" | "updatedAt">;

export interface ReadinessComponent { key: string; label: string; weight: number; score: number | null; evidence: string[]; missing: string[]; included: boolean }
export interface ReadinessSkill { skillName: string; priority: string; requiredBy: string[]; status: string; score: number | null; evidence: string[] }
export interface Assessment {
  id: string; method: string; targetRole: string; overallScore: number | null; readinessLabel: string; coverage?: { componentsIncluded: number; componentsTotal: number; weightUsed: number };
  components: ReadinessComponent[]; skills: ReadinessSkill[]; strengths: string[]; improvements: string[]; missingEvidence: string[]; nextActions: Array<{ title: string; href: string; reason: string }>;
  sources: Record<string, number>; disclaimer?: string; createdAt: string;
}
export interface AssessmentSummary { id: string; targetRole: string; overallScore: number; readinessLabel: string; method: string; createdAt: string; components: ReadinessComponent[] }

export interface Recommendation { id: string; key: string; type: string; title: string; explanation: string; reason: string; evidence: string[]; priority: "high" | "medium" | "low"; effortMinutes: number | null; href: string; status: "open" | "done" | "dismissed"; completedAt: string | null; updatedAt: string }

export interface JobPriorityItem {
  jobDescriptionId: string | null; applicationId: string | null; jobTitle: string; companyName: string | null; targetRole: string | null; status: string | null; nextFollowUpDate: string | null; matchScore: number | null; analysisId: string | null;
  demonstratedSkills: string[]; skillsNeedingEvidence: string[]; experienceAlignment: string | null; educationAlignment: string | null; recommendedVersion: { id: string; name: string; tailored: boolean } | null;
  interviewPrep: { suggestedType: string; topics: string[]; href: string }; priorityScore: number | null; closed: boolean; factors: Array<{ key: string; label: string; weight: number; score: number | null; evidence: string }>; confidence: number;
}
export interface JobPriorities { method: string; weights: Record<string, number>; items: JobPriorityItem[]; closedCount: number; hasProfile: boolean; disclaimer: string }

export interface PlanTask { id: string; planId: string; title: string; description: string | null; category: "learning" | "interview" | "resume" | "application" | "personal"; href: string | null; estimatedMinutes: number; dueDate: string | null; isOptional: boolean; sourceKey: string | null; status: "pending" | "done" | "skipped"; completedAt: string | null; notes: string | null }
export interface PlanProgress { total: number; required: number; done: number; doneRequired: number; skipped: number; overdue: number; percent: number; minutesDone: number }
export interface ActionPlan { id: string; weekStart: string; weekEnd: string; status: string; targetRole: string | null; summary: { totalMinutes: number; requiredMinutes: number; budgetMinutes: number; byCategory: Record<string, number> }; tasks: PlanTask[]; progress: PlanProgress }

export interface InterviewPrep {
  targetRole: string; sessionsCompleted: number; weakTopics: Array<{ topic: string; mean: number; attempts: number }>; candidateTopics: Array<{ topic: string; mean: number }>; strongTopics: Array<{ topic: string; mean: number }>;
  recurringGaps: Array<{ concept: string; count: number }>; untestedRequirements: string[]; recommendedSessions: Array<{ key: string; title: string; interviewType: string; difficulty: string; topics: string[]; reason: string; href: string }>;
  practicePlan: Array<{ step: number; kind: string; title: string; detail: string; href: string; minutes: number }>; codingTasks: Array<{ taskId: string; title: string; skillName: string; taskType: string; milestone: string; href: string }>;
  trend: Array<{ sessionId: string; date: string; score: number; type: string; role: string }>; followUps: Array<{ sessionId: string | null; topic: string | null; score: number | null; status: string }>;
}

export interface CareerDashboard {
  readiness: { latest: { id: string; targetRole: string; overallScore: number | null; readinessLabel: string; createdAt: string } | null; trend: Array<{ date: string; score: number; targetRole: string }> };
  strengths: string[]; priorityGaps: Array<{ skillName: string; status: string; priorityScore: number }>;
  resume: { versions: number; bestQuality: number | null; uploads: number }; jobMatch: { analyses: number; average: number | null; best: { id: string; jobTitle: string; companyName: string | null; matchScore: number } | null };
  interviews: { completed: number; trend: Array<{ date: string; score: number; type: string }>; weakTopics: string[] };
  learning: { roadmapId: string; title: string; targetRole: string; percent: number; completedTasks: number; requiredTasks: number; nextTask: string | null } | null;
  applications: { total: number; active: number; byStatus: Record<string, number>; interviews: number; upcoming: Array<{ id: string; companyName: string; jobTitle: string; status: string; nextFollowUpDate: string; overdue: boolean }> };
  achievements: Array<{ kind: string; title: string; date: string }>; nextAction: { title: string; href: string; reason: string; priority: string } | null; openRecommendations: number;
  plan: ({ id: string; weekStart: string; weekEnd: string; tasksDueToday: number } & PlanProgress) | null; hasProfile: boolean; generatedAt: string;
}

export interface CoachMessage { id: string; role: "user" | "assistant"; content: string; factsUsed: string[] | null; suggestions: string[] | null; links: Array<{ label: string; path: string }> | null; clarifying: boolean; createdAt: string; clarifyingQuestion?: string | null }
export interface Conversation { id: string; title: string; messageCount?: number; createdAt: string; updatedAt: string; messages?: CoachMessage[] }

export async function getProfile(): Promise<CareerProfile | null> { const { data } = await api.get("/api/career/profile"); return data.profile; }
export async function saveProfile(input: ProfileInput): Promise<CareerProfile> { const { data } = await api.put("/api/career/profile", input); return data.profile; }
export async function createAssessment(targetRole?: string): Promise<{ assessment: Assessment; recommendations: Recommendation[] }> { const { data } = await api.post("/api/career/assessments", targetRole ? { targetRole } : {}); return data; }
export async function listAssessments(targetRole?: string): Promise<AssessmentSummary[]> { const { data } = await api.get("/api/career/assessments", { params: targetRole ? { targetRole } : {} }); return data.assessments; }
export async function getAssessment(id: string): Promise<Assessment> { const { data } = await api.get(`/api/career/assessments/${encodeURIComponent(id)}`); return data.assessment; }
export async function getRecommendations(params: { status?: Recommendation["status"]; refresh?: boolean } = {}): Promise<Recommendation[]> { const { data } = await api.get("/api/career/recommendations", { params }); return data.recommendations; }
export async function updateRecommendation(id: string, status: Recommendation["status"]): Promise<Recommendation> { const { data } = await api.patch(`/api/career/recommendations/${encodeURIComponent(id)}`, { status }); return data.recommendation; }
export async function getCareerDashboard(targetRole?: string): Promise<{ dashboard: CareerDashboard; targetRole: string | null }> { const { data } = await api.get("/api/career/dashboard", { params: targetRole ? { targetRole } : {} }); return data; }
export async function getJobPriorities(params: { wMatch?: number; wSkills?: number; wRelevance?: number; wPreference?: number; wUrgency?: number; includeClosed?: boolean } = {}): Promise<JobPriorities> { const { data } = await api.get("/api/career/job-priorities", { params }); return data; }
export async function getInterviewPrep(targetRole?: string): Promise<InterviewPrep> { const { data } = await api.get("/api/career/interview-prep", { params: targetRole ? { targetRole } : {} }); return data.prep; }
export async function generatePlan(weeklyMinutes?: number): Promise<{ plan: ActionPlan; regenerated: boolean }> { const { data } = await api.post("/api/career/action-plans/generate", weeklyMinutes ? { weeklyMinutes } : {}); return data; }
export async function getCurrentPlan(): Promise<{ plan: ActionPlan | null; history: Array<{ id: string; weekStart: string; weekEnd: string; status: string; progress: PlanProgress }> }> { const { data } = await api.get("/api/career/action-plans/current"); return data; }
export async function updatePlanTask(id: string, input: { status?: PlanTask["status"]; dueDate?: string | null; notes?: string | null; title?: string; estimatedMinutes?: number }): Promise<{ task: PlanTask; progress: PlanProgress | null }> { const { data } = await api.patch(`/api/career/action-tasks/${encodeURIComponent(id)}`, input); return data; }
export async function addPlanTask(input: { title: string; description?: string; category?: PlanTask["category"]; estimatedMinutes?: number; dueDate?: string | null; isOptional?: boolean }): Promise<PlanTask> { const { data } = await api.post("/api/career/action-tasks", input); return data.task; }
export async function deletePlanTask(id: string): Promise<void> { await api.delete(`/api/career/action-tasks/${encodeURIComponent(id)}`); }
export async function listConversations(): Promise<Conversation[]> { const { data } = await api.get("/api/career/coach/conversations"); return data.conversations; }
export async function getConversation(id: string): Promise<Conversation & { messages: CoachMessage[] }> { const { data } = await api.get(`/api/career/coach/conversations/${encodeURIComponent(id)}`); return data.conversation; }
export async function startConversation(message?: string): Promise<{ conversationId: string; userMessage?: CoachMessage; reply?: CoachMessage; conversation?: Conversation }> {
  const { data } = await api.post("/api/career/coach/conversations", message ? { message } : {}, { timeout: AI_TIMEOUT_MS });
  return data.conversation ? { conversationId: data.conversation.id, conversation: data.conversation } : data;
}
export async function sendMessage(conversationId: string, content: string): Promise<{ userMessage: CoachMessage; reply: CoachMessage }> { const { data } = await api.post(`/api/career/coach/conversations/${encodeURIComponent(conversationId)}/messages`, { content }, { timeout: AI_TIMEOUT_MS }); return data; }
export async function renameConversation(id: string, title: string): Promise<void> { await api.patch(`/api/career/coach/conversations/${encodeURIComponent(id)}`, { title }); }
export async function deleteConversation(id: string): Promise<void> { await api.delete(`/api/career/coach/conversations/${encodeURIComponent(id)}`); }
