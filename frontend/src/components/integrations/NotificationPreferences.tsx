"use client";

import { useEffect, useState } from "react";
import { Mail, Info, ShieldOff, Clock } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { EmailStatus } from "@/services/integrationService";

interface Props {
  email: EmailStatus;
  preferences: Record<string, boolean>;
  deliveries: Array<{ id: string; subject: string; recipient: string; statusLabel: string; transport: string; createdAt: string }>;
  saving: boolean;
  onSave: (input: Record<string, boolean>) => void;
}

/**
 * Which emails the user wants, and what actually happens to them.
 *
 * The banner is the important part: with the recording transport nothing is
 * delivered, and the UI says so rather than letting a switched-on toggle imply
 * mail is arriving. Preferences are still worth setting — they are checked at
 * send time, so they take effect the moment a transport is configured.
 */
export default function NotificationPreferences({ email, preferences, deliveries, saving, onSave }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected(Object.fromEntries(email.categories.map((c) => [c.key, Boolean(preferences[c.key] ?? c.default)])));
  }, [email.categories, preferences]);

  const dirty = email.categories.some((c) => selected[c.key] !== Boolean(preferences[c.key] ?? c.default));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
          <Mail className="w-4 h-4 text-indigo-600" /> Email notifications
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Sent only to the address on your account.
        </p>
      </div>

      {!email.delivers && (
        <p className={cn("rounded-lg border px-3 py-2 text-xs flex items-start gap-1.5", "border-amber-200 bg-amber-50 text-amber-900")}>
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Nothing is being delivered.</strong> {email.note} Your choices below are still saved and will
            take effect as soon as a transport is configured.
          </span>
        </p>
      )}

      <div className="space-y-2">
        {email.categories.map((c) => (
          <label key={c.key} className="flex items-start gap-2.5 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={Boolean(selected[c.key])}
              onChange={(e) => setSelected((s) => ({ ...s, [c.key]: e.target.checked }))}
              className="mt-0.5 rounded border-gray-300"
            />
            <span className="min-w-0">
              <span className="text-sm text-gray-900 flex items-center gap-1.5">
                {c.label}
                {!c.default && <Badge variant="neutral">off by default</Badge>}
              </span>
              <span className="block text-[11px] text-gray-600">{c.description}</span>
            </span>
          </label>
        ))}
      </div>

      <Button size="sm" loading={saving} disabled={!dirty} onClick={() => onSave(selected)}>
        Save preferences
      </Button>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
          <ShieldOff className="w-3.5 h-3.5 text-gray-500" /> What this never does
        </p>
        <ul className="mt-1 space-y-0.5">
          {email.neverDoes.map((n) => <li key={n} className="text-[11px] text-gray-600">· {n}</li>)}
        </ul>
      </div>

      {deliveries.length > 0 && (
        <details className="rounded-lg border border-gray-200 px-3 py-2">
          <summary className="text-xs text-gray-700 cursor-pointer">
            Message log ({deliveries.length})
          </summary>
          <ul className="mt-1.5 space-y-1">
            {deliveries.map((d) => (
              <li key={d.id} className="text-[11px] text-gray-700">
                <strong>{d.subject}</strong> → {d.recipient}
                <span className={cn("ml-1.5", d.statusLabel.startsWith("Delivered") ? "text-emerald-700" : "text-gray-500")}>
                  {d.statusLabel}
                </span>
                <span className="block text-gray-400">{new Date(d.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        A message is recorded once per event, so a workflow that runs twice cannot email you twice.
      </p>
    </section>
  );
}
