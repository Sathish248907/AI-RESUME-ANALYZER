/**
 * jobDiscoveryService.ts — Phase 12: job discovery, resume-to-job matching,
 * saved jobs, search preferences and alerts.
 *
 * Everything here is a thin client over the backend. In particular the browser
 * never sees a provider API key, never computes a match score and never invents
 * a field: a `null` from the server means "the source did not say", and the UI
 * is expected to render that as such rather than as a zero.
 */
import { api } from "./api";

export const WORK_ARRANGEMENTS = ["remote", "hybrid", "onsite"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EXPERIENCE_LEVELS = ["entry", "junior", "mid", "senior", "lead"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const WORK_ARRANGEMENT_LABELS: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Not stated" };
export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract", internship: "Internship", temporary: "Temporary", unknown: "Not stated" };
export const EXPERIENCE_LEVEL_LABELS: Record<string, string> = { entry: "Entry", junior: "Junior", mid: "Mid", senior: "Senior", lead: "Lead", unknown: "Not stated" };

export type EvidenceState = "demonstrated" | "mentioned" | "not_found" | "not_assessed";
export const EVIDENCE_LABELS: Record<EvidenceState, string> = {
  demonstrated: "Demonstrated",
  mentioned: "Mentioned",
  not_found: "Not found",
  not_assessed: "Not assessed",
};

export type SavedState = "saved" | "interested" | "hidden";
export type JobSort = "relevance" | "newest" | "match";
export type JobSource = "all" | "provider" | "own";

export interface JobListing {
  id: string;
  sourceKind: "provider" | "own";
  jobDescriptionId: string | null;
  providerSlug: string;
  providerName?: string;
  externalId: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  location: string | null;
  isRemote: boolean;
  workArrangement: WorkArrangement | "unknown";
  employmentType: EmploymentType | "unknown";
  experienceLevel: ExperienceLevel | "unknown";
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryIsEstimate: boolean;
  isSponsored: boolean;
  postedAt: string | null;
  /** False when the source has no trustworthy publication timestamp. */
  postedAtReliable: boolean;
  sourceUrl: string | null;
  applyUrl: string | null;
  tags: string[];
  listingStatus: string;
  targetRole: string | null;
  /** Names of fields the source did not supply, for honest empty labels. */
  missingFields: string[];
}

export interface MatchDimension { key: string; label: string; weight: number; score: number | null; applicable: boolean; explanation: string }
export interface SkillEvidence { name: string; priority: "required" | "preferred"; evidence: EvidenceState }
export interface Mismatch { key: string; severity: "high" | "medium" | "low"; title: string; detail: string; note: string }
export interface RelevantEntry { sectionId: string; entryId: string; name: string; matchedSkills: string[] }

export interface MatchReport {
  method: string;
  matchScore: number | null;
  label: string;
  assessed: boolean;
  notAssessedReason: string | null;
  dimensions: MatchDimension[];
  weightsUsed: Record<string, number>;
  skills: {
    requiredDemonstrated: string[]; requiredMentioned: string[]; requiredNotFound: string[];
    preferredDemonstrated: string[]; preferredMentioned: string[]; preferredNotFound: string[];
    needingEvidence: string[]; detail: SkillEvidence[];
  };
  keywordCoverage: { total: number; found: string[]; missing: string[]; percent: number | null } | null;
  relevantExperience: RelevantEntry[];
  relevantProjects: RelevantEntry[];
  mismatches: Mismatch[];
  resumeLevel: string;
  jobLevel: string | null;
  requirements: { skills: Array<{ name: string; priority: string }>; educationRequired: boolean; minYears: number | null; level: string | null };
  preferenceNotes: string[];
  evidenceScale: Array<{ key: EvidenceState; label: string; meaning: string }>;
  disclaimer: string;
  computedAt: string;
}

/** The compact match shown on a card, rather than the full report. */
export interface CardMatch {
  matchScore: number | null;
  label: string;
  assessed: boolean;
  notAssessedReason: string | null;
  requiredDemonstrated: string[];
  requiredNotFound: string[];
  needingEvidence: string[];
  mismatchCount: number;
}

export interface RankingFactor { key: string; label: string; weight: number; score: number | null; applicable: boolean; evidence: string }
export interface Ranking {
  method: string;
  rankScore: number | null;
  /** Relevance deliberately excludes posting age. */
  relevanceScore: number | null;
  freshnessScore: number | null;
  factors: RankingFactor[];
  excludedFactors: Array<{ key: string; label: string; reason: string }>;
  weightsUsed: Record<string, number>;
  reasons: string[];
  notes: string[];
  isSponsored: boolean;
}

export interface ProviderInfo {
  slug: string; displayName: string; enabled: boolean; configured: boolean;
  requiresCredentials: boolean; credentialKeys: string[]; missingCredentials: string[];
  attribution: string | null; termsUrl: string | null; docsUrl: string | null;
  supports: Record<string, boolean>;
  lastFetchedAt?: string | null; lastStatus?: string | null; lastError?: string | null; lastJobCount?: number;
}

export interface SetupGuide {
  message: string; howTo: string; envVar: string;
  available: Array<{ slug: string; displayName: string; requiresCredentials: boolean; credentialKeys: string[]; missingCredentials: string[]; docsUrl: string | null; termsUrl: string | null; attribution: string | null; note: string }>;
  manualEntry: { message: string; href: string };
}

export interface ProviderStatus {
  configured: boolean;
  enabled: string[];
  results: Array<{ slug: string; status: string; count: number; dropped?: number; ms: number; error: string | null }>;
  misconfigured: Array<{ slug: string; displayName: string; missingCredentials: string[] }>;
  unknown: string[];
  partial: boolean;
  created: number;
  updated: number;
  cacheTtlMinutes: number;
  attribution: string[];
}

export interface ResumeVersionRef { id: string; name: string; kind: string; isOriginal: boolean; lastQualityScore: number | null }

export interface DiscoverItem {
  job: JobListing;
  match: CardMatch;
  ranking: Ranking;
  savedState: SavedState | null;
  savedJobId: string | null;
  storedMatch: { id: string; matchScore: number; label: string; updatedAt: string } | null;
}

export interface DiscoverResult {
  method: string;
  items: DiscoverItem[];
  page: number; limit: number; total: number; totalPages: number; hasMore: boolean;
  sort: JobSort;
  filtersApplied: Record<string, unknown> & { hiddenExcluded: number };
  resumeVersion: ResumeVersionRef | null;
  availableResumeVersions: ResumeVersionRef[];
  providerStatus: ProviderStatus;
  setup: SetupGuide | null;
  rankingWeights: Record<string, number>;
  notes: string[];
}

export interface DiscoverQuery {
  q?: string; location?: string;
  workArrangement?: WorkArrangement; employmentType?: EmploymentType; experienceLevel?: ExperienceLevel;
  minSalary?: number; postedWithinDays?: number;
  sort?: JobSort; source?: JobSource;
  resumeVersionId?: string; includeHidden?: boolean; refresh?: boolean;
  page?: number; limit?: number;
  /** "match:50,freshness:0" — bounded server-side. */
  weights?: string;
}

export async function discoverJobs(query: DiscoverQuery = {}): Promise<DiscoverResult> {
  const { data } = await api.get("/api/jobs/discover", { params: query });
  return data;
}

export async function listProviders(): Promise<{ configured: boolean; enabled: string[]; providers: ProviderInfo[]; setup: SetupGuide | null; retentionDays: number }> {
  const { data } = await api.get("/api/jobs/providers");
  return data;
}

export async function refreshJobs(input: { q?: string; location?: string } = {}): Promise<{ fetched: number; created: number; updated: number; providers: ProviderStatus["results"]; partial: boolean; note: string }> {
  const { data } = await api.post("/api/jobs/refresh", input);
  return data;
}

export interface JobPreparation {
  method: string;
  targetRole: string;
  skillGaps: { method: string | null; skills: Array<{ skillName: string; category: string; proficiencyStatus: string; priority: string; explanation: string; whyItMatters: string; evidenceSources: string[] }>; summary: Record<string, number> | null };
  interview: {
    technicalTopics: Array<{ topic: string; requirement: string; evidence: EvidenceState; priority: string; why: string; prepare: string }>;
    behaviouralTopics: Array<{ key: string; topic: string; question: string; source: string }>;
    practiceQuestions: Array<{ kind: string; skill: string | null; question: string; basis: string }>;
    recommendedSessions: Array<{ key: string; title: string; interviewType: string; difficulty: string; topics: string[]; reason: string; href: string }>;
    weakTopics: Array<{ topic: string; mean: number; attempts: number }>;
    codingExercises: Array<{ taskId: string; title: string; skillName: string; taskType: string; milestone: string; href: string }>;
    practicePlan: Array<{ step: number; kind: string; title: string; detail: string; href: string; minutes: number }>;
    untestedRequirements: string[];
    sessionsCompleted: number;
    scoreTrend: Array<{ sessionId: string; date: string; score: number }>;
    startSessionHref: string;
    note: string;
  };
  learning: Array<{ skillName: string; requirement: string; evidence: EvidenceState; inRoadmap: boolean; taskId: string | null; taskStatus: string | null; milestone: string | null; href: string; why: string; resources: Array<{ title: string; url: string | null; resourceType: string; provider: string; description: string }> }>;
  notes: string[];
}

export interface JobDetail {
  job: JobListing;
  requirements: MatchReport["requirements"] & { method: string };
  match: MatchReport | null;
  ranking: Ranking;
  preparation: JobPreparation | null;
  savedJob: { id: string; state: SavedState; notes: string | null; applicationId: string | null } | null;
  application: { id: string; status: string; applicationDate: string; nextFollowUpDate: string | null } | null;
  resumeVersion: ResumeVersionRef | null;
  availableResumeVersions: ResumeVersionRef[];
  attribution: string | null;
  notes: string[];
}

export async function getJob(jobId: string, params: { resumeVersionId?: string } = {}): Promise<JobDetail> {
  const { data } = await api.get(`/api/jobs/${encodeURIComponent(jobId)}`, { params });
  return data;
}

export async function matchJob(jobId: string, input: { resumeVersionId?: string; compareAllVersions?: boolean; save?: boolean } = {}): Promise<{
  jobId: string; match: MatchReport; resumeVersion: ResumeVersionRef; recommendedVersion: ResumeVersionRef;
  comparison: Array<{ version: ResumeVersionRef; matchScore: number | null; label: string }>;
  saved: boolean; weights: Record<string, number>; dimensionLabels: Record<string, string>; disclaimer: string;
}> {
  const { data } = await api.post(`/api/jobs/${encodeURIComponent(jobId)}/match`, input);
  return data;
}

export async function getMatchReport(jobId: string, params: { resumeVersionId?: string } = {}): Promise<{ jobId: string; stored: boolean; report: MatchReport | { matchScore: number; label: string; details: unknown; scoringVersion: string } | null; staleNote?: string; note?: string; resumeVersion?: ResumeVersionRef; disclaimer: string }> {
  const { data } = await api.get(`/api/jobs/${encodeURIComponent(jobId)}/match-report`, { params });
  return data;
}

export async function getInterviewPreparation(jobId: string, params: { resumeVersionId?: string } = {}): Promise<{ jobId: string; job?: { id: string; title: string; companyName: string }; resumeVersion?: ResumeVersionRef; preparation: JobPreparation | null; note?: string }> {
  const { data } = await api.get(`/api/jobs/${encodeURIComponent(jobId)}/interview-preparation`, { params });
  return data;
}

export interface TailorHandoff {
  jobId: string;
  recommendedVersion: ResumeVersionRef & { matchScore: number | null; label: string };
  comparison: Array<{ version: { id: string; name: string; isOriginal: boolean }; matchScore: number | null; label: string }>;
  jobDescriptionId: string | null;
  keywordSuggestions: { addWhereTrue: string[]; evidenceNeeded: string[]; alreadyStrong: string[]; rule: string };
  highlight: { projects: RelevantEntry[]; experience: RelevantEntry[] };
  experienceGaps: Mismatch[];
  next: { message: string; tailorEndpoint: string; tailorBody: Record<string, unknown>; href: string; exportNote: string };
}

export async function tailorResumeForJob(jobId: string, input: { resumeVersionId?: string; saveJobDescription?: boolean } = {}): Promise<TailorHandoff> {
  const { data } = await api.post(`/api/jobs/${encodeURIComponent(jobId)}/tailor-resume`, input);
  return data;
}

// ─── Saved jobs ──────────────────────────────────────────────────────────────

export interface SavedJobItem {
  savedJobId: string;
  state: SavedState;
  notes: string | null;
  savedAt: string;
  updatedAt: string;
  job: JobListing;
  match: { matchScore: number | null; label: string; requiredNotFound: string[]; mismatchCount: number } | null;
  storedMatch: { matchScore: number; label: string; updatedAt: string } | null;
  application: { id: string; status: string; applicationDate: string; nextFollowUpDate: string | null; jobUrl: string | null; notes: string | null } | null;
  ranking: Ranking;
}

export async function listSavedJobs(params: { state?: SavedState } = {}): Promise<{ items: SavedJobItem[]; counts: Record<string, number>; note: string | null }> {
  const { data } = await api.get("/api/saved-jobs", { params });
  return data;
}
export async function saveJob(input: { jobId: string; state?: SavedState; notes?: string }): Promise<{ savedJob: { id: string; state: SavedState; notes: string | null } }> {
  const { data } = await api.post("/api/saved-jobs", input);
  return data;
}
export async function updateSavedJob(savedJobId: string, input: { state?: SavedState; notes?: string | null }) {
  const { data } = await api.patch(`/api/saved-jobs/${encodeURIComponent(savedJobId)}`, input);
  return data.savedJob as { id: string; state: SavedState; notes: string | null; applicationId: string | null };
}
export async function deleteSavedJob(savedJobId: string): Promise<void> {
  await api.delete(`/api/saved-jobs/${encodeURIComponent(savedJobId)}`);
}

/**
 * Creates one record in the existing application tracker. Status changes and
 * follow-ups are made there, not here.
 */
export async function startApplication(savedJobId: string, input: { status?: string; applicationDate?: string; nextFollowUpDate?: string; notes?: string; allowDuplicate?: boolean } = {}): Promise<{
  application: { id: string; status: string }; savedJob: { id: string; state: SavedState; applicationId: string }; note: string; href: string;
}> {
  const { data } = await api.post(`/api/saved-jobs/${encodeURIComponent(savedJobId)}/application`, input);
  return data;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export interface JobPreference {
  id: string;
  titles: string[]; skills: string[]; locations: string[];
  workArrangements: WorkArrangement[]; employmentTypes: EmploymentType[];
  experienceLevel: ExperienceLevel | null;
  minSalary: number | null; salaryCurrency: string | null;
  excludedCompanies: string[]; keywords: string | null;
  rankingWeights: Record<string, number> | null;
  updatedAt: string;
}
export type JobPreferenceInput = Omit<JobPreference, "id" | "updatedAt">;

export async function getJobPreferences(): Promise<{ preference: JobPreference | null; defaults: { rankingWeights: Record<string, number> }; factorLabels: Record<string, string>; note: string }> {
  const { data } = await api.get("/api/job-preferences");
  return data;
}
export async function saveJobPreferences(input: Partial<JobPreferenceInput>): Promise<{ preference: JobPreference; defaults: { rankingWeights: Record<string, number> } }> {
  const { data } = await api.put("/api/job-preferences", input);
  return data;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertFrequency = "manual" | "daily" | "weekly";
export interface JobAlertQuery {
  titles: string[]; skills: string[]; locations: string[];
  workArrangements: WorkArrangement[]; employmentTypes: EmploymentType[];
  experienceLevel?: ExperienceLevel; minSalary?: number; keywords?: string;
}
export interface JobAlert {
  id: string; name: string; query: JobAlertQuery; frequency: AlertFrequency; isActive: boolean;
  lastRunAt: string | null; lastResultCount: number; lastNewCount: number;
  createdAt: string; updatedAt: string;
  /** What actually happens, as opposed to the requested frequency. */
  deliveryMode: "manual" | "scheduled";
  deliveryNote: string;
  requiresForAutomatic: { needs: string; where: string; providerNote: string } | null;
}

export async function listJobAlerts(): Promise<{ alerts: JobAlert[]; scheduler: { available: boolean; message: string; toEnable: string } }> {
  const { data } = await api.get("/api/job-alerts");
  return data;
}
export async function createJobAlert(input: { name: string; query: Partial<JobAlertQuery>; frequency?: AlertFrequency; isActive?: boolean }): Promise<JobAlert> {
  const { data } = await api.post("/api/job-alerts", input);
  return data.alert;
}
export async function updateJobAlert(alertId: string, input: { name?: string; query?: Partial<JobAlertQuery>; frequency?: AlertFrequency; isActive?: boolean }): Promise<JobAlert> {
  const { data } = await api.patch(`/api/job-alerts/${encodeURIComponent(alertId)}`, input);
  return data.alert;
}
export async function deleteJobAlert(alertId: string): Promise<void> {
  await api.delete(`/api/job-alerts/${encodeURIComponent(alertId)}`);
}
export async function runJobAlert(alertId: string): Promise<{
  alert: JobAlert; resultCount: number; newCount: number;
  notified: Array<{ jobId: string; title: string; companyName: string; matchScore: number | null }>;
  providerStatus: ProviderStatus; notes: string[];
}> {
  const { data } = await api.post(`/api/job-alerts/${encodeURIComponent(alertId)}/run`);
  return data;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** Salary as the source stated it, or null — never a guess. */
export function formatSalary(job: Pick<JobListing, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod" | "salaryIsEstimate">): string | null {
  if (!job.salaryMin && !job.salaryMax) return null;
  const fmt = (n: number) => n.toLocaleString();
  const currency = job.salaryCurrency ? `${job.salaryCurrency} ` : "";
  const range = job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax
    ? `${fmt(job.salaryMin)}–${fmt(job.salaryMax)}`
    : fmt((job.salaryMax ?? job.salaryMin) as number);
  const period = job.salaryPeriod ? ` / ${job.salaryPeriod}` : "";
  return `${currency}${range}${period}${job.salaryIsEstimate ? " (estimated by the provider)" : ""}`;
}

/** Posting age, only when the provider's timestamp can be trusted. */
export function formatPostedAt(job: Pick<JobListing, "postedAt" | "postedAtReliable">): string | null {
  if (!job.postedAt || !job.postedAtReliable) return null;
  const days = Math.floor((Date.now() - new Date(job.postedAt).getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Posted ${months} month${months === 1 ? "" : "s"} ago`;
}

export const matchTone = (score: number | null): "emerald" | "sky" | "amber" | "gray" =>
  score === null ? "gray" : score >= 75 ? "emerald" : score >= 55 ? "sky" : "amber";

/** Only ever link out to an http(s) URL the backend already validated. */
export function externalHref(url: string | null): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
