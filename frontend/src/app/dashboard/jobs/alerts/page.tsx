"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobsPageShell from "@/components/jobs/JobsPageShell";
import JobAlertSettings from "@/components/jobs/JobAlertSettings";
import {
  createJobAlert, deleteJobAlert, listJobAlerts, runJobAlert, updateJobAlert,
  type AlertFrequency, type JobAlert, type JobAlertQuery,
} from "@/services/jobDiscoveryService";

/** Saved searches, run on demand. Nothing is scheduled in this deployment. */
export default function JobAlertsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [scheduler, setScheduler] = useState<{ available: boolean; message: string; toEnable: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastRun, setLastRun] = useState<{ alertId: string; newCount: number; resultCount: number; notes: string[] } | null>(null);
  const [toDelete, setToDelete] = useState<JobAlert | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const r = await listJobAlerts();
      setAlerts(r.alerts);
      setScheduler(r.scheduler);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  async function onCreate(input: { name: string; query: Partial<JobAlertQuery>; frequency: AlertFrequency }) {
    setCreating(true);
    try {
      await createJobAlert(input);
      toast.success("Alert created. Run it to see what it finds.");
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(alert: JobAlert) {
    setBusyId(alert.id);
    try {
      await updateJobAlert(alert.id, { isActive: !alert.isActive });
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onRun(alertId: string) {
    setBusyId(alertId);
    try {
      const r = await runJobAlert(alertId);
      setLastRun({ alertId, newCount: r.newCount, resultCount: r.resultCount, notes: r.notes });
      toast.success(
        r.newCount > 0
          ? `${r.newCount} new match${r.newCount === 1 ? "" : "es"} added to your notifications.`
          : "No new matches — everything found had already been announced for this alert."
      );
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await deleteJobAlert(toDelete.id);
      toast.success("Alert deleted.");
      setToDelete(null);
      await load();
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <JobsPageShell
      current="/dashboard/jobs/alerts"
      title="Job Alerts"
      description="Saved searches you can re-run. Each listing is announced at most once per alert."
      icon={BellRing}
      loading={loading && alerts.length === 0}
      error={error}
      onRetry={load}
    >
      <JobAlertSettings
        alerts={alerts}
        scheduler={scheduler}
        busyId={busyId}
        creating={creating}
        lastRun={lastRun}
        onCreate={onCreate}
        onToggle={onToggle}
        onRun={onRun}
        onDelete={(id) => setToDelete(alerts.find((a) => a.id === id) ?? null)}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Delete the alert “${toDelete?.name}”?`}
        message="The saved search is removed. Notifications it already created stay in your notification list."
        confirmLabel="Delete alert"
        busy={busyId === toDelete?.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </JobsPageShell>
  );
}
