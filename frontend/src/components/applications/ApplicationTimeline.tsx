"use client";

import { useState } from "react";
import {
  History, Plus, ArrowRight, User, Cog, Info, FileText, Paperclip,
  CheckCircle2, Mic, Bell, ClipboardCheck, Send,
} from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/services/applicationWorkspaceService";

interface Props {
  activity: ActivityEntry[];
  note?: string;
  adding: boolean;
  onAdd: (input: { title: string; detail?: string; type: "note" | "follow_up" }) => void;
}

const ICONS: Record<string, typeof History> = {
  status_changed: ArrowRight,
  cover_letter_created: FileText,
  document_added: Paperclip,
  checklist_completed: CheckCircle2,
  interview_scheduled: Mic,
  interview_completed: Mic,
  reminder_completed: Bell,
  readiness_review: ClipboardCheck,
  submitted: Send,
  follow_up: Bell,
  note: Info,
};

/**
 * The application's audit trail. Every row was written when an operation
 * actually succeeded — there is no reconstructed history — and each one says
 * whether the user recorded it or the app did.
 */
export default function ApplicationTimeline({ activity, note, adding, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [type, setType] = useState<"note" | "follow_up">("note");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return;
    onAdd({ title: title.trim(), detail: detail.trim() || undefined, type });
    setTitle(""); setDetail(""); setOpen(false);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" /> Activity
          </h2>
          {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a note
        </Button>
      </div>

      {open && (
        <form onSubmit={submit} className="rounded-lg border border-gray-200 p-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What happened?"
            maxLength={200}
            aria-label="Activity title"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Any detail worth keeping"
            aria-label="Activity detail"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as "note" | "follow_up")} aria-label="Entry type" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              <option value="note">Note</option>
              <option value="follow_up">Follow-up</option>
            </select>
            <Button size="sm" type="submit" loading={adding} disabled={title.trim().length < 2}>Add</Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {activity.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nothing recorded yet. Entries appear here as things actually happen — this app does not invent history for applications created before it existed.
        </p>
      ) : (
        <ol className="relative border-l border-gray-200 ml-2 space-y-4 pt-1">
          {activity.map((a) => {
            const Icon = ICONS[a.type] ?? Info;
            return (
              <li key={a.id} className="ml-5">
                <span className="absolute -left-[11px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white border border-gray-200">
                  <Icon className="w-3 h-3 text-gray-500" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm text-gray-900">{a.title}</p>
                  <span
                    title={a.sourceLabel}
                    className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border",
                      a.source === "user" ? "bg-gray-100 text-gray-600 border-gray-200" : "bg-sky-50 text-sky-700 border-sky-100"
                    )}
                  >
                    {a.source === "user" ? <User className="w-3 h-3" /> : <Cog className="w-3 h-3" />}
                    {a.source === "user" ? "you" : "app"}
                  </span>
                </div>
                {a.detail && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap">{a.detail}</p>}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(a.occurredAt).toLocaleString()}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
