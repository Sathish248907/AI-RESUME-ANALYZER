/**
 * applicationWorkspaceService.ts — Phase 13: the per-application workspace,
 * checklist, cover letters, documents, activity, reminders, interview rounds
 * and the readiness review.
 *
 * Status changes are *not* here: they go through `updateApplication` in
 * `jobApplicationService`, which is the one place an application's status is
 * written. This module only reads the consequences.
 */
import { api } from "./api";

/** Cover-letter drafting goes through the model, so it uses the long budget. */
const AI_TIMEOUT_MS = 330_000;
import type { ApplicationStatus } from "./jobApplicationService";

export const CHECKLIST_CATEGORIES = ["research", "resume", "cover_letter", "documents", "interview", "submission"] as const;
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];
export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  research: "Research", resume: "Resume", cover_letter: "Cover letter",
  documents: "Documents", interview: "Interview", submission: "Submission",
};

export const DOCUMENT_CATEGORIES = ["resume", "cover_letter", "portfolio", "certificate", "transcript", "other"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  resume: "Resume", cover_letter: "Cover letter", portfolio: "Portfolio link",
  certificate: "Certificate", transcript: "Transcript", other: "Other",
};

export const TONES = ["professional", "enthusiastic", "concise", "formal"] as const;
export type Tone = (typeof TONES)[number];
export const LENGTHS = ["short", "standard", "detailed"] as const;
export type LengthTarget = (typeof LENGTHS)[number];

