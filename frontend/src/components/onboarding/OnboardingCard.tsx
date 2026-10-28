"use client";

import Link from "next/link";
import { CheckCircle2, Circle, SkipForward, ArrowRight, X, Info } from "lucide-react";
import Button from "@/components/common/Button";
import { cn } from "@/lib/utils";
import type { OnboardingState, OnboardingStepKey } from "@/services/onboardingService";

interface Props {
  state: OnboardingState;
  busy: boolean;
  onSkip: (step: OnboardingStepKey) => void;
  onDismiss: () => void;
  compact?: boolean;
}

/**
 * First-run setup, as a card on the dashboard rather than a wall the user has
 * to get through. Three things make it honest:
 *
 *   - A step the user's records already answer is shown ticked, not re-asked.
 *     An account that existed before this flow is simply already set up.
 *   - Skipping is offered on every step and is remembered; nothing is filled in
 *     on the user's behalf.
 *   - Each step says where its answers are actually stored, so "set up" never
 *     means a hidden second copy of the same data.
 */
export default function OnboardingCard({ state, busy, onSkip, onDismiss, compact = false }: Props) {
  const { steps, progress } = state;
  const current = steps.find((s) => s.current);

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {state.started ? "Finish setting up" : "Let’s get you set up"}
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {progress.requiredRemaining === 0
              ? "The essentials are done. The rest is optional."
              : `${progress.requiredRemaining} essential step${progress.requiredRemaining === 1 ? "" : "s"} left — a few minutes.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          aria-label="Hide setup"
          className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress */}
      <div className="mt-3" role="group" aria-label="Setup progress">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${Math.round((progress.satisfied / progress.total) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-gray-500">
          {progress.satisfied} of {progress.total} done
        </p>
      </div>

      <ol className="mt-3 space-y-2">
        {steps.map((step) => {
          const done = step.satisfied;
          return (
            <li
              key={step.key}
              className={cn(
                "rounded-lg border px-3 py-2.5",
                step.current ? "border-blue-300 bg-white" : "border-transparent bg-white/60"
              )}
            >
              <div className="flex items-start gap-2.5">
                {done ? (
                  <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-emerald-600" />
                ) : step.skipped ? (
                  <SkipForward className="mt-0.5 w-4 h-4 shrink-0 text-gray-400" />
                ) : (
                  <Circle className="mt-0.5 w-4 h-4 shrink-0 text-gray-300" />
                )}

                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", done ? "text-gray-500 line-through" : "text-gray-900")}>
                    {step.title}
                    {step.optional && !done && (
                      <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
                        optional
                      </span>
                    )}
                    {step.skipped && !done && (
                      <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
                        skipped
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{step.summary}</p>

                  {step.current && !compact && (
                    <>
                      <p className="text-[11px] text-gray-600 mt-1.5">{step.detail}</p>
                      {step.collects.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {step.collects.map((c) => (
                            <li key={c} className="text-[11px] text-gray-500">· {c}</li>
                          ))}
                        </ul>
                      )}
                      <p className="mt-1.5 text-[11px] text-gray-400 inline-flex items-start gap-1">
                        <Info className="w-3 h-3 mt-0.5 shrink-0" />
                        Saved in: {step.ownedBy}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Link
                          href={step.href}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          {step.key === "profile" ? "Fill this in" : step.key === "resume" ? "Add a resume" : "Open"}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                        <Button size="sm" variant="ghost" loading={busy} onClick={() => onSkip(step.key)}>
                          Skip for now
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {!current && (
        <p className="mt-3 text-xs text-emerald-800">
          Setup is complete. Everything below is built from what you added.
        </p>
      )}

      <p className="mt-3 text-[11px] text-gray-500 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        {state.note}
      </p>
    </section>
  );
}
