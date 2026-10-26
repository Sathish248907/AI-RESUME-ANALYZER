"use client";

import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  RefreshCw,
  Wand2,
  HelpCircle,
  CheckCircle2,
  Filter,
  ChevronRight,
  Info,
  TrendingUp,
  Minus,
  Lock,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { ApplyFixResult, AutoFixKind, Priority, ValidationIssue, ValidationReport } from "./types";

interface Props {
  report: ValidationReport | null;
  busy: boolean;
  /** Content changed since the check ran, so the findings are stale. */
  stale: boolean;
  /** Kind of the fix currently being applied, so only that button spins. */
  fixBusy: AutoFixKind | null;
  /** Result of the last applied fix, for the honest before/after score. */
  lastFix: ApplyFixResult | null;
  readOnly: boolean;
  onRun: () => void;
  onApplyFix: (fix: { kind: AutoFixKind; sectionId?: string; value?: string }) => Promise<void>;
  onLocate: (target: { sectionId: string | null; entryId: string | null }) => void;
}

type FilterKey = "all" | "high" | "fixable" | "questions";

const SEVERITY_BADGE: Record<Priority, "error" | "warning" | "neutral"> = {
  high: "error",
  medium: "warning",
  low: "neutral",
};

const CATEGORY_LABELS: Record<string, string> = {
  grammar: "Spelling",
  readability: "Readability",
  duplication: "Duplication",
  keywords: "Keywords",
  projects: "Projects",
  impact: "Impact",
  links: "Links",
  dates: "Dates",
  structure: "Structure",
  formatting: "Formatting",
};

/**
 * Deterministic document checks (Phase 11): spelling against a fixed list,
 * duplication, dates, links, decorative symbols and headings — plus the safe
 * mechanical fixes. Anything that would need a fact the resume does not contain
 * is shown as a question, never auto-filled, so no metric is ever invented.
 */
