"use client";

import type { ReactNode } from "react";
import { LogIn, AlertTriangle } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard, SkeletonStatRow } from "@/components/common/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import ProgressNav from "./ProgressNav";

interface ShellProps { current: string; title: string; description: string; icon: React.ComponentType<{ className?: string }>; loading: boolean; error: string | null; onRetry: () => void; actions?: ReactNode; children: ReactNode }

/** Shared chrome for the /dashboard/progress pages: auth gate, loading, error, nav. */
export default function ProgressPageShell({ current, title, description, icon: Icon, loading, error, onRetry, actions, children }: ShellProps) {
  const { user, ready } = useAuth();
  if (!ready || (user && loading)) return <div className="max-w-6xl mx-auto px-4 py-10 space-y-4"><SkeletonStatRow count={4} /><SkeletonCard lines={6} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to see your progress" description="Analytics, points, achievements, goals and reports are derived from your own saved records." action={{ label: "Sign in", href: `/auth/login?next=${encodeURIComponent(current)}`, icon: LogIn }} /></div>;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Icon className="w-6 h-6 text-indigo-600" /> {title}</h1>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        {actions}
      </header>
      <ProgressNav current={current} />
      {error ? <EmptyState icon={AlertTriangle} title="Could not load this page" description={error} action={{ label: "Retry", onClick: onRetry }} /> : children}
    </div>
  );
}
