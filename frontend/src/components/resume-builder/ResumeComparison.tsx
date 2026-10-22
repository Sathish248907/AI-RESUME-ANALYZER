"use client";

import { ArrowRight, GitCompare } from "lucide-react";
import Modal from "@/components/common/Modal";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import type { CompareResult, DiffChange } from "@/services/resumeBuilderService";

interface Props { result: CompareResult | null; open: boolean; onClose: () => void; onRestore?: () => void }

const KIND_LABEL: Record<string, string> = { personal: "Contact detail", section_added: "Section added", section_removed: "Section removed", section_renamed: "Section renamed", section_hidden: "Section hidden", section_shown: "Section shown", sections_reordered: "Sections reordered", entry_added: "Entry added", entry_removed: "Entry removed", entry_field: "Entry field", text_changed: "Text changed", line_changed: "Bullet changed", line_added: "Bullet added", line_removed: "Bullet removed" };

/** Side-by-side change list between the version being edited (base) and another version. */
export default function ResumeComparison({ result, open, onClose, onRestore }: Props) {
  if (!result) return null;
  const s = result.diff.summary;
  const group = (c: DiffChange) => c.sectionTitle ?? (c.kind === "personal" ? "Personal details" : c.title ?? "Document");
  const groups = new Map<string, DiffChange[]>();
  for (const c of result.diff.changes) groups.set(group(c), [...(groups.get(group(c)) ?? []), c]);
  return (
    <Modal open={open} onClose={onClose} title={`Compare “${result.base.name}” with “${result.other.name}”`} description={result.description} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{onRestore && <Button variant="outline" onClick={onRestore}>Restore “{result.other.name}” into current</Button>}</>}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Stat label="Changes" value={String(s.totalChanges)} />
          <Stat label="Words" value={`${s.wordsBefore} → ${s.wordsAfter}`} />
          <Stat label="Quality (current)" value={String(result.quality.base)} />
          <Stat label="Quality (other)" value={String(result.quality.other)} />
        </div>
        {result.diff.changes.length === 0 ? <p className="text-gray-600">The two versions have identical content.</p> : [...groups.entries()].map(([title, changes]) => (
          <section key={title}>
            <h4 className="font-semibold text-gray-900 mb-1 inline-flex items-center gap-1"><GitCompare className="w-4 h-4 text-indigo-600" /> {title}</h4>
            <ul className="space-y-1.5">
              {changes.map((c, i) => (
                <li key={i} className="rounded-lg border border-gray-200 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs mb-1"><Badge variant="neutral">{KIND_LABEL[c.kind] ?? c.kind}</Badge>{c.label && <span className="text-gray-600">{c.label}</span>}{c.field && <span className="text-gray-400">{c.field}</span>}{typeof c.index === "number" && <span className="text-gray-400">#{c.index + 1}</span>}</div>
                  {(c.before !== undefined || c.after !== undefined) && (
                    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-2 items-start text-xs">
                      <div className="rounded bg-red-50 border border-red-100 px-2 py-1 text-gray-700 min-h-[1.5rem]">{Array.isArray(c.before) ? c.before.join(" → ") : c.before || <span className="italic text-gray-400">(none)</span>}</div>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 hidden md:block mt-1" />
                      <div className="rounded bg-green-50 border border-green-100 px-2 py-1 text-gray-900 min-h-[1.5rem]">{Array.isArray(c.after) ? c.after.join(" → ") : c.after || <span className="italic text-gray-400">(none)</span>}</div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-[11px] text-gray-500">Left = the version you are editing, right = the other version.</p>
      </div>
    </Modal>
  );
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2"><p className="text-gray-500">{label}</p><p className="font-semibold text-gray-900">{value}</p></div>; }