export default function ResumeValidationPanel({
  report,
  busy,
  stale,
  fixBusy,
  lastFix,
  readOnly,
  onRun,
  onApplyFix,
  onLocate,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = report?.counts;
  const questions = useMemo(
    () => (report?.issues ?? []).filter((i) => i.needsUserInput && i.question),
    [report]
  );

  const filtered = useMemo(() => {
    const issues = report?.issues ?? [];
    if (filter === "high") return issues.filter((i) => i.severity === "high");
    if (filter === "fixable") return issues.filter((i) => Boolean(i.autoFix));
    if (filter === "questions") return issues.filter((i) => i.needsUserInput);
    return issues;
  }, [report, filter]);

  const label = (c: string) => CATEGORY_LABELS[c] ?? c;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-sky-600" />
            Checks & safe fixes
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Mechanical checks on the document. No AI, no guessing — missing facts become questions.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRun} loading={busy}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} />
          {report ? "Re-check" : "Run checks"}
        </Button>
      </div>

      {!report ? (
        <p className="text-sm text-gray-500">
          Run the checks to list spelling, duplication, date, link and formatting problems, each with
          the fix that would be applied.
        </p>
      ) : (
        <>
          {stale && (
            <p className="text-[11px] text-amber-700">
              You have edited since this check; re-run for current results.
            </p>
          )}

          {/* Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: "total", n: counts!.total, text: "findings", cls: "text-gray-900" },
              { k: "high", n: counts!.high, text: "high severity", cls: "text-red-700" },
              { k: "autoFixable", n: counts!.autoFixable, text: "auto-fixable", cls: "text-indigo-700" },
              { k: "needsUserInput", n: counts!.needsUserInput, text: "need your answer", cls: "text-amber-700" },
            ].map((c) => (
              <div key={c.k} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className={cn("text-lg font-semibold tabular-nums", c.cls)}>{c.n}</p>
                <p className="text-[11px] text-gray-500">{c.text}</p>
              </div>
            ))}
          </div>

          {/* Last applied fix — the real score movement, not a promised one */}
          {lastFix && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-xs",
                lastFix.changed
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                  : "border-gray-200 bg-gray-50 text-gray-700"
              )}
            >
              <p className="font-medium inline-flex items-center gap-1">
                {lastFix.changed ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                {lastFix.fix.label}
              </p>
              <p className="mt-0.5">{lastFix.summary}</p>
              {lastFix.changed && lastFix.scoreBefore !== null && lastFix.scoreAfter !== null && (
                <p className="mt-0.5 tabular-nums">
                  ATS readiness {lastFix.scoreBefore} → {lastFix.scoreAfter} (
                  {lastFix.scoreAfter - lastFix.scoreBefore >= 0 ? "+" : ""}
                  {lastFix.scoreAfter - lastFix.scoreBefore})
                </p>
              )}
            </div>
          )}

          {/* Safe automatic fixes */}
          {report.availableFixes.length > 0 && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="text-xs font-semibold text-indigo-950 inline-flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> Safe automatic fixes
              </p>
              <p className="text-[11px] text-indigo-900/80 mt-0.5">
                Each one only rearranges or tidies text you already wrote. Nothing is added.
              </p>
              <ul className="mt-2 space-y-2">
                {report.availableFixes.map((f) => (
                  <li
                    key={f.kind}
                    className="rounded-lg border border-indigo-100 bg-white px-3 py-2 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900">{f.label}</p>
                      <p className="text-[11px] text-gray-600">{f.description}</p>
                      <p className="text-[11px] text-indigo-700 mt-0.5">{f.preview}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={readOnly}
                      loading={fixBusy === f.kind}
                      onClick={() => onApplyFix({ kind: f.kind })}
                      title={readOnly ? "The original is read-only. Duplicate it to apply fixes." : undefined}
                    >
                      {readOnly ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
                      Apply
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Questions only you can answer */}
          {questions.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" /> Only you can answer these
              </p>
              <p className="text-[11px] text-amber-900/80 mt-0.5">
                These need a real figure or fact. Nothing is filled in for you — answer in the editor.
              </p>
              <ul className="mt-2 space-y-1.5">
                {questions.map((q) => (
                  <li key={`q-${q.id}`} className="text-xs text-amber-950 flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    <span className="min-w-0">
                      {q.question}
                      {q.sectionId && (
                        <button
                          type="button"
                          onClick={() => onLocate({ sectionId: q.sectionId, entryId: q.entryId })}
                          className="ml-1.5 text-sky-700 hover:underline font-medium"
                        >
                          answer in editor
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-400 inline-flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3" /> Filter:
            </span>
            {(
              [
                { key: "all", text: `All (${counts!.total})`, on: "bg-gray-900 text-white", off: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
                { key: "high", text: `High (${counts!.high})`, on: "bg-red-600 text-white", off: "bg-red-50 text-red-700 hover:bg-red-100" },
                { key: "fixable", text: `Auto-fixable (${counts!.autoFixable})`, on: "bg-indigo-600 text-white", off: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
                { key: "questions", text: `Questions (${counts!.needsUserInput})`, on: "bg-amber-600 text-white", off: "bg-amber-50 text-amber-800 hover:bg-amber-100" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "px-2.5 py-1 rounded-full font-medium transition-colors",
                  filter === f.key ? f.on : f.off
                )}
              >
                {f.text}
              </button>
            ))}
          </div>

          {/* Findings */}
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-900">
                {counts!.total === 0 ? "No problems found." : "Nothing matches this filter."}
              </p>
              <p className="text-xs text-emerald-700 mt-1">
                {counts!.total === 0
                  ? "Spelling, dates, links, duplication and headings all passed these checks."
                  : "Switch filters above to see the remaining findings."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filtered.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  label={label(issue.category)}
                  readOnly={readOnly}
                  fixBusy={fixBusy}
                  onApplyFix={onApplyFix}
                  onLocate={onLocate}
                />
              ))}
            </ul>
          )}

          <ul className="space-y-1 pt-1">
            {report.notes.map((n) => (
              <li key={n} className="text-[11px] text-gray-500 inline-flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-400">
            {report.method} · checked {new Date(report.checkedAt).toLocaleTimeString()}
          </p>
        </>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  label,
  readOnly,
  fixBusy,
  onApplyFix,
  onLocate,
}: {
  issue: ValidationIssue;
  label: string;
  readOnly: boolean;
  fixBusy: AutoFixKind | null;
  onApplyFix: Props["onApplyFix"];
  onLocate: Props["onLocate"];
}) {
  return (
    <li
      className={cn(
        "rounded-xl border bg-white px-3.5 py-3",
        issue.severity === "high" ? "border-red-200" : "border-gray-200"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={SEVERITY_BADGE[issue.severity]}>{issue.severity}</Badge>
        <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">{label}</span>
        {issue.autoFix && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            <Wand2 className="w-3 h-3" /> Safe fix ready
          </span>
        )}
        {issue.needsUserInput && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
            <HelpCircle className="w-3 h-3" /> Needs your answer
          </span>
        )}
      </div>

      <h4 className="text-sm font-semibold text-gray-900 mt-1.5">{issue.title}</h4>
      <p className="text-xs text-gray-600 mt-1">{issue.detail}</p>
      <p className="text-xs text-gray-800 mt-1">
        <strong className="font-semibold">What to do:</strong> {issue.action}
      </p>
      {issue.needsUserInput && issue.question && (
        <p className="text-xs text-amber-900 bg-amber-50/70 border border-amber-100 rounded-lg px-2.5 py-2 mt-2">
          {issue.question}
        </p>
      )}

      <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        {issue.sectionId ? (
          <button
            type="button"
            onClick={() => onLocate({ sectionId: issue.sectionId, entryId: issue.entryId })}
            className="text-xs text-sky-700 hover:text-sky-900 hover:underline inline-flex items-center gap-1 font-medium"
          >
            Jump to section in editor
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-[11px] text-gray-400">
            {issue.field ? `Contact details · ${issue.field}` : "Whole document"}
          </span>
        )}
        {issue.autoFix && (
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly}
            loading={fixBusy === issue.autoFix.kind}
            onClick={() =>
              onApplyFix({
                kind: issue.autoFix!.kind,
                sectionId: issue.autoFix!.sectionId,
                value: issue.autoFix!.value,
              })
            }
            title={readOnly ? "The original is read-only. Duplicate it to apply fixes." : undefined}
          >
            {readOnly ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />}
            {issue.autoFix.label}
          </Button>
        )}
      </div>
    </li>
  );
}
