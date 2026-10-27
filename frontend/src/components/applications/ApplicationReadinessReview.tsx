"use client";

import Link from "next/link";
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, HelpCircle, Info, RefreshCw, ArrowRight,
} from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import type { ReadinessItem, ReadinessReview } from "@/services/applicationWorkspaceService";

interface Props {
  review: ReadinessReview | null;
  busy: boolean;
  onRun: () => void;
}

const STATE_META: Record<ReadinessItem["state"], { icon: typeof CheckCircle2; cls: string; label: string }> = {
  ready: { icon: CheckCircle2, cls: "text-emerald-600", label: "Ready" },
  attention: { icon: AlertTriangle, cls: "text-amber-600", label: "Worth a look" },
  unknown: { icon: HelpCircle, cls: "text-gray-400", label: "Not known" },
};

/**
 * The optional pre-submission review. It has no pass mark and never blocks:
 * items are grouped as ready, worth-a-look, or simply unknown, and "unknown"
 * is kept visually distinct from a real problem.
 */
export default function ApplicationReadinessReview({ review, busy, onRun }: Props) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-sky-600" /> Readiness review
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            An optional check of your own records before you send this. It cannot stop you applying.
          </p>
        </div>
        <Button size="sm" variant="outline" loading={busy} onClick={onRun}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} />
          {review ? "Run again" : "Run review"}
        </Button>
      </div>

      {!review ? (
        <p className="text-sm text-gray-500">
          Run it to see what is in place and what is missing. Nothing is scored, and nothing is blocked.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-sm text-gray-900">{review.verdict}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {review.counts.ready} ready · {review.counts.attention} worth a look · {review.counts.unknown} not known
            </p>
          </div>

          <ul className="space-y-1.5">
            {review.items.map((item) => {
              const meta = STATE_META[item.state];
              const Icon = meta.icon;
              return (
                <li
                  key={item.key}
                  className={cn(
                    "rounded-lg border px-3 py-2.5",
                    item.state === "attention" ? "border-amber-200 bg-amber-50/40"
                      : item.state === "ready" ? "border-emerald-100 bg-emerald-50/30"
                        : "border-gray-200"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", meta.cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {item.label}
                        <span className="text-[11px] font-normal text-gray-400 ml-1.5">{meta.label}</span>
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.because}</p>
                      {item.action && (
                        <Link href={item.action.href} className="text-[11px] text-indigo-700 hover:underline inline-flex items-center gap-1 mt-1 font-medium">
                          {item.action.label} <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" /> {review.disclaimer}
          </p>
        </>
      )}
    </section>
  );
}
