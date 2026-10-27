"use client";

import type { ReactNode } from "react";
import { LogIn, AlertTriangle } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import JobsNav from "./JobsNav";

interface Props {
  current: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

/** Shared chrome for the /dashboard/jobs pages: auth gate, loading, error, nav. */
export default function JobsPageShell({ current, title, description, icon: Icon, loading, error, onRetry, actions, children }: Props) {
  const { user, ready } = useAuth();

  if (!ready || (user && loading)) {
    return <div className="max-w-6xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={3} /><SkeletonCard lines={6} /></div>;
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState
          icon={LogIn}
          title="Sign in to search for jobs"
          description="Job matching compares real listings against your own resume versions, so it needs your account."
          action={{ label: "Sign in", href: `/auth/login?next=${encodeURIComponent(current)}`, icon: LogIn }}
        />
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Icon className="w-6 h-6 text-indigo-600" /> {title}
          </h1>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        {actions}
      </header>
      <JobsNav />
      {error
        ? <EmptyState icon={AlertTriangle} title="Could not load this page" description={error} action={{ label: "Retry", onClick: onRetry }} />
        : children}
    </div>
  );
}
