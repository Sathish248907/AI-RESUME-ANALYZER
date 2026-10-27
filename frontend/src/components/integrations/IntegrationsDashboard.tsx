"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert, AlertCircle, Info } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { toApiClientError } from "@/services/api";
import IntegrationCard from "./IntegrationCard";
import IntegrationSettings from "./IntegrationSettings";
import AutomationCenter from "./AutomationCenter";
import AutomationHistory from "./AutomationHistory";
import {
  connectIntegration, disconnectIntegration, getEmailHistory, getEmailSettings,
  getSyncHistory, listExecutions, listIntegrations, listWorkflows, pauseAllAutomation,
  previewRule, retryExecution, runRule, saveCalendarPreferences, saveEmailPreferences,
  syncIntegration, updateRule, upsertRule,
  type AutomationExecution, type AutomationPreview, type CalendarSyncResult, type EmailStatus,
  type Integration, type IntegrationsOverview, type SyncLogEntry, type Workflow,
} from "@/services/integrationService";

interface EmailDelivery {
  id: string; subject: string; recipient: string; statusLabel: string; transport: string; createdAt: string;
}

const CONFIGURABLE = ["google_calendar", "google_drive", "email"];

/**
 * The integrations and automation dashboard.
 *
 * Two rules shape this screen. First, nothing is shown as connectable unless
 * the server could actually finish the flow — an integration without
 * credentials shows what to set instead of a button that fails. Second, every
 * automation is off until switched on, and anything that leaves the app needs an
 * explicit approval after a preview, so the user always sees the plan first.
 */
