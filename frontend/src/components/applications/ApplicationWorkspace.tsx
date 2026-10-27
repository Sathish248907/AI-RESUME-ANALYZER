"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2, ExternalLink, CalendarDays, Target, ArrowRight, Sparkles,
  AlertTriangle, Info, FileText, Gauge, ChevronDown,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus } from "@/services/jobApplicationService";
import { STAGE_TONE, safeHref, type Workspace } from "@/services/applicationWorkspaceService";

interface Props {
  workspace: Workspace;
  changingStatus: boolean;
  onChangeStatus: (status: ApplicationStatus, opts: { note?: string; confirmUnusual?: boolean }) => void;
  onSetOutcome: (outcome: "accepted" | "declined") => void;
  /** Set when the last status change was refused as unusual. */
  unusualPrompt: { status: ApplicationStatus; message: string } | null;
  onDismissUnusual: () => void;
}

const TONE_CLS: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
  sky: "bg-sky-50 text-sky-800 border-sky-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
  red: "bg-red-50 text-red-800 border-red-200",
};

/**
 * The workspace header: what the job is, where the application stands, and the
 * one thing worth doing next. The status control offers only the ordinary next
 * steps; anything unusual is still possible but has to be confirmed, so an odd
 * move is deliberate rather than a slip.
 */
export default function ApplicationWorkspace({
  workspace, changingStatus, onChangeStatus, onSetOutcome, unusualPrompt, onDismissUnusual,
}: Props) {
  const { application, job, stage, allowedTransitions, nextAction, match, checklist } = workspace;
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const listing = safeHref(job.listingUrl);

  const deadlineDays = application.applicationDeadline
    ? Math.round((new Date(application.applicationDeadline).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900">{application.jobTitle}</h1>
            <p className="text-sm text-gray-700 mt-1 inline-flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-gray-400" /> {application.companyName}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cn("text-xs px-2.5 py-1 rounded-full border font-medium", TONE_CLS[STAGE_TONE[stage.stage] ?? "gray"])} title={stage.basis}>
                {stage.label}
              </span>
              {application.outcome && <Badge variant={application.outcome === "accepted" ? "success" : "neutral"}>{application.outcome}</Badge>}
              {job.sourceKind === "provider" && <Badge variant="info">from {job.providerName ?? "a job provider"}</Badge>}
              {job.sourceKind === "own" && <Badge variant="neutral">your saved description</Badge>}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {listing && (
              <a
                href={listing}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Open the listing <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {match && (
              <Link href="/dashboard/jobs" className="text-xs text-indigo-700 hover:underline inline-flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5" /> Resume match {match.matchScore}% ({match.label})
              </Link>
            )}
          </div>
        </div>

        <dl className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <dt className="text-gray-500 inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> Applied</dt>
            <dd className="mt-0.5 text-gray-900">
              {application.status === "INTERESTED" ? <span className="text-gray-400">Not yet</span> : new Date(application.applicationDate).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Deadline</dt>
            <dd className={cn("mt-0.5", application.applicationDeadline ? (deadlineDays !== null && deadlineDays < 0 ? "text-red-700" : "text-gray-900") : "text-gray-400")}>
              {application.applicationDeadline
                ? `${new Date(application.applicationDeadline).toLocaleDateString()}${deadlineDays !== null ? ` (${deadlineDays < 0 ? `${Math.abs(deadlineDays)} days ago` : `in ${deadlineDays} days`})` : ""}`
                : "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Follow-up</dt>
            <dd className={cn("mt-0.5", application.nextFollowUpDate ? "text-gray-900" : "text-gray-400")}>
              {application.nextFollowUpDate ? new Date(application.nextFollowUpDate).toLocaleDateString() : "None set"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Preparation</dt>
            <dd className="mt-0.5 text-gray-900">{checklist.summary.percent}% · {checklist.summary.requiredCompleted}/{checklist.summary.required} required</dd>
          </div>
        </dl>
      </div>

      {/* Next action */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <p className="text-xs font-semibold text-indigo-950 inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Next
        </p>
        <p className="text-sm text-indigo-950 mt-1">{nextAction.title}</p>
        {nextAction.detail && <p className="text-xs text-indigo-900/80 mt-0.5">{nextAction.detail}</p>}
        {nextAction.href && safeHref(nextAction.href) && (
          <a href={safeHref(nextAction.href) as string} target="_blank" rel="noopener noreferrer nofollow" className="text-xs font-medium text-indigo-700 hover:underline inline-flex items-center gap-1 mt-1">
            Open <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {nextAction.href && !safeHref(nextAction.href) && (
          <Link href={nextAction.href} className="text-xs font-medium text-indigo-700 hover:underline inline-flex items-center gap-1 mt-1">
            Go <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {/* Status */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-500" /> Status
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {stage.basis} Nothing detects employer activity — every change is one you record.
          </p>
        </div>

        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for this change"
          maxLength={1000}
          aria-label="Status change note"
          className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
        />

        <div className="flex flex-wrap items-center gap-2">
          {allowedTransitions.map((t) => (
            <Button
              key={t.status}
              size="sm"
              variant="outline"
              loading={changingStatus}
              onClick={() => { onChangeStatus(t.status, { note: note.trim() || undefined }); setNote(""); }}
            >
              Move to {t.label}
            </Button>
          ))}
          {allowedTransitions.length === 0 && (
            <p className="text-xs text-gray-500">This application is closed. Use “any status” below to correct the record.</p>
          )}

          {application.status === "OFFER" && !application.outcome && (
            <>
              <Button size="sm" loading={changingStatus} onClick={() => onSetOutcome("accepted")}>Record as accepted</Button>
              <Button size="sm" variant="ghost" loading={changingStatus} onClick={() => onSetOutcome("declined")}>Record as declined</Button>
            </>
          )}
        </div>

        <details open={showAll} onToggle={(e) => setShowAll((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="text-xs text-gray-600 cursor-pointer inline-flex items-center gap-1">
            Any status <ChevronDown className={cn("w-3 h-3 transition-transform", showAll && "rotate-180")} />
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).filter((s) => s !== application.status).map((s) => (
              <button
                key={s}
                type="button"
                disabled={changingStatus}
                onClick={() => { onChangeStatus(s, { note: note.trim() || undefined }); setNote(""); }}
                className="text-xs px-2.5 py-1 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </details>

        {unusualPrompt && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
            <p className="text-xs font-semibold text-amber-950 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Unusual change
            </p>
            <p className="text-[11px] text-amber-900 mt-0.5">{unusualPrompt.message}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" loading={changingStatus} onClick={() => onChangeStatus(unusualPrompt.status, { note: note.trim() || undefined, confirmUnusual: true })}>
                Record it anyway
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismissUnusual}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* The listing itself */}
      {job.description && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="text-sm font-semibold text-gray-900 cursor-pointer inline-flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" /> The job description
          </summary>
          <p className="text-[11px] text-gray-500 mt-1">Shown as plain text exactly as it was saved.</p>
          <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{job.description}</p>
        </details>
      )}

      {workspace.notes.length > 0 && (
        <ul className="space-y-1">
          {workspace.notes.map((n) => (
            <li key={n} className="text-[11px] text-gray-500 flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
