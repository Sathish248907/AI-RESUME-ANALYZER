"use client";

import { useEffect, useState } from "react";
import {
  Zap, ChevronDown, Play, Eye, ShieldAlert, Info, AlertTriangle, Ban, Check,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import type { AutomationPreview, Workflow } from "@/services/integrationService";

interface Props {
  workflow: Workflow;
  preview: AutomationPreview | null;
  busy: boolean;
  previewing: boolean;
  running: boolean;
  onToggle: (enabled: boolean) => void;
  onSaveConfig: (config: Record<string, unknown>) => void;
  onPreview: () => void;
  onRun: (approved: boolean) => void;
}

/**
 * One workflow: its trigger, its conditions, every action it can take, and what
 * it will never do. Actions that leave the app are marked, and running one is a
 * two-step affair — preview first, then an explicit approval — so nothing
 * external ever happens as a side effect of flipping a switch.
 */
export default function AutomationRuleEditor({
  workflow, preview, busy, previewing, running, onToggle, onSaveConfig, onPreview, onRun,
}: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>({});

  useEffect(() => { setConfig(workflow.rule.config ?? {}); }, [workflow.rule.config]);

  const dirty = JSON.stringify(config) !== JSON.stringify(workflow.rule.config ?? {});
  const enabled = workflow.rule.isEnabled;
  const blocked = (key: string) => workflow.unavailableOptions.find((o) => o.field === key);

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
            <Zap className="w-4 h-4 text-amber-500" />
            {workflow.name}
            {workflow.requiresApproval && <Badge variant="warning">needs approval</Badge>}
            {workflow.rule.lastStatus && <Badge variant="neutral">last run: {workflow.rule.lastStatus}</Badge>}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">{workflow.summary}</p>
        </div>
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
          <span className="text-xs text-gray-600">{enabled ? "On" : "Off"}</span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            className="rounded border-gray-300"
            aria-label={`${enabled ? "Disable" : "Enable"} ${workflow.name}`}
          />
        </label>
      </div>

      <dl className="mt-3 space-y-1 text-[11px]">
        <div className="flex gap-1.5">
          <dt className="text-gray-500 shrink-0">Trigger:</dt>
          <dd className="text-gray-800">{workflow.trigger}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-gray-500 shrink-0">On failure:</dt>
          <dd className="text-gray-800">{workflow.failureBehaviour}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-2 text-xs text-sky-700 hover:underline inline-flex items-center gap-1"
      >
        Conditions, actions and settings
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-800">It runs only when</p>
            <ul className="mt-1 space-y-0.5">
              {workflow.conditions.map((c) => <li key={c} className="text-[11px] text-gray-700">· {c}</li>)}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-800">What it does</p>
            <ul className="mt-1 space-y-1">
              {workflow.actionDetail.map((a) => (
                <li key={a.key} className="text-[11px] flex items-start gap-1.5">
                  <span className={cn(
                    "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 border",
                    a.consequence === "external"
                      ? "bg-amber-50 text-amber-800 border-amber-200"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  )}>
                    {a.consequence === "external" ? "leaves the app" : "in app"}
                  </span>
                  <span className="text-gray-700"><strong>{a.label}</strong> — {a.description}</span>
                </li>
              ))}
            </ul>
          </div>

          {workflow.configSchema.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-2">
              <p className="text-xs font-semibold text-gray-800">Settings</p>
              {workflow.configSchema.map((field) => {
                const unavailable = blocked(field.key);
                return (
                  <div key={field.key}>
                    {field.type === "boolean" ? (
                      <label className={cn("flex items-center gap-2 text-xs", unavailable ? "text-gray-400" : "text-gray-700")}>
                        <input
                          type="checkbox"
                          checked={Boolean(config[field.key])}
                          disabled={Boolean(unavailable)}
                          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.checked }))}
                          className="rounded border-gray-300"
                        />
                        {field.label}
                      </label>
                    ) : field.type === "number" ? (
                      <label className="block text-xs text-gray-700">
                        {field.label}
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          value={Number(config[field.key] ?? field.default)}
                          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: Number(e.target.value) }))}
                          className="mt-1 w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      </label>
                    ) : (
                      <label className="block text-xs text-gray-700">
                        {field.label}
                        <select
                          value={String(config[field.key] ?? field.default)}
                          onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
                          className="mt-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        >
                          {(field.options ?? []).map((o) => (
                            <option key={o} value={o}>{field.optionLabels?.[o] ?? o}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {unavailable && (
                      <p className="text-[11px] text-amber-800 mt-0.5 inline-flex items-start gap-1">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {unavailable.reason}
                      </p>
                    )}
                  </div>
                );
              })}
              {dirty && (
                <Button size="sm" loading={busy} onClick={() => onSaveConfig(config)}>
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Save settings
                </Button>
              )}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 px-3 py-2">
            <p className="text-xs font-semibold text-gray-800 inline-flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 text-gray-500" /> It never
            </p>
            <ul className="mt-1 space-y-0.5">
              {workflow.neverDoes.map((n) => <li key={n} className="text-[11px] text-gray-600">· {n}</li>)}
            </ul>
          </div>

          {workflow.note && (
            <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" /> {workflow.note}
            </p>
          )}
        </div>
      )}

      {/* Preview and run */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" loading={previewing} disabled={!workflow.rule.id} onClick={onPreview}>
          <Eye className="w-3.5 h-3.5 mr-1.5" /> Preview
        </Button>
        <Button size="sm" variant="ghost" loading={running} disabled={!workflow.rule.id || !enabled} onClick={() => onRun(false)}>
          <Play className="w-3.5 h-3.5 mr-1.5" /> Run now
        </Button>
        {!enabled && <span className="text-[11px] text-gray-400">Switch it on to run it.</span>}
      </div>

      {/* The plan, before anything happens */}
      {preview && (
        <div className={cn("mt-3 rounded-lg border px-3 py-2", preview.fired ? "border-sky-100 bg-sky-50/60" : "border-gray-200 bg-gray-50")}>
          <p className="text-xs font-semibold text-gray-900">
            {preview.fired ? "This is what it would do" : "Nothing to do right now"}
          </p>
          <p className="text-[11px] text-gray-700 mt-0.5">{preview.reason}</p>

          {preview.actions.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {preview.actions.map((a, i) => (
                <li key={`${a.type}-${i}`} className="text-[11px] flex items-start gap-1.5">
                  <span className={cn(
                    "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 border",
                    a.consequence === "external" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-white text-gray-600 border-gray-200"
                  )}>
                    {a.consequence === "external" ? "leaves the app" : "in app"}
                  </span>
                  <span className={cn(a.skipReason ? "text-gray-400" : "text-gray-800")}>
                    {a.preview}
                    {a.skipReason && <span className="block text-amber-800">Will be skipped: {a.skipReason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {preview.requiresApproval ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="text-[11px] text-amber-950 inline-flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {preview.note}
              </p>
              <div className="mt-1.5 flex gap-2">
                <Button size="sm" loading={running} onClick={() => onRun(true)}>Approve and run</Button>
                <Button size="sm" variant="ghost" loading={running} onClick={() => onRun(false)}>Run in-app steps only</Button>
              </div>
            </div>
          ) : preview.fired ? (
            <p className="text-[11px] text-gray-600 mt-1">{preview.note}</p>
          ) : null}
        </div>
      )}
    </li>
  );
}
