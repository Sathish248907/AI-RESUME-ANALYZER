"use client";

import { useMemo, useState } from "react";
import {
  ShieldCheck, Target, RefreshCw, ChevronDown, Info, TrendingUp, TrendingDown, Minus,
  CheckCircle2, CircleDashed, AlertTriangle, Briefcase, Lock,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn, formatDate } from "@/lib/utils";
import type { AtsAssessment, AtsCategory, AtsHistory, JobDescriptionOption } from "./types";

interface Props {
  assessment: AtsAssessment | null;
  history: AtsHistory | null;
  delta: number | null;
  qualityScore: number | null;
  busy: boolean;
  /** Content changed since the score was computed, so the number is stale. */
  stale: boolean;
  savedJobs: JobDescriptionOption[];
  onRun: (input: { jobDescriptionId?: string; jobDescription?: string; jobTitle?: string; saveJobDescription?: boolean }) => void;
  onLocate: (target: { sectionId: string | null; entryId: string | null }) => void;
}

const RING = (score: number) => (score >= 75 ? "#059669" : score >= 60 ? "#0284c7" : score >= 40 ? "#d97706" : "#dc2626");
const TEXT = (score: number) => (score >= 75 ? "text-emerald-700" : score >= 60 ? "text-sky-700" : score >= 40 ? "text-amber-700" : "text-red-700");
const BAR = (score: number) => (score >= 75 ? "bg-emerald-500" : score >= 60 ? "bg-sky-500" : score >= 40 ? "bg-amber-500" : "bg-red-500");

/**
 * The ATS dashboard: the overall readiness score, the weighted category
 * breakdown, keyword and skill evidence, section completeness and the parsing
 * facts. Every number shown here comes from the backend's deterministic engine;
 * nothing is computed or rounded again on the client.
 */
