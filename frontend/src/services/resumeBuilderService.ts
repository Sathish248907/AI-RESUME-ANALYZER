/**
 * resumeBuilderService.ts — Phase 8 resume versions, AI improvement / tailoring,
 * quality checks, comparison and PDF export. AI calls use the long timeout.
 */
import { api } from "./api";
import type { PageMeta } from "./resumeService";

const AI_TIMEOUT_MS = 330_000;

export const SECTION_TYPES = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "languages", "custom"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const SECTION_LABELS: Record<SectionType, string> = { summary: "Professional Summary", skills: "Technical Skills", experience: "Work Experience", projects: "Projects", education: "Education", certifications: "Certifications", achievements: "Achievements", languages: "Languages", custom: "Custom section" };
export const TEMPLATE_IDS = ["minimal_ats", "modern", "technical", "fresher", "experienced", "classic"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const FONT_FAMILIES = ["Helvetica", "Times", "Courier"] as const;
export const MARGINS = ["narrow", "normal", "wide"] as const;
export const SPACINGS = ["compact", "normal", "relaxed"] as const;
export const HEADING_STYLES = ["uppercase", "capitalize"] as const;
export const BULLET_STYLES = ["disc", "dash", "arrow"] as const;

export interface Personal { fullName: string; title: string; email: string; phone: string; location: string; website: string; linkedin: string; github: string }
export interface ExperienceEntry { id: string; role: string; company: string; location: string; startDate: string; endDate: string; current: boolean; bullets: string[] }
export interface ProjectEntry { id: string; name: string; role: string; technologies: string[]; link: string; startDate: string; endDate: string; bullets: string[] }
export interface EducationEntry { id: string; degree: string; institution: string; location: string; startDate: string; endDate: string; details: string[] }
export interface CertificationEntry { id: string; name: string; issuer: string; date: string; link: string }
export interface SkillGroup { id: string; name: string; items: string[] }
interface SectionBase { id: string; title: string; visible: boolean }
export type ResumeSection =
  | (SectionBase & { type: "summary"; text: string })
  | (SectionBase & { type: "skills"; groups: SkillGroup[] })
  | (SectionBase & { type: "experience"; entries: ExperienceEntry[] })
  | (SectionBase & { type: "projects"; entries: ProjectEntry[] })
  | (SectionBase & { type: "education"; entries: EducationEntry[] })
  | (SectionBase & { type: "certifications"; entries: CertificationEntry[] })
  | (SectionBase & { type: "achievements" | "languages" | "custom"; items: string[] });
export interface ResumeContent { schemaVersion?: string; personal: Personal; sections: ResumeSection[] }

export interface Formatting { fontFamily: (typeof FONT_FAMILIES)[number]; fontSize: number; accentColor: string; margins: (typeof MARGINS)[number]; sectionSpacing: (typeof SPACINGS)[number]; headingStyle: (typeof HEADING_STYLES)[number]; bulletStyle: (typeof BULLET_STYLES)[number]; pageSize: "A4"; layout: "single" | "multi"; atsMode: boolean }
export interface Template { id: TemplateId; name: string; description: string; bestFor: string; atsSafe: boolean; sectionOrder: SectionType[] | null; defaults: Partial<Formatting> }

export type VersionKind = "original" | "improved" | "tailored" | "custom" | "restored";
export interface ResumeVersionSummary {
  id: string; resumeId: string | null; resume: { id: string; name: string; originalFileName: string } | null; jobDescriptionId: string | null; jobDescription: { id: string; jobTitle: string; companyName: string | null } | null;
  parentVersionId: string | null; name: string; versionNumber: number; kind: VersionKind; isOriginal: boolean; templateId: TemplateId; contentSource: string; targetJobTitle: string | null; targetCompany: string | null; lastQualityScore: number | null; createdAt: string; updatedAt: string;
}
export interface ResumeVersion extends ResumeVersionSummary { content: ResumeContent; formatting: Formatting }

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";
export type Priority = "high" | "medium" | "low";
export const SUGGESTION_GROUPS = ["summary", "skills", "experience", "projects", "education", "achievements", "keywords", "grammar", "formatting", "ats"] as const;
export type SuggestionGroup = (typeof SUGGESTION_GROUPS)[number];
export const SUGGESTION_GROUP_LABELS: Record<SuggestionGroup, string> = {
  summary: "Professional summary", skills: "Technical skills", experience: "Work experience", projects: "Projects", education: "Education",
  achievements: "Achievements & extras", keywords: "Job keywords", grammar: "Grammar & readability", formatting: "Formatting", ats: "ATS compatibility",
};
export interface Suggestion {
  id: string; versionId: string; batchId: string; mode: "improve" | "tailor"; sectionId: string; entryId: string | null; field: string; category: string;
  suggestionGroup: SuggestionGroup; priority: Priority; title: string | null; issue: string | null; benefit: string | null; regenerationCount: number;
  originalText: string; suggestedText: string; rationale: string; needsConfirmation: boolean; confirmationQuestion: string | null; status: SuggestionStatus; acceptedText: string | null; resolvedAt: string | null; createdAt: string;
}
export interface ImproveResult { batchId: string; suggestions: Suggestion[]; generalNotes: string[]; method: string; provider: string; model: string }
export interface TailorResult extends ImproveResult { keywordsToAdd: string[]; genuineGaps: string[]; emphasise: Array<{ sectionId: string; entryId: string | null; reason: string }>; target: { jobTitle: string | null; companyName: string | null; jobDescriptionId: string | null }; version: ResumeVersion }

export interface QualityIssue { id: string; category: string; severity: "high" | "medium" | "low"; message: string; suggestion: string; sectionId: string | null; entryId: string | null; field: string | null }
export interface QualityReport {
  method: string; overall: number; label: string; categories: Array<{ key: string; label: string; weight: number; score: number; explanation: string }>; issues: QualityIssue[];
  atsChecks: Array<{ name: string; status: "pass" | "warn" | "fail"; explanation: string }>; keywordCoverage: { total: number; found: string[]; missing: string[]; percent: number } | null; jobTitle: string | null; disclaimer: string; checkedAt: string;
}
export interface DiffChange { kind: string; sectionId?: string; sectionTitle?: string; entryId?: string; label?: string; field?: string; index?: number; before?: string; after?: string; title?: string }
export interface CompareResult { base: ResumeVersionSummary; other: ResumeVersionSummary; diff: { method: string; summary: Record<string, number | boolean | string[]> & { totalChanges: number; wordsBefore: number; wordsAfter: number; personalChanged: string[] }; changes: DiffChange[] }; description: string; quality: { base: number; other: number } }

export async function getTemplates(): Promise<{ templates: Template[]; defaultFormatting: Formatting }> { const { data } = await api.get("/api/resume-builder/templates"); return data; }
export async function getPreference(): Promise<{ templateId: TemplateId; formatting: Formatting } | null> { const { data } = await api.get("/api/resume-builder/preferences"); return data.preference; }
export async function savePreference(input: { templateId: TemplateId; formatting?: Partial<Formatting> }) { const { data } = await api.put("/api/resume-builder/preferences", input); return data.preference; }

export async function getEditableResume(resumeId: string): Promise<{ resume: { id: string; name: string; originalFileName: string; charCount: number; targetRole: string | null }; original: ResumeVersion; versions: ResumeVersionSummary[]; createdOriginal: boolean }> {
  const { data } = await api.get(`/api/resume-builder/${encodeURIComponent(resumeId)}`);
  return data;
}
export async function createVersion(input: { resumeId?: string; name?: string; structure?: "heuristic" | "ai"; templateId?: TemplateId; fromVersionId?: string; blank?: boolean; jobDescriptionId?: string }): Promise<{ version: ResumeVersion; structuring: { source: string; provider: string | null; model: string | null; ungroundedCount: number } }> {
  const { resumeId, ...body } = input;
  const { data } = await api.post(resumeId ? `/api/resume-builder/${encodeURIComponent(resumeId)}/versions` : "/api/resume-builder/versions", body, { timeout: AI_TIMEOUT_MS });
  return data;
}
export async function listVersions(params: { resumeId?: string; page?: number; limit?: number } = {}): Promise<{ versions: ResumeVersionSummary[] } & PageMeta> { const { data } = await api.get("/api/resume-builder/versions", { params }); return data; }
export async function getVersion(versionId: string): Promise<{ version: ResumeVersion; pendingSuggestions: number; templates: Template[] }> { const { data } = await api.get(`/api/resume-builder/versions/${encodeURIComponent(versionId)}`); return data; }
export async function updateVersion(versionId: string, input: { name?: string; content?: ResumeContent; templateId?: TemplateId; formatting?: Partial<Formatting>; jobDescriptionId?: string | null; targetJobTitle?: string | null; targetCompany?: string | null; expectedUpdatedAt?: string }): Promise<ResumeVersion> {
  const { data } = await api.patch<{ version: ResumeVersion }>(`/api/resume-builder/versions/${encodeURIComponent(versionId)}`, input);
  return data.version;
}
export async function duplicateVersion(versionId: string, input: { name?: string; jobDescriptionId?: string } = {}): Promise<ResumeVersion> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/duplicate`, input); return data.version; }
export async function deleteVersion(versionId: string): Promise<void> { await api.delete(`/api/resume-builder/versions/${encodeURIComponent(versionId)}`); }
export async function restoreVersion(versionId: string, fromVersionId: string): Promise<{ version: ResumeVersion; backup: ResumeVersionSummary | null; description: string }> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/restore`, { fromVersionId }); return data; }

