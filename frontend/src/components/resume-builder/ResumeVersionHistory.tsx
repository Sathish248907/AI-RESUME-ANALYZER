"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Trash2, Pencil, History, GitCompare, RotateCcw, Lock, Check, X } from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import type { ResumeVersionSummary } from "@/services/resumeBuilderService";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  versions: ResumeVersionSummary[];
  currentId: string;
  onRename: (v: ResumeVersionSummary, name: string) => Promise<void>;
  onDuplicate: (v: ResumeVersionSummary) => Promise<void>;
  onDelete: (v: ResumeVersionSummary) => void;
  onCompare: (v: ResumeVersionSummary) => void;
  onRestore: (v: ResumeVersionSummary) => void;
}

const KIND: Record<string, "neutral" | "success" | "info" | "warning"> = { original: "neutral", improved: "success", tailored: "info", custom: "neutral", restored: "warning" };

export default function ResumeVersionHistory({ versions, currentId, onRename, onDuplicate, onDelete, onCompare, onRestore }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-gray-600 inline-flex items-center gap-1"><History className="w-3.5 h-3.5" /> {versions.length} version{versions.length === 1 ? "" : "s"}. The original is never edited; restore copies another version's content into the one you are editing and keeps a backup.</p>
      <ul className="space-y-2">
        {versions.map((v) => {
          const current = v.id === currentId;
          return (
            <li key={v.id} className={cn("rounded-xl border p-3", current ? "border-indigo-300 bg-indigo-50/40" : "border-gray-200 bg-white")}>
              <div className="flex flex-wrap items-center gap-2">
                {renaming === v.id ? (
                  <span className="flex items-center gap-1 flex-1 min-w-[12rem]"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm" autoFocus />
                    <button type="button" aria-label="Save name" className="p-1 text-green-700" onClick={async () => { setBusy(v.id); try { await onRename(v, name.trim()); setRenaming(null); } finally { setBusy(null); } }}><Check className="w-4 h-4" /></button>
                    <button type="button" aria-label="Cancel" className="p-1 text-gray-500" onClick={() => setRenaming(null)}><X className="w-4 h-4" /></button></span>
                ) : (
                  <Link href={`/dashboard/resume-builder/${v.id}`} className="font-medium text-gray-900 hover:underline flex-1 min-w-[10rem] truncate">{v.name}</Link>
                )}
                <Badge variant={KIND[v.kind] ?? "neutral"}>{v.kind}</Badge>
                {v.isOriginal && <Badge variant="neutral" className="gap-1"><Lock className="w-3 h-3" /> read-only</Badge>}
                {current && <Badge variant="info">editing</Badge>}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">v{v.versionNumber} · {v.templateId} · {v.jobDescription ? `for ${v.jobDescription.jobTitle}` : v.targetJobTitle ? `for ${v.targetJobTitle}` : "no target job"} · modified {formatDate(v.updatedAt)}{typeof v.lastQualityScore === "number" ? ` · quality ${v.lastQualityScore}` : ""}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {!v.isOriginal && <Button size="sm" variant="ghost" onClick={() => { setRenaming(v.id); setName(v.name); }}><Pencil className="w-3.5 h-3.5 mr-1" /> Rename</Button>}
                <Button size="sm" variant="ghost" loading={busy === `d-${v.id}`} onClick={async () => { setBusy(`d-${v.id}`); try { await onDuplicate(v); } finally { setBusy(null); } }}><Copy className="w-3.5 h-3.5 mr-1" /> Duplicate</Button>
                {!current && <Button size="sm" variant="ghost" onClick={() => onCompare(v)}><GitCompare className="w-3.5 h-3.5 mr-1" /> Compare</Button>}
                {!current && <Button size="sm" variant="ghost" onClick={() => onRestore(v)}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore into current</Button>}
                {!v.isOriginal && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onDelete(v)}><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</Button>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
