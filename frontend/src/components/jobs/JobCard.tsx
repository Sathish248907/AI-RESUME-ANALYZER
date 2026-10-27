"use client";

import Link from "next/link";
import {
  Building2, MapPin, Clock, Banknote, ExternalLink, Bookmark, BookmarkCheck,
  EyeOff, Info, Sparkles, ChevronRight, Megaphone,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVEL_LABELS, WORK_ARRANGEMENT_LABELS,
  externalHref, formatPostedAt, formatSalary, matchTone,
  type DiscoverItem, type SavedState,
} from "@/services/jobDiscoveryService";

interface Props {
  item: DiscoverItem;
  busy?: boolean;
  onSave: (state: SavedState) => void;
  onUnsave?: () => void;
}

const TONE_RING: Record<string, string> = {
  emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
  sky: "text-sky-700 bg-sky-50 border-sky-200",
  amber: "text-amber-700 bg-amber-50 border-amber-200",
  gray: "text-gray-500 bg-gray-50 border-gray-200",
};

/**
 * One job result. Every fact shown comes from the listing; anything the source
 * did not supply is labelled "not stated" rather than defaulted, and the match
 * percentage is the backend's deterministic score (never recomputed here).
 */
export default function JobCard({ item, busy = false, onSave, onUnsave }: Props) {
  const { job, match, ranking, savedState } = item;
  const salary = formatSalary(job);
  const posted = formatPostedAt(job);
  const apply = externalHref(job.applyUrl);
  const tone = matchTone(match.matchScore);

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/jobs/${encodeURIComponent(job.id)}`} className="font-semibold text-gray-900 hover:text-indigo-700">
              {job.title}
            </Link>
            {job.sourceKind === "own" && <Badge variant="neutral">Entered by you</Badge>}
            {job.isSponsored && (
              <span title="Promoted by the provider. Promotion does not affect its position here." className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                <Megaphone className="w-3 h-3" /> Promoted
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 mt-1 inline-flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400" /> {job.companyName}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {job.location ?? (job.workArrangement === "remote" ? "Remote" : "Location not stated")}
            </span>
            <span>{WORK_ARRANGEMENT_LABELS[job.workArrangement]}</span>
            <span>{EMPLOYMENT_TYPE_LABELS[job.employmentType]}</span>
            <span>{EXPERIENCE_LEVEL_LABELS[job.experienceLevel]}</span>
            <span className="inline-flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-gray-400" />
              {salary ?? "Salary not published"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              {posted ?? "Posting date not provided"}
            </span>
          </div>
        </div>

        {/* Match */}
        <div className={cn("shrink-0 rounded-xl border px-3 py-2 text-center", TONE_RING[tone])}>
          <p className="text-xl font-semibold tabular-nums leading-none">
            {match.matchScore === null ? "—" : `${match.matchScore}%`}
          </p>
          <p className="text-[10px] mt-1 whitespace-nowrap">{match.label}</p>
        </div>
      </div>

      {/* Why it is here */}
      {ranking.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {ranking.reasons.slice(0, 2).map((reason) => (
            <li key={reason} className="text-xs text-gray-600 flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" /> {reason}
            </li>
          ))}
        </ul>
      )}

      {!match.assessed && match.notAssessedReason && (
        <p className="mt-2 text-[11px] text-gray-500 inline-flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> {match.notAssessedReason}
        </p>
      )}

      {match.assessed && match.requiredNotFound.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-800">
          Not found in your resume: {match.requiredNotFound.slice(0, 5).join(", ")}
          {match.requiredNotFound.length > 5 ? ` +${match.requiredNotFound.length - 5} more` : ""}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-400">
          {job.providerName ?? job.providerSlug}
          {job.missingFields.length > 0 && ` · not provided by the source: ${job.missingFields.join(", ")}`}
        </span>
        <div className="flex items-center gap-1.5">
          {savedState === "hidden" ? (
            <Button size="sm" variant="ghost" loading={busy} onClick={() => onSave("saved")}>
              <EyeOff className="w-3.5 h-3.5 mr-1.5" /> Unhide
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" loading={busy} onClick={() => onSave("hidden")} title="Hide this job from your results">
                <EyeOff className="w-3.5 h-3.5" />
              </Button>
              {savedState ? (
                <Button size="sm" variant="outline" loading={busy} onClick={() => (onUnsave ? onUnsave() : onSave("saved"))}>
                  <BookmarkCheck className="w-3.5 h-3.5 mr-1.5" /> Saved
                </Button>
              ) : (
                <Button size="sm" variant="outline" loading={busy} onClick={() => onSave("saved")}>
                  <Bookmark className="w-3.5 h-3.5 mr-1.5" /> Save
                </Button>
              )}
            </>
          )}
          {apply && (
            <a href={apply} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 px-2 py-1.5">
              Apply <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <Link href={`/dashboard/jobs/${encodeURIComponent(job.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 px-2 py-1.5">
            Details <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}
