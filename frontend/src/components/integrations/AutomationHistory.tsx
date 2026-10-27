"use client";

import { History, RotateCcw, CheckCircle2, XCircle, MinusCircle, Clock, AlertTriangle } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import { ACTION_STATUS_LABELS, type AutomationExecution } from "@/services/integrationService";

interface Props {
  executions: AutomationExecution[];
  retryingId: string | null;
  onRetry: (executionId: string) => void;
}

const STATUS_STYLE: Record<AutomationExecution["status"], string> = {
  succeeded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  failed: "bg-red-50 text-red-800 border-red-200",
  awaiting_approval: "bg-amber-50 text-amber-800 border-amber-200",
  planned: "bg-sky-50 text-sky-800 border-sky-200",
  skipped: "bg-gray-100 text-gray-600 border-gray-200",
};

const RESULT_ICON = {
  ok: CheckCircle2,
  failed: XCircle,
  skipped: MinusCircle,
  skipped_needs_approval: Clock,
} as const;

/**
 * Every run this app has made on the user's behalf, with each action's outcome
 * spelled out. A failed run says whether it will retry itself and when, or
 * whether it is waiting on the user to reconnect something — a retry button
 * that cannot succeed is not shown.
 */
export default function AutomationHistory({ executions, retryingId, onRetry }: Props) {
  if (executions.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" /> Automation history
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          Nothing has run yet. Every run is recorded here with what it did, so there is no hidden activity.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
        <History className="w-4 h-4 text-gray-500" /> Automation history
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        {executions.length} run{executions.length === 1 ? "" : "s"}, newest first.
      </p>

      <ol className="mt-3 space-y-2">
        {executions.map((ex) => (
          <li key={ex.id} className="rounded-lg border border-gray-200 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900">
                  {ex.trigger ?? "Manual run"}
                </p>
                <p className="text-[11px] text-gray-400">{new Date(ex.createdAt).toLocaleString()}</p>
              </div>
              <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[ex.status])}>
                {ex.statusLabel}
              </span>
            </div>

            {ex.results.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {ex.results.map((r, i) => {
                  const Icon = RESULT_ICON[r.status];
                  return (
                    <li key={`${r.type}-${i}`} className="text-[11px] flex items-start gap-1.5">
                      <Icon className={cn(
                        "w-3 h-3 mt-0.5 shrink-0",
                        r.status === "ok" ? "text-emerald-600"
                          : r.status === "failed" ? "text-red-500"
                          : r.status === "skipped_needs_approval" ? "text-amber-500"
                          : "text-gray-400",
                      )} />
                      <span className="text-gray-700">
                        <span className="text-gray-500">{ACTION_STATUS_LABELS[r.status]} —</span> {r.detail}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Planned but never executed: an awaiting-approval run */}
            {ex.results.length === 0 && ex.plannedActions.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {ex.plannedActions.map((a, i) => (
                  <li key={`${a.type}-${i}`} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <Clock className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                    <span>Planned, not run: {a.preview}</span>
                  </li>
                ))}
              </ul>
            )}

            {(ex.errorCategory || ex.retryCount > 0 || ex.retryable) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {ex.errorCategory === "needs_reconnect" && (
                  <span className="text-[11px] text-amber-900 inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Reconnect the integration, then retry.
                  </span>
                )}
                {ex.retryCount > 0 && <Badge variant="neutral">attempt {ex.retryCount + 1}</Badge>}
                {ex.nextRetryAt && (
                  <span className="text-[11px] text-gray-500">
                    Next automatic attempt {new Date(ex.nextRetryAt).toLocaleString()}
                  </span>
                )}
                {ex.retryable && (
                  <Button size="sm" variant="ghost" loading={retryingId === ex.id} onClick={() => onRetry(ex.id)}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry now
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