export async function improveVersion(versionId: string, input: { sectionIds?: string[]; userNotes?: string } = {}): Promise<ImproveResult> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/improve`, input, { timeout: AI_TIMEOUT_MS }); return data; }
export async function tailorVersion(versionId: string, input: { jobDescriptionId?: string; jobDescription?: string; jobTitle?: string; companyName?: string; analysisId?: string; saveJobDescription?: boolean }): Promise<TailorResult> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/tailor`, input, { timeout: AI_TIMEOUT_MS }); return data; }
export async function listSuggestions(versionId: string, params: { status?: SuggestionStatus; batchId?: string; group?: SuggestionGroup; priority?: Priority } = {}): Promise<Suggestion[]> { const { data } = await api.get(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/improvements`, { params }); return data.suggestions; }
/** Ask for a different take on one pending suggestion. Applies nothing. */
export async function regenerateSuggestion(versionId: string, improvementId: string, input: { instruction?: string } = {}): Promise<{ suggestion: Suggestion; previousSuggestedText: string }> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/improvements/${encodeURIComponent(improvementId)}/regenerate`, input, { timeout: AI_TIMEOUT_MS });
  return data;
}
export async function resolveSuggestion(versionId: string, improvementId: string, input: { action: "accept" | "reject" | "edit" | "reset"; text?: string }): Promise<{ suggestion: Suggestion; version: ResumeVersion }> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/improvements/${encodeURIComponent(improvementId)}`, input); return data; }

export async function qualityCheck(versionId: string, jobDescriptionId?: string): Promise<{ quality: QualityReport; jobDescriptionId: string | null }> { const { data } = await api.get(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/quality-check`, { params: jobDescriptionId ? { jobDescriptionId } : {} }); return data; }
export async function compareVersions(versionId: string, otherVersionId: string): Promise<CompareResult> { const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/compare`, { otherVersionId }); return data; }

export async function exportPdf(versionId: string, input: { templateId?: TemplateId; formatting?: Partial<Formatting> } = {}): Promise<{ blob: Blob; fileName: string; pages: number }> {
  const res = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/export/pdf`, input, { responseType: "blob", timeout: 60_000 });
  const cd = String(res.headers["content-disposition"] ?? "");
  const fileName = /filename="([^"]+)"/.exec(cd)?.[1] ?? "resume.pdf";
  return { blob: res.data as Blob, fileName, pages: Number(res.headers["x-resume-pages"] ?? 0) };
}
export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Phase 11: ATS readiness ──────────────────────────────────────────────────