export const INTERVIEW_STAGES = ["screening", "technical", "system_design", "behavioral", "onsite", "final", "other"] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];
export const INTERVIEW_STAGE_LABELS: Record<InterviewStage, string> = {
  screening: "Screening", technical: "Technical", system_design: "System design",
  behavioral: "Behavioural", onsite: "On-site", final: "Final", other: "Other",
};
export const INTERVIEW_MODES = ["video", "phone", "onsite", "take_home"] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];
export const INTERVIEW_OUTCOMES = ["scheduled", "completed", "passed", "rejected", "cancelled", "no_response"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const REMINDER_TYPES = ["deadline", "follow_up", "interview", "assessment", "custom"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const browserTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string; key: string | null; title: string; description: string | null;
  category: ChecklistCategory; isRequired: boolean; isCustom: boolean;
  completed: boolean; completedAt: string | null;
  completionSource: "in_app" | "external" | null;
  /** Whether this product can see evidence for the step, or only the user knows. */
  verifiableBy: "in_app" | "external";
  verificationNote: string;
  sortOrder: number;
}

export interface ChecklistSummary {
  total: number; completed: number; percent: number;
  required: number; requiredCompleted: number; requiredPercent: number;
  preparationStage: "not_started" | "preparing" | "ready_to_apply" | "submitted";
  preparationLabel: string; preparationExplanation: string;
  remainingRequired: string[];
  byCategory: Array<{ category: ChecklistCategory; total: number; completed: number }>;
}

export interface CoverLetterSummary {
  id: string; title: string; versionNumber: number; status: "draft" | "approved";
  source: "ai" | "manual" | "edited"; tone: Tone; lengthTarget: LengthTarget;
  wordCount: number; resumeVersionId: string | null;
  groundingNotes: { checked: number; withheld: number; cliches: string[]; rule: string } | null;
  updatedAt: string; preview: string;
}
export interface CoverLetter extends CoverLetterSummary { content: string; applicationId: string }

export interface ApplicationDocument {
  id: string; applicationId: string; category: DocumentCategory; kind: "file" | "link";
  fileName: string | null; mimeType: string | null; fileSize: number | null;
  url: string | null; previewable: boolean; downloadHref: string | null;
  coverLetterId: string | null; note: string | null; createdAt: string;
}

export interface ActivityEntry {
  id: string; type: string; title: string; detail: string | null;
  source: "user" | "system"; sourceLabel: string;
  fromStatus: string | null; toStatus: string | null; occurredAt: string;
}

export interface Reminder {
  id: string; applicationId: string | null; interviewId: string | null;
  type: ReminderType; typeLabel: string; title: string; note: string | null;
  dueAt: string; timezone: string; dueLocal: string;
  /** Set when the viewer's zone differs from the one it was created in. */
  dueInSetZone: string | null;
  status: "pending" | "done" | "dismissed"; completedAt: string | null;
  overdue: boolean; daysUntil: number;
}

export interface ReminderGroups {
  method: string; timezone: string; today: string;
  groups: { overdue: Reminder[]; today: Reminder[]; this_week: Reminder[]; later: Reminder[] };
  counts: { overdue: number; today: number; thisWeek: number; later: number; pending: number; done: number; dismissed: number };
  completed: Reminder[];
  scheduler?: SchedulerContract;
  notificationsCreated?: number;
}

export interface SchedulerContract {
  active: boolean;
  deliveryMode: string;
  message: string;
  toEnable: { needs: string; entryPoint: string; where: string; idempotency: string };
}

export interface ApplicationInterview {
  id: string; applicationId: string; stage: InterviewStage;
  scheduledAt: string | null; timezone: string | null; durationMinutes: number | null;
  mode: InterviewMode; location: string | null;
  interviewers: Array<{ name: string; role?: string | null }>;
  preparationNotes: string | null; mockSessionId: string | null;
  outcome: InterviewOutcome; feedback: string | null;
  createdAt: string; updatedAt: string;
}

export interface MockSession { id: string; targetRole: string; interviewType: string; status: string; score: number | null; createdAt: string }
export interface ResumeVersionRef { id: string; name: string; kind: string; isOriginal: boolean; jobDescriptionId: string | null; lastQualityScore: number | null; updatedAt: string }

export interface ReadinessItem {
  key: string; label: string;
  /** ready = fine, attention = fixable, unknown = we have no information. */
  state: "ready" | "attention" | "unknown";
  because: string;
  action: { label: string; href: string } | null;
}
export interface ReadinessReview {
  method: string; items: ReadinessItem[];
  ready: ReadinessItem[]; attention: ReadinessItem[]; unknown: ReadinessItem[];
  counts: { ready: number; attention: number; unknown: number; total: number };
  verdict: string; blocking: false; disclaimer: string; reviewedAt: string;
}

export interface Workspace {
  application: {
    id: string; jobTitle: string; companyName: string; status: ApplicationStatus;
    statusLabel: string; outcome: "accepted" | "declined" | null;
    applicationDate: string; applicationDeadline: string | null;
    nextFollowUpDate: string | null; notes: string | null;
    createdAt: string; updatedAt: string;
  };
  job: {
    jobTitle: string; companyName: string; description: string;
    jobDescriptionId: string | null; externalJobId: string | null;
    listingUrl: string | null; sourceKind: "provider" | "own" | "manual"; providerName: string | null;
  };
  stage: { stage: string; label: string; basis: string };
  allowedTransitions: Array<{ status: ApplicationStatus; label: string }>;
  checklist: { items: ChecklistItem[]; summary: ChecklistSummary; autoCompletions: Array<{ key: string; title: string; reason: string }> };
  coverLetters: CoverLetterSummary[];
  documents: ApplicationDocument[];
  activity: ActivityEntry[];
  reminders: ReminderGroups;
  interviews: ApplicationInterview[];
  resumeVersions: ResumeVersionRef[];
  selectedResumeVersion: ResumeVersionRef | null;
  match: { id: string; matchScore: number; label: string; scoringVersion: string; updatedAt: string } | null;
  mockSessions: MockSession[];
  nextAction: { key: string; title: string; detail: string; href: string | null };
  storage: { enabled: boolean; driver: string };
  scheduler: SchedulerContract;
  notificationsCreated: number;
  notes: string[];
}

export interface DashboardItem {
  id: string; jobTitle: string; companyName: string; status: ApplicationStatus; statusLabel: string;
  outcome: "accepted" | "declined" | null;
  stage: { stage: string; label: string; basis: string };
  applicationDate: string; applicationDeadline: string | null; nextFollowUpDate: string | null; updatedAt: string;
  checklistPercent: number; requiredRemaining: number; coverLetters: number;
  upcomingInterview: { id: string; stage: string; scheduledAt: string } | null;
  overdueReminders: number; pendingReminders: number;
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export async function getWorkspace(applicationId: string): Promise<Workspace> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/workspace`, { params: { tz: browserTimeZone() } });
  return data;
}

export async function getWorkspaceDashboard(): Promise<{ items: DashboardItem[]; filters: Record<string, number>; scheduler: SchedulerContract }> {
  const { data } = await api.get("/api/application-workspaces");
  return data;
}

// ─── Checklist ───────────────────────────────────────────────────────────────

export async function getChecklist(applicationId: string): Promise<{ items: ChecklistItem[]; summary: ChecklistSummary }> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/checklist`);
  return data;
}
export async function addChecklistItem(applicationId: string, input: { title: string; description?: string; category: ChecklistCategory; isRequired?: boolean }) {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/checklist`, input);
  return data as { item: ChecklistItem; summary: ChecklistSummary };
}
export async function updateChecklistItem(
  applicationId: string, itemId: string,
  input: { completed?: boolean; completionSource?: "in_app" | "external"; title?: string; description?: string | null; isRequired?: boolean }
) {
  const { data } = await api.patch(`/api/applications/${encodeURIComponent(applicationId)}/checklist/${encodeURIComponent(itemId)}`, input);
  return data as {
    item: ChecklistItem; summary: ChecklistSummary;
    /** Offered after the submission step; the app never changes status itself. */
    submissionPrompt: { message: string; endpoint: string; body: { status: ApplicationStatus } } | null;
  };
}
export async function deleteChecklistItem(applicationId: string, itemId: string): Promise<void> {
  await api.delete(`/api/applications/${encodeURIComponent(applicationId)}/checklist/${encodeURIComponent(itemId)}`);
}

// ─── Cover letters ───────────────────────────────────────────────────────────

export async function listCoverLetters(applicationId: string): Promise<{ coverLetters: CoverLetter[]; tones: Tone[]; lengths: LengthTarget[] }> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/cover-letters`);
  return data;
}
export async function createCoverLetter(applicationId: string, input: {
  resumeVersionId?: string; title?: string; tone?: Tone; lengthTarget?: LengthTarget;
  userNotes?: string; existingText?: string; content?: string;
}): Promise<{
  coverLetter: CoverLetter; generated: boolean; questions?: string[]; highlighted?: string[];
  withheldParagraphs?: Array<{ role: string; reason: string; text: string }>; note?: string;
}> {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/cover-letters`, input, { timeout: AI_TIMEOUT_MS });
  return data;
}
export async function updateCoverLetter(coverLetterId: string, input: { title?: string; content?: string; tone?: Tone; lengthTarget?: LengthTarget; status?: "draft" | "approved" }) {
  const { data } = await api.patch(`/api/cover-letters/${encodeURIComponent(coverLetterId)}`, input);
  return data.coverLetter as CoverLetter;
}
export async function deleteCoverLetter(coverLetterId: string): Promise<void> {
  await api.delete(`/api/cover-letters/${encodeURIComponent(coverLetterId)}`);
}
/** Returns a replacement paragraph. Nothing is saved until the letter is updated. */
export async function regenerateParagraph(coverLetterId: string, input: { paragraphText: string; instruction?: string }) {
  const { data } = await api.post(`/api/cover-letters/${encodeURIComponent(coverLetterId)}/regenerate-paragraph`, input, { timeout: AI_TIMEOUT_MS });
  return data as { text: string; rationale: string; saved: false; note: string };
}
export async function exportCoverLetter(coverLetterId: string): Promise<{ blob: Blob; fileName: string }> {
  const res = await api.post(`/api/cover-letters/${encodeURIComponent(coverLetterId)}/export`, {}, { responseType: "blob", timeout: 60_000 });
  const cd = String(res.headers["content-disposition"] ?? "");
  return { blob: res.data as Blob, fileName: /filename="([^"]+)"/.exec(cd)?.[1] ?? "cover-letter.pdf" };
}

// ─── Documents ───────────────────────────────────────────────────────────────

export async function listDocuments(applicationId: string): Promise<{
  documents: ApplicationDocument[]; categories: DocumentCategory[];
  limits: { maxBytes: number; formats: string[] };
  storage: { enabled: boolean; driver: string };
}> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/documents`);
  return data;
}
export async function uploadDocument(applicationId: string, file: File, input: { category: DocumentCategory; note?: string }) {
  const form = new FormData();
  form.append("document", file);
  form.append("category", input.category);
  if (input.note) form.append("note", input.note);
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/documents`, form, { timeout: 120_000 });
  return data.document as ApplicationDocument;
}
export async function addDocumentLink(applicationId: string, input: { category: DocumentCategory; url: string; note?: string }) {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/documents`, input);
  return data.document as ApplicationDocument;
}
export async function deleteDocument(documentId: string): Promise<void> {
  await api.delete(`/api/application-documents/${encodeURIComponent(documentId)}`);
}
/** Fetches through the owner-checked endpoint; the storage key is never exposed. */
export async function downloadDocument(documentId: string, fileName: string): Promise<void> {
  const res = await api.get(`/api/application-documents/${encodeURIComponent(documentId)}/download`, { responseType: "blob" });
  triggerDownload(res.data as Blob, fileName);
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Activity ────────────────────────────────────────────────────────────────

export async function listActivity(applicationId: string, params: { limit?: number } = {}): Promise<{ activity: ActivityEntry[]; note: string }> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/activity`, { params });
  return data;
}
export async function addActivity(applicationId: string, input: { title: string; detail?: string; type?: "note" | "follow_up" | "submitted" | "interview_completed"; occurredAt?: string }) {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/activity`, input);
  return data.activity as ActivityEntry;
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export async function listReminders(params: { status?: string; applicationId?: string } = {}): Promise<ReminderGroups> {
  const { data } = await api.get("/api/application-reminders", { params: { ...params, tz: browserTimeZone() } });
  return data;
}
export async function createReminder(input: {
  applicationId?: string; interviewId?: string; type: ReminderType;
  title: string; note?: string; dueAt: string; timezone?: string;
}): Promise<{ reminder: Reminder; created: boolean; note?: string }> {
  const { data } = await api.post("/api/application-reminders", { ...input, timezone: input.timezone ?? browserTimeZone() });
  return data;
}
export async function updateReminder(reminderId: string, input: { title?: string; note?: string | null; dueAt?: string; timezone?: string; status?: "pending" | "done" | "dismissed" }) {
  const { data } = await api.patch(`/api/application-reminders/${encodeURIComponent(reminderId)}`, input);
  return data.reminder as Reminder;
}
export async function deleteReminder(reminderId: string): Promise<void> {
  await api.delete(`/api/application-reminders/${encodeURIComponent(reminderId)}`);
}

