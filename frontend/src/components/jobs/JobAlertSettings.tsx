"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, Play, Trash2, Plus, Info, Clock, PauseCircle, PlayCircle, Check } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import EmptyState from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import {
  EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS, WORK_ARRANGEMENTS, WORK_ARRANGEMENT_LABELS,
  type AlertFrequency, type JobAlert, type JobAlertQuery,
} from "@/services/jobDiscoveryService";

interface Props {
  alerts: JobAlert[];
  scheduler: { available: boolean; message: string; toEnable: string } | null;
  busyId: string | null;
  creating: boolean;
  lastRun: { alertId: string; newCount: number; resultCount: number; notes: string[] } | null;
  onCreate: (input: { name: string; query: Partial<JobAlertQuery>; frequency: AlertFrequency }) => void;
  onToggle: (alert: JobAlert) => void;
  onRun: (alertId: string) => void;
  onDelete: (alertId: string) => void;
}

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/**
 * Saved searches. The UI states plainly that nothing runs in the background in
 * this deployment: an alert is delivered when it is run, and the frequency the
 * user picks is recorded as an intention with what would be needed to honour it.
 */
export default function JobAlertSettings({ alerts, scheduler, busyId, creating, lastRun, onCreate, onToggle, onRun, onDelete }: Props) {
  const [open, setOpen] = useState(alerts.length === 0);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [arrangements, setArrangements] = useState<string[]>([]);
  const [level, setLevel] = useState("");
  const [frequency, setFrequency] = useState<AlertFrequency>("manual");

  const canCreate = name.trim().length >= 2 && (keywords.trim() || titles.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    onCreate({
      name: name.trim(),
      frequency,
      query: {
        keywords: keywords.trim() || undefined,
        titles: toList(titles),
        locations: toList(locations),
        workArrangements: arrangements as JobAlertQuery["workArrangements"],
        experienceLevel: (level || undefined) as JobAlertQuery["experienceLevel"],
      },
    });
    setName(""); setKeywords(""); setTitles(""); setLocations(""); setArrangements([]); setLevel("");
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      {scheduler && !scheduler.available && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
          <h2 className="text-sm font-semibold text-sky-950 inline-flex items-center gap-2">
            <Clock className="w-4 h-4" /> Alerts run when you run them
          </h2>
          <p className="text-xs text-sky-900 mt-1">{scheduler.message}</p>
          <p className="text-[11px] text-sky-900/80 mt-1">{scheduler.toEnable}</p>
        </div>
      )}

      {/* Create */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <BellRing className="w-4 h-4 text-indigo-600" /> New alert
          </h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> {open ? "Close" : "Add alert"}
          </Button>
        </div>

        {open && (
          <form onSubmit={submit} className="mt-3 grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Alert name <span className="text-red-600">*</span></span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Remote React roles" className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Keywords</span>
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="react developer" className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Job titles</span>
              <input value={titles} onChange={(e) => setTitles(e.target.value)} placeholder="Frontend Developer, React Developer" className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Locations</span>
              <input value={locations} onChange={(e) => setLocations(e.target.value)} placeholder="Pune" className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            </label>
            <div>
              <span className="text-xs font-medium text-gray-700">Work arrangement</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WORK_ARRANGEMENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setArrangements((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]))}
                    aria-pressed={arrangements.includes(a)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors",
                      arrangements.includes(a) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    {WORK_ARRANGEMENT_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Experience level</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm">
                <option value="">Any</option>
                {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{EXPERIENCE_LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">How often you want it</span>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as AlertFrequency)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm">
                <option value="manual">Only when I run it</option>
                <option value="daily">Daily (not automatic yet)</option>
                <option value="weekly">Weekly (not automatic yet)</option>
              </select>
              <span className="text-[11px] text-gray-500">Daily and weekly are recorded as intentions; nothing runs in the background here.</span>
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={creating} disabled={!canCreate}>
                <Check className="w-4 h-4 mr-1.5" /> Create alert
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* List */}
      {alerts.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="No alerts yet"
          description="An alert is a saved search. Run it to see what is new since the last time; each listing is announced at most once per alert."
        />
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 inline-flex items-center gap-2 flex-wrap">
                    {a.name}
                    {a.isActive ? <Badge variant="success">active</Badge> : <Badge variant="neutral">paused</Badge>}
                    <Badge variant="info">{a.frequency}</Badge>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {[a.query.keywords, (a.query.titles ?? []).join(", "), (a.query.locations ?? []).join(", "), (a.query.workArrangements ?? []).join(", ")]
                      .filter(Boolean)
                      .join(" · ") || "No filters"}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {a.lastRunAt
                      ? `Last run ${new Date(a.lastRunAt).toLocaleString()} · ${a.lastResultCount} result${a.lastResultCount === 1 ? "" : "s"}, ${a.lastNewCount} new`
                      : "Never run"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" loading={busyId === a.id} onClick={() => onRun(a.id)}>
                    <Play className="w-3.5 h-3.5 mr-1.5" /> Run now
                  </Button>
                  <Button size="sm" variant="ghost" loading={busyId === a.id} onClick={() => onToggle(a)} title={a.isActive ? "Pause" : "Resume"}>
                    {a.isActive ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busyId === a.id} onClick={() => onDelete(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <p className="mt-2 text-[11px] text-gray-500 inline-flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" /> {a.deliveryNote}
              </p>

              {lastRun?.alertId === a.id && (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                  <p className="text-xs text-emerald-900">
                    {lastRun.newCount > 0
                      ? `${lastRun.newCount} new match${lastRun.newCount === 1 ? "" : "es"} added to your notifications.`
                      : "No new matches — everything found had already been announced for this alert."}
                    {" "}
                    <span className="text-emerald-800">({lastRun.resultCount} result{lastRun.resultCount === 1 ? "" : "s"} in total.)</span>
                  </p>
                  {lastRun.notes.map((n) => <p key={n} className="text-[11px] text-emerald-800 mt-0.5">{n}</p>)}
                  <Link href="/dashboard/progress/notifications" className="text-[11px] text-emerald-900 underline font-medium">
                    Open notifications →
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