export const ATS_CATEGORY_KEYS = ["keywords", "skills", "structure", "relevance", "readability", "formatting", "contact"] as const;
export type AtsCategoryKey = (typeof ATS_CATEGORY_KEYS)[number];

export interface AtsCategory { key: AtsCategoryKey; label: string; weight: number; score: number | null; applicable: boolean; pointsEarned: number; pointsLost: number; explanation: string }
export interface AtsAutoFix { kind: AutoFixKind; label: string; sectionId?: string; value?: string }
export interface AtsFinding {
  id: string; rank?: number; category: AtsCategoryKey; priority: Priority; title: string; issue: string; why: string; action: string;
  sectionId: string | null; entryId: string | null; field: string | null; autoFix: AtsAutoFix | null;
}
export interface AtsAssessment {
  method: string; mode: "general" | "job"; modeLabel: string; overall: number; label: string;
  jobTitle: string | null; targetRole: string | null; templateId: TemplateId; atsSafeRender: boolean;
  categories: AtsCategory[]; findings: AtsFinding[]; actionPlan: AtsFinding[];
  headroom: Array<{ key: AtsCategoryKey; label: string; pointsAvailable: number; score: number }>;
  keywordCoverage: { total: number; found: string[]; missing: string[]; percent: number; requiredMissing: string[]; detail: Array<{ name: string; priority: string | null; evidence: "demonstrated" | "listed" | "absent" }> } | null;
  skills: { listed: string[]; demonstrated: string[]; listedNotDemonstrated: string[]; roleBaseline: { role: string; total: number; covered: number; missing: string[] } | null };
  sectionCompleteness: Array<{ type: SectionType; label: string; present: boolean; filled: boolean; required: boolean; sectionId: string | null }>;
  formattingIssues: Array<{ issue: string; detail: string }>;
  parsingGuarantees: string[];
  counts: { words: number; bullets: number; entries: number; sections: number };
  weights: Record<AtsCategoryKey, number>;
  disclaimer: string; checkedAt: string;
}
export interface AtsCheckResult {
  ats: AtsAssessment; assessmentId: string | null;
  previous: { id: string; overallScore: number; label: string; createdAt: string } | null;
  delta: number | null;
  quality: { overall: number; label: string; method: string };
  scoreGuide: string; versionId: string; jobDescriptionId: string | null;
}
export interface AtsHistory {
  versionId: string;
  assessments: Array<{ id: string; versionId: string; jobDescriptionId: string | null; mode: "general" | "job"; overallScore: number; label: string; jobTitle: string | null; targetRole: string | null; templateId: string | null; categories: AtsCategory[]; keywordCoverage: AtsAssessment["keywordCoverage"]; method: string; createdAt: string }>;
  trend: { general: Array<{ at: string; score: number }>; job: Array<{ at: string; score: number }> };
  note: string;
}

