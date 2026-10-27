"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark, Building2, MapPin, ExternalLink, Trash2, ClipboardList, StickyNote,
  Check, EyeOff, Eye, Info,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import {
  externalHref, formatSalary, matchTone,
  type SavedJobItem, type SavedState,
} from "@/services/jobDiscoveryService";

interface Props {
  items: SavedJobItem[];
  counts: Record<string, number>;
  note: string | null;
  filter: SavedState | "all";
  busyId: string | null;
  onFilter: (state: SavedState | "all") => void;
  onChangeState: (savedJobId: string, state: SavedState) => void;
  onSaveNotes: (savedJobId: string, notes: string) => void;
  onRemove: (savedJobId: string) => void;
  onStartApplication: (savedJobId: string) => void;
}

const TONE: Record<string, string> = {
  emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  sky: "text-sky-700 bg-sky-50 border-sky-200",
  amber: "text-amber-700 bg-amber-50 border-amber-200",
  gray: "text-gray-500 bg-gray-50 border-gray-200",
};

/**
 * The saved list. The application record lives in the existing tracker — this
 * only links to it, so there is one place where application state is managed.
 */
export default function SavedJobs({
  items, counts, note, filter, busyId,
  onFilter, onChangeState, onSaveNotes, onRemove, onStartApplication,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const filters: Array<{ key: SavedState | "all"; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.total ?? 0 },
    { key: "saved", label: "Saved", count: counts.saved ?? 0 },
    { key: "interested", label: "Interested", count: counts.interested ?? 0 },
    { key: "hidden", label: "Hidden", count: counts.hidden ?? 0 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "px-2.5 py-1 rounded-full font-medium transition-colors",
              filter === f.key ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f.label} ({f.count})
          </button>
        ))}
        {counts.withApplication > 0 && (
          <Link href="/dashboard/applications" className="ml-auto text-indigo-700 hover:underline font-medium">
            {counts.withApplication} tracked in applications →
          </Link>
        )}
      </div>

      {note && (
        <p className="text-xs text-gray-600 inline-flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" /> {note}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={filter === "all" ? "No saved jobs yet" : `No ${filter} jobs`}
          description="Save a job from the discovery page to keep it here, add notes and start tracking an application."
          action={{ label: "Find jobs", href: "/dashboard/jobs" }}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const salary = formatSalary(item.job);
            const apply = externalHref(item.job.applyUrl);
            const score = item.match?.matchScore ?? item.storedMatch?.matchScore ?? null;
            return (
              <li key={item.savedJobId} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/jobs/${encodeURIComponent(item.job.id)}`} className="font-semibold text-gray-900 hover:text-indigo-700">
                      {item.job.title}
                    </Link>
                    <p className="text-sm text-gray-700 mt-0.5 inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-gray-400" /> {item.job.companyName}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {item.job.location ?? (item.job.workArrangement === "remote" ? "Remote" : "Location not stated")}
                      </span>
                      <span>{salary ?? "Salary not published"}</span>
                      <Badge variant={item.state === "hidden" ? "neutral" : item.state === "interested" ? "info" : "success"}>{item.state}</Badge>
                      {item.application && <Badge variant="warning">{item.application.status}</Badge>}
                    </div>
                  </div>
                  <div className={cn("shrink-0 rounded-xl border px-3 py-2 text-center", TONE[matchTone(score)])}>
                    <p className="text-lg font-semibold tabular-nums leading-none">{score === null ? "—" : `${score}%`}</p>
                    <p className="text-[10px] mt-0.5">match</p>
                  </div>
                </div>

                {item.match && item.match.requiredNotFound.length > 0 && (
                  <p className="mt-2 text-[11px] text-amber-800">
                    Not found in your resume: {item.match.requiredNotFound.slice(0, 5).join(", ")}
                  </p>
                )}

                {/* Notes */}
                <div className="mt-3">
                  {editing === item.savedJobId ? (
                    <div className="space-y-1.5">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        aria-label="Notes on this job"
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" loading={busyId === item.savedJobId} onClick={() => { onSaveNotes(item.savedJobId, draft); setEditing(null); }}>
                          <Check className="w-3.5 h-3.5 mr-1.5" /> Save note
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditing(item.savedJobId); setDraft(item.notes ?? ""); }}
                      className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-start gap-1.5 text-left"
                    >
                      <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                      {item.notes ? item.notes : <span className="text-gray-400">Add a note…</span>}
                    </button>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                  {item.application ? (
                    <Link href="/dashboard/applications" className="text-xs font-medium text-indigo-700 hover:underline inline-flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" /> Open in application tracker
                    </Link>
                  ) : (
                    <Button size="sm" variant="outline" loading={busyId === item.savedJobId} onClick={() => onStartApplication(item.savedJobId)}>
                      <ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Start application
                    </Button>
                  )}
                  {item.state === "hidden" ? (
                    <Button size="sm" variant="ghost" loading={busyId === item.savedJobId} onClick={() => onChangeState(item.savedJobId, "saved")}>
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Unhide
                    </Button>
                  ) : (
                    <>
                      {item.state !== "interested" && (
                        <Button size="sm" variant="ghost" loading={busyId === item.savedJobId} onClick={() => onChangeState(item.savedJobId, "interested")}>
                          Mark interested
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" loading={busyId === item.savedJobId} onClick={() => onChangeState(item.savedJobId, "hidden")}>
                        <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide
                      </Button>
                    </>
                  )}
                  {apply && (
                    <a href={apply} target="_blank" rel="noopener noreferrer nofollow" className="text-xs font-medium text-sky-700 hover:text-sky-900 inline-flex items-center gap-1">
                      Apply <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto text-red-600 hover:bg-red-50" loading={busyId === item.savedJobId} onClick={() => onRemove(item.savedJobId)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
