"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobsPageShell from "@/components/jobs/JobsPageShell";
import JobSearchPreferences from "@/components/jobs/JobSearchPreferences";
import ProviderSetupNotice from "@/components/jobs/ProviderSetupNotice";
import {
  getJobPreferences, listProviders, saveJobPreferences,
  type JobPreference, type JobPreferenceInput, type ProviderInfo, type SetupGuide,
} from "@/services/jobDiscoveryService";

/** Search preferences, ranking weights, and the state of the configured providers. */
export default function JobPreferencesPage() {
  const toast = useToast();
  const { user, ready } = useAuth();

  const [preference, setPreference] = useState<JobPreference | null>(null);
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [factorLabels, setFactorLabels] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [setup, setSetup] = useState<SetupGuide | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const [prefs, provs] = await Promise.all([getJobPreferences(), listProviders()]);
      setPreference(prefs.preference);
      setDefaults(prefs.defaults.rankingWeights);
      setFactorLabels(prefs.factorLabels);
      setNote(prefs.note);
      setProviders(provs.providers);
      setSetup(provs.setup);
      setRetentionDays(provs.retentionDays);
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

  async function onSave(input: Partial<JobPreferenceInput>) {
    setSaving(true);
    try {
      const r = await saveJobPreferences(input);
      setPreference(r.preference);
      toast.success("Preferences saved. They apply to your next search.");
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <JobsPageShell
      current="/dashboard/jobs/preferences"
      title="Search Preferences"
      description="What you are looking for, and how much each factor counts when results are ordered."
      icon={SlidersHorizontal}
      loading={loading}
      error={error}
      onRetry={load}
    >
      <div className="space-y-4">
        <JobSearchPreferences
          preference={preference}
          defaults={defaults}
          factorLabels={factorLabels}
          note={note}
          busy={saving}
          onSave={onSave}
        />

        <ProviderSetupNotice setup={setup} />

        {/* Provider state: what is configured, what it last did, and its terms. */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Job sources</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Configured in the backend environment; credentials never reach the browser.
            {retentionDays !== null && ` Cached listings are deleted after ${retentionDays} days.`}
          </p>
          <ul className="mt-3 divide-y divide-gray-100">
            {providers.map((p) => (
              <li key={p.slug} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">
                    {p.displayName}
                    <span className="text-xs text-gray-400"> · {p.slug}</span>
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {p.enabled
                      ? p.configured
                        ? `Enabled${p.lastStatus ? ` · last run ${p.lastStatus}${p.lastJobCount ? ` (${p.lastJobCount} listings)` : ""}` : " · not used yet"}`
                        : `Enabled but missing ${p.missingCredentials.join(", ")}`
                      : p.requiresCredentials
                        ? `Not enabled · needs ${p.credentialKeys.join(", ")}`
                        : "Not enabled · works without credentials"}
                  </p>
                  {p.lastError && <p className="text-[11px] text-amber-700">{p.lastError}</p>}
                  {p.attribution && <p className="text-[11px] text-gray-400">{p.attribution}</p>}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {p.termsUrl && <a href={p.termsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">Terms</a>}
                  {p.docsUrl && <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">Docs</a>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </JobsPageShell>
  );
}
