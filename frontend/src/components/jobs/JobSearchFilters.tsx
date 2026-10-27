"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, RefreshCw, X, Info } from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LEVELS, EXPERIENCE_LEVEL_LABELS,
  WORK_ARRANGEMENTS, WORK_ARRANGEMENT_LABELS,
  type DiscoverQuery, type JobSort, type JobSource, type ResumeVersionRef,
} from "@/services/jobDiscoveryService";

interface Props {
  query: DiscoverQuery;
  busy: boolean;
  refreshing: boolean;
  /** Null when no provider is configured: refresh and date filters cannot work. */
  providerConfigured: boolean;
  resumeVersions: ResumeVersionRef[];
  activeResumeVersionId: string | null;
  onChange: (patch: Partial<DiscoverQuery>) => void;
  onSubmit: () => void;
  onRefresh: () => void;
}

const SORTS: { value: JobSort; label: string; hint: string }[] = [
  { value: "relevance", label: "Relevance", hint: "Your preferences and resume match, excluding posting age" },
  { value: "match", label: "Resume match", hint: "Highest resume match first" },
  { value: "newest", label: "Newest", hint: "Only listings with a trustworthy posting date can be ordered by age" },
];
const SOURCES: { value: JobSource; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "provider", label: "Job providers" },
  { value: "own", label: "Entered by me" },
];

/** Search and filter controls. Filters narrow results; they never relax themselves. */
export default function JobSearchFilters({
  query, busy, refreshing, providerConfigured, resumeVersions, activeResumeVersionId,
  onChange, onSubmit, onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    query.location, query.workArrangement, query.employmentType, query.experienceLevel,
    query.minSalary, query.postedWithinDays, query.source && query.source !== "all" ? query.source : undefined,
  ].filter(Boolean).length;

  const clear = () =>
    onChange({
      location: undefined, workArrangement: undefined, employmentType: undefined,
      experienceLevel: undefined, minSalary: undefined, postedWithinDays: undefined,
      source: "all", page: 1,
    });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query.q ?? ""}
            onChange={(e) => onChange({ q: e.target.value, page: 1 })}
            placeholder="Job title, skill, company or keyword"
            aria-label="Search jobs"
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" size="md" loading={busy}>Search</Button>
        <Button
          type="button"
          size="md"
          variant="outline"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <SlidersHorizontal className="w-4 h-4 mr-1.5" />
          Filters{activeCount > 0 && <span className="ml-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] px-1.5">{activeCount}</span>}
        </Button>
        {providerConfigured && (
          <Button
            type="button"
            size="md"
            variant="ghost"
            loading={refreshing}
            onClick={onRefresh}
            title="Fetch current listings from the configured providers"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Sort</span>
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.hint}
            onClick={() => onChange({ sort: s.value, page: 1 })}
            aria-pressed={(query.sort ?? "relevance") === s.value}
            className={cn(
              "px-2.5 py-1 rounded-full font-medium transition-colors",
              (query.sort ?? "relevance") === s.value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {s.label}
          </button>
        ))}

        {resumeVersions.length > 0 && (
          <label className="ml-auto inline-flex items-center gap-1.5 text-gray-600">
            Match against
            <select
              value={activeResumeVersionId ?? ""}
              onChange={(e) => onChange({ resumeVersionId: e.target.value || undefined, page: 1 })}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              {resumeVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.isOriginal ? " (original)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {open && (
        <div className="pt-3 border-t border-gray-100 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Location</span>
            <input
              value={query.location ?? ""}
              onChange={(e) => onChange({ location: e.target.value || undefined, page: 1 })}
              placeholder="City or region"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-500">Remote roles always match a location filter.</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Work arrangement</span>
            <select
              value={query.workArrangement ?? ""}
              onChange={(e) => onChange({ workArrangement: (e.target.value || undefined) as DiscoverQuery["workArrangement"], page: 1 })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {WORK_ARRANGEMENTS.map((a) => <option key={a} value={a}>{WORK_ARRANGEMENT_LABELS[a]}</option>)}
            </select>
            <span className="text-[11px] text-gray-500">Listings that do not state this are excluded by the filter.</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Employment type</span>
            <select
              value={query.employmentType ?? ""}
              onChange={(e) => onChange({ employmentType: (e.target.value || undefined) as DiscoverQuery["employmentType"], page: 1 })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Experience level</span>
            <select
              value={query.experienceLevel ?? ""}
              onChange={(e) => onChange({ experienceLevel: (e.target.value || undefined) as DiscoverQuery["experienceLevel"], page: 1 })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {EXPERIENCE_LEVELS.map((l) => <option key={l} value={l}>{EXPERIENCE_LEVEL_LABELS[l]}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Minimum salary</span>
            <input
              type="number"
              min={0}
              value={query.minSalary ?? ""}
              onChange={(e) => onChange({ minSalary: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
              placeholder="Any"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            />
            <span className="text-[11px] text-gray-500">Only listings that publish a figure can match; currencies are not converted.</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Posted within</span>
            <select
              value={query.postedWithinDays ?? ""}
              onChange={(e) => onChange({ postedWithinDays: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              <option value="">Any time</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
            <span className="text-[11px] text-gray-500 inline-flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              Applies only to listings whose source publishes a reliable date.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Source</span>
            <select
              value={query.source ?? "all"}
              onChange={(e) => onChange({ source: e.target.value as JobSource, page: 1 })}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs text-gray-700 self-end">
            <input
              type="checkbox"
              checked={Boolean(query.includeHidden)}
              onChange={(e) => onChange({ includeHidden: e.target.checked, page: 1 })}
              className="rounded border-gray-300"
            />
            Show jobs I have hidden
          </label>

          {activeCount > 0 && (
            <div className="self-end">
              <Button type="button" size="sm" variant="ghost" onClick={clear}>
                <X className="w-3.5 h-3.5 mr-1.5" /> Clear filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
