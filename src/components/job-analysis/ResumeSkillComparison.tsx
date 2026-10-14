"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { GitCompareArrows, CheckCircle2, CircleDashed, XCircle, HelpCircle, Upload, Trash2, Info, RotateCcw, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import ResumeUploader from "@/components/analyzer/ResumeUploader";
import { cn, formatDate } from "@/lib/utils";
import type { JobSkill } from "@/services/jobDescriptionParser";
import {
  compareSkills,
  extractResumeSkills,
  type ComparisonItem,
  type ComparisonStatus,
  type ResumeSkillSnapshot,
} from "@/services/skillComparisonService";

interface ResumeSkillComparisonProps {
  jobSkills: JobSkill[];
  resume: ResumeSkillSnapshot | null;
  confirmed: string[];
  rejected: string[];
  onResumeChange: (snapshot: ResumeSkillSnapshot | null) => void;
  /** has = true → confirm; false → reject; null → clear override */
  onOverride: (skillName: string, has: boolean | null) => void;
}

const STATUS_META: Record<ComparisonStatus, { title: string; icon: React.ComponentType<{ className?: string }>; color: string; text: string }> = {
  matched: { title: "Matched", icon: CheckCircle2, color: "text-green-600", text: "Found in your resume (or confirmed by you)." },
  partial: { title: "Partially matched", icon: CircleDashed, color: "text-amber-600", text: "A related skill from the dictionary is on your resume." },
  missing: { title: "Missing or unverified", icon: XCircle, color: "text-red-600", text: "Not detected. Could be a real gap or a term the parser missed." },
  review: { title: "Needs manual review", icon: HelpCircle, color: "text-purple-600", text: "Cannot be verified by keyword matching." },
};

export default function ResumeSkillComparison({ jobSkills, resume, confirmed, rejected, onResumeChange, onOverride }: ResumeSkillComparisonProps) {
  const [showUploader, setShowUploader] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  const result = useMemo(() => compareSkills(jobSkills, resume, { confirmed, rejected }), [jobSkills, resume, confirmed, rejected]);

  const handleFileParsed = useCallback(
    (f: File, text: string, count: number) => {
      setFile(f);
      setParsed(true);
      setCharCount(count);
      setParseError(null);
      onResumeChange(extractResumeSkills(text, f.name)); // text is discarded after extraction
      setShowUploader(false);
    },
    [onResumeChange]
  );

  const handleClear = useCallback(() => {
    setFile(null);
    setParsed(false);
    setCharCount(0);
    setParseError(null);
  }, []);

  const overridesCount = confirmed.length + rejected.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrows className="w-5 h-5 text-blue-600" />
              Resume-to-Job Skill Comparison
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {resume ? (
                <>Comparing against skills extracted from <span className="font-medium text-gray-700">{resume.fileName}</span> ({resume.skills.length} skills, {formatDate(resume.extractedAt)}). Only skill names are kept for this browser session.</>
              ) : (
                "No resume skills are available in this session."
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowUploader((s) => !s)}>
              <Upload className="w-4 h-4" /> {resume ? "Replace resume" : "Upload resume"}
            </Button>
            {resume && (
              <Button variant="ghost" size="sm" onClick={() => { onResumeChange(null); handleClear(); }}>
                <Trash2 className="w-4 h-4" /> Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {showUploader && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs text-gray-600">Upload a PDF or DOCX. The file is parsed on the local dev server; only detected skill names are kept.</p>
            <ResumeUploader
              onFileParsed={handleFileParsed}
              onParseError={(m) => { setParseError(m); setParsed(false); }}
              onClear={handleClear}
              currentFile={file}
              parsed={parsed}
              charCount={charCount}
              parseError={parseError}
            />
          </div>
        )}

        {!resume ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Upload a resume to compare</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Upload here, or run the <Link href="/dashboard/resume-analyzer" className="text-blue-600 hover:underline">Resume Analyzer</Link> first — its extracted skills carry over to this session automatically.
            </p>
          </div>
        ) : jobSkills.length === 0 ? (
          <p className="text-sm text-gray-500 italic">Add job skills above to run the comparison.</p>
        ) : (
          <>
            {/* Estimate */}
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4">
              <div className="flex items-end justify-between gap-4 mb-2">
                <div>
                  <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Keyword overlap estimate</p>
                  <p className="text-3xl font-bold text-blue-900 tabular-nums">{result.estimate.percent}%</p>
                </div>
                <p className="text-xs text-blue-800 text-right tabular-nums">
                  {result.estimate.weightedEarned} / {result.estimate.weightedTotal} weighted points
                </p>
              </div>
              <ProgressBar value={result.estimate.percent} barClassName="bg-blue-600" />
              <p className="text-[11px] text-blue-800 mt-2 flex items-start gap-1.5 leading-snug">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                {result.estimate.explanation}
              </p>
            </div>

            {/* Buckets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["matched", "partial", "missing", "review"] as ComparisonStatus[]).map((status) => (
                <Bucket key={status} status={status} items={result[status]} onOverride={onOverride} />
              ))}
            </div>

            {result.extraResumeSkills.length > 0 && (
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-1.5">Also on your resume (not requested by this job)</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.extraResumeSkills.map((s) => (
                    <span key={s} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full border border-gray-200">{s}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400 pt-2 border-t border-gray-100">
              <span>“Missing” never means the skill is definitely absent — the demo parser only knows dictionary terms. Use “I have this” / “I don’t” to correct it.</span>
              {overridesCount > 0 && (
                <button type="button" onClick={() => [...confirmed, ...rejected].forEach((n) => onOverride(n, null))} className="flex items-center gap-1 text-blue-600 hover:underline whitespace-nowrap">
                  <RotateCcw className="w-3 h-3" /> Reset {overridesCount} correction{overridesCount === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Bucket({ status, items, onOverride }: { status: ComparisonStatus; items: ComparisonItem[]; onOverride: (name: string, has: boolean | null) => void }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-1">
        <h4 className={cn("text-sm font-semibold flex items-center gap-1.5", meta.color)}>
          <Icon className="w-4 h-4" /> {meta.title}
        </h4>
        <span className="text-xs text-gray-400 tabular-nums">{items.length}</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2.5">{meta.text}</p>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">None.</p>
      ) : (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map((it) => (
            <li key={it.skill.id} className="flex items-start justify-between gap-2 text-sm bg-gray-50 rounded-lg px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-900">{it.skill.name}</span>
                  <span className={cn("text-[10px] px-1.5 rounded-full border", it.skill.priority === "required" ? "bg-blue-50 text-blue-800 border-blue-200" : it.skill.priority === "preferred" ? "bg-green-50 text-green-800 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200")}>
                    {it.skill.priority}
                  </span>
                  {it.userOverride && <span className="text-[10px] text-gray-500 italic">your correction</span>}
                </div>
                <p className="text-[11px] text-gray-500 leading-snug mt-0.5" title={it.reason}>{it.reason}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {it.userOverride ? (
                  <button type="button" onClick={() => onOverride(it.skill.name, null)} className="text-[11px] text-gray-500 hover:text-gray-800 underline">undo</button>
                ) : (
                  <>
                    {status !== "matched" && (
                      <button type="button" onClick={() => onOverride(it.skill.name, true)} className="text-[11px] px-1.5 py-0.5 rounded border border-green-200 text-green-700 hover:bg-green-50">I have this</button>
                    )}
                    {status !== "missing" && (
                      <button type="button" onClick={() => onOverride(it.skill.name, false)} className="text-[11px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100">I don’t</button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