export interface AtsCheckInput { jobDescriptionId?: string; jobDescription?: string; jobTitle?: string; companyName?: string; analysisId?: string; targetRole?: string; weights?: Partial<Record<AtsCategoryKey, number>>; save?: boolean; saveJobDescription?: boolean }

export async function atsCheck(versionId: string, input: AtsCheckInput = {}): Promise<AtsCheckResult> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/ats-check`, input);
  return data;
}
export async function atsHistory(versionId: string, params: { mode?: "general" | "job"; limit?: number } = {}): Promise<AtsHistory> {
  const { data } = await api.get(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/ats-history`, { params });
  return data;
}

// ─── Phase 11: validation and safe fixes ──────────────────────────────────────

export const AUTO_FIX_KINDS = ["dedupe_skills", "dedupe_bullets", "normalise_dates", "fix_current_dates", "strip_symbols", "trim_whitespace", "fix_spelling", "rename_heading", "hide_empty_sections"] as const;
export type AutoFixKind = (typeof AUTO_FIX_KINDS)[number];

export interface ValidationIssue {
  id: string; category: string; severity: Priority; title: string; detail: string; action: string;
  sectionId: string | null; entryId: string | null; field: string | null;
  autoFix: AtsAutoFix | null; needsUserInput?: boolean; question?: string;
}
export interface ValidationReport {
  method: string; issues: ValidationIssue[]; bySection: Record<string, string[]>;
  counts: { total: number; high: number; medium: number; low: number; autoFixable: number; needsUserInput: number };
  availableFixes: Array<{ kind: AutoFixKind; label: string; description: string; preview: string }>;
  notes: string[]; checkedAt: string;
}
export interface ApplyFixResult {
  changed: boolean; summary: string; version: ResumeVersion;
  scoreBefore: number | null; scoreAfter: number | null;
  fix: { kind: AutoFixKind; label: string; description: string };
}