export default function IntegrationsDashboard() {
  const toast = useToast();

  const [overview, setOverview] = useState<IntegrationsOverview | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [safety, setSafety] = useState<{ message: string; externalActionsRequireApproval: boolean } | null>(null);
  const [anyEnabled, setAnyEnabled] = useState(false);
  const [executions, setExecutions] = useState<AutomationExecution[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailPreferences, setEmailPreferences] = useState<Record<string, boolean>>({});
  const [deliveries, setDeliveries] = useState<EmailDelivery[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [calendarHistory, setCalendarHistory] = useState<SyncLogEntry[]>([]);
  const [calendarResult, setCalendarResult] = useState<CalendarSyncResult | null>(null);

  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState<Integration | null>(null);

  const [previews, setPreviews] = useState<Record<string, AutomationPreview | null>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [ov, wf, ex, mail] = await Promise.all([
        listIntegrations(), listWorkflows(), listExecutions({ limit: 25 }), getEmailSettings(),
      ]);
      setOverview(ov);
      setWorkflows(wf.workflows);
      setSafety(wf.safety);
      setAnyEnabled(wf.anyEnabled);
      setExecutions(ex.executions);
      setEmailStatus(mail);
      setEmailPreferences(mail.preferences);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshAutomation = useCallback(async () => {
    const [wf, ex] = await Promise.all([listWorkflows(), listExecutions({ limit: 25 })]);
    setWorkflows(wf.workflows);
    setSafety(wf.safety);
    setAnyEnabled(wf.anyEnabled);
    setExecutions(ex.executions);
  }, []);

  const fail = (err: unknown) => toast.error(toApiClientError(err).message);

  // Integrations

  const onConnect = async (integration: Integration) => {
    setBusyProvider(integration.provider);
    try {
      const { authorizationUrl } = await connectIntegration(integration.provider, { returnTo: "/dashboard/integrations" });
      // The provider's own consent screen does the rest; the callback lands
      // back here with ?connected= or ?error=.
      window.location.assign(authorizationUrl);
    } catch (err) {
      fail(err);
      setBusyProvider(null);
    }
  };

  const onDisconnect = async (integration: Integration) => {
    setBusyProvider(integration.provider);
    try {
      const result = await disconnectIntegration(integration.provider);
      toast.success(result.revokedAtProvider
        ? "Disconnected, and the grant was revoked at the provider."
        : result.note);
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setBusyProvider(null);
      setDisconnecting(null);
    }
  };

  const openSettings = async (integration: Integration) => {
    setSelected(integration.provider);
    setCalendarResult(null);
    try {
      if (integration.provider === "google_calendar" && integration.connection?.status === "connected") {
        setCalendarHistory((await getSyncHistory("google_calendar", { limit: 25 })).entries);
      }
      if (integration.provider === "email") {
        const history = await getEmailHistory({ limit: 25 });
        setDeliveries(history.deliveries);
        setEmailStatus(history);
      }
    } catch (err) {
      fail(err);
    }
  };

  const onSaveCalendarPreferences = async (input: Record<string, boolean>) => {
    setSavingPreferences(true);
    try {
      await saveCalendarPreferences(input);
      toast.success("Saved.");
      await load();
    } catch (err) { fail(err); } finally { setSavingPreferences(false); }
  };

  const onSync = async (dryRun: boolean) => {
    setSyncing(true);
    try {
      const result = await syncIntegration("google_calendar", { dryRun });
      setCalendarResult(result);
      if (!dryRun) {
        setCalendarHistory((await getSyncHistory("google_calendar", { limit: 25 })).entries);
        toast.success(`${result.created} created, ${result.updated} updated.`);
      }
    } catch (err) { fail(err); } finally { setSyncing(false); }
  };

  const onSaveEmailPreferences = async (input: Record<string, boolean>) => {
    setSavingPreferences(true);
    try {
      const { preferences } = await saveEmailPreferences(input);
      setEmailPreferences(preferences);
      toast.success("Saved.");
    } catch (err) { fail(err); } finally { setSavingPreferences(false); }
  };

  // Automation

  /** A workflow with no stored rule gets one on first use. */
  const ensureRule = async (workflow: Workflow, isEnabled: boolean, config?: Record<string, unknown>) => {
    if (workflow.rule.id) {
      return updateRule(workflow.rule.id, { isEnabled, ...(config ? { config } : {}) });
    }
    return upsertRule({ workflowKey: workflow.key, isEnabled, config: config ?? workflow.rule.config ?? {} });
  };

  const onToggle = async (workflow: Workflow, enabled: boolean) => {
    setBusyKey(workflow.key);
    try {
      await ensureRule(workflow, enabled);
      setPreviews((p) => ({ ...p, [workflow.key]: null }));
      await refreshAutomation();
      toast.success(enabled ? `${workflow.name} is on.` : `${workflow.name} is off.`);
    } catch (err) { fail(err); } finally { setBusyKey(null); }
  };

  const onSaveConfig = async (workflow: Workflow, config: Record<string, unknown>) => {
    setBusyKey(workflow.key);
    try {
      await ensureRule(workflow, workflow.rule.isEnabled, config);
      await refreshAutomation();
      toast.success("Settings saved.");
    } catch (err) { fail(err); } finally { setBusyKey(null); }
  };

  const onPreview = async (workflow: Workflow) => {
    const ruleId = workflow.rule.id;
    if (!ruleId) return;
    setPreviewingKey(workflow.key);
    try {
      setPreviews((p) => ({ ...p, [workflow.key]: null }));
      const plan = await previewRule(ruleId);
      setPreviews((p) => ({ ...p, [workflow.key]: plan }));
    } catch (err) { fail(err); } finally { setPreviewingKey(null); }
  };

  const onRun = async (workflow: Workflow, approved: boolean) => {
    const ruleId = workflow.rule.id;
    if (!ruleId) return;
    setRunningKey(workflow.key);
    try {
      const result = await runRule(ruleId, { approved });
      setPreviews((p) => ({ ...p, [workflow.key]: result.plan }));
      if (!result.ran) {
        toast.info(result.plan.reason);
      } else if (result.execution.status === "awaiting_approval") {
        toast.info("The step that leaves the app needs your approval. Review the plan, then approve it.");
      } else {
        const c = result.counts;
        toast.success(c ? `${c.ok} done, ${c.skipped} skipped, ${c.failed} failed.` : result.execution.statusLabel);
      }
      await refreshAutomation();
    } catch (err) { fail(err); } finally { setRunningKey(null); }
  };

  const onPauseAll = async () => {
    setPausing(true);
    try {
      const { paused, note } = await pauseAllAutomation();
      toast.success(paused > 0 ? `${paused} workflow${paused === 1 ? "" : "s"} paused.` : note);
      setPreviews({});
      await refreshAutomation();
    } catch (err) { fail(err); } finally { setPausing(false); }
  };

  const onRetry = async (executionId: string) => {
    setRetryingId(executionId);
    try {
      const { counts, note } = await retryExecution(executionId);
      toast.success(counts ? `${counts.ok} done, ${counts.failed} failed.` : note);
      await refreshAutomation();
    } catch (err) { fail(err); } finally { setRetryingId(null); }
  };

  // Render

  const grouped = useMemo(() => {
    if (!overview) return [];
    return overview.categories
      .map((c) => ({ ...c, items: overview.integrations.filter((i) => i.category === c.key) }))
      .filter((c) => c.items.length > 0);
  }, [overview]);

  const selectedIntegration = overview?.integrations.find((i) => i.provider === selected) ?? null;

  if (loading) {
    return <div className="space-y-4"><SkeletonCard lines={6} /><SkeletonCard lines={6} /></div>;
  }
  if (error || !overview || !emailStatus) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Could not load integrations"
        description={error ?? undefined}
        action={{ label: "Retry", onClick: load }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* The vault gates every OAuth connection, so its state leads. */}
      {!overview.vault.configured && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{overview.vault.note}</span>
        </p>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Integrations", value: overview.counts.total },
          { label: "Connected", value: overview.counts.connected },
          { label: "Ready to connect", value: overview.counts.available },
          { label: "Need setup", value: overview.counts.needsSetup },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <dt className="text-[11px] text-gray-500">{s.label}</dt>
            <dd className="text-xl font-semibold text-gray-900">{s.value}</dd>
          </div>
        ))}
      </dl>

      {grouped.map((group) => (
        <section key={group.key}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</h2>
          <ul className="mt-2 space-y-3">
            {group.items.map((integration) => (
              <IntegrationCard
                key={integration.provider}
                integration={integration}
                busy={busyProvider === integration.provider}
                onConnect={() => onConnect(integration)}
                onDisconnect={() => setDisconnecting(integration)}
                onConfigure={
                  CONFIGURABLE.includes(integration.provider)
                    ? () => openSettings(integration)
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      ))}

      {selectedIntegration && (
        <IntegrationSettings
          integration={selectedIntegration}
          overview={overview}
          calendarHistory={calendarHistory}
          calendarResult={calendarResult}
          emailPreferences={emailPreferences}
          emailStatus={emailStatus}
          deliveries={deliveries}
          savingPreferences={savingPreferences}
          syncing={syncing}
          onClose={() => setSelected(null)}
          onSaveCalendarPreferences={onSaveCalendarPreferences}
          onSync={onSync}
          onSaveEmailPreferences={onSaveEmailPreferences}
          onError={(m) => toast.error(m)}
          onSuccess={(m) => toast.success(m)}
        />
      )}

      <AutomationCenter
        workflows={workflows}
        previews={previews}
        safety={safety}
        anyEnabled={anyEnabled}
        busyKey={busyKey}
        previewingKey={previewingKey}
        runningKey={runningKey}
        pausing={pausing}
        onToggle={onToggle}
        onSaveConfig={onSaveConfig}
        onPreview={onPreview}
        onRun={onRun}
        onPauseAll={onPauseAll}
      />

      <AutomationHistory executions={executions} retryingId={retryingId} onRetry={onRetry} />

      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" /> {overview.note}
      </p>

      <ConfirmDialog
        open={Boolean(disconnecting)}
        title={`Disconnect ${disconnecting?.displayName ?? ""}?`}
        message="The stored tokens are deleted and this app loses access immediately. Anything already created in your calendar or Drive stays where it is."
        confirmLabel="Disconnect"
        busy={Boolean(busyProvider)}
        onConfirm={() => disconnecting && onDisconnect(disconnecting)}
        onCancel={() => setDisconnecting(null)}
      />
    </div>
  );
}
