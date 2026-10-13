"use client";

import { useState } from "react";
import { ClipboardList, Wrench, Users, Briefcase, CheckSquare, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { cn } from "@/lib/utils";
import type { Responsibility, ResponsibilityType } from "@/services/jobDescriptionParser";
import { EmptyBox } from "./SkillCategorySection";

interface ResponsibilitiesListProps {
  responsibilities: Responsibility[];
  requiredQualifications?: string[];
  preferredQualifications?: string[];
}

const GROUPS: { type: ResponsibilityType; title: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { type: "role", title: "Role responsibilities", icon: Briefcase, color: "text-gray-600 bg-gray-100" },
  { type: "technical", title: "Technical responsibilities", icon: Wrench, color: "text-blue-700 bg-blue-100" },
  { type: "collaboration", title: "Collaboration & communication", icon: Users, color: "text-purple-700 bg-purple-100" },
];

export default function ResponsibilitiesList({ responsibilities, requiredQualifications = [], preferredQualifications = [] }: ResponsibilitiesListProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showQuals, setShowQuals] = useState(false);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const hasQuals = requiredQualifications.length > 0 || preferredQualifications.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              Responsibilities
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              {responsibilities.length} detected · tick the ones your resume already demonstrates
              {checked.size > 0 && ` · ${checked.size} ticked`}
            </p>
          </div>
          {hasQuals && (
            <button type="button" onClick={() => setShowQuals((s) => !s)} className="text-xs text-blue-600 hover:underline">
              {showQuals ? "Hide" : "Show"} qualification lines
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {responsibilities.length === 0 ? (
          <EmptyBox icon={ClipboardList} text="No responsibilities could be detected confidently. The description may not use a responsibilities heading or bullet points." />
        ) : (
          GROUPS.map(({ type, title, icon: Icon, color }) => {
            const list = responsibilities.filter((r) => r.type === type);
            if (list.length === 0) return null;
            return (
              <div key={type}>
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                  <span className={cn("w-6 h-6 rounded-md flex items-center justify-center", color)}><Icon className="w-3.5 h-3.5" /></span>
                  {title}
                  <span className="text-xs text-gray-400 font-normal tabular-nums">{list.length}</span>
                </h4>
                <ul className="space-y-1.5">
                  {list.map((r) => {
                    const on = checked.has(r.id);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => toggle(r.id)}
                          aria-pressed={on}
                          className={cn(
                            "w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm transition-colors",
                            on ? "bg-green-50 border-green-200 text-gray-700" : "bg-white border-gray-200 text-gray-800 hover:bg-gray-50"
                          )}
                        >
                          {on ? <CheckSquare className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" /> : <Square className="w-4 h-4 text-gray-300 mt-0.5 flex-shrink-0" />}
                          <span className={on ? "line-through decoration-green-400/60" : ""}>{r.text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}

        {showQuals && hasQuals && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
            <QualList title="Required qualifications (as written)" items={requiredQualifications} dot="bg-blue-500" />
            <QualList title="Preferred qualifications (as written)" items={preferredQualifications} dot="bg-green-500" />
          </div>
        )}

        <p className="text-[11px] text-gray-400">Ticks are for your own review and are not saved. Classification into role / technical / collaboration is heuristic.</p>
      </CardContent>
    </Card>
  );
}

function QualList({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  return (
    <div>
      <h5 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-1.5"><span className={cn("w-2 h-2 rounded-full", dot)} />{title}</h5>
      {items.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No heading of this type was found.</p>
      ) : (
        <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
          {items.map((q) => <li key={q}>{q}</li>)}
        </ul>
      )}
    </div>
  );
}
