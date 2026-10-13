"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, PlusCircle, History, Trash2, Download, Save, Pencil, Check, X, Building2, Calendar, Briefcase } from "lucide-react";
import Button from "@/components/common/Button";
import DemoNotice from "@/components/job-analysis/DemoNotice";
import JobOverviewCard, { formatEducation, formatExperience } from "@/components/job-analysis/JobOverviewCard";
import SkillCategorySection from "@/components/job-analysis/SkillCategorySection";
import RequiredPreferredSkills from "@/components/job-analysis/RequiredPreferredSkills";
import ExperienceEducationCard from "@/components/job-analysis/ExperienceEducationCard";
import ResponsibilitiesList from "@/components/job-analysis/ResponsibilitiesList";
import KeywordAnalysisCard from "@/components/job-analysis/KeywordAnalysisCard";
import ResumeSkillComparison from "@/components/job-analysis/ResumeSkillComparison";
import { formatDate } from "@/lib/utils";
import {
  createManualSkill,
  type EducationRequirement,
  type ExperienceRequirement,
  type JobAnalysis,
  type JobSkill,
  type SkillPriority,
} from "@/services/jobDescriptionParser";
import type { SkillCategory } from "@/services/skillDictionary";
import {
  deleteJobAnalysis,
  getJobAnalysisById,
  loadSessionResumeSkills,
  renameJobAnalysis,
  saveJobAnalysis,
  saveSessionResumeSkills,
  clearSessionResumeSkills,
} from "@/services/jobAnalysisStorage";
import type { ResumeSkillSnapshot } from "@/services/skillComparisonService";

type LoadState = "loading" | "ready" | "not-found";

