"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar, Mail, HardDrive, Briefcase, ExternalLink, ChevronDown, ShieldCheck,
  KeyRound, Settings2, Unplug, AlertTriangle, Copy, Check,
} from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import IntegrationStatusBadge from "./IntegrationStatusBadge";
import { safeHref, type Integration } from "@/services/integrationService";

interface Props {
  integration: Integration;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure?: () => void;
}

const ICONS: Record<string, typeof Calendar> = {
  calendar: Calendar, email: Mail, storage: HardDrive, jobs: Briefcase,
};

/**
 * One integration. The card's job is to be honest about three things: what it
 * would be allowed to do (every scope explained in words), what it will never
 * do, and — when it cannot be connected — exactly which environment variables
 * are missing. The connect button appears only when the backend says the flow
 * could actually complete, so there are no buttons that lead nowhere.
 */
export default function IntegrationCard({ integration, busy, onConnect, onDisconnect, onConfigure }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = ICONS[integration.category] ?? Settings2;
  const connected = integration.connection?.status === "connected" || integration.connection?.status === "configured";
  const expired = integration.connection?.status === "expired";
  const setupUrl = safeHref(integration.setupUrl);

  const copyRedirect = async () => {
    if (!integration.redirectUri) return;
    try {
      await navigator.clipboard.writeText(integration.redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { setCopied(false); }
  };

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 rounded-lg bg-gray-100 p-2 shrink-0">
            <Icon className="w-5 h-5 text-gray-600" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{integration.displayName}</p>
            <p className="text-xs text-gray-600 mt-0.5">{integration.summary}</p>
          </div>
        </div>
        <IntegrationStatusBadge readiness={integration.readiness} status={integration.connection?.status ?? null} />
      </div>

      {/* Why it cannot be connected */}
      {integration.blockers.length > 0 && (
        <ul className="mt-3 space-y-1">
          {integration.blockers.map((b) => (
            <li key={b} className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {b}
            </li>
          ))}
        </ul>
      )}

      {expired && integration.connection?.lastError && (
        <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
          {integration.connection.lastError}
        </p>
      )}

      {/* Connection facts. Only OAuth grants have a date and scopes to report;
          a key-configured provider has neither, so it says nothing instead of
          showing "0 granted". */}
      {connected && integration.connection && integration.kind === "oauth" && (
        <dl className="mt-3 grid sm:grid-cols-3 gap-2 text-[11px]">
          <div>
            <dt className="text-gray-500">Connected</dt>
            <dd className="text-gray-900">{integration.connection.connectedAt ? new Date(integration.connection.connectedAt).toLocaleDateString() : "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Last sync</dt>
            <dd className="text-gray-900">{integration.connection.lastSyncAt ? new Date(integration.connection.lastSyncAt).toLocaleString() : "Never"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Permissions</dt>
            <dd className="text-gray-900">{integration.connection.scopes.length || integration.scopes.length} granted</dd>
          </div>
        </dl>
      )}

      {/* Permissions and limits */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 text-xs text-sky-700 hover:underline inline-flex items-center gap-1"
      >
        What this can and cannot do
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {integration.scopes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Permissions it asks for
              </p>
              <ul className="mt-1 space-y-1">
                {integration.scopes.map((s) => (
                  <li key={s} className="text-[11px] text-gray-700">
                    <code className="text-gray-500 break-all">{s.replace("https://www.googleapis.com/auth/", "")}</code>
                    <span className="block text-gray-600">{integration.scopeExplanations[s]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {integration.features.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-800">What it does</p>
              <ul className="mt-1 space-y-0.5">
                {integration.features.map((f) => <li key={f} className="text-[11px] text-gray-700">· {f}</li>)}
              </ul>
            </div>
          )}

          {integration.doesNot.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-800">What it never does</p>
              <ul className="mt-1 space-y-0.5">
                {integration.doesNot.map((d) => <li key={d} className="text-[11px] text-gray-600">· {d}</li>)}
              </ul>
            </div>
          )}

          {/* Setup, for an integration that cannot connect yet */}
          {integration.readiness === "needs_setup" && integration.setupSteps.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> How to enable it
              </p>
              <ol className="mt-1 space-y-0.5 list-decimal list-inside">
                {integration.setupSteps.map((s) => <li key={s} className="text-[11px] text-gray-700">{s}</li>)}
              </ol>
              {integration.redirectUri && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="text-[11px] bg-gray-900 text-gray-100 rounded px-2 py-1 overflow-x-auto flex-1">{integration.redirectUri}</code>
                  <Button size="sm" variant="ghost" onClick={copyRedirect} title="Copy the redirect URI">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              )}
              {setupUrl && (
                <a href={setupUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1 mt-1.5">
                  Open the provider console <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
        {integration.connectable && (
          <Button size="sm" loading={busy} onClick={onConnect}>
            Connect
          </Button>
        )}
        {connected && integration.kind === "oauth" && (
          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" loading={busy} onClick={onDisconnect}>
            <Unplug className="w-3.5 h-3.5 mr-1.5" /> Disconnect
          </Button>
        )}
        {expired && (
          <Button size="sm" loading={busy} onClick={onConnect}>Reconnect</Button>
        )}
        {onConfigure && (connected || integration.kind === "server_config") && (
          <Button size="sm" variant="outline" onClick={onConfigure}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Settings
          </Button>
        )}
        {integration.managedAt && (
          <Link href={integration.managedAt} className="text-xs text-indigo-700 hover:underline font-medium">
            Manage where it is configured →
          </Link>
        )}
      </div>
    </li>
  );
}
