/**
 * jobAnalysisStorage.ts
 * Persists demo job description analyses to localStorage and keeps a
 * session-scoped snapshot of resume skills (names only) for comparison.
 *
 * Resume text is never stored. Corrupted or unrecognised records are skipped
 * rather than crashing the UI.
 */

import {
  MAX_DESCRIPTION_LENGTH,
  type JobAnalysis,
} from "./jobDescriptionParser";
import type { ResumeSkillSnapshot } from "./skillComparisonService";

const STORAGE_KEY = "resumeai_job_analyses_v1";
const RESUME_SKILLS_KEY = "resumeai_session_resume_skills_v1";
const MAX_STORED = 30;

export interface JobAnalysisMeta {
  id: string;
  name: string;
  jobTitle: string;
  companyName: string | null;
  targetRole: string;
  createdAt: string;
  updatedAt: string;
  skillCount: number;
  requiredSkillCount: number;
  minYears: number | null;
  isDemoAnalysis: true;
}

export interface StorageResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Shape check so a corrupted record cannot break the UI. */
function isValidRecord(value: unknown): value is JobAnalysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.jobTitle === "string" &&
    typeof v.createdAt === "string" &&
    Array.isArray(v.skills) &&
    Array.isArray(v.responsibilities) &&
    typeof v.experience === "object" &&
    typeof v.education === "object" &&
    typeof v.keywords === "object"
  );
}

/** Fill in fields that older records may lack. */
function normalize(record: JobAnalysis): JobAnalysis {
  return {
    ...record,
    isDemoAnalysis: true,
    name: record.name || record.jobTitle,
    updatedAt: record.updatedAt || record.createdAt,
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    certifications: Array.isArray(record.certifications) ? record.certifications : [],
    requiredQualifications: Array.isArray(record.requiredQualifications) ? record.requiredQualifications : [],
    preferredQualifications: Array.isArray(record.preferredQualifications) ? record.preferredQualifications : [],
    confirmedResumeSkills: Array.isArray(record.confirmedResumeSkills) ? record.confirmedResumeSkills : [],
    rejectedResumeSkills: Array.isArray(record.rejectedResumeSkills) ? record.rejectedResumeSkills : [],
  };
}

function readAll(): { records: JobAnalysis[]; skipped: number } {
  if (!hasWindow()) return { records: [], skipped: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], skipped: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { records: [], skipped: 1 };
    const records: JobAnalysis[] = [];
    let skipped = 0;
    for (const item of parsed) {
      if (isValidRecord(item)) records.push(normalize(item));
      else skipped += 1;
    }
    return { records, skipped };
  } catch {
    return { records: [], skipped: 1 };
  }
}

function writeAll(records: JobAnalysis[]): StorageResult<void> {
  if (!hasWindow()) return { ok: false, error: "Storage is not available in this environment." };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_STORED)));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    return { ok: false, error: quota ? "Browser storage is full. Delete older analyses and try again." : "Could not save to browser storage." };
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function saveJobAnalysis(analysis: JobAnalysis): StorageResult<JobAnalysis> {
  const { records } = readAll();
  const toSave: JobAnalysis = {
    ...analysis,
    description: analysis.description.slice(0, MAX_DESCRIPTION_LENGTH),
    updatedAt: new Date().toISOString(),
  };
  const others = records.filter((r) => r.id !== analysis.id);
  const result = writeAll([toSave, ...others]);
  return result.ok ? { ok: true, data: toSave } : { ok: false, error: result.error };
}

export function getJobAnalysisById(id: string): JobAnalysis | null {
  if (!id) return null;
  return readAll().records.find((r) => r.id === id) ?? null;
}

export function getAllJobAnalyses(): JobAnalysis[] {
  return readAll().records.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Number of stored records that failed validation on the last read. */
export function getCorruptedRecordCount(): number {
  return readAll().skipped;
}

export function getJobAnalysisMetas(): JobAnalysisMeta[] {
  return getAllJobAnalyses().map((r) => ({
    id: r.id,
    name: r.name,
    jobTitle: r.jobTitle,
    companyName: r.companyName,
    targetRole: r.targetRole,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    skillCount: r.skills.length,
    requiredSkillCount: r.skills.filter((s) => s.priority === "required").length,
    minYears: r.experience?.minYears ?? null,
    isDemoAnalysis: true,
  }));
}

export function renameJobAnalysis(id: string, name: string): StorageResult<void> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name cannot be empty." };
  if (trimmed.length > 80) return { ok: false, error: "Name must be 80 characters or fewer." };
  const { records } = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return { ok: false, error: "Analysis not found." };
  records[idx] = { ...records[idx], name: trimmed, updatedAt: new Date().toISOString() };
  return writeAll(records);
}

export function deleteJobAnalysis(id: string): StorageResult<void> {
  const { records } = readAll();
  return writeAll(records.filter((r) => r.id !== id));
}

export function clearAllJobAnalyses(): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface JobSearchFilters {
  query?: string;
  targetRole?: string;
  priorityOnly?: "required";
  sort?: "newest" | "oldest" | "name" | "skills";
}

export function searchJobAnalyses(filters: JobSearchFilters = {}): JobAnalysisMeta[] {
  const q = filters.query?.trim().toLowerCase() ?? "";
  let list = getJobAnalysisMetas();
  if (filters.targetRole) list = list.filter((m) => m.targetRole === filters.targetRole);
  if (q) {
    const all = getAllJobAnalyses();
    const matchingIds = new Set(
      all
        .filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.jobTitle.toLowerCase().includes(q) ||
            (r.companyName ?? "").toLowerCase().includes(q) ||
            r.skills.some((s) => s.name.toLowerCase().includes(q))
        )
        .map((r) => r.id)
    );
    list = list.filter((m) => matchingIds.has(m.id));
  }
  switch (filters.sort) {
    case "oldest":
      list = [...list].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
      break;
    case "name":
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "skills":
      list = [...list].sort((a, b) => b.skillCount - a.skillCount);
      break;
    default:
      list = [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  return list;
}

/** Aggregate stats for the dashboard. */
export interface JobAnalysisStats {
  total: number;
  topSkills: { name: string; count: number }[];
  recentRoles: string[];
  recent: JobAnalysisMeta[];
}

export function getJobAnalysisStats(limit = 5): JobAnalysisStats {
  const all = getAllJobAnalyses();
  const counts = new Map<string, number>();
  for (const r of all) {
    for (const s of r.skills) {
      if (s.category === "Soft Skills") continue;
      counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
    }
  }
  const topSkills = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  const recentRoles = [...new Set(all.map((r) => r.targetRole))].slice(0, 6);
  return { total: all.length, topSkills, recentRoles, recent: getJobAnalysisMetas().slice(0, limit) };
}

// ─── Session resume skills (names only) ─────────────────────────────────────

export function saveSessionResumeSkills(snapshot: ResumeSkillSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RESUME_SKILLS_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function loadSessionResumeSkills(): ResumeSkillSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RESUME_SKILLS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeSkillSnapshot;
    if (!parsed || typeof parsed.fileName !== "string" || !Array.isArray(parsed.skills)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionResumeSkills(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RESUME_SKILLS_KEY);
  } catch {
    // ignore
  }
}
