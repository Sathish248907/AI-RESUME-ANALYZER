"use client";

import { useState } from "react";
import {
  Gauge, Info, CheckCircle2, CircleDashed, XCircle, HelpCircle, ChevronDown,
  Briefcase, FolderGit2, AlertTriangle, RefreshCw, FileText,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import { cn } from "@/lib/utils";
import { EVIDENCE_LABELS, type EvidenceState, type MatchReport, type ResumeVersionRef } from "@/services/jobDiscoveryService";

interface Props {
  report: MatchReport | null;
  resumeVersion: ResumeVersionRef | null;
  versions: ResumeVersionRef[];
  busy: boolean;
  onRecompute: (resumeVersionId?: string, compareAll?: boolean) => void;
  onLocate?: (target: { sectionId: string; entryId: string }) => void;
  comparison?: Array<{ version: { id: string; name: string; isOriginal?: boolean }; matchScore: number | null; label: string }>;
}

const EVIDENCE_META: Record<EvidenceState, { icon: typeof CheckCircle2; cls: string }> = {
  demonstrated: { icon: CheckCircle2, cls: "text-emerald-600" },
  mentioned: { icon: CircleDashed, cls: "text-amber-600" },
  not_found: { icon: XCircle, cls: "text-gray-400" },
  not_assessed: { icon: HelpCircle, cls: "text-gray-300" },
};
const BAR = (n: number) => (n >= 75 ? "bg-emerald-500" : n >= 55 ? "bg-sky-500" : n >= 35 ? "bg-amber-500" : "bg-red-500");
const RING = (n: number | null) =>
  n === null ? "text-gray-400 border-gray-200" : n >= 75 ? "text-emerald-700 border-emerald-300" : n >= 55 ? "text-sky-700 border-sky-300" : "text-amber-700 border-amber-300";

/**
 * The resume-to-job match: the score, the weighted dimensions that produced it,
 * four-valued skill evidence, the entries it was read from, and the
 * qualification mismatches. Every number comes from the backend engine.
 */
export default function JobMatchReport({ report, resumeVersion, versions, busy, onRecompute, onLocate, comparison }: Props) {
  const [showScale, setShowScale] = useState(false);

  if (!report) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Gauge className="w-4 h-4 text-indigo-600" /> Resume match
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          No match has been computed. A match needs a resume version to compare this listing against.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {versions.length > 0 ? (
            <Button size="sm" loading={busy} onClick={() => onRecompute(undefined, true)}>
              <Gauge className="w-3.5 h-3.5 mr-1.5" /> Compute match
            </Button>
          ) : (
            <a href="/dashboard/resume-builder" className="text-sm text-indigo-700 hover:underline inline-flex items-center gap-1">
              <FileText className="w-4 h-4" /> Create a resume version first
            </a>
          )}
        </div>
      </div>
    );
  }

  const assessed = report.dimensions.filter((d) => d.applicable);
  const excluded = report.dimensions.filter((d) => !d.applicable);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Gauge className="w-4 h-4 text-indigo-600" /> Resume match
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {resumeVersion ? <>Against <strong className="text-gray-700">{resumeVersion.name}</strong></> : "No version selected"}
            {" · "}{report.method}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {versions.length > 1 && (
            <select
              value={resumeVersion?.id ?? ""}
              onChange={(e) => onRecompute(e.target.value, false)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
              aria-label="Resume version to match against"
            >
              {versions.map((v) => <option key={v.id} value={v.id}>{v.name}{v.isOriginal ? " (original)" : ""}</option>)}
            </select>
          )}
          <Button size="sm" variant="outline" loading={busy} onClick={() => onRecompute(resumeVersion?.id, true)}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} /> Recompute
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className={cn("w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center shrink-0", RING(report.matchScore))}>
          <span className="text-2xl font-bold tabular-nums leading-none">{report.matchScore === null ? "—" : report.matchScore}</span>
          <span className="text-[10px]">{report.matchScore === null ? "" : "%"}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{report.label}</p>
          {report.notAssessedReason && <p className="text-xs text-amber-800 mt-0.5">{report.notAssessedReason}</p>}
          {report.jobLevel && (
            <p className="text-xs text-gray-600 mt-0.5">
              Listing targets <strong>{report.jobLevel}</strong>; your resume reads as <strong>{report.resumeLevel}</strong>.
            </p>
          )}
          {report.keywordCoverage && (
            <p className="text-xs text-gray-600 mt-0.5">
              Keyword coverage {report.keywordCoverage.percent}% ({report.keywordCoverage.found.length}/{report.keywordCoverage.total})
            </p>
          )}
        </div>
      </div>

      {/* Dimensions */}
      <div className="space-y-1.5">
        {assessed.map((d) => (
          <div key={d.key} title={d.explanation}>
            <div className="flex justify-between text-xs">
              <span className="text-gray-700">{d.label} <span className="text-gray-400">(weight {d.weight})</span></span>
              <span className="font-medium tabular-nums">{d.score}</span>
            </div>
            <ProgressBar value={d.score ?? 0} animated={false} className="h-1.5" barClassName={BAR(d.score ?? 0)} />
          </div>
        ))}
      </div>

      {excluded.length > 0 && (
        <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <summary className="text-xs text-gray-700 cursor-pointer">
            {excluded.length} dimension{excluded.length === 1 ? "" : "s"} could not be assessed and {excluded.length === 1 ? "was" : "were"} excluded from the score
          </summary>
          <ul className="mt-1.5 space-y-1">
            {excluded.map((d) => (
              <li key={d.key} className="text-[11px] text-gray-600">
                <strong className="text-gray-800">{d.label}:</strong> {d.explanation}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Skill evidence */}
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-gray-800">Skill evidence</h4>
          <button type="button" onClick={() => setShowScale((s) => !s)} className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1">
            What these mean <ChevronDown className={cn("w-3 h-3 transition-transform", showScale && "rotate-180")} />
          </button>
        </div>
        {showScale && (
          <ul className="mt-1.5 space-y-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            {report.evidenceScale.map((s) => {
              const Icon = EVIDENCE_META[s.key].icon;
              return (
                <li key={s.key} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                  <Icon className={cn("w-3.5 h-3.5 mt-0.5 shrink-0", EVIDENCE_META[s.key].cls)} />
                  <span><strong>{s.label}:</strong> {s.meaning}</span>
                </li>
              );
            })}
          </ul>
        )}
        <ul className="mt-2 space-y-1">
          {report.skills.detail.map((s) => {
            const Icon = EVIDENCE_META[s.evidence].icon;
            return (
              <li key={`${s.name}-${s.priority}`} className="text-xs flex items-center gap-2">
                <Icon className={cn("w-3.5 h-3.5 shrink-0", EVIDENCE_META[s.evidence].cls)} />
                <span className="text-gray-900">{s.name}</span>
                {s.priority === "required"
                  ? <Badge variant="warning">required</Badge>
                  : <Badge variant="neutral">preferred</Badge>}
                <span className="text-gray-500 ml-auto">{EVIDENCE_LABELS[s.evidence]}</span>
              </li>
            );
          })}
          {report.skills.detail.length === 0 && (
            <li className="text-xs text-gray-500">No recognisable skill requirements in this listing.</li>
          )}
        </ul>
      </div>

      {/* Evidence in the resume */}
      {(report.relevantExperience.length > 0 || report.relevantProjects.length > 0) && (
        <div>
          <h4 className="text-xs font-semibold text-gray-800">What this score was read from</h4>
          <ul className="mt-1.5 space-y-1">
            {report.relevantExperience.map((e) => (
              <li key={`exp-${e.entryId}`} className="text-xs text-gray-700 flex items-start gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
                <span>
                  {onLocate
                    ? <button type="button" onClick={() => onLocate({ sectionId: e.sectionId, entryId: e.entryId })} className="text-sky-700 hover:underline font-medium">{e.name}</button>
                    : <strong>{e.name}</strong>}
                  {e.matchedSkills.length > 0 && <span className="text-gray-500"> — {e.matchedSkills.join(", ")}</span>}
                </span>
              </li>
            ))}
            {report.relevantProjects.map((p) => (
              <li key={`proj-${p.entryId}`} className="text-xs text-gray-700 flex items-start gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
                <span>
                  <strong>{p.name}</strong>
                  {p.matchedSkills.length > 0 && <span className="text-gray-500"> — {p.matchedSkills.join(", ")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mismatches */}
      {report.mismatches.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-800">Worth knowing before you apply</h4>
          <ul className="mt-1.5 space-y-1.5">
            {report.mismatches.map((m) => (
              <li key={m.key} className="rounded-lg border border-gray-200 px-2.5 py-2">
                <p className="text-xs font-medium text-gray-900 inline-flex items-center gap-1.5">
                  <AlertTriangle className={cn("w-3.5 h-3.5", m.severity === "high" ? "text-red-500" : m.severity === "medium" ? "text-amber-500" : "text-gray-400")} />
                  {m.title}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">{m.detail}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{m.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.preferenceNotes.length > 0 && (
        <ul className="space-y-1">
          {report.preferenceNotes.map((n) => (
            <li key={n} className="text-[11px] text-gray-600 flex items-start gap-1.5">
              <Info className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" /> {n}
            </li>
          ))}
        </ul>
      )}

      {comparison && comparison.length > 1 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold text-gray-800">Your versions against this job</p>
          <ul className="mt-1 space-y-0.5">
            {comparison.map((c) => (
              <li key={c.version.id} className="text-[11px] text-gray-700 flex justify-between gap-2">
                <span>{c.version.name}{c.version.isOriginal ? " (original)" : ""}</span>
                <span className="tabular-nums">{c.matchScore === null ? "—" : `${c.matchScore}% ${c.label}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" /> {report.disclaimer}
      </p>
    </div>
  );
}
