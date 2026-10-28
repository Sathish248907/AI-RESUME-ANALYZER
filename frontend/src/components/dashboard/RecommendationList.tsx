"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Check, X, Info, ChevronDown, Sparkles, RefreshCw,
} from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import {
  formatEffort, PRIORITY_TONE, TYPE_LABELS,
  type Recommendation, type RecommendationFeed,
} from "@/services/recommendationService";

interface Props {
  feed: RecommendationFeed;
  busyId: string | null;
  refreshing: boolean;
  onComplete: (rec: Recommendation) => void;
  onDismiss: (rec: Recommendation) => void;
  onRefresh: () => void;
}

/**
 * What to do next, and why.
 *
 * Every row carries the record it came from, so none of it reads as a generic
 * tip: "quality 62/100 on your tailored resume" is checkable, "improve your
 * resume" is not. The two controls are deliberately different — *done* lets an
 * item come back if the condition recurs, *not now* keeps it away for good.
 */
export default function RecommendationList({
  feed, busyId, refreshing, onComplete, onDismiss, onRefresh,
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (feed.recommendations.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" /> What to do next
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Nothing outstanding. New suggestions appear as you add resumes, run analyses and track
          applications.
        </p>
        <Button size="sm" variant="outline" className="mt-3" loading={refreshing} onClick={onRefresh}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} /> Check again
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" /> What to do next
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {feed.counts.open} open
            {feed.counts.high > 0 && <> · {feed.counts.high} high priority</>}
            {feed.targetRole && <> · aiming at {feed.targetRole}</>}
          </p>
        </div>
        <Button size="sm" variant="ghost" loading={refreshing} onClick={onRefresh} title="Recompute from your latest records">
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", refreshing && "animate-spin")} /> Refresh
        </Button>
      </div>

      <ol className="mt-3 space-y-2">
        {feed.recommendations.map((rec) => {
          const open = expanded === rec.id;
          const effort = formatEffort(rec.effortMinutes);
          return (
            <li key={rec.id} className="rounded-lg border border-gray-200 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{rec.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{rec.explanation}</p>
                </div>
                <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", PRIORITY_TONE[rec.priority])}>
                  {rec.priority}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{TYPE_LABELS[rec.type] ?? rec.type}</span>
                {effort && <span>about {effort}</span>}
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : rec.id)}
                  aria-expanded={open}
                  className="inline-flex items-center gap-1 text-sky-700 hover:underline"
                >
                  Why this is here
                  <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
                </button>
              </div>

              {open && (
                <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 px-2.5 py-2">
                  <p className="text-[11px] text-gray-700 flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 shrink-0 text-gray-400" />
                    {rec.reason}
                  </p>
                  {rec.evidence.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {rec.evidence.map((e) => (
                        <li key={e} className="text-[11px] text-gray-600">· {e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link
                  href={rec.href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Open <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Button size="sm" variant="ghost" loading={busyId === rec.id} onClick={() => onComplete(rec)}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Done
                </Button>
                <Button size="sm" variant="ghost" loading={busyId === rec.id} onClick={() => onDismiss(rec)} title="Hide this for good">
                  <X className="w-3.5 h-3.5 mr-1.5" /> Not now
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        {feed.basis} Marking one done lets it return if the same thing happens again; “not now” hides it.
      </p>
    </section>
  );
}
