/**
 * resumeAnalysisService.ts — real AI analysis via the Express backend.
 *
 * Also adapts the backend's validated payload into `AnalysisView`, the shape the
 * existing Phase 2 results components render, so demo and AI results share UI.
 */
import { api, API_BASE_URL } from "./api";
import type {
  AlignmentSummary,
  AnalysisView,
  ATSCheck,
  InterviewQuestion,
  RecommendationItem,
  ScoreBreakdownItem,
  SkillItem,
} from "./mockAnalysisService";

// ─── Backend payload types (mirror backend/src/validators + services) ────────

interface AiSkill {
  name: string;
  category: string;
  priority: "required" | "preferred" | "unknown";
  evidence?: string;
  evidenceType?: "direct" | "inferred";
  gap?: string;
  reason?: string;
}

export interface AiAnalysisPayload {
  analysisMode: "ai";
  provider: string;
  model: string;
  jobTitle: string;
  targetRole: string;
  companyName: string | null;
  fileName: string | null;
  summary: string;
  matchScore: number | null;
  scoreExplanation: string;
  scoreBreakdown: ScoreBreakdownItem[];
  lowEvidence: boolean;
  matchedSkills: AiSkill[];
  partiallyMatchedSkills: AiSkill[];
  missingOrUnverifiedSkills: AiSkill[];
  strengths: string[];
  improvementSuggestions: RecommendationItem[];
  keywordAnalysis: { foundKeywords: string[]; missingOrUnverifiedKeywords: string[]; recommendedKeywords: string[] };
  experienceAlignment: AlignmentSummary;
  educationAlignment: AlignmentSummary;
  atsChecks: { name: string; status: "pass" | "warn" | "fail"; explanation: string; verifiability: ATSCheck["verifiability"] }[];
  interviewQuestions: { question: string; category: "Technical" | "Project" | "Behavioral"; difficulty: "Beginner" | "Intermediate" | "Advanced"; reason: string }[];
  limitations: string[];
  generatedAt: string;
}

export interface AiAnalysisRecord {
  id: string;
  jobTitle: string;
  targetRole: string;
  companyName: string | null;
  fileName: string | null;
  resumeId?: string | null;
  resumeName?: string | null;
  jobDescriptionId?: string | null;
  analysisMode: "ai" | "demo";
  matchScore: number;
  provider: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
  result: AiAnalysisPayload;
  canRegenerate: boolean;
  jobDescription?: string;
}

export type AiAnalysisListItem = Omit<AiAnalysisRecord, "result" | "canRegenerate" | "jobDescription">;

export interface AnalyzeRequest {
  /** Either resumeText or resumeId (a stored resume) is required. */
  resumeText?: string;
  resumeId?: string;
  /** When jobDescriptionId is given the saved description supplies title/role/text unless overridden. */
  jobDescriptionId?: string;
  jobTitle?: string;
  targetRole?: string;
  jobDescription?: string;
  companyName?: string;
  fileName?: string;
  /** Save the pasted job description as a reusable record and link it to the analysis. */
  saveJobDescription?: boolean;
}

export interface BackendHealth {
  status: string;
  ai: { configured: boolean; provider: string; model: string };
}

/** What the endpoint may actually send; every field is treated as untrusted. */
type RawHealth = { status?: unknown; ai?: { configured?: unknown; provider?: unknown; model?: unknown } };

// ─── API calls ───────────────────────────────────────────────────────────────

/**
 * Reads backend health and returns a guaranteed shape, or null if unreachable.
 *
 * Seven pages branch on `health.ai.configured`, so the response is normalised
 * here rather than trusted field by field at each call site. A backend that
 * stops sending `ai` - as the Phase 15 health split briefly did - must degrade
 * to "AI not configured" everywhere, not throw a TypeError that blanks the
 * page. Callers may still assume `health.ai` exists whenever health is non-null.
 */
export async function getBackendHealth(): Promise<BackendHealth | null> {
  try {
    const { data } = await api.get<RawHealth>("/api/health", { timeout: 4000 });
    if (!data || typeof data !== "object") return null;
    const ai = (data.ai ?? {}) as NonNullable<RawHealth["ai"]>;
    return {
      status: typeof data.status === "string" ? data.status : "unknown",
      ai: {
        configured: ai.configured === true,
        provider: typeof ai.provider === "string" ? ai.provider : "",
        model: typeof ai.model === "string" ? ai.model : "",
      },
    };
  } catch {
    return null;
  }
}

/** AI calls can legitimately take minutes when the provider is slow; this must exceed the backend's AI request budget. */
export const AI_CALL_TIMEOUT_MS = 330_000;

