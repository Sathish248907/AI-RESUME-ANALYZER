"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, PlusCircle, Search, X, AlertTriangle, Trash2, Layers, Star } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import Button from "@/components/common/Button";
import JobAnalysisHistory from "@/components/job-analysis/JobAnalysisHistory";
import DemoNotice from "@/components/job-analysis/DemoNotice";
import { TARGET_ROLES } from "@/components/analyzer/JobDescriptionForm";
import {
  clearAllJobAnalyses,
  deleteJobAnalysis,
  getCorruptedRecordCount,
  getJobAnalysisStats,
  renameJobAnalysis,
  searchJobAnalyses,
  type JobAnalysisMeta,
  type JobSearchFilters,
} from "@/services/jobAnalysisStorage";

export default function JobHistoryPage() {
  const [items, setItems] = useState<JobAnalysisMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState<NonNullable<JobSearchFilters["sort"]>>("newest");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [corrupted, setCorrupted] = useState(0);
  const [topSkills, setTopSkills] = useState<{ name: string; count: number }[]>([]);

  const reload = useCallback(() => {
    setItems(searchJobAnalyses({ query, targetRole: role || undefined, sort }));
    const stats = getJobAnalysisStats();
    setTotal(stats.total);
    setTopSkills(stats.topSkills.slice(0, 6));
    setCorrupted(getCorruptedRecordCount());
    setLoaded(true);
  }, [query, role, sort]);

  useEffect(() => { reload(); }, [reload]);

  const handleRename = useCallback((id: string, name: string): string | null => {
    const res = renameJobAnalysis(id, name);
    if (!res.ok) return res.error ?? "Could not rename.";
    reload();
    return null;
  }, [reload]);

  const handleDelete = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (!confirm(`Delete "${item?.name ?? "this analysis"}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const res = deleteJobAnalysis(id);
    setDeletingId(null);
    if (!res.ok) {
      setNotice(res.error ?? "Could not delete the analysis.");
      return;
    }
    setNotice("Analysis deleted.");
    setTimeout(() => setNotice(null), 2500);
    reload();
  }, [items, reload]);

  const handleClearAll = useCallback(() => {
    if (!confirm("Delete ALL saved job analyses? This cannot be undone.")) return;
    clearAllJobAnalyses();
    reload();
  }, [reload]);

  const filtersActive = useMemo(() => Boolean(query.trim() || role || sort !== "newest"), [query, role, sort]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <svg className="animate-spin w-5 h-5 mr-3 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading saved jobs…
      </div>
    );
  }

  if (total === 0 && corrupted === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Briefcase className="w-8 h-8 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">No saved job analyses</h2>
        <p className="text-gray-500 mt-3 text-sm leading-relaxed">
          Analyze a job description to see its extracted skills, requirements and keywords here. Analyses are stored locally in this browser.
        </p>
        <Link href="/dashboard/job-analyzer" className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors">
          <PlusCircle className="w-4 h-4" /> Analyze a Job Description
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Saved Job Analyses</h1>
          <p className="text-gray-500 mt-1">{total} saved · demo analyses stored in this browser</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/job-analyzer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm">
            <PlusCircle className="w-4 h-4" /> New Job Analysis
          </Link>
          {total > 0 && (
            <Button variant="outline" size="sm" onClick={handleClearAll} className="text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> Clear all
            </Button>
          )}
        </div>
      </div>

      <DemoNotice title="Demo records." >
        Each saved analysis came from rule-based extraction. Open one to review and correct its skills.
      </DemoNotice>

      {corrupted > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {corrupted} saved record{corrupted === 1 ? " was" : "s were"} unreadable and {corrupted === 1 ? "has" : "have"} been skipped. Use “Clear all” to reset storage if this persists.
        </div>
      )}

      {notice && <p role="status" className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">{notice}</p>}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center"><Briefcase className="w-5 h-5" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{total}</div><div className="text-xs text-gray-500">Saved jobs</div></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center"><Layers className="w-5 h-5" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{items.reduce((s, i) => s + i.skillCount, 0)}</div><div className="text-xs text-gray-500">Skills across shown jobs</div></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="py-4">
          <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-500"><Star className="w-3.5 h-3.5" /> Most requested</div>
          {topSkills.length === 0 ? <p className="text-xs text-gray-400 italic">No technical skills yet.</p> : (
            <div className="flex flex-wrap gap-1.5">
              {topSkills.map((s) => <span key={s.name} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full border border-gray-200">{s.name} <span className="text-gray-400">×{s.count}</span></span>)}
            </div>
          )}
        </CardContent></Card>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, title, company or skill…"
            aria-label="Search saved jobs"
            className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
          )}
        </div>
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by target role" className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All target roles</option>
          {TARGET_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort" className="text-sm px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="skills">Most skills</option>
        </select>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setRole(""); setSort("newest"); }}>Reset</Button>
        )}
      </div>

      <p className="text-xs text-gray-500">{items.length} of {total} shown</p>

      <JobAnalysisHistory
        items={items}
        onRename={handleRename}
        onDelete={handleDelete}
        deletingId={deletingId}
        emptyMessage={filtersActive ? "No saved jobs match your search or filters." : "No saved job analyses."}
      />
    </div>
  );
}
