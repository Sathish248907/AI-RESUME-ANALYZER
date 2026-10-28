/**
 * onboardingService.ts — Phase 16 first-run setup.
 *
 * The flow stores progress and nothing else. Each step's answers are saved by
 * the feature that owns them — the profile step calls the career profile
 * endpoint, the resume step uploads a resume — so there is never a second copy
 * of the same fact, and leaving halfway loses nothing.
 */
import { api } from "./api";

export const ONBOARDING_STEP_KEYS = ["profile", "resume", "assessment", "next_steps"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export interface OnboardingStep {
  key: OnboardingStepKey;
  title: string;
  summary: string;
  detail: string;
  href: string;
  optional: boolean;
  collects: string[];
  /** Which model actually stores this step's answers. */
  ownedBy: string;
  /** True when the user's existing records already answer this step. */
  satisfied: boolean;
  skipped: boolean;
  completed: boolean;
  current: boolean;
}

export interface OnboardingState {
  method: string;
  started: boolean;
  complete: boolean;
  dismissed: boolean;
  currentStep: OnboardingStepKey | "done";
  steps: OnboardingStep[];
  progress: { satisfied: number; total: number; requiredRemaining: number };
  evidence: {
    hasProfile: boolean;
    resumeCount: number;
    versionCount: number;
    assessmentCount: number;
    analysisCount: number;
  };
  note: string;
  /** Present once the flow reaches the end. */
  recommendations?: Array<{ id: string; title: string; reason: string; href: string; priority: string }>;
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const { data } = await api.get("/api/onboarding");
  return data;
}

export async function markOnboardingStep(
  step: OnboardingStepKey,
  action: "complete" | "skip" = "complete"
): Promise<OnboardingState> {
  const { data } = await api.post(`/api/onboarding/steps/${encodeURIComponent(step)}`, { action });
  return data;
}

export async function dismissOnboarding(): Promise<OnboardingState> {
  const { data } = await api.post("/api/onboarding/dismiss");
  return data;
}

export async function restartOnboarding(): Promise<OnboardingState> {
  const { data } = await api.post("/api/onboarding/restart");
  return data;
}

/**
 * Whether the dashboard should offer the setup card.
 *
 * Not when it is finished, not when the user dismissed it, and not when their
 * existing records already answer every required step — an account from before
 * this flow existed should never be told to "get started".
 */
export function shouldOfferOnboarding(state: OnboardingState | null): boolean {
  if (!state) return false;
  return !state.complete && !state.dismissed;
}