// ─── Interview rounds ────────────────────────────────────────────────────────

export async function listInterviews(applicationId: string): Promise<{ interviews: ApplicationInterview[]; mockSessions: MockSession[] }> {
  const { data } = await api.get(`/api/applications/${encodeURIComponent(applicationId)}/interviews`);
  return data;
}
export async function createInterview(applicationId: string, input: {
  stage: InterviewStage; scheduledAt?: string; timezone?: string; durationMinutes?: number;
  mode?: InterviewMode; location?: string; interviewers?: Array<{ name: string; role?: string }>;
  preparationNotes?: string; mockSessionId?: string; createReminder?: boolean;
}): Promise<{ interview: ApplicationInterview; reminder: Reminder | null; note: string }> {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/interviews`, input);
  return data;
}
export async function updateInterview(interviewId: string, input: Partial<{
  stage: InterviewStage; scheduledAt: string | null; timezone: string; durationMinutes: number | null;
  mode: InterviewMode; location: string | null; interviewers: Array<{ name: string; role?: string }>;
  preparationNotes: string | null; mockSessionId: string | null; outcome: InterviewOutcome; feedback: string | null;
}>) {
  const { data } = await api.patch(`/api/application-interviews/${encodeURIComponent(interviewId)}`, input);
  return data.interview as ApplicationInterview;
}
export async function deleteInterview(interviewId: string): Promise<void> {
  await api.delete(`/api/application-interviews/${encodeURIComponent(interviewId)}`);
}

// ─── Readiness ───────────────────────────────────────────────────────────────

export async function runReadinessReview(applicationId: string, input: { resumeVersionId?: string } = {}): Promise<{ review: ReadinessReview }> {
  const { data } = await api.post(`/api/applications/${encodeURIComponent(applicationId)}/readiness-review`, input);
  return data;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export const STAGE_TONE: Record<string, "emerald" | "sky" | "amber" | "gray" | "red"> = {
  saved: "gray", preparing: "amber", ready_to_apply: "sky", applied: "sky",
  assessment: "sky", interview: "sky", offer: "emerald", accepted: "emerald",
  declined: "gray", rejected: "red", withdrawn: "gray",
};

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Only ever link out to an absolute http(s) URL. */
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
