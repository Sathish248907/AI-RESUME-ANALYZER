"use client";

import { useState } from "react";
import {
  Bell, Plus, Check, Trash2, Clock, AlertTriangle, Info, CalendarClock,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  REMINDER_TYPES, browserTimeZone,
  type Reminder, type ReminderGroups, type ReminderType, type SchedulerContract,
} from "@/services/applicationWorkspaceService";

interface Props {
  groups: ReminderGroups;
  scheduler: SchedulerContract;
  /** Omitted on the cross-application page, where each reminder shows its own job. */
  applicationId?: string;
  busyId: string | null;
  adding: boolean;
  onAdd: (input: { type: ReminderType; title: string; note?: string; dueAt: string }) => void;
  onComplete: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  /** Rendered next to a reminder on the cross-application view. */
  renderContext?: (reminder: Reminder) => React.ReactNode;
}

const TYPE_LABELS: Record<ReminderType, string> = {
  deadline: "Application deadline", follow_up: "Follow-up",
  interview: "Interview", assessment: "Assessment deadline", custom: "Reminder",
};

const GROUP_META: Array<{ key: keyof ReminderGroups["groups"]; label: string; tone: string; icon: typeof Bell }> = [
  { key: "overdue", label: "Overdue", tone: "text-red-700", icon: AlertTriangle },
  { key: "today", label: "Today", tone: "text-amber-700", icon: Clock },
  { key: "this_week", label: "This week", tone: "text-sky-700", icon: CalendarClock },
  { key: "later", label: "Later", tone: "text-gray-600", icon: Bell },
];

/**
 * Reminders, grouped by the viewer's own calendar day. A reminder set in
 * another timezone shows both readings, so a 9am follow-up set while travelling
 * does not silently become 3am.
 */
export default function ApplicationReminders({
  groups, scheduler, applicationId, busyId, adding, onAdd, onComplete, onDelete, renderContext,
}: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReminderType>("follow_up");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2 || !dueAt) return;
    onAdd({ type, title: title.trim(), note: note.trim() || undefined, dueAt: new Date(dueAt).toISOString() });
    setTitle(""); setNote(""); setDueAt(""); setOpen(false);
  };

  const total = groups.counts.pending;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" /> Reminders
            {groups.counts.overdue > 0 && <Badge variant="error">{groups.counts.overdue} overdue</Badge>}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Shown in {groups.timezone}. {total} pending.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add reminder
        </Button>
      </div>

      {!scheduler.active && (
        <p className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] text-sky-900 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {scheduler.message}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Type</span>
              <select value={type} onChange={(e) => setType(e.target.value as ReminderType)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {REMINDER_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">When <span className="text-red-600">*</span></span>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
              <span className="text-[11px] text-gray-500">Saved in {browserTimeZone()}.</span>
            </label>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should you do?"
            maxLength={160}
            aria-label="Reminder title"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            maxLength={600}
            aria-label="Reminder note"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" type="submit" loading={adding} disabled={title.trim().length < 2 || !dueAt}>Add</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          {applicationId && <p className="text-[11px] text-gray-400">Attached to this application.</p>}
        </form>
      )}

      {total === 0 ? (
        <p className="text-sm text-gray-500">No pending reminders.</p>
      ) : (
        <div className="space-y-3">
          {GROUP_META.map(({ key, label, tone, icon: Icon }) => {
            const list = groups.groups[key];
            if (!list.length) return null;
            return (
              <div key={key}>
                <p className={cn("text-xs font-semibold inline-flex items-center gap-1.5", tone)}>
                  <Icon className="w-3.5 h-3.5" /> {label} ({list.length})
                </p>
                <ul className="mt-1 space-y-1.5">
                  {list.map((r) => (
                    <li key={r.id} className={cn("rounded-lg border px-3 py-2 flex flex-wrap items-center gap-2", r.overdue ? "border-red-200 bg-red-50/40" : "border-gray-200")}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">{r.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {r.typeLabel} · {r.dueLocal}
                          {r.dueInSetZone && <span className="text-gray-400"> · set as {r.dueInSetZone}</span>}
                        </p>
                        {r.note && <p className="text-[11px] text-gray-600 mt-0.5">{r.note}</p>}
                        {renderContext?.(r)}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" loading={busyId === r.id} onClick={() => onComplete(r)} title="Mark done">
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busyId === r.id} onClick={() => onDelete(r)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {groups.completed.length > 0 && (
        <details className="rounded-lg border border-gray-200 px-3 py-2">
          <summary className="text-xs text-gray-600 cursor-pointer">{groups.completed.length} completed or dismissed</summary>
          <ul className="mt-1.5 space-y-0.5">
            {groups.completed.map((r) => (
              <li key={r.id} className="text-[11px] text-gray-500 line-through">{r.title} · {r.dueLocal}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
