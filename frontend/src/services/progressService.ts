/**
 * progressService.ts — Phase 10: analytics, career progress score, gamification
 * (points / levels / achievements / streaks / activity), goals, progress reports,
 * notifications. The browser's IANA timezone is sent so streak days are counted
 * in the user's own calendar; nothing score-related is ever sent to the server.
 */
import { api } from "./api";

export const browserTimeZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const tzParams = (extra: Record<string, unknown> = {}) => ({ tz: browserTimeZone(), ...extra });

export type AnalyticsRange = "7d" | "30d" | "90d" | "all";
export const ANALYTICS_RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "all", label: "All time" }];

export interface Comparison { previous: number | null; delta: number | null; direction: "better" | "worse" | "flat" | null }
export interface Kpi extends Comparison { label: string; current: number; definition: string }
export interface TrendPoint { date: string; score: number }
export interface ResumeAnalytics {
  qualityTrend: Array<TrendPoint & { name: string; kind: string; isOriginal: boolean; versionId: string }>;
  matchTrend: Array<TrendPoint & { jobTitle: string; companyName: string | null; targetRole: string; analysisId: string }>;
  quality: Comparison & { best: number | null; latest: number | null; versions: number; originalBaseline: number | null; editedInRange: number };
  match: Comparison & { analyses: number; analysesInRange: number; average: number | null; best: number | null; byRole: Array<{ role: string; analyses: number; average: number | null }> };
  uploads: number; definitions: Record<string, string>;
}
export interface InterviewAnalytics {
  trend: Array<TrendPoint & { type: string; role: string; sessionId: string; evaluatedAnswers: number }>;
  sessions: { total: number; completed: number; inRange: number; abandoned: number; inProgress: number };
  score: Comparison & { average: number | null; best: number | null };
  byType: Array<{ type: string; sessions: number; average: number | null }>;
  weakTopics: Array<{ topic: string; mean: number; attempts: number }>; strongTopics: Array<{ topic: string; mean: number; attempts: number }>; candidateTopics: Array<{ topic: string; mean: number }>;
  coding: { sessions: number; average: number | null } | null; definitions: Record<string, string>;
}
export interface SkillEntry {
  key: string; skillName: string; status: string; bucket: "demonstrated" | "needs_practice" | "not_assessed"; priority?: string; category?: string; recentImprovement: boolean; lastAssessedAt: string | null;
  sources: Array<{ source: string; method: string; date: string; detail: string }>; interview: { attempts: number; mean: number; best: number; improvement: number | null } | null;
  learning: { completedTasks: number; totalTasks: number; roadmapId: string | null }; history: Array<{ date: string; status: string; score: number | null; source: string; targetRole: string }>; notes: string[]; links: Array<{ label: string; href: string }>;
}
export interface SkillAnalytics { method: string; totals: { tracked: number; demonstrated: number; needsPractice: number; notAssessed: number; improving: number }; demonstrated: SkillEntry[]; needsPractice: SkillEntry[]; notAssessed: SkillEntry[]; improving: SkillEntry[]; assessmentHistory: Array<{ date: string; targetRole: string; demonstrated: number; total: number }>; definitions: Record<string, string>; generatedAt: string }
export interface ApplicationAnalytics {
  total: number; inRange: number; byStatus: Record<string, number>; active: number;
  funnel: Array<{ stage: string; key: string; count: number; definition: string }>;
  rates: { sampleSize: number; minSample: number; available: boolean; responseRate: number | null; interviewRate: number | null; offerRate: number | null; appliedToInterview: number | null; interviewToOffer: number | null; definitions: Record<string, string> };
  responseTime: { sampleSize: number; medianDays: number | null; meanDays: number | null; caveat: string };
  overTime: Array<{ weekStart: string; applications: number; submitted: number }>;
  submittedInRange: Comparison & { current: number };
  byRole: Array<{ key: string; total: number; submitted: number; interviews: number; offers: number }>; byCompany: Array<{ key: string; total: number; submitted: number; interviews: number; offers: number }>;
}
export interface LearningAnalytics { roadmaps: Array<{ id: string; title: string; targetRole: string; status: string; percent: number; completedTasks: number; requiredTasks: number; completedMilestones: number; totalMilestones: number; studiedMinutes: number }>; tasksCompleted: Comparison & { current: number }; studyMinutesInRange: number; checkpointsPassed: number }
export interface ActivityBucket { events: number; points: number; byCategory: Record<string, number> }
export interface OverviewAnalytics {
  method: string; range: AnalyticsRange; from: string | null; to: string; kpis: Kpi[];
  activity: { weekly: Array<ActivityBucket & { weekStart: string; weekEnd: string }>; monthly: Array<ActivityBucket & { month: string }> };
  resume: ResumeAnalytics; interviews: InterviewAnalytics; learning: LearningAnalytics; applications: ApplicationAnalytics;
  readiness: Array<{ id: string; date: string; targetRole: string; score: number | null; label: string }>; emptyState: string | null; generatedAt: string;
}
export interface ProgressDimension { key: string; label: string; weight: number; score: number | null; included: boolean; evidence: string[]; explanation: string; formula: string }
export interface ProgressScore { method: string; overallScore: number | null; label: string; dimensions: ProgressDimension[]; coverage: { included: number; total: number; weightUsed: number }; disclaimer: string }
export interface ProgressComparison { previousDayKey: string; overallDelta: number | null; dimensions: Array<{ key: string; delta: number | null }> }
export interface LevelInfo { level: number; name: string; totalPoints: number; levelMinPoints: number; nextLevel: { level: number; name: string; minPoints: number; pointsNeeded: number } | null; percentToNext: number; disclaimer: string }
export interface StreakInfo { currentStreak: number; longestStreak: number; totalLearningDays: number; lastActivityDay: string | null; activeToday: boolean }
export interface PointTransaction { id: string; eventKey: string; eventType: string; kind: "award" | "reversal"; cycle: number; points: number; title: string; occurredAt: string; createdAt: string }
export interface PointRule { eventType: string; points: number; label: string; category: string; dailyCap: number | null }
export interface GamificationProfile {
  totalPoints: number; level: LevelInfo; streak: StreakInfo; timezone: string; achievementsUnlocked: number; achievementsTotal: number; stats: Record<string, number>; recentTransactions: PointTransaction[];
  notificationPreferences: Record<string, boolean>; method: string; levels: Array<{ level: number; name: string; minPoints: number }>; levelStepAfterLast: number; disclaimer: string;
}
export interface Achievement { key: string; title: string; description: string; category: string; icon: string; target: number; progress: number; percent: number; unlocked: boolean; unlockedAt: string | null }
export interface StreakDetail extends StreakInfo { timezone: string; today: string; milestones: number[]; calendar: { start: string; end: string; cells: Array<{ day: string; count: number; active: boolean; future: boolean }> }; weekly: Array<{ weekStart: string; weekEnd: string; activeDays: number; events: number }>; rules: string }
export interface ActivityItem { id: string; eventKey: string; eventType: string; title: string; category: string; points: number; href: string | null; occurredAt: string }
export type GoalType = "mock_interviews" | "learning_tasks" | "roadmap_completion" | "resume_quality" | "skill_practice" | "applications" | "custom";
export interface GoalProgress { currentValue: number; percent: number; reached: boolean; evidence: string[]; nextAction: { title: string; href: string } | null; unit: string; measurable: boolean; overdue?: boolean | null }
export interface Goal { id: string; title: string; description: string | null; goalType: GoalType; linkKey: string | null; targetValue: number; currentValue: number; unit: string; targetDate: string | null; status: "active" | "paused" | "completed" | "archived"; completedAt: string | null; createdAt: string; updatedAt: string; progress: GoalProgress; typeLabel: string }
export interface GoalTypeInfo { key: GoalType; label: string; unit: string; measurable: boolean; percent?: boolean; absolute?: boolean }
export interface ReportNarrative { summary: string; highlights: string[]; priorities: string[]; source: "ai" | "deterministic"; note?: string }
export interface ProgressReport { id: string; periodType: "weekly" | "monthly"; periodStart: string; periodEnd: string; metrics: Record<string, any>; narrative: ReportNarrative | null; aiUsed: boolean; provider: string | null; model: string | null; method: string; createdAt: string; updatedAt: string }
export interface ReportSummary { id: string; periodType: "weekly" | "monthly"; periodStart: string; periodEnd: string; aiUsed: boolean; method: string; createdAt: string; updatedAt: string; summary: string | null }
export interface Notification { id: string; type: string; title: string; body: string; href: string | null; dedupeKey: string; readAt: string | null; createdAt: string }
export interface PageMeta { page: number; limit: number; total: number; totalPages: number }

