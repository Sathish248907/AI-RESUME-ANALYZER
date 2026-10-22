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
export const TEMPLATE_IDS = ["modern", "minimal_ats", "technical", "classic"] as const;
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

export interface Formatting { fontFamily: (typeof FONT_FAMILIES)[number]; fontSize: number; accentColor: string; margins: (typeof MARGINS)[number]; sectionSpacing: (typeof SPACINGS)[number]; headingStyle: (typeof HEADING_STYLES)[number]; bulletStyle: (typeof BULLET_STYLES)[number]; pageSize: "A4"; layout: "single" | "multi" }
export interface Template { id: TemplateId; name: string; description: string; defaults: Partial<Formatting> }

export type VersionKind = "original" | "improved" | "tailored" | "custom" | "restored";
export interface ResumeVersionSummary {
  id: string; resumeId: string | null; resume: { id: string; name: string; originalFileName: string } | null; jobDescriptionId: string | null; jobDescription: { id: string; jobTitle: string; companyName: string | null } | null;
  parentVersionId: string | null; name: string; versionNumber: number; kind: VersionKind; isOriginal: boolean; templateId: TemplateId; contentSource: string; targetJobTitle: string | null; targetCompany: string | null; lastQualityScore: number | null; createdAt: string; updatedAt: string;
}
export interface ResumeVersion extends ResumeVersionSummary { content: ResumeContent; formatting: Formatting }

export type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";
export interface Suggestion {
  id: string; versionId: string; batchId: string; mode: "improve" | "tailor"; sectionId: string; entryId: string | null; field: string; category: string;
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
export async function listSuggestions(versionId: string, params: { status?: SuggestionStatus; batchId?: string } = {}): Promise<Suggestion[]> { const { data } = await api.get(`/api/resume-builder/versions/${encodeURIComponent(versionId)}/improvements`, { params }); return data.suggestions; }
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
export function sectionIsEmpty(s: ResumeSection): boolean {
  switch (s.type) {
    case "summary": return !s.text?.trim();
    case "skills": return !s.groups.some((g) => g.items.length);
    case "experience": case "projects": case "education": case "certifications": return s.entries.length === 0;
    default: return s.items.length === 0;
  }
}
