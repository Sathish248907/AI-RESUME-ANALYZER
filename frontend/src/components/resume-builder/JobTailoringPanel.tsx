"use client";

import { useEffect, useState } from "react";
import { Target, Info, Briefcase, Lightbulb } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import SuggestionList from "./SuggestionList";
import { listJobDescriptions, type SavedJobDescription } from "@/services/jobDescriptionService";
import { listAnalysisHistory, type AnalysisHistoryItem } from "@/services/analysisHistoryService";
import type { ResumeContent, Suggestion, TailorResult } from "@/services/resumeBuilderService";

interface Props {
  content: ResumeContent;
  version: { jobDescriptionId: string | null; targetJobTitle: string | null; targetCompany: string | null; isOriginal: boolean };
  suggestions: Suggestion[];
  lastResult: TailorResult | null;
  busy: boolean;
  busyId: string | null;
  aiConfigured: boolean | null;
  onTailor: (input: { jobDescriptionId?: string; jobDescription?: string; jobTitle?: string; companyName?: string; analysisId?: string; saveJobDescription?: boolean }) => Promise<void>;
  onResolve: (s: Suggestion, action: "accept" | "reject" | "edit" | "reset", text?: string) => Promise<void>;
  onLocate: (s: Suggestion) => void;
}

export default function JobTailoringPanel({ content, version, suggestions, lastResult, busy, busyId, aiConfigured, onTailor, onResolve, onLocate }: Props) {
  const [mode, setMode] = useState<"saved" | "paste">("saved");
  const [jds, setJds] = useState<SavedJobDescription[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [jobDescriptionId, setJobDescriptionId] = useState(version.jobDescriptionId ?? "");
  const [analysisId, setAnalysisId] = useState("");
  const [pasted, setPasted] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [save, setSave] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    (async () => {
      const [j, a] = await Promise.allSettled([listJobDescriptions({ limit: 100 }), listAnalysisHistory({ mode: "ai", limit: 25 })]);
      if (j.status === "fulfilled") { setJds(j.value.jobDescriptions); if (!j.value.jobDescriptions.length) setMode("paste"); }
      if (a.status === "fulfilled") setAnalyses(a.value.analyses);
    })();
  }, []);

  const relatedAnalyses = analyses.filter((a) => !jobDescriptionId || a.jobDescriptionId === jobDescriptionId);
  const sectionTitle = (id: string) => content.sections.find((s) => s.id === id)?.title ?? "Section";
  const visible = suggestions.filter((s) => s.mode === "tailor" && (showResolved || s.status === "pending"));
  const canRun = mode === "saved" ? Boolean(jobDescriptionId) : pasted.trim().length >= 50;

  return (
    <div className="space-y-4 text-sm">
      {version.isOriginal ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">The original version is read-only. Duplicate it into a working version to tailor it.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          {(version.targetJobTitle || version.jobDescriptionId) && <p className="text-xs text-gray-600 inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Currently targeting <strong className="ml-1">{version.targetJobTitle ?? "a saved job description"}</strong>{version.targetCompany ? ` at ${version.targetCompany}` : ""}</p>}
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setMode("saved")} className={`px-3 py-1.5 rounded-lg border ${mode === "saved" ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200"}`}>Saved job description</button>
            <button type="button" onClick={() => setMode("paste")} className={`px-3 py-1.5 rounded-lg border ${mode === "paste" ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-gray-200"}`}>Paste a new one</button>
          </div>
          {mode === "saved" ? (
            <select value={jobDescriptionId} onChange={(e) => setJobDescriptionId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Select a job description…</option>
              {jds.map((j) => <option key={j.id} value={j.id}>{j.jobTitle}{j.companyName ? ` · ${j.companyName}` : ""}</option>)}
            </select>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Job title" maxLength={120} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company (optional)" maxLength={120} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} maxLength={20000} placeholder="Paste the job description…" className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
              <label className="text-xs inline-flex items-center gap-1 text-gray-600"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save it to my job descriptions</label>
            </div>
          )}
          {relatedAnalyses.length > 0 && (
            <label className="block text-xs"><span className="font-medium text-gray-700">Use an existing AI match analysis (optional)</span>
              <select value={analysisId} onChange={(e) => setAnalysisId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"><option value="">None</option>{relatedAnalyses.map((a) => <option key={a.id} value={a.id}>{a.jobTitle} — {a.matchScore}% ({new Date(a.createdAt).toLocaleDateString()})</option>)}</select></label>
          )}
          <Button onClick={() => onTailor(mode === "saved" ? { jobDescriptionId, analysisId: analysisId || undefined } : { jobDescription: pasted.trim(), jobTitle: jobTitle.trim() || undefined, companyName: companyName.trim() || undefined, analysisId: analysisId || undefined, saveJobDescription: save })} loading={busy} disabled={!canRun || aiConfigured === false}><Target className="w-4 h-4 mr-1" /> Tailor to this job</Button>
          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1"><Info className="w-3 h-3 mt-0.5 shrink-0" /> Tailoring rewords what you already have for this role. Keywords are only suggested where your resume supports them; everything else is listed as a genuine skill gap, never written into the resume.</p>
        </div>
      )}
      {lastResult && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs space-y-2">
          <p className="font-semibold text-indigo-900 inline-flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> {lastResult.target.jobTitle ?? "Target job"}{lastResult.target.companyName ? ` · ${lastResult.target.companyName}` : ""}</p>
          {lastResult.keywordsToAdd.length > 0 && <p><span className="font-medium">Keywords your resume supports but phrases differently:</span> {lastResult.keywordsToAdd.map((k) => <Badge key={k} variant="success" className="ml-1">{k}</Badge>)}</p>}
          {lastResult.genuineGaps.length > 0 && <p><span className="font-medium">Genuine gaps (not added — consider the learning roadmap):</span> {lastResult.genuineGaps.map((k) => <Badge key={k} variant="error" className="ml-1">{k}</Badge>)}</p>}
          {lastResult.emphasise.length > 0 && <ul className="list-disc pl-4">{lastResult.emphasise.map((e, i) => <li key={i}><strong>{sectionTitle(e.sectionId)}</strong>: {e.reason}</li>)}</ul>}
          {lastResult.generalNotes.length > 0 && <ul className="list-disc pl-4">{lastResult.generalNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">{visible.filter((s) => s.status === "pending").length} pending tailoring suggestion{visible.filter((s) => s.status === "pending").length === 1 ? "" : "s"}</p>
        <label className="text-xs inline-flex items-center gap-1 text-gray-600"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> show resolved</label>
      </div>
      <SuggestionList suggestions={visible} busyId={busyId} onResolve={onResolve} onLocate={onLocate} sectionTitle={sectionTitle} />
    </div>
  );
}