export async function getOverview(range: AnalyticsRange): Promise<{ analytics: OverviewAnalytics; progress: ProgressScore; progressComparison: ProgressComparison | null; gamification: { totalPoints: number; level: LevelInfo; streak: StreakInfo } }> { const { data } = await api.get("/api/analytics/overview", { params: tzParams({ range }) }); return data; }
export async function getCareerProgress(): Promise<{ progress: ProgressScore; comparison: ProgressComparison | null; history: Array<{ dayKey: string; overallScore: number | null; dimensions: Array<{ key: string; score: number | null }> }>; weights: Record<string, number> }> { const { data } = await api.get("/api/analytics/career-progress", { params: tzParams() }); return data; }
export async function getSkillAnalytics(): Promise<SkillAnalytics> { const { data } = await api.get("/api/analytics/skills"); return data.skills; }
export async function getInterviewAnalytics(range: AnalyticsRange): Promise<InterviewAnalytics> { const { data } = await api.get("/api/analytics/interviews", { params: { range } }); return data.interviews; }
export async function getResumeAnalytics(range: AnalyticsRange): Promise<ResumeAnalytics> { const { data } = await api.get("/api/analytics/resume", { params: { range } }); return data.resume; }
export async function getApplicationAnalytics(range: AnalyticsRange): Promise<ApplicationAnalytics> { const { data } = await api.get("/api/analytics/applications", { params: tzParams({ range }) }); return data.applications; }