export async function validateResume(versionId: string, input: { jobDescriptionId?: string; targetRole?: string } = {}): Promise<{ validation: ValidationReport; versionId: string }> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/validate`, input);
  return data;
}
export async function applyFix(versionId: string, input: { kind: AutoFixKind; sectionId?: string; value?: string }): Promise<ApplyFixResult> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/apply-fix`, input);
  return data;
}

// ─── Phase 11: role recommendations ───────────────────────────────────────────

export interface RoleCard {
  id: string; title: string; family: string; summary: string; suitability: number; band: string; isPreferred: boolean;
  components: Array<{ key: string; label: string; weight: number; score: number }>;
  matchingSkills: string[]; skillsNeedingEvidence: string[]; skillsToDevelop: Array<{ name: string; learningInProgress: boolean }>;
  relevantProjects: Array<{ sectionId: string; entryId: string; name: string; matchedSkills: string[] }>;
  relevantExperience: Array<{ sectionId: string; entryId: string; name: string; matchedSkills: string[] }>;
  recommendedTemplateId: TemplateId; recommendedSectionOrder: SectionType[];
  learningTasks: Array<{ skillName: string; isCore: boolean; inProgress: boolean; why: string; resources: Array<{ title: string; url: string | null; resourceType: string; provider: string; description: string }> }>;
  reasons: string[]; careerLevel: string;
}
export interface RoleRecommendations {
  method: string; roles: RoleCard[]; considered: number;
  belowThreshold: Array<{ title: string; suitability: number }>;
  minSuitability: number; weights: Record<string, number>; careerLevel: string;
  evidenceNote: string; disclaimer: string; generatedAt: string;
  recommendationId: string | null; versionId: string; currentTargetRoles: string[];
  inputsUsed: { resumeContent: boolean; careerProfile: boolean; learningProgress: boolean; note: string };
}

export async function roleRecommendations(versionId: string, input: { limit?: number; save?: boolean } = {}): Promise<RoleRecommendations> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/role-recommendations`, input);
  return data;
}
export async function selectTargetRole(versionId: string, input: { role: string; recommendationId?: string | null; applyTemplate?: boolean; applySectionOrder?: boolean }): Promise<{ targetRole: string; targetRoles: string[]; version: ResumeVersion; applied: { template: boolean; sectionOrder: boolean }; readOnlySkipped: string | null }> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/target-role`, { ...input, recommendationId: input.recommendationId ?? undefined });
  return data;
}

// ─── Phase 11: writing assistant ──────────────────────────────────────────────

export const ASSISTANT_INTENTS = [
  { key: "improve_summary", label: "Improve my professional summary", sectionTypes: ["summary"] },
  { key: "improve_text", label: "Make this more professional", sectionTypes: null },
  { key: "rewrite_clearly", label: "Rewrite this clearly", sectionTypes: null },
  { key: "describe_contribution", label: "Help me describe my contribution", sectionTypes: ["experience", "projects"] },
  { key: "suggest_skills", label: "Suggest skills for my target role", sectionTypes: ["skills"] },
  { key: "preserve_meaning", label: "Improve the wording, keep the meaning", sectionTypes: null },
  { key: "suggest_questions", label: "What should I answer to strengthen this?", sectionTypes: null },
  { key: "explain_weakness", label: "Why does this section need work?", sectionTypes: null },
  { key: "freeform", label: "Ask something else", sectionTypes: null },
] as const;
export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number]["key"];

export interface AssistantDraft {
  sectionId: string; entryId: string | null; field: string;
  originalText: string; text: string; rationale: string;
  needsConfirmation: boolean; confirmationQuestion: string | null;
}
export interface AssistantReply {
  method: string; intent: AssistantIntent; answer: string;
  drafts: AssistantDraft[]; questions: string[];
  evidencedSkills: string[]; skillsToLearn: string[];
  rejectedDrafts: Array<{ key: string; reason: string }>;
  note: string; versionId: string;
  intents: Array<{ key: AssistantIntent; label: string; sectionTypes: string[] | null }>;
}

