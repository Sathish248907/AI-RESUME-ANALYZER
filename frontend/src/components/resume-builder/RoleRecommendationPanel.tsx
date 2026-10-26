"use client";

import { useState } from "react";
import {
  Compass,
  RefreshCw,
  ChevronDown,
  Check,
  Info,
  GraduationCap,
  FolderGit2,
  Briefcase,
  CircleDashed,
  CheckCircle2,
  LayoutTemplate,
  ExternalLink,
  Lock,
} from "lucide-react";
import Button from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import { ProgressBar } from "@/components/common/ProgressBar";
import { cn } from "@/lib/utils";
import type { RoleCard, RoleRecommendations } from "./types";

interface Props {
  result: RoleRecommendations | null;
  busy: boolean;
  /** Content changed since the roles were computed. */
  stale: boolean;
  /** Title of the role currently being selected. */
  selectingRole: string | null;
  readOnly: boolean;
  onRun: () => void;
  onSelectRole: (input: { role: string; applyTemplate: boolean; applySectionOrder: boolean }) => Promise<void>;
  onLocate: (target: { sectionId: string | null; entryId: string | null }) => void;
}

const BAND_BADGE = (score: number): "success" | "info" | "warning" =>
  score >= 75 ? "success" : score >= 60 ? "info" : "warning";
const BAR = (score: number) =>
  score >= 75 ? "bg-emerald-500" : score >= 60 ? "bg-sky-500" : "bg-amber-500";

/**
 * Role suitability (Phase 11): every number comes from the deterministic engine
 * and is explained by the evidence it was read from. The panel deliberately
 * shows no salary, demand or hiring-probability figure — the engine produces
 * none — and separates skills that are demonstrated from skills merely listed.
 */
