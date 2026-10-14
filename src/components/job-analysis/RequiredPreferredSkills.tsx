"use client";

import { ListChecks, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { JobSkill, SkillPriority } from "@/services/jobDescriptionParser";
import EditableSkillBadge, { PRIORITY_STYLES, type SkillEditHandlers } from "./EditableSkillBadge";
import { EmptyBox } from "./SkillCategorySection";

interface RequiredPreferredSkillsProps extends SkillEditHandlers {
  skills: JobSkill[];
}

const COLUMNS: { priority: SkillPriority; title: string; hint: string }[] = [
  { priority: "required", title: "Required skills", hint: "Text uses wording such as “required”, “must have”, “proficient”, or the skill sits under a requirements heading." },
  { priority: "preferred", title: "Preferred skills", hint: "Text uses wording such as “nice to have”, “preferred”, “familiarity with”, or a nice-to-have heading." },
  { priority: "unclear", title: "Unclear priority", hint: "The description mentions the skill without wording that signals priority. Set it manually if you know." },
];

export default function RequiredPreferredSkills({ skills, onChangeCategory, onChangePriority, onRemove }: RequiredPreferredSkillsProps) {
  const inferredCount = skills.filter((s) => s.priorityInferred && s.priority !== "unclear").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-blue-600" />
          Required vs Preferred
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          A skill is only classified when the description provides supporting wording. Everything else is listed as unclear.
          {inferredCount > 0 && ` ${inferredCount} classification${inferredCount === 1 ? " is" : "s are"} marked “inferred” and should be double-checked.`}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(({ priority, title, hint }) => {
            const list = skills.filter((s) => s.priority === priority);
            const style = PRIORITY_STYLES[priority];
            return (
              <div key={priority} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    {title}
                  </h4>
                  <span className="text-xs text-gray-400 tabular-nums">{list.length}</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-3 flex items-start gap-1">
                  <HelpCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {hint}
                </p>
                {list.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">None in this group.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <EditableSkillBadge key={s.id} skill={s} onChangeCategory={onChangeCategory} onChangePriority={onChangePriority} onRemove={onRemove} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {skills.length === 0 && (
          <div className="mt-4">
            <EmptyBox icon={ListChecks} text="No skills to classify yet. Add skills in the Technical Skills section." />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
