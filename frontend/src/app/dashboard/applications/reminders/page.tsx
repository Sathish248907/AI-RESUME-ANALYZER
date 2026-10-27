"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, AlertCircle, Lock } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ApplicationReminders from "@/components/applications/ApplicationReminders";
import {
  createReminder, deleteReminder, getWorkspaceDashboard, listReminders, updateReminder,
  type DashboardItem, type Reminder, type ReminderGroups, type SchedulerContract,
} from "@/services/applicationWorkspaceService";

/** Reminders across every application, grouped by the viewer's own calendar. */
export default function RemindersPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [groups, setGroups] = useState<ReminderGroups | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerContract | null>(null);
  const [applications, setApplications] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [reminders, dashboard] = await Promise.all([listReminders(), getWorkspaceDashboard()]);
      setGroups(reminders);
      setScheduler(reminders.scheduler ?? dashboard.scheduler);
      setApplications(dashboard.items);
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

  const run = async (fn: () => Promise<void>, success?: string) => {
    try { await fn(); await load(); if (success) toast.success(success); }
    catch (err) { toast.error(toApiClientError(err).message); }
  };

  /** Which application a reminder belongs to, shown on the cross-application view. */
  const context = (r: Reminder) => {
    if (!r.applicationId) return null;
    const app = applications.find((a) => a.id === r.applicationId);
    if (!app) return null;
    return (
      <Link href={`/dashboard/applications/${app.id}`} className="text-[11px] text-indigo-700 hover:underline block mt-0.5">
        {app.jobTitle} · {app.companyName} →
      </Link>
    );
  };

  if (!ready || (user && loading)) {
    return <div className="max-w-4xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={8} /></div>;
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={Lock} title="Sign in to see your reminders" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/applications/reminders" }} />
      </div>
    );
  }
  if (error || !groups || !scheduler) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={AlertCircle} title="Could not load reminders" description={error ?? undefined} action={{ label: "Retry", onClick: load }} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <Link href="/dashboard/applications" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> All applications
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell className="w-6 h-6 text-amber-600" /> Reminders
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Deadlines, follow-ups and interview times across every application.
        </p>
      </header>

      <ApplicationReminders
        groups={groups}
        scheduler={scheduler}
        busyId={busyId}
        adding={adding}
        renderContext={context}
        onAdd={async (input) => {
          setAdding(true);
          await run(async () => {
            const r = await createReminder(input);
            if (!r.created) toast.success(r.note ?? "A matching reminder already exists.");
          });
          setAdding(false);
        }}
        onComplete={(r) => run(async () => { setBusyId(r.id); await updateReminder(r.id, { status: "done" }); setBusyId(null); }, "Done.")}
        onDelete={(r) => run(async () => { setBusyId(r.id); await deleteReminder(r.id); setBusyId(null); })}
      />
    </div>
  );
}
