"use client";

import { Briefcase, AlertCircle, Info, Loader2 } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import JobCard from "./JobCard";
import type { DiscoverResult, SavedState } from "@/services/jobDiscoveryService";

interface Props {
  result: DiscoverResult | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  busyJobId: string | null;
  onSave: (jobId: string, state: SavedState) => void;
  onUnsave: (savedJobId: string) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

/**
 * The results region: loading, error, no-results and partial-source states are
 * all distinct, because "no jobs matched" and "a provider failed" mean very
 * different things to someone searching.
 */
export default function JobResultsList({
  result, loading, loadingMore, error, busyJobId, onSave, onUnsave, onLoadMore, onRetry,
}: Props) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={4} />)}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load jobs"
        description={error}
        action={{ label: "Try again", onClick: onRetry }}
      />
    );
  }

  if (!result) return null;

  const { items, total, page, totalPages, hasMore, providerStatus, notes, filtersApplied } = result;

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {notes.length > 0 && (
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n} className="text-xs text-gray-600 flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" /> {n}
              </li>
            ))}
          </ul>
        )}
        <EmptyState
          icon={Briefcase}
          title="No jobs match this search"
          description={
            providerStatus.configured
              ? "Nothing in the current results matches these filters. Widen them, or refresh to fetch newer listings from your providers."
              : "No external provider is configured, so only job descriptions you entered yourself are searched."
          }
          action={{ label: "Refresh listings", onClick: onRetry }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900 tabular-nums">{total}</strong> job{total === 1 ? "" : "s"}
          {totalPages > 1 && <span className="text-gray-400"> · page {page} of {totalPages}</span>}
          {filtersApplied.hiddenExcluded > 0 && <span className="text-gray-400"> · {filtersApplied.hiddenExcluded} hidden</span>}
        </p>
        {providerStatus.attribution.length > 0 && (
          <p className="text-[11px] text-gray-400">{providerStatus.attribution.join(" · ")}</p>
        )}
      </div>

      {providerStatus.partial && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 inline-flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          These results are incomplete: at least one provider did not respond. Nothing has been substituted for the missing listings.
        </p>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((n) => (
            <li key={n} className="text-xs text-gray-600 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" /> {n}
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3">
        {items.map((item) => (
          <JobCard
            key={item.job.id}
            item={item}
            busy={busyJobId === item.job.id}
            onSave={(state) => onSave(item.job.id, state)}
            onUnsave={item.savedJobId ? () => onUnsave(item.savedJobId as string) : undefined}
          />
        ))}
      </ul>

      {hasMore && (
        <div className="pt-1 text-center">
          <Button variant="outline" onClick={onLoadMore} loading={loadingMore}>
            {loadingMore ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
