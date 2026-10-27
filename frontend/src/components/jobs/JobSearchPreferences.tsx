"use client";

import { useEffect, useState } from "react";
import { Save, Info, RotateCcw } from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS,
  WORK_ARRANGEMENTS, WORK_ARRANGEMENT_LABELS,
  type JobPreference, type JobPreferenceInput,
} from "@/services/jobDiscoveryService";

interface Props {
  preference: JobPreference | null;
  defaults: Record<string, number>;
  factorLabels: Record<string, string>;
  note: string;
  busy: boolean;
  onSave: (input: Partial<JobPreferenceInput>) => void;
}

const EMPTY: JobPreferenceInput = {
  titles: [], skills: [], locations: [], workArrangements: [], employmentTypes: [],
  experienceLevel: null, minSalary: null, salaryCurrency: null,
  excludedCompanies: [], keywords: null, rankingWeights: null,
};

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const fromList = (l: string[]) => l.join(", ");

/**
 * What the user is looking for, plus the ranking weights. Weights change the
 * order of results only — the match score is unaffected, which the form states
 * so nobody expects tuning them to make them a better candidate.
 */
export default function JobSearchPreferences({ preference, defaults, factorLabels, note, busy, onSave }: Props) {
  const [form, setForm] = useState<JobPreferenceInput>(EMPTY);
  const [weights, setWeights] = useState<Record<string, number>>(defaults);

  useEffect(() => {
    setForm(preference ? { ...EMPTY, ...preference } : EMPTY);
    setWeights({ ...defaults, ...(preference?.rankingWeights ?? {}) });
  }, [preference, defaults]);

  const set = <K extends keyof JobPreferenceInput>(key: K, value: JobPreferenceInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggle = <K extends "workArrangements" | "employmentTypes">(key: K, value: string) =>
    setForm((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] } as JobPreferenceInput;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, rankingWeights: weights });
  };

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">What you are looking for</h2>
        <p className="text-xs text-gray-500">
          These fill in your searches and drive ranking. Leaving a field empty means the matching factor is
          excluded rather than counted against a job.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Target job titles</span>
            <input
              value={fromList(form.titles)}
              onChange={(e) => set("titles", toList(e.target.value))}
              placeholder="Frontend Developer, React Developer"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-500">Comma separated, up to 10.</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Skills you want to use</span>
            <input
              value={fromList(form.skills)}
              onChange={(e) => set("skills", toList(e.target.value))}
              placeholder="React, TypeScript"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Preferred locations</span>
            <input
              value={fromList(form.locations)}
              onChange={(e) => set("locations", toList(e.target.value))}
              placeholder="Pune, Bengaluru"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-500">Remote roles always satisfy a location preference.</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Default search keywords</span>
            <input
              value={form.keywords ?? ""}
              onChange={(e) => set("keywords", e.target.value || null)}
              placeholder="react developer"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          </label>

          <div>
            <span className="text-xs font-medium text-gray-700">Work arrangement</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {WORK_ARRANGEMENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggle("workArrangements", a)}
                  aria-pressed={form.workArrangements.includes(a)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    form.workArrangements.includes(a) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {WORK_ARRANGEMENT_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-700">Employment type</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {EMPLOYMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle("employmentTypes", t)}
                  aria-pressed={form.employmentTypes.includes(t)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    form.employmentTypes.includes(t) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Experience level</span>
            <select
              value={form.experienceLevel ?? ""}
              onChange={(e) => set("experienceLevel", (e.target.value || null) as JobPreferenceInput["experienceLevel"])}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">No preference</option>
              {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{EXPERIENCE_LEVEL_LABELS[l]}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Minimum salary</span>
              <input
                type="number"
                min={0}
                value={form.minSalary ?? ""}
                onChange={(e) => set("minSalary", e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Currency</span>
              <input
                value={form.salaryCurrency ?? ""}
                onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase() || null)}
                placeholder="INR"
                maxLength={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <span className="col-span-2 text-[11px] text-gray-500">
              Currencies are not converted: a listing in another currency is not scored on salary rather than compared wrongly.
            </span>
          </div>

          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-700">Companies to exclude</span>
            <input
              value={fromList(form.excludedCompanies)}
              onChange={(e) => set("excludedCompanies", toList(e.target.value))}
              placeholder="Companies you never want to see"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>
      </div>

      {/* Ranking weights */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">How results are ordered</h2>
            <p className="text-xs text-gray-500">{note}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setWeights({ ...defaults })}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to defaults
          </Button>
        </div>

        <div className="space-y-2">
          {Object.keys(defaults).map((key) => (
            <div key={key}>
              <div className="flex justify-between text-xs">
                <span className="text-gray-700">
                  {factorLabels[key] ?? key}
                  {key === "freshness" && <span className="text-gray-400"> — urgency, not fit</span>}
                </span>
                <span className="tabular-nums font-medium">{weights[key] ?? 0}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[key] ?? 0}
                onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                aria-label={`${factorLabels[key] ?? key} weight`}
                className="w-full"
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Weights are relative, so they need not add up to 100 (currently {weightTotal}). A weight of 0 switches a
          factor off. A factor a listing cannot answer is always excluded instead of scored zero.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          <Save className="w-4 h-4 mr-1.5" /> Save preferences
        </Button>
      </div>
    </form>
  );
}