export default function RoleRecommendationPanel({
  result,
  busy,
  stale,
  selectingRole,
  readOnly,
  onRun,
  onSelectRole,
  onLocate,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [applyTemplate, setApplyTemplate] = useState(true);
  const [applySectionOrder, setApplySectionOrder] = useState(true);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Compass className="w-4 h-4 text-violet-600" />
            Roles your resume supports
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Scored from the skills, projects and experience in this version — not from a prediction
            about the job market.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRun} loading={busy}>
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", busy && "animate-spin")} />
          {result ? "Recalculate" : "Find roles"}
        </Button>
      </div>

      {!result ? (
        <p className="text-sm text-gray-500">
          Run this to see which roles your current content already evidences, what each one is
          missing, and the template and section order that suit it.
        </p>
      ) : (
        <>
          {stale && (
            <p className="text-[11px] text-amber-700">
              You have edited since this ran; recalculate for current results.
            </p>
          )}

          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-700">
            <p>
              {result.considered} role{result.considered === 1 ? "" : "s"} considered ·{" "}
              {result.roles.length} above the {result.minSuitability}% evidence threshold · career
              level read as <strong className="font-semibold">{result.careerLevel}</strong>
            </p>
            <p className="mt-1 text-gray-600">{result.evidenceNote}</p>
            {result.currentTargetRoles.length > 0 && (
              <p className="mt-1 text-gray-600">
                Your stated target{result.currentTargetRoles.length === 1 ? "" : "s"}:{" "}
                {result.currentTargetRoles.join(", ")}
              </p>
            )}
            <p className="mt-1 text-gray-500">
              Read from: {[
                result.inputsUsed.resumeContent && "this resume",
                result.inputsUsed.careerProfile && "your career profile",
                result.inputsUsed.learningProgress && "your learning progress",
              ]
                .filter(Boolean)
                .join(", ") || "this resume"}
              . {result.inputsUsed.note}
            </p>
          </div>

          {result.roles.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm font-semibold text-amber-950">No role has enough evidence yet</p>
              <p className="text-xs text-amber-900 mt-1">
                Nothing in this version reaches {result.minSuitability}% suitability, so no role is
                recommended rather than guessing one. Add your skills, then the projects or
                experience where you used them.
              </p>
              {result.belowThreshold.length > 0 && (
                <p className="text-xs text-amber-900/80 mt-2">
                  Closest so far:{" "}
                  {result.belowThreshold
                    .slice(0, 4)
                    .map((r) => `${r.title} (${r.suitability}%)`)
                    .join(" · ")}
                </p>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {result.roles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  open={openId === role.id}
                  onToggle={() => setOpenId((id) => (id === role.id ? null : role.id))}
                  busy={selectingRole === role.title}
                  readOnly={readOnly}
                  applyTemplate={applyTemplate}
                  applySectionOrder={applySectionOrder}
                  onApplyTemplate={setApplyTemplate}
                  onApplySectionOrder={setApplySectionOrder}
                  onSelect={() => onSelectRole({ role: role.title, applyTemplate, applySectionOrder })}
                  onLocate={onLocate}
                />
              ))}
            </ul>
          )}

          {result.roles.length > 0 && result.belowThreshold.length > 0 && (
            <details className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <summary className="text-xs text-gray-600 cursor-pointer">
                {result.belowThreshold.length} role
                {result.belowThreshold.length === 1 ? "" : "s"} below the threshold (not recommended)
              </summary>
              <ul className="mt-2 space-y-1">
                {result.belowThreshold.map((r) => (
                  <li key={r.title} className="text-xs text-gray-600 flex justify-between gap-2">
                    <span>{r.title}</span>
                    <span className="tabular-nums text-gray-400">{r.suitability}%</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-[11px] text-gray-500 inline-flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" /> {result.disclaimer}
          </p>
          <p className="text-[11px] text-gray-400">
            {result.method} · weights{" "}
            {Object.entries(result.weights)
              .map(([k, v]) => `${k} ${v}`)
              .join(" · ")}
          </p>
        </>
      )}
    </div>
  );
}

function RoleRow({
  role,
  open,
  onToggle,
  busy,
  readOnly,
  applyTemplate,
  applySectionOrder,
  onApplyTemplate,
  onApplySectionOrder,
  onSelect,
  onLocate,
}: {
  role: RoleCard;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  readOnly: boolean;
  applyTemplate: boolean;
  applySectionOrder: boolean;
  onApplyTemplate: (v: boolean) => void;
  onApplySectionOrder: (v: boolean) => void;
  onSelect: () => void;
  onLocate: Props["onLocate"];
}) {
  const evidence = [
    ...role.relevantExperience.map((e) => ({ ...e, kind: "experience" as const })),
    ...role.relevantProjects.map((e) => ({ ...e, kind: "project" as const })),
  ];

  return (
    <li className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-3.5 py-3 hover:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 inline-flex items-center gap-2 flex-wrap">
              {role.title}
              <Badge variant={BAND_BADGE(role.suitability)}>{role.band}</Badge>
              {role.isPreferred && <Badge variant="info">your stated preference</Badge>}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{role.summary}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-semibold tabular-nums text-gray-900">{role.suitability}%</p>
            <p className="text-[11px] text-gray-400">evidence</p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar
            value={role.suitability}
            animated={false}
            className="h-1.5 flex-1"
            barClassName={BAR(role.suitability)}
          />
          <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3.5 py-3 space-y-3">
          {/* Component breakdown */}
          <div className="space-y-1.5">
            {role.components.map((c) => (
              <div key={c.key}>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-700">
                    {c.label} <span className="text-gray-400">(weight {c.weight})</span>
                  </span>
                  <span className="font-medium tabular-nums">{c.score}</span>
                </div>
                <ProgressBar value={c.score} animated={false} className="h-1" barClassName={BAR(c.score)} />
              </div>
            ))}
          </div>

          {/* Why */}
          {role.reasons.length > 0 && (
            <ul className="space-y-1">
              {role.reasons.map((r) => (
                <li key={r} className="text-xs text-gray-700 flex items-start gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> {r}
                </li>
              ))}
            </ul>
          )}

          {/* Skills, three-valued */}
          <div className="grid sm:grid-cols-3 gap-2">
            <SkillBox
              title="Demonstrated"
              hint="Used in a project or role"
              icon={CheckCircle2}
              tone="emerald"
              items={role.matchingSkills}
            />
            <SkillBox
              title="Listed only"
              hint="Named but not evidenced"
              icon={CircleDashed}
              tone="amber"
              items={role.skillsNeedingEvidence}
            />
            <SkillBox
              title="Not shown"
              hint="Expected for this role"
              icon={GraduationCap}
              tone="gray"
              items={role.skillsToDevelop.map((s) => (s.learningInProgress ? `${s.name} (learning)` : s.name))}
            />
          </div>

          {/* Evidence in the document */}
          {evidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-800">What this is based on</p>
              <ul className="mt-1 space-y-1">
                {evidence.map((e) => (
                  <li key={`${e.kind}-${e.entryId}`} className="text-xs text-gray-700 flex items-start gap-1.5">
                    {e.kind === "project" ? (
                      <FolderGit2 className="w-3.5 h-3.5 text-violet-500 mt-0.5 shrink-0" />
                    ) : (
                      <Briefcase className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onLocate({ sectionId: e.sectionId, entryId: e.entryId })}
                        className="text-sky-700 hover:underline font-medium"
                      >
                        {e.name}
                      </button>
                      {e.matchedSkills.length > 0 && (
                        <span className="text-gray-500"> — {e.matchedSkills.join(", ")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What to learn next */}
          {role.learningTasks.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-800">To close the gap</p>
              <ul className="mt-1.5 space-y-2">
                {role.learningTasks.map((t) => (
                  <li key={t.skillName} className="text-xs">
                    <p className="font-medium text-gray-900 inline-flex items-center gap-1.5 flex-wrap">
                      {t.skillName}
                      {t.isCore && <Badge variant="warning">core</Badge>}
                      {t.inProgress && <Badge variant="info">in progress</Badge>}
                    </p>
                    <p className="text-gray-600">{t.why}</p>
                    {t.resources.length > 0 && (
                      <ul className="mt-0.5 space-y-0.5">
                        {t.resources.map((r) => (
                          <li key={r.title}>
                            {r.url ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-700 hover:underline inline-flex items-center gap-1"
                              >
                                {r.title} <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-gray-600">{r.title}</span>
                            )}
                            <span className="text-gray-400"> · {r.resourceType}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Select this role */}
          <div className="rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2.5">
            <p className="text-xs font-semibold text-violet-950 inline-flex items-center gap-1.5">
              <LayoutTemplate className="w-3.5 h-3.5" /> Target this role
            </p>
            <p className="text-[11px] text-violet-900/80 mt-0.5">
              Saves “{role.title}” as this version’s target role. Your content is never rewritten.
            </p>
            <div className="mt-2 space-y-1.5">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={applyTemplate}
                  disabled={readOnly}
                  onChange={(e) => onApplyTemplate(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Switch to the suggested template ({role.recommendedTemplateId})
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={applySectionOrder}
                  disabled={readOnly}
                  onChange={(e) => onApplySectionOrder(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Reorder sections for a {role.careerLevel} profile
              </label>
            </div>
            <Button size="sm" className="mt-2" onClick={onSelect} loading={busy} disabled={readOnly}>
              {readOnly ? <Lock className="w-3.5 h-3.5 mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
              {readOnly ? "Original is read-only" : `Target ${role.title}`}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SkillBox({
  title,
  hint,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber" | "gray";
  items: string[];
}) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-950",
    amber: "border-amber-100 bg-amber-50/60 text-amber-950",
    gray: "border-gray-200 bg-gray-50 text-gray-800",
  };
  const iconTones = { emerald: "text-emerald-600", amber: "text-amber-600", gray: "text-gray-500" };
  return (
    <div className={cn("rounded-lg border px-2.5 py-2", tones[tone])}>
      <p className="text-[11px] font-semibold inline-flex items-center gap-1">
        <Icon className={cn("w-3.5 h-3.5", iconTones[tone])} /> {title} ({items.length})
      </p>
      <p className="text-[10px] opacity-70">{hint}</p>
      <p className="text-[11px] mt-1 break-words">{items.length ? items.join(", ") : "—"}</p>
    </div>
  );
}
