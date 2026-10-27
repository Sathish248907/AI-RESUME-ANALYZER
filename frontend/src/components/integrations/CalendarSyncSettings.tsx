"use client";

import { useEffect, useState } from "react";
import { Calendar, RefreshCw, Eye, Info, CheckCircle2, AlertTriangle, History } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { CalendarSyncResult, Integration, SyncLogEntry } from "@/services/integrationService";

interface Props {
  integration: Integration;
  eventTypes: Array<{ key: string; label: string; default: boolean; description: string }>;
  preferences: Record<string, unknown>;
  history: SyncLogEntry[];
  lastResult: CalendarSyncResult | null;
  savingPreferences: boolean;
  syncing: boolean;
  onSavePreferences: (input: Record<string, boolean>) => void;
  onSync: (dryRun: boolean) => void;
}

/**
 * Which event types go to the calendar, and a preview before anything is sent.
 * The preview is the point: a dry run shows exactly what would be created or
 * changed, so the first time something appears in someone's real calendar it is
 * because they chose it.
 */
export default function CalendarSyncSettings({
  integration, eventTypes, preferences, history, lastResult,
  savingPreferences, syncing, onSavePreferences, onSync,
}: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected(Object.fromEntries(eventTypes.map((t) => [t.key, Boolean(preferences[t.key] ?? t.default)])));
  }, [eventTypes, preferences]);

  const connected = integration.connection?.status === "connected";
  const dirty = eventTypes.some((t) => selected[t.key] !== Boolean(preferences[t.key] ?? t.default));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Calendar className="w-4 h-4 text-sky-600" /> Calendar sync
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Events are created on your own calendar with no attendees, so nobody is invited or emailed.
        </p>
      </div>

      {!connected ? (
        <p className="text-sm text-gray-500">Connect Google Calendar to choose what gets synced.</p>
      ) : (
        <>
          <div className="space-y-2">
            {eventTypes.map((t) => (
              <label key={t.key} className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={Boolean(selected[t.key])}
                  onChange={(e) => setSelected((s) => ({ ...s, [t.key]: e.target.checked }))}
                  className="mt-0.5 rounded border-gray-300"
                />
                <span className="min-w-0">
                  <span className="text-sm text-gray-900 flex items-center gap-1.5">
                    {t.label}
                    {!t.default && <Badge variant="neutral">off by default</Badge>}
                  </span>
                  <span className="block text-[11px] text-gray-600">{t.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" loading={savingPreferences} disabled={!dirty} onClick={() => onSavePreferences(selected)}>
              Save choices
            </Button>
            <Button size="sm" variant="outline" loading={syncing} onClick={() => onSync(true)}>
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
            </Button>
            <Button size="sm" variant="outline" loading={syncing} onClick={() => onSync(false)}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", syncing && "animate-spin")} /> Sync now
            </Button>
          </div>

          {lastResult && (
            <div className={cn("rounded-lg border px-3 py-2", lastResult.dryRun ? "border-sky-100 bg-sky-50/60" : "border-emerald-100 bg-emerald-50/50")}>
              <p className="text-xs font-semibold text-gray-900">
                {lastResult.dryRun ? "Preview — nothing was sent" : "Sync complete"}
              </p>
              <p className="text-[11px] text-gray-700 mt-0.5">
                {lastResult.considered} item{lastResult.considered === 1 ? "" : "s"} considered ·{" "}
                {lastResult.created} created · {lastResult.updated} updated · {lastResult.unchanged} unchanged
                {lastResult.failed > 0 && <span className="text-red-700"> · {lastResult.failed} failed</span>}
              </p>
              {lastResult.results.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {lastResult.results.slice(0, 8).map((r, i) => (
                    <li key={`${r.source.id}-${i}`} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                      {r.action === "failed"
                        ? <AlertTriangle className="w-3 h-3 mt-0.5 text-red-500 shrink-0" />
                        : <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-600 shrink-0" />}
                      <span>
                        <strong>{r.source.summary}</strong> — {r.action.replace(/_/g, " ")}
                        {r.error && <span className="text-red-700"> · {r.error}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-gray-500 mt-1">{lastResult.note}</p>
            </div>
          )}

          {history.length > 0 && (
            <details className="rounded-lg border border-gray-200 px-3 py-2">
              <summary className="text-xs text-gray-700 cursor-pointer inline-flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" /> What this app has done on your calendar ({history.length})
              </summary>
              <ul className="mt-1.5 space-y-1">
                {history.map((h) => (
                  <li key={h.id} className="text-[11px] text-gray-700 flex items-start gap-1.5">
                    <span className={cn("mt-1 w-1.5 h-1.5 rounded-full shrink-0", h.status === "ok" ? "bg-emerald-500" : h.status === "warning" ? "bg-amber-500" : "bg-red-500")} />
                    <span>
                      <strong>{h.action.replace(/_/g, " ")}</strong>
                      {h.detail && <span className="text-gray-600"> — {h.detail}</span>}
                      <span className="block text-gray-400">{new Date(h.createdAt).toLocaleString()}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Syncing twice does not create duplicates: each item is linked to the event it created, and an unchanged item is not re-sent.
          </p>
        </>
      )}
    </section>
  );
}
