"use client";

import { ShieldCheck, PauseCircle, Workflow as WorkflowIcon } from "lucide-react";
import Button from "@/components/common/Button";
import AutomationRuleEditor from "./AutomationRuleEditor";
import type { AutomationPreview, Workflow } from "@/services/integrationService";

interface Props {
  workflows: Workflow[];
  previews: Record<string, AutomationPreview | null>;
  safety: { message: string; externalActionsRequireApproval: boolean } | null;
  anyEnabled: boolean;
  busyKey: string | null;
  previewingKey: string | null;
  runningKey: string | null;
  pausing: boolean;
  onToggle: (workflow: Workflow, enabled: boolean) => void;
  onSaveConfig: (workflow: Workflow, config: Record<string, unknown>) => void;
  onPreview: (workflow: Workflow) => void;
  onRun: (workflow: Workflow, approved: boolean) => void;
  onPauseAll: () => void;
}

/**
 * All automation in one place, with a single switch that stops everything. Every
 * workflow is off until the user turns it on, and the panel states the two rules
 * the engine actually enforces: nothing that leaves the app runs without
 * approval, and nothing applies to a job application on the user's behalf.
 */
export default function AutomationCenter({
  workflows, previews, safety, anyEnabled, busyKey, previewingKey, runningKey, pausing,
  onToggle, onSaveConfig, onPreview, onRun, onPauseAll,
}: Props) {
  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
              <WorkflowIcon className="w-4 h-4 text-amber-500" /> Workflow automation
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {anyEnabled
                ? "Some workflows are on. Each one is listed below with exactly what it can do."
                : "Everything is off. Nothing runs until you switch it on."}
            </p>
          </div>
          <Button size="sm" variant="outline" loading={pausing} disabled={!anyEnabled} onClick={onPauseAll}>
            <PauseCircle className="w-3.5 h-3.5 mr-1.5" /> Pause all automation
          </Button>
        </div>

        {safety && (
          <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900 flex items-start gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{safety.message}</span>
          </p>
        )}
      </div>

      {workflows.length === 0 ? (
        <p className="text-sm text-gray-500">No workflows are available.</p>
      ) : (
        <ul className="space-y-3">
          {workflows.map((w) => (
            <AutomationRuleEditor
              key={w.key}
              workflow={w}
              preview={previews[w.key] ?? null}
              busy={busyKey === w.key}
              previewing={previewingKey === w.key}
              running={runningKey === w.key}
              onToggle={(enabled) => onToggle(w, enabled)}
              onSaveConfig={(config) => onSaveConfig(w, config)}
              onPreview={() => onPreview(w)}
              onRun={(approved) => onRun(w, approved)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
