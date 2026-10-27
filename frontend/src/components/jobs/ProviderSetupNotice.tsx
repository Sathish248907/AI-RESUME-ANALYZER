"use client";

import Link from "next/link";
import { Plug, ExternalLink, KeyRound, Check, FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/common/Badge";
import type { ProviderStatus, SetupGuide } from "@/services/jobDiscoveryService";

interface Props {
  setup: SetupGuide | null;
  status?: ProviderStatus | null;
}

/**
 * Shown when no job provider is configured, and whenever a configured provider
 * is failing or misconfigured. This is the honest alternative to sample data:
 * the app says it has no live vacancies and explains exactly what to set.
 */
export default function ProviderSetupNotice({ setup, status }: Props) {
  const problems = [
    ...(status?.misconfigured ?? []).map((m) => `“${m.slug}” is enabled but missing ${m.missingCredentials.join(", ")}.`),
    ...(status?.unknown ?? []).map((u) => `“${u}” is listed in JOB_PROVIDERS but this build has no adapter for it.`),
    ...(status?.results ?? []).filter((r) => r.status !== "ok").map((r) => r.error ?? `${r.slug} failed (${r.status}).`),
  ];

  if (!setup && problems.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-amber-950 inline-flex items-center gap-2">
          <Plug className="w-4 h-4" />
          {setup ? "No job provider is configured" : "A job provider needs attention"}
        </h3>
        {setup && <p className="text-xs text-amber-900 mt-1">{setup.message}</p>}
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1">
          {problems.map((p) => (
            <li key={p} className="text-xs text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      )}

      {setup && (
        <>
          <div className="rounded-lg bg-white border border-amber-100 p-3">
            <p className="text-xs font-medium text-gray-900">{setup.howTo}</p>
            <code className="mt-1.5 block text-[11px] bg-gray-900 text-gray-100 rounded px-2 py-1.5 overflow-x-auto">
              {setup.envVar}=remotive,arbeitnow
            </code>
          </div>

          <ul className="grid sm:grid-cols-2 gap-2">
            {setup.available.map((p) => (
              <li key={p.slug} className="rounded-lg border border-amber-100 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
                  {p.displayName}
                  {p.requiresCredentials
                    ? <Badge variant="warning"><KeyRound className="w-3 h-3" /> key needed</Badge>
                    : <Badge variant="success"><Check className="w-3 h-3" /> no key</Badge>}
                </p>
                <p className="text-[11px] text-gray-600 mt-0.5">{p.note}</p>
                {p.missingCredentials.length > 0 && (
                  <p className="text-[11px] text-amber-800 mt-0.5">Missing: {p.missingCredentials.join(", ")}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-2">
                  {p.docsUrl && (
                    <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1">
                      API docs <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {p.termsUrl && (
                    <a href={p.termsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-700 hover:underline inline-flex items-center gap-1">
                      Terms <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-amber-100 bg-white px-3 py-2">
            <p className="text-xs font-semibold text-gray-900 inline-flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> In the meantime
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">{setup.manualEntry.message}</p>
            <Link href={setup.manualEntry.href} className="text-[11px] text-indigo-700 hover:underline font-medium mt-1 inline-block">
              Add a job description →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
