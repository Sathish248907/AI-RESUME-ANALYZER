"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobsPageShell from "@/components/jobs/JobsPageShell";
import SavedJobs from "@/components/jobs/SavedJobs";
import {
  deleteSavedJob, listSavedJobs, startApplication, updateSavedJob,
  type SavedJobItem, type SavedState,
} from "@/services/jobDiscoveryService";

/** Saved, interested and hidden jobs. Applications live in the Phase 5 tracker. */
export default function SavedJobsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [items, setItems] = useState<SavedJobItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<SavedState | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<SavedJobItem | null>(null);

  const load = useCallback(async (state: SavedState | "all") => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const r = await listSavedJobs(state === "all" ? {} : { state });
      setItems(r.items); setCounts(r.counts); setNote(r.note);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load(filter);
  }, [ready, user, load, filter]);

  async function onChangeState(savedJobId: string, state: SavedState) {
    setBusyId(savedJobId);
    try {
      await updateSavedJob(savedJobId, { state });
      toast.success(state === "hidden" ? "Hidden." : state === "interested" ? "Marked as interested." : "Moved back to saved.");
      await load(filter);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveNotes(savedJobId: string, notes: string) {
    setBusyId(savedJobId);
    try {
      await updateSavedJob(savedJobId, { notes: notes.trim() ? notes : null });
      toast.success("Note saved.");
      await load(filter);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onStartApplicationFor(savedJobId: string) {
    setBusyId(savedJobId);
    try {
      const r = await startApplication(savedJobId, { status: "INTERESTED" });
      toast.success(r.note);
      await load(filter);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemove() {
    if (!toRemove) return;
    setBusyId(toRemove.savedJobId);
    try {
      await deleteSavedJob(toRemove.savedJobId);
      toast.success("Removed from your saved jobs.");
      setToRemove(null);
      await load(filter);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <JobsPageShell
      current="/dashboard/jobs/saved"
      title="Saved Jobs"
      description="Jobs you kept, with your notes and a link to the application tracker."
      icon={Bookmark}
      loading={loading && items.length === 0}
      error={error}
      onRetry={() => load(filter)}
    >
      <SavedJobs
        items={items}
        counts={counts}
        note={note}
        filter={filter}
        busyId={busyId}
        onFilter={setFilter}
        onChangeState={onChangeState}
        onSaveNotes={onSaveNotes}
        onRemove={(id) => setToRemove(items.find((i) => i.savedJobId === id) ?? null)}
        onStartApplication={onStartApplicationFor}
      />

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={`Remove “${toRemove?.job.title}” from saved jobs?`}
        message="Your notes on this job are deleted. Any application record you created stays in the application tracker."
        confirmLabel="Remove"
        busy={busyId === toRemove?.savedJobId}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </JobsPageShell>
  );
}