export async function getGamificationProfile(): Promise<{ profile: GamificationProfile; rules: PointRule[] }> { const { data } = await api.get("/api/gamification/profile", { params: tzParams() }); return data; }
export async function getPointsHistory(params: { page?: number; limit?: number; eventType?: string } = {}): Promise<{ transactions: PointTransaction[] } & PageMeta> { const { data } = await api.get("/api/gamification/points/history", { params: tzParams(params) }); return data; }
export async function getAchievements(): Promise<{ achievements: Achievement[]; unlocked: number; total: number }> { const { data } = await api.get("/api/gamification/achievements", { params: tzParams() }); return data; }
export async function getStreaks(): Promise<StreakDetail> { const { data } = await api.get("/api/gamification/streaks", { params: tzParams() }); return data.streaks; }
export async function getActivity(params: { page?: number; limit?: number; category?: string } = {}): Promise<{ activity: ActivityItem[] } & PageMeta> { const { data } = await api.get("/api/gamification/activity", { params: tzParams(params) }); return data; }

export async function listGoals(status?: Goal["status"]): Promise<{ goals: Goal[]; goalTypes: GoalTypeInfo[] }> { const { data } = await api.get("/api/goals", { params: tzParams(status ? { status } : {}) }); return data; }
export async function createGoal(input: { title: string; description?: string; goalType: GoalType; linkKey?: string; targetValue: number; targetDate?: string | null }): Promise<Goal> { const { data } = await api.post("/api/goals", input); return data.goal; }
export async function updateGoal(id: string, input: { title?: string; description?: string | null; targetValue?: number; targetDate?: string | null; status?: Goal["status"]; currentValue?: number }): Promise<Goal> { const { data } = await api.patch(`/api/goals/${encodeURIComponent(id)}`, input); return data.goal; }
export async function deleteGoal(id: string): Promise<void> { await api.delete(`/api/goals/${encodeURIComponent(id)}`); }

export async function generateReport(input: { periodType: "weekly" | "monthly"; offset?: number; force?: boolean }): Promise<{ report: ProgressReport; reused: boolean }> { const { data } = await api.post("/api/progress-reports/generate", { ...input, tz: browserTimeZone() }, { timeout: 330_000 }); return data; }
export async function listReports(params: { page?: number; limit?: number; periodType?: "weekly" | "monthly" } = {}): Promise<{ reports: ReportSummary[] } & PageMeta> { const { data } = await api.get("/api/progress-reports", { params }); return data; }
export async function getReport(id: string): Promise<ProgressReport> { const { data } = await api.get(`/api/progress-reports/${encodeURIComponent(id)}`); return data.report; }
export async function downloadReportPdf(id: string): Promise<Blob> { const { data } = await api.get(`/api/progress-reports/${encodeURIComponent(id)}/pdf`, { responseType: "blob" }); return data as Blob; }

export async function listNotifications(params: { page?: number; limit?: number; unread?: boolean } = {}): Promise<{ notifications: Notification[]; unread: number } & PageMeta> { const { data } = await api.get("/api/notifications", { params: tzParams(params) }); return data; }
export async function markNotificationRead(id: string): Promise<Notification> { const { data } = await api.patch(`/api/notifications/${encodeURIComponent(id)}/read`); return data.notification; }
export async function markAllNotificationsRead(): Promise<number> { const { data } = await api.post("/api/notifications/read-all"); return data.updated; }
export async function getNotificationPreferences(): Promise<Record<string, boolean>> { const { data } = await api.get("/api/notifications/preferences"); return data.preferences; }
export async function updateNotificationPreferences(prefs: Record<string, boolean>): Promise<Record<string, boolean>> { const { data } = await api.patch("/api/notifications/preferences", prefs); return data.preferences; }

export const CATEGORY_LABELS: Record<string, string> = { learning: "Learning", interview: "Interviews", resume: "Resume", application: "Applications", career: "Career", gamification: "Milestones" };
export const NOTIFICATION_PREF_LABELS: Record<string, string> = { achievements: "Achievement unlocked", levels: "Level reached", milestones: "Learning milestone completed", assessments: "Career assessment completed", reports: "Progress report generated", goals: "Personal goal completed", streaks: "Learning streak milestones" };