export async function runAiAnalysis(input: AnalyzeRequest): Promise<AiAnalysisRecord> {
  const { data } = await api.post<{ analysis: AiAnalysisRecord }>("/api/analysis/resume", input, { timeout: AI_CALL_TIMEOUT_MS });
  return data.analysis;
}

export async function getAiAnalysis(id: string): Promise<AiAnalysisRecord> {
  const { data } = await api.get<{ analysis: AiAnalysisRecord }>(`/api/analysis/${encodeURIComponent(id)}`);
  return data.analysis;
}

export async function listAiAnalyses(): Promise<AiAnalysisListItem[]> {
  const { data } = await api.get<{ analyses: AiAnalysisListItem[] }>("/api/analysis");
  return data.analyses;
}

export async function deleteAiAnalysis(id: string): Promise<void> {
  await api.delete(`/api/analysis/${encodeURIComponent(id)}`);
}

/** Regeneration creates a NEW history record; the returned analysis has a new id and `previousId` points at the original. */
export async function regenerateAiAnalysis(id: string, resumeText?: string): Promise<AiAnalysisRecord & { previousId: string }> {
  const { data } = await api.post<{ analysis: AiAnalysisRecord; previousId: string }>(`/api/analysis/${encodeURIComponent(id)}/regenerate`, resumeText ? { resumeText } : {}, { timeout: AI_CALL_TIMEOUT_MS });
  return { ...data.analysis, previousId: data.previousId };
}

/** Demo analysis ids are generated client-side with this prefix; everything else is a backend id. */
export function isDemoAnalysisId(id: string): boolean {
  return id.startsWith("demo_");
}

export { API_BASE_URL };

// ─── Adapter → AnalysisView ──────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, SkillItem["category"]> = {
  Frontend: "framework",
  Backend: "framework",
  Database: "technical",
  "Cloud/DevOps": "tool",
  Testing: "tool",
  Tools: "tool",
  Data: "technical",
  "Soft Skill": "soft",
  Other: "technical",
};

const QUESTION_TYPE: Record<AiAnalysisPayload["interviewQuestions"][number]["category"], InterviewQuestion["type"]> = {
  Technical: "technical",
  Project: "resume-based",
  Behavioral: "behavioral",
};

const DIFFICULTY: Record<AiAnalysisPayload["interviewQuestions"][number]["difficulty"], InterviewQuestion["difficulty"]> = {
  Beginner: "easy",
  Intermediate: "medium",
  Advanced: "hard",
};

function toSkill(s: AiSkill, matchType: SkillItem["matchType"]): SkillItem {
  return {
    name: s.name,
    category: CATEGORY_MAP[s.category] ?? "technical",
    matchType,
    evidence: s.evidence,
    evidenceType: s.evidenceType,
    gap: s.gap,
    reason: s.reason,
    priority: s.priority,
  };
}

export function toAnalysisViewFromAi(record: AiAnalysisRecord): AnalysisView {
  const r = record.result;
  const scoreAvailable = typeof r.matchScore === "number";
  return {
    id: record.id,
    isDemoData: false,
    analysisMode: "ai",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    jobTitle: record.jobTitle,
    targetRole: record.targetRole,
    companyName: record.companyName,
    jobDescription: record.jobDescription ?? "",
    fileName: record.fileName ?? "resume",
    matchScore: scoreAvailable ? (r.matchScore as number) : 0,
    scoreAvailable,
    lowEvidence: r.lowEvidence,
    matchExplanation: r.scoreExplanation,
    scoreBreakdown: r.scoreBreakdown,
    summary: r.summary,
    skills: [
      ...r.matchedSkills.map((s) => toSkill(s, "matched")),
      ...r.partiallyMatchedSkills.map((s) => toSkill(s, "partial")),
      ...r.missingOrUnverifiedSkills.map((s) => toSkill(s, "missing")),
    ],
    atsChecks: r.atsChecks.map((c) => ({ label: c.name, status: c.status, detail: c.explanation, verifiability: c.verifiability })),
    strengths: r.strengths,
    recommendations: r.improvementSuggestions,
    interviewQuestions: r.interviewQuestions.map((q) => ({
      question: q.question,
      type: QUESTION_TYPE[q.category] ?? "technical",
      difficulty: DIFFICULTY[q.difficulty] ?? "medium",
      reason: q.reason,
    })),
    experienceAlignment: r.experienceAlignment,
    educationAlignment: r.educationAlignment,
    keywordAnalysis: r.keywordAnalysis,
    limitations: r.limitations,
    provider: record.provider ?? r.provider,
    model: record.model ?? r.model,
    canRegenerate: record.canRegenerate,
  };
}