export async function askAssistant(versionId: string, input: {
  intent: AssistantIntent; question?: string; sectionId?: string; entryId?: string; field?: string;
  targetRole?: string; jobDescriptionId?: string; history?: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<AssistantReply> {
  const { data } = await api.post(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/assistant`, input, { timeout: AI_TIMEOUT_MS });
  return data;
}

/** Client-side helpers mirroring the backend content schema. */
export const newId = (prefix = "s") => `${prefix}_${Math.random().toString(16).slice(2, 12)}`;
export function emptySection(type: SectionType, title?: string): ResumeSection {
  const base = { id: newId(), title: title ?? SECTION_LABELS[type], visible: true };
  switch (type) {
    case "summary": return { ...base, type, text: "" };
    case "skills": return { ...base, type, groups: [] };
    case "experience": return { ...base, type, entries: [] };
    case "projects": return { ...base, type, entries: [] };
    case "education": return { ...base, type, entries: [] };
    case "certifications": return { ...base, type, entries: [] };
    default: return { ...base, type, items: [] };
  }
}
/** Target of a field-level edit, matching the backend's sectionId/entryId/field addressing. */
export interface FieldTarget { sectionId: string; entryId?: string | null; field: string }

/**
 * Mirror of the backend's applyTextField: returns a copy of `content` with one
 * addressed field replaced, or null when the target no longer exists (a section
 * deleted since a suggestion was generated). Used to insert assistant drafts;
 * accepted suggestions are applied server-side instead.
 */
export function applyTextField(content: ResumeContent, { sectionId, entryId, field }: FieldTarget, text: string): ResumeContent | null {
  const next: ResumeContent = JSON.parse(JSON.stringify(content));
  const section = next.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  if (field === "summary" && section.type === "summary") { section.text = text; return next; }
  if (field === "skills" && section.type === "skills") {
    const group = section.groups.find((g) => g.id === entryId);
    if (!group) return null;
    group.items = text.split(/,|\n/).map((x) => x.trim()).filter(Boolean).slice(0, 60);
    return next;
  }
  const [kind, idxRaw] = field.split(":");
  const idx = Number(idxRaw);
  if (kind === "bullet" && (section.type === "experience" || section.type === "projects")) {
    const entry = section.entries.find((e) => e.id === entryId);
    if (!entry || !Array.isArray(entry.bullets) || idx >= entry.bullets.length) return null;
    entry.bullets[idx] = text;
    return next;
  }
  if (kind === "detail" && section.type === "education") {
    const entry = section.entries.find((e) => e.id === entryId);
    if (!entry || !Array.isArray(entry.details) || idx >= entry.details.length) return null;
    entry.details[idx] = text;
    return next;
  }
  if (kind === "item" && (section.type === "achievements" || section.type === "languages" || section.type === "custom")) {
    if (!Array.isArray(section.items) || idx >= section.items.length) return null;
    section.items[idx] = text;
    return next;
  }
  return null;
}

/** Human label for a field target, for "applied to Work experience → Acme" messages. */
export function describeTarget(content: ResumeContent, { sectionId, entryId, field }: FieldTarget): string {
  const section = content.sections.find((s) => s.id === sectionId);
  if (!section) return "a section that no longer exists";
  let entryLabel = "";
  if (section.type === "experience") entryLabel = section.entries.find((e) => e.id === entryId)?.role ?? "";
  else if (section.type === "projects") entryLabel = section.entries.find((e) => e.id === entryId)?.name ?? "";
  else if (section.type === "education") entryLabel = section.entries.find((e) => e.id === entryId)?.degree ?? "";
  else if (section.type === "skills") entryLabel = section.groups.find((g) => g.id === entryId)?.name ?? "";
  const n = Number(field.split(":")[1]);
  const position = Number.isFinite(n) ? ` · item ${n + 1}` : "";
  return [section.title, entryLabel].filter(Boolean).join(" → ") + position;
}

export function sectionIsEmpty(s: ResumeSection): boolean {
  switch (s.type) {
    case "summary": return !s.text?.trim();
    case "skills": return !s.groups.some((g) => g.items.length);
    case "experience": case "projects": case "education": case "certifications": return s.entries.length === 0;
    default: return s.items.length === 0;
  }
}
