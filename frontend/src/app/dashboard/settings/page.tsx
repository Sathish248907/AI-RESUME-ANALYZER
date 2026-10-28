"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Settings as SettingsIcon, User, Briefcase, Plug, Bell, Zap, RotateCcw,
  Lock, ArrowRight, Info, AlertCircle,
} from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import Button from "@/components/common/Button";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import {
  getOnboardingState, restartOnboarding, type OnboardingState,
} from "@/services/onboardingService";

/**
 * Settings — a hub, not a new store.
 *
 * Phase 16 found preferences spread across four pages with nothing pointing at
 * them: career profile, job search filters, notification categories and
 * automation rules. This page collects the links and says plainly which
 * feature owns each group. It deliberately introduces no settings of its own,
 * because a second copy of a preference is a second thing that can disagree.
 */

interface SettingsGroup {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: typeof User;
  ownedBy: string;
}

const GROUPS: SettingsGroup[] = [
  {
    key: "profile",
    title: "Career profile",
    description: "Career stage, target roles, skills, locations and what you are working towards. Everything else is shaped by this.",
    href: "/dashboard/career/profile",
    icon: User,
    ownedBy: "Used by recommendations, job ranking and readiness scoring",
  },
  {
    key: "jobs",
    title: "Job search preferences",
    description: "Which listings are surfaced, and how matches are weighted against your resume.",
    href: "/dashboard/jobs/preferences",
    icon: Briefcase,
    ownedBy: "Used by job discovery and saved-search alerts",
  },
  {
    key: "integrations",
    title: "Connections",
    description: "Google Calendar and Drive, and what each one is allowed to do. Nothing connects until you say so.",
    href: "/dashboard/integrations",
    icon: Plug,
    ownedBy: "Tokens are encrypted on the server and never reach the browser",
  },
  {
    key: "notifications",
    title: "Notifications",
    description: "Which emails you want, and the in-app alerts you already receive.",
    href: "/dashboard/integrations",
    icon: Bell,
    ownedBy: "Email delivery is off until a transport is configured — the page says so",
  },
  {
    key: "automation",
    title: "Automation",
    description: "Routine steps this app may take for you. Everything is off until switched on, and anything that leaves the app needs approval.",
    href: "/dashboard/integrations",
    icon: Zap,
    ownedBy: "Workflow rules and their run history",
  },
];

export default function SettingsPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setOnboarding(await getOnboardingState());
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  if (!ready || (user && loading)) {
    return <div className="max-w-3xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={8} /></div>;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState
          icon={Lock}
          title="Sign in to manage your settings"
          description="Preferences belong to an account."
          action={{ label: "Sign in", href: "/auth/login?next=/dashboard/settings" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-gray-500" /> Settings
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Everything that changes how this app behaves for you, and where each setting actually lives.
        </p>
      </header>

      {/* Account */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <dl className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="text-gray-900">{user.name || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd className="text-gray-900 break-all">{user.email}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-gray-500 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Signing out clears the token held in this browser. There is no server-side session to end,
          and no password reset flow in this build.
        </p>
      </section>

      {/* The groups */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Preferences</h2>
        <ul className="space-y-2">
          {GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <li key={group.key}>
                <Link
                  href={group.href}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:bg-blue-50/30"
                >
                  <span className="mt-0.5 rounded-lg bg-gray-100 p-2 shrink-0">
                    <Icon className="w-4 h-4 text-gray-600" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{group.title}</span>
                    <span className="block text-xs text-gray-600 mt-0.5">{group.description}</span>
                    <span className="block text-[11px] text-gray-400 mt-1">{group.ownedBy}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* First-run setup */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">First-run setup</h2>
        {error ? (
          <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
          </p>
        ) : onboarding ? (
          <>
            <p className="text-xs text-gray-600 mt-0.5">
              {onboarding.complete
                ? "Complete. Every step stays available here."
                : `${onboarding.progress.requiredRemaining} essential step${onboarding.progress.requiredRemaining === 1 ? "" : "s"} outstanding.`}
              {onboarding.dismissed && " You hid it from the dashboard."}
            </p>
            <ul className="mt-2 space-y-1">
              {onboarding.steps.map((step) => (
                <li key={step.key} className="text-[11px] text-gray-700 flex items-center gap-2">
                  <span
                    className={
                      step.satisfied
                        ? "w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                        : step.skipped
                          ? "w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0"
                          : "w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                    }
                  />
                  <Link href={step.href} className="hover:underline">{step.title}</Link>
                  <span className="text-gray-400">
                    {step.satisfied ? "done" : step.skipped ? "skipped" : "outstanding"}
                  </span>
                </li>
              ))}
            </ul>
            {(onboarding.dismissed || onboarding.complete) && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                loading={restarting}
                onClick={async () => {
                  setRestarting(true);
                  try {
                    setOnboarding(await restartOnboarding());
                    toast.success("Setup will be offered on the dashboard again.");
                  } catch (err) {
                    toast.error(toApiClientError(err).message);
                  } finally {
                    setRestarting(false);
                  }
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Show setup again
              </Button>
            )}
          </>
        ) : null}
      </section>

      <p className="text-[11px] text-gray-500 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        This page stores nothing of its own. Each link opens the feature that owns those settings, so
        there is only ever one copy of any preference.
      </p>
    </div>
  );
}