export default function JobAnalysisResultsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.jobId as string;

  const [analysis, setAnalysis] = useState<JobAnalysis | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [resume, setResume] = useState<ResumeSkillSnapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const data = getJobAnalysisById(jobId);
    if (!data) {
      setLoadState("not-found");
      return;
    }
    setAnalysis(data);
    setResume(loadSessionResumeSkills());
    setLoadState("ready");
  }, [jobId]);

  // ── Persist edits (debounced) ─────────────────────────────────────────────
  const persist = useCallback((next: JobAnalysis, immediate = false) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const run = () => {
      const res = saveJobAnalysis(next);
      if (res.ok) {
        setDirty(false);
        setSaveMsg({ type: "ok", text: "Changes saved" });
      } else {
        setSaveMsg({ type: "error", text: res.error ?? "Could not save changes." });
      }
      setTimeout(() => setSaveMsg(null), 2500);
    };
    if (immediate) run();
    else saveTimer.current = setTimeout(run, 700);
  }, []);

  const update = useCallback(
    (mutator: (prev: JobAnalysis) => JobAnalysis) => {
      setAnalysis((prev) => {
        if (!prev) return prev;
        const next = mutator(prev);
        setDirty(true);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  // ── Skill editing ─────────────────────────────────────────────────────────
  const handleAddSkill = useCallback(
    (name: string, category: SkillCategory, priority: SkillPriority): string | null => {
      const trimmed = name.trim();
      if (trimmed.length < 2) return "Skill name must be at least 2 characters.";
      if (!analysis) return "Analysis not loaded.";
      if (analysis.skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) return "That skill is already in the list.";
      update((prev) => ({ ...prev, skills: [...prev.skills, createManualSkill(trimmed, category, priority)] }));
      return null;
    },
    [analysis, update]
  );

  const handleRemoveSkill = useCallback((id: string) => update((prev) => ({ ...prev, skills: prev.skills.filter((s) => s.id !== id) })), [update]);

  const patchSkill = useCallback(
    (id: string, patch: Partial<JobSkill>) => update((prev) => ({ ...prev, skills: prev.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    [update]
  );

  const handleChangeCategory = useCallback((id: string, category: SkillCategory) => patchSkill(id, { category }), [patchSkill]);
  const handleChangePriority = useCallback(
    (id: string, priority: SkillPriority) => patchSkill(id, { priority, priorityInferred: false, priorityEvidence: "Set manually by you." }),
    [patchSkill]
  );

  const handleUpdateExperience = useCallback(
    (patch: Partial<ExperienceRequirement>) => update((prev) => ({ ...prev, experience: { ...prev.experience, ...patch } })),
    [update]
  );
  const handleUpdateEducation = useCallback(
    (patch: Partial<EducationRequirement>) => update((prev) => ({ ...prev, education: { ...prev.education, ...patch } })),
    [update]
  );

  // ── Resume comparison ─────────────────────────────────────────────────────
  const handleResumeChange = useCallback((snapshot: ResumeSkillSnapshot | null) => {
    setResume(snapshot);
    if (snapshot) saveSessionResumeSkills(snapshot);
    else clearSessionResumeSkills();
  }, []);

  const handleOverride = useCallback(
    (skillName: string, has: boolean | null) =>
      update((prev) => {
        const key = skillName.toLowerCase();
        const confirmed = prev.confirmedResumeSkills.filter((n) => n.toLowerCase() !== key);
        const rejected = prev.rejectedResumeSkills.filter((n) => n.toLowerCase() !== key);
        if (has === true) confirmed.push(skillName);
        if (has === false) rejected.push(skillName);
        return { ...prev, confirmedResumeSkills: confirmed, rejectedResumeSkills: rejected };
      }),
    [update]
  );

  // ── Header actions ────────────────────────────────────────────────────────
  function handleSaveNow() {
    if (analysis) persist(analysis, true);
  }

  function handleDelete() {
    if (!analysis) return;
    if (!confirm(`Delete "${analysis.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = deleteJobAnalysis(analysis.id);
    if (!res.ok) {
      setDeleting(false);
      setSaveMsg({ type: "error", text: res.error ?? "Could not delete." });
      return;
    }
    router.push("/dashboard/job-history");
  }

  function commitRename() {
    if (!analysis) return;
    const res = renameJobAnalysis(analysis.id, nameDraft);
    if (!res.ok) {
      setSaveMsg({ type: "error", text: res.error ?? "Could not rename." });
      return;
    }
    setAnalysis({ ...analysis, name: nameDraft.trim() });
    setRenaming(false);
    setSaveMsg({ type: "ok", text: "Renamed" });
    setTimeout(() => setSaveMsg(null), 2000);
  }

  function handleExport() {
    if (!analysis) return;
    const byPriority = (p: SkillPriority) => analysis.skills.filter((s) => s.priority === p).map((s) => `  - ${s.name} (${s.category})${s.priorityInferred ? " [inferred]" : ""}`);
    const lines = [
      "JOB DESCRIPTION ANALYSIS — DEMO (RULE-BASED)",
      "=".repeat(50),
      "This report was generated by keyword matching, not by an AI model.",
      "",
      `Name:         ${analysis.name}`,
      `Job Title:    ${analysis.jobTitle}`,
      `Company:      ${analysis.companyName ?? "Not specified"}`,
      `Target Role:  ${analysis.targetRole}`,
      `Analyzed:     ${formatDate(analysis.createdAt)}`,
      `Experience:   ${formatExperience(analysis.experience)}${analysis.experience.seniority ? ` · ${analysis.experience.seniority}` : ""}`,
      `Education:    ${formatEducation(analysis.education)}`,
      "",
      "REQUIRED SKILLS", ...(byPriority("required").length ? byPriority("required") : ["  (none)"]), "",
      "PREFERRED SKILLS", ...(byPriority("preferred").length ? byPriority("preferred") : ["  (none)"]), "",
      "UNCLEAR PRIORITY", ...(byPriority("unclear").length ? byPriority("unclear") : ["  (none)"]), "",
      "CERTIFICATIONS", ...(analysis.certifications.length ? analysis.certifications.map((c) => `  - ${c}`) : ["  Not specified"]), "",
      "RESPONSIBILITIES", ...(analysis.responsibilities.length ? analysis.responsibilities.map((r) => `  [${r.type}] ${r.text}`) : ["  Not detected"]), "",
      "KEYWORDS (exact matches)",
      `  Technical: ${analysis.keywords.technical.map((k) => k.term).join(", ") || "—"}`,
      `  Role terms: ${analysis.keywords.roleTerms.map((k) => k.term).join(", ") || "—"}`,
      `  Action words: ${analysis.keywords.actionWords.map((k) => k.term).join(", ") || "—"}`,
      "",
      "PARSER NOTES", ...(analysis.warnings.length ? analysis.warnings.map((w) => `  - ${w}`) : ["  None"]),
      "",
      "=".repeat(50),
      "Generated by ResumeAI · Demo analysis only",
    ];
    try {
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `job-analysis-demo-${analysis.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setSaveMsg({ type: "ok", text: "Report downloaded as .txt" });
    } catch {
      setSaveMsg({ type: "error", text: "Export failed — please try again." });
    }
    setTimeout(() => setSaveMsg(null), 3000);
  }

  // ── States ────────────────────────────────────────────────────────────────
  if (loadState === "not-found") {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Job analysis not found</h2>
        <p className="text-gray-500 mt-3 text-sm">
          It may have been deleted, the link may be invalid, or the saved record could not be read.
          Demo analyses live in this browser&apos;s local storage.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Link href="/dashboard/job-analyzer" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm">
            <PlusCircle className="w-4 h-4" /> Analyze a Job
          </Link>
          <Link href="/dashboard/job-history" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
            <History className="w-4 h-4" /> Saved Jobs
          </Link>
        </div>
      </div>
    );
  }

  if (loadState === "loading" || !analysis) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <svg className="animate-spin w-5 h-5 mr-3 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading job analysis…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <Link href="/dashboard/job-history" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to saved jobs
      </Link>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            {renaming ? (
              <form onSubmit={(e) => { e.preventDefault(); commitRename(); }} className="flex items-center gap-2">
                <input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={80} aria-label="Analysis name" className="text-xl font-bold text-gray-900 px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0" />
                <Button type="submit" size="sm" aria-label="Save name"><Check className="w-4 h-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)} aria-label="Cancel"><X className="w-4 h-4" /></Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 truncate">{analysis.name}</h1>
                <button type="button" onClick={() => { setNameDraft(analysis.name); setRenaming(true); }} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label="Rename analysis">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
              {analysis.name !== analysis.jobTitle && <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" />{analysis.jobTitle}</span>}
              {analysis.companyName && <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{analysis.companyName}</span>}
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{formatDate(analysis.createdAt)}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-medium">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" /> Demo analysis · rule-based
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveNow} disabled={!dirty}>
              <Save className="w-4 h-4" /> {dirty ? "Save changes" : "Saved"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}><Download className="w-4 h-4" /> Export</Button>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}><Trash2 className="w-4 h-4" /> Delete</Button>
          </div>
        </div>
        {saveMsg && (
          <p role="status" className={`mt-3 text-xs rounded-lg px-3 py-1.5 border ${saveMsg.type === "ok" ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200"}`}>
            {saveMsg.text}
          </p>
        )}
      </div>

      <DemoNotice>
        Skills, requirements and keywords were extracted with rule-based matching against a built-in dictionary.
        Edits you make (adding, removing or re-classifying skills; confirming experience and education) are saved automatically to this browser.
      </DemoNotice>

      <JobOverviewCard analysis={analysis} />

      <SkillCategorySection
        skills={analysis.skills}
        onAddSkill={handleAddSkill}
        onChangeCategory={handleChangeCategory}
        onChangePriority={handleChangePriority}
        onRemove={handleRemoveSkill}
      />

      <RequiredPreferredSkills
        skills={analysis.skills}
        onChangeCategory={handleChangeCategory}
        onChangePriority={handleChangePriority}
        onRemove={handleRemoveSkill}
      />

      <ExperienceEducationCard
        experience={analysis.experience}
        education={analysis.education}
        certifications={analysis.certifications}
        onUpdateExperience={handleUpdateExperience}
        onUpdateEducation={handleUpdateEducation}
      />

      <ResponsibilitiesList
        responsibilities={analysis.responsibilities}
        requiredQualifications={analysis.requiredQualifications}
        preferredQualifications={analysis.preferredQualifications}
      />

      <KeywordAnalysisCard keywords={analysis.keywords} />

      <ResumeSkillComparison
        jobSkills={analysis.skills}
        resume={resume}
        confirmed={analysis.confirmedResumeSkills}
        rejected={analysis.rejectedResumeSkills}
        onResumeChange={handleResumeChange}
        onOverride={handleOverride}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-gray-200">
        <Link href="/dashboard/job-analyzer" className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm">
          <PlusCircle className="w-4 h-4" /> Analyze Another Job
        </Link>
        <Link href="/dashboard/job-history" className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
          <History className="w-4 h-4" /> Saved Jobs
        </Link>
        <Link href="/dashboard/resume-analyzer" className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors text-sm">
          <Briefcase className="w-4 h-4" /> Resume Analyzer
        </Link>
      </div>
    </div>
  );
}