export default function ATSScorePanel({ assessment, history, delta, qualityScore, busy, stale, savedJobs, onRun, onLocate }: Props) {
  const [mode, setMode] = useState<"general" | "job">("general");
  const [jobId, setJobId] = useState("");
  const [pasted, setPasted] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saveJob, setSaveJob] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const run = () => {
    if (mode === "general") return onRun({});
    if (jobId) return onRun({ jobDescriptionId: jobId });
    return onRun({ jobDescription: pasted.trim(), jobTitle: jobTitle.trim() || undefined, saveJobDescription: saveJob });
  };
  const canRun = mode === "general" || Boolean(jobId) || pasted.trim().length >= 50;

  return (
    <div className="space-y-4">
      {/* ── Run controls ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-600" /> ATS readiness check
        </h3>
        <div role="radiogroup" aria-label="Scoring mode" className="mt-3 grid grid-cols-2 gap-2">
          {([
            { id: "general", label: "General readiness", hint: "How complete and parseable the document is" },
            { id: "job", label: "Against a job", hint: "Adds keyword and skill alignment for one job" },
          ] as const).map((m) => (
            <button
              key={m.id} type="button" role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
              className={cn("text-left rounded-lg border px-3 py-2.5 transition-colors", mode === m.id ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500/20" : "border-gray-200 hover:border-gray-300")}
            >
              <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                {m.id === "general" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />} {m.label}
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{m.hint}</span>
            </button>
          ))}
        </div>

        {mode === "job" && (
          <div className="mt-3 space-y-2">
            {savedJobs.length > 0 && (
              <label className="block">
                <span className="text-[11px] font-medium text-gray-600">Saved job description</span>
                <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white">
                  <option value="">Paste one instead…</option>
                  {savedJobs.map((j) => <option key={j.id} value={j.id}>{j.jobTitle}{j.companyName ? ` — ${j.companyName}` : ""}</option>)}
                </select>
              </label>
            )}
            {!jobId && (
              <>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600">Job title (optional)</span>
                  <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Frontend Developer" className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-600">Paste the job description</span>
                  <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} placeholder="Paste the full posting — requirements, responsibilities and nice-to-haves." className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm resize-y" />
                  <span className="text-[11px] text-gray-400">{pasted.trim().length} characters (50 minimum)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-[11px] text-gray-600">
                  <input type="checkbox" checked={saveJob} onChange={(e) => setSaveJob(e.target.checked)} /> Save this job description for reuse
                </label>
              </>
            )}
          </div>
        )}

        <Button onClick={run} loading={busy} disabled={!canRun} className="mt-3 w-full" size="sm">
          <RefreshCw className={cn("w-4 h-4", busy && "animate-spin")} />
          {assessment ? "Re-check ATS readiness" : "Run ATS check"}
        </Button>
        {stale && assessment && (
          <p className="mt-2 text-[11px] text-amber-700 inline-flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> You have edited the resume since this score was calculated. Re-check to see the current number.
          </p>
        )}
      </section>

      {!assessment && !busy && (
        <p className="text-sm text-gray-500 px-1">
          Run a check to see your readiness score, the category breakdown and a prioritised list of what to fix.
        </p>
      )}

      {assessment && (
        <>
          {/* ── Score ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start gap-4">
              <ScoreRing score={assessment.overall} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-sm font-semibold", TEXT(assessment.overall))}>{assessment.label}</span>
                  <Badge variant={assessment.mode === "job" ? "info" : "neutral"}>{assessment.modeLabel}</Badge>
                  {assessment.atsSafeRender && <Badge variant="success">ATS-safe rendering</Badge>}
                </div>
                {assessment.mode === "job" && assessment.jobTitle && (
                  <p className="text-xs text-gray-600 mt-1 inline-flex items-center gap-1"><Briefcase className="w-3 h-3" /> scored against {assessment.jobTitle}</p>
                )}
                {delta !== null && (
                  <p className={cn("text-xs mt-1.5 inline-flex items-center gap-1 font-medium", delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-gray-500")}>
                    {delta > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                    {delta > 0 ? `+${delta}` : delta} since your last {assessment.mode} check
                  </p>
                )}
                {qualityScore !== null && (
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    Document quality is scored separately: <span className="font-medium text-gray-700">{qualityScore}/100</span>. Readiness is about completeness and alignment; quality is about how the resume is written.
                  </p>
                )}
                <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
                  <div><dt className="inline">Words </dt><dd className="inline font-medium text-gray-700">{assessment.counts.words}</dd></div>
                  <div><dt className="inline">Bullets </dt><dd className="inline font-medium text-gray-700">{assessment.counts.bullets}</dd></div>
                  <div><dt className="inline">Entries </dt><dd className="inline font-medium text-gray-700">{assessment.counts.entries}</dd></div>
                </dl>
              </div>
            </div>

            {assessment.headroom.length > 0 && (
              <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600">
                <span className="font-medium text-gray-800">Biggest wins available:</span>{" "}
                {assessment.headroom.slice(0, 3).map((h) => `${h.label} (+${h.pointsAvailable} pts)`).join(", ")}.
              </p>
            )}
          </section>

          {/* ── Category breakdown ── */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <h3 className="text-sm font-semibold text-gray-900 px-4 pt-4 pb-2">Score breakdown</h3>
            <ul className="divide-y divide-gray-100">
              {assessment.categories.map((c) => (
                <CategoryRow key={c.key} category={c} open={open[c.key] ?? false} onToggle={() => setOpen((o) => ({ ...o, [c.key]: !o[c.key] }))} />
              ))}
            </ul>
            <p className="px-4 py-3 text-[11px] text-gray-500 border-t border-gray-100">
              Weights total 100 when every category applies. A category that cannot be measured is dropped and its weight is shared across the rest, rather than scored as zero.
            </p>
          </section>

          {/* ── Keywords ── */}
          {assessment.keywordCoverage && <KeywordCoverage coverage={assessment.keywordCoverage} />}

          {/* ── Skills evidence ── */}
          <SkillsEvidence skills={assessment.skills} onLocate={onLocate} />

          {/* ── Section completeness ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Section completeness</h3>
            <ul className="mt-2.5 grid sm:grid-cols-2 gap-1.5">
              {assessment.sectionCompleteness.map((s) => (
                <li key={s.type}>
                  <button
                    type="button"
                    disabled={!s.sectionId}
                    onClick={() => s.sectionId && onLocate({ sectionId: s.sectionId, entryId: null })}
                    className={cn("w-full text-left flex items-center gap-2 text-xs rounded-md px-2 py-1.5", s.sectionId ? "hover:bg-gray-50" : "cursor-default")}
                  >
                    {s.filled ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <CircleDashed className={cn("w-4 h-4 flex-shrink-0", s.required ? "text-red-500" : "text-gray-300")} />}
                    <span className={cn("truncate", s.filled ? "text-gray-700" : "text-gray-500")}>{s.label}</span>
                    {!s.filled && s.required && <Badge variant="error" className="ml-auto flex-shrink-0">needed</Badge>}
                    {!s.filled && !s.required && !s.present && <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">not added</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Formatting & parsing ── */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Formatting and parsing</h3>
            {assessment.formattingIssues.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {assessment.formattingIssues.map((f, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span><span className="font-medium">{f.issue}</span> — {f.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-emerald-700 inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> No formatting problems detected.</p>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-medium text-gray-600 inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Guaranteed by this builder</p>
              <ul className="mt-1.5 space-y-1">
                {assessment.parsingGuarantees.map((g, i) => (
                  <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0 mt-0.5" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── History ── */}
          {history && (history.trend.general.length > 1 || history.trend.job.length > 1) && <ScoreTrend history={history} />}

          <p className="text-[11px] text-gray-500 leading-relaxed px-1 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {assessment.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0" role="img" aria-label={`ATS readiness ${score} out of 100`}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={R} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={R} fill="none" stroke={RING(score)} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold tabular-nums leading-none", TEXT(score))}>{score}</span>
        <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">of 100</span>
      </div>
    </div>
  );
}

function CategoryRow({ category: c, open, onToggle }: { category: AtsCategory; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full px-4 py-2.5 text-left hover:bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">{c.label}</span>
          {c.applicable ? (
            <span className="text-xs tabular-nums text-gray-500">
              <span className={cn("font-semibold", TEXT(c.score ?? 0))}>{c.pointsEarned}</span>
              <span className="text-gray-400"> / {c.weight} pts</span>
            </span>
          ) : (
            <Badge variant="neutral">not scored</Badge>
          )}
          <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0", open && "rotate-180")} />
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          {c.applicable && (
            <div
              className={cn("h-full rounded-full transition-all duration-700", BAR(c.score ?? 0))}
              style={{ width: `${c.score ?? 0}%` }}
              role="progressbar" aria-valuenow={c.score ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={c.label}
            />
          )}
        </div>
      </button>
      {open && <p className="px-4 pb-3 text-[11px] text-gray-600 leading-relaxed">{c.explanation}</p>}
    </li>
  );
}

function KeywordCoverage({ coverage }: { coverage: NonNullable<AtsAssessment["keywordCoverage"]> }) {
  const [showAll, setShowAll] = useState(false);
  const demonstrated = coverage.detail.filter((d) => d.evidence === "demonstrated");
  const listed = coverage.detail.filter((d) => d.evidence === "listed");
  const absent = coverage.detail.filter((d) => d.evidence === "absent");
  const shown = (arr: typeof coverage.detail) => (showAll ? arr : arr.slice(0, 12));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Job keywords</h3>
        <span className="text-xs text-gray-500 tabular-nums">{coverage.found.length}/{coverage.total} found · {coverage.percent}%</span>
      </div>

      {coverage.requiredMissing.length > 0 && (
        <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">
          <span className="font-medium">Required and missing:</span> {coverage.requiredMissing.join(", ")}.
        </p>
      )}

      <div className="mt-3 space-y-3">
        <KeywordGroup
          title="Shown in your experience or projects" tone="success" count={demonstrated.length}
          items={shown(demonstrated).map((d) => d.name)}
          note="These carry the most weight — the resume shows them in use."
        />
        <KeywordGroup
          title="Listed only in your skills section" tone="warning" count={listed.length}
          items={shown(listed).map((d) => d.name)}
          note="Half credit. Name these inside the bullet where you used them to get full credit."
        />
        <KeywordGroup
          title="Not in your resume" tone="neutral" count={absent.length}
          items={shown(absent).map((d) => d.name)}
          note="Add only the ones that honestly describe work you have done. The rest are skills to learn, not wording to fix."
        />
      </div>

      {coverage.detail.length > 12 && (
        <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-3 text-xs text-sky-700 hover:underline">
          {showAll ? "Show fewer" : `Show all ${coverage.total} keywords`}
        </button>
      )}
    </section>
  );
}

function KeywordGroup({ title, tone, items, count, note }: { title: string; tone: "success" | "warning" | "neutral"; items: string[]; count: number; note: string }) {
  if (count === 0) return null;
  const chip = { success: "bg-emerald-50 text-emerald-800 border-emerald-200", warning: "bg-amber-50 text-amber-800 border-amber-200", neutral: "bg-gray-50 text-gray-600 border-gray-200" }[tone];
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-700">{title} <span className="text-gray-400">({count})</span></p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {items.map((k) => <span key={k} className={cn("text-[11px] px-2 py-0.5 rounded-md border", chip)}>{k}</span>)}
        {count > items.length && <span className="text-[11px] text-gray-400 px-1 py-0.5">+{count - items.length} more</span>}
      </div>
      <p className="mt-1 text-[10px] text-gray-500 leading-snug">{note}</p>
    </div>
  );
}

function SkillsEvidence({ skills, onLocate }: { skills: AtsAssessment["skills"]; onLocate: Props["onLocate"] }) {
  if (skills.listed.length === 0 && !skills.roleBaseline) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Your skills, and which ones you prove</h3>
      <div className="mt-2.5 space-y-3">
        {skills.demonstrated.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-emerald-800">Demonstrated in your work ({skills.demonstrated.length})</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {skills.demonstrated.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-800 border-emerald-200">{s}</span>)}
            </div>
          </div>
        )}
        {skills.listedNotDemonstrated.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-amber-800">Listed, but not shown anywhere ({skills.listedNotDemonstrated.length})</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {skills.listedNotDemonstrated.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200">{s}</span>)}
            </div>
            <p className="mt-1 text-[10px] text-gray-500">This is not a judgement about what you can do — only about what the resume evidences.</p>
          </div>
        )}
        {skills.roleBaseline && (
          <div className="pt-2.5 border-t border-gray-100">
            <p className="text-[11px] font-medium text-gray-700">
              Common {skills.roleBaseline.role} skills: {skills.roleBaseline.covered} of {skills.roleBaseline.total} present
            </p>
            {skills.roleBaseline.missing.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {skills.roleBaseline.missing.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-md border bg-gray-50 text-gray-600 border-gray-200">{s}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** A compact inline sparkline of past scores. General and job runs stay separate series. */
function ScoreTrend({ history }: { history: AtsHistory }) {
  const series = useMemo(
    () => ([
      { key: "general" as const, label: "General readiness", points: history.trend.general, colour: "#0284c7" },
      { key: "job" as const, label: "Job-specific", points: history.trend.job, colour: "#7c3aed" },
    ]).filter((s) => s.points.length > 1),
    [history]
  );
  if (series.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Score over time</h3>
      <div className="mt-3 space-y-4">
        {series.map((s) => {
          const w = 260, h = 44;
          const xs = s.points.map((_, i) => (i / Math.max(1, s.points.length - 1)) * w);
          const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${(h - (p.score / 100) * h).toFixed(1)}`).join(" ");
          const first = s.points[0], last = s.points[s.points.length - 1];
          const change = last.score - first.score;
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-gray-700">{s.label}</span>
                <span className={cn("text-[11px] font-medium tabular-nums", change > 0 ? "text-emerald-700" : change < 0 ? "text-red-700" : "text-gray-500")}>
                  {first.score} → {last.score} ({change > 0 ? `+${change}` : change})
                </span>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11 mt-1 overflow-visible" role="img" aria-label={`${s.label}: ${s.points.map((p) => p.score).join(", ")}`}>
                <path d={path} fill="none" stroke={s.colour} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {s.points.map((p, i) => <circle key={i} cx={xs[i]} cy={h - (p.score / 100) * h} r="2.5" fill={s.colour} />)}
              </svg>
              <p className="text-[10px] text-gray-400">{formatDate(first.at)} – {formatDate(last.at)} · {s.points.length} checks</p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-gray-500 leading-snug">{history.note}</p>
    </section>
  );
}
