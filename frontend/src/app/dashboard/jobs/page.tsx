"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobsPageShell from "@/components/jobs/JobsPageShell";
import JobSearchFilters from "@/components/jobs/JobSearchFilters";
import JobResultsList from "@/components/jobs/JobResultsList";
import ProviderSetupNotice from "@/components/jobs/ProviderSetupNotice";
import {
  deleteSavedJob, discoverJobs, refreshJobs, saveJob,
  type DiscoverQuery, type DiscoverResult, type SavedState,
} from "@/services/jobDiscoveryService";

const PAGE_SIZE = 20;

/**
 * Job discovery. The search is server-driven: filters, matching and ranking all
 * happen on the backend, so this page never computes a score and never fills in
 * a field the provider did not supply.
 */
export default function JobDiscoveryPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [query, setQuery] = useState<DiscoverQuery>({ sort: "relevance", source: "all", page: 1, limit: PAGE_SIZE });
  const [result, setResult] = useState<DiscoverResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  /** Guards against an older in-flight search overwriting a newer one. */
  const requestId = useRef(0);

  const run = useCallback(async (q: DiscoverQuery, { append = false } = {}) => {
    if (!user) return;
    const id = ++requestId.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const data = await discoverJobs(q);
      if (id !== requestId.current) return; // a newer search has started
      setResult((prev) => (append && prev ? { ...data, items: [...prev.items, ...data.items] } : data));
    } catch (err) {
      if (id === requestId.current) setError(toApiClientError(err).message);
    } finally {
      if (id === requestId.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    run({ sort: "relevance", source: "all", page: 1, limit: PAGE_SIZE });
  }, [ready, user, run]);

  /** Filter edits apply immediately; free text waits for submit. */
  function change(patch: Partial<DiscoverQuery>) {
    setQuery((prev) => {
      const next = { ...prev, ...patch };
      const onlyText = Object.keys(patch).length === 1 && "q" in patch;
      if (!onlyText) run(next);
      return next;
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      const r = await refreshJobs({ q: query.q, location: query.location });
      toast.success(
        r.created > 0
          ? `${r.created} new listing${r.created === 1 ? "" : "s"} fetched${r.updated ? `, ${r.updated} updated` : ""}.`
          : r.partial ? "Some providers did not respond; nothing was substituted." : "No new listings — your providers returned what you already have."
      );
      await run({ ...query, page: 1 });
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function onSave(jobId: string, state: SavedState) {
    setBusyJobId(jobId);
    try {
      await saveJob({ jobId, state });
      toast.success(state === "hidden" ? "Hidden from your results." : "Saved.");
      await run({ ...query, page: 1 });
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyJobId(null);
    }
  }

  async function onUnsave(savedJobId: string) {
    const item = result?.items.find((i) => i.savedJobId === savedJobId);
    setBusyJobId(item?.job.id ?? null);
    try {
      await deleteSavedJob(savedJobId);
      toast.success("Removed from your saved jobs.");
      await run({ ...query, page: 1 });
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyJobId(null);
    }
  }

  function loadMore() {
    const next = { ...query, page: (result?.page ?? 1) + 1 };
    setQuery(next);
    run(next, { append: true });
  }

  return (
    <JobsPageShell
      current="/dashboard/jobs"
      title="Job Discovery"
      description="Real listings from the providers you configure, matched against your own resume versions and explained."
      icon={Search}
      loading={loading && !result}
      error={error && !result ? error : null}
      onRetry={() => run(query)}
    >
      <div className="space-y-4">
        <JobSearchFilters
          query={query}
          busy={loading}
          refreshing={refreshing}
          providerConfigured={result?.providerStatus.configured ?? false}
          resumeVersions={result?.availableResumeVersions ?? []}
          activeResumeVersionId={result?.resumeVersion?.id ?? null}
          onChange={change}
          onSubmit={() => run({ ...query, page: 1 })}
          onRefresh={onRefresh}
        />

        <ProviderSetupNotice setup={result?.setup ?? null} status={result?.providerStatus ?? null} />

        <JobResultsList
          result={result}
          loading={loading && !result}
          loadingMore={loadingMore}
          error={error}
          busyJobId={busyJobId}
          onSave={onSave}
          onUnsave={onUnsave}
          onLoadMore={loadMore}
          onRetry={() => (result?.providerStatus.configured ? onRefresh() : run({ ...query, page: 1 }))}
        />
      </div>
    </JobsPageShell>
  );
}
