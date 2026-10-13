"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, Building2, Calendar, Eye, Pencil, Trash2, Check, X, Search, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import Button from "@/components/common/Button";
import { formatDate } from "@/lib/utils";
import type { JobAnalysisMeta } from "@/services/jobAnalysisStorage";

interface JobAnalysisHistoryProps {
  items: JobAnalysisMeta[];
  onRename?: (id: string, name: string) => string | null;
  onDelete?: (id: string) => void;
  deletingId?: string | null;
  /** Compact rows for the dashboard widget. */
  compact?: boolean;
  emptyMessage?: string;
}

export default function JobAnalysisHistory({ items, onRename, onDelete, deletingId, compact = false, emptyMessage }: JobAnalysisHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  function startRename(item: JobAnalysisMeta) {
    setEditingId(item.id);
    setDraft(item.name);
    setRenameError(null);
  }

  function commitRename(id: string) {
    if (!onRename) return;
    const err = onRename(id, draft);
    if (err) {
      setRenameError(err);
      return;
    }
    setEditingId(null);
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-5">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {emptyMessage ?? "No saved job analyses match."}
      </div>
    );
  }

  if (compact) {
    return (
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/dashboard/job-analysis/${item.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{item.name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {item.companyName ? `${item.companyName} · ` : ""}{item.targetRole} · {formatDate(item.updatedAt)}
                </p>
              </div>
              <Badge variant="info" className="hidden sm:inline-flex">{item.skillCount} skills</Badge>
              <ArrowRight className="w-4 h-4 text-gray-300" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const editing = editingId === item.id;
        return (
          <Card key={item.id} hover>
            <CardContent className="py-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <form onSubmit={(e) => { e.preventDefault(); commitRename(item.id); }} className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); setRenameError(null); }}
                        maxLength={80}
                        aria-label="Analysis name"
                        className={`flex-1 text-sm px-2.5 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${renameError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                      />
                      <Button type="submit" size="sm" aria-label="Save name"><Check className="w-4 h-4" /></Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel rename"><X className="w-4 h-4" /></Button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                      {onRename && (
                        <button type="button" onClick={() => startRename(item)} className="p-1 text-gray-400 hover:text-gray-700 rounded" aria-label={`Rename ${item.name}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {renameError && editing && <p className="text-xs text-red-600 mt-1">{renameError}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                    {item.name !== item.jobTitle && <span className="truncate">{item.jobTitle}</span>}
                    {item.companyName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{item.companyName}</span>}
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{item.targetRole}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(item.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="info">{item.skillCount} skills</Badge>
                  <Badge variant="neutral">{item.requiredSkillCount} required</Badge>
                  {item.minYears !== null && <Badge variant="neutral">{item.minYears}+ yrs</Badge>}
                </div>
                <div className="flex items-center gap-2 sm:ml-2">
                  <Link href={`/dashboard/job-analysis/${item.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                    <Eye className="w-4 h-4" /> View
                  </Link>
                  {onDelete && (
                    <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} loading={deletingId === item.id} className="text-red-600 hover:bg-red-50" aria-label={`Delete ${item.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
