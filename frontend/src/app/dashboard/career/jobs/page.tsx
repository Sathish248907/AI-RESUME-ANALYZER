"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, LogIn, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonList } from "@/components/common/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobPriorityBoard from "@/components/career/JobPriorityBoard";
import { getJobPriorities, type JobPriorities } from "@/services/careerService";
import CareerNav from "@/components/career/CareerNav";

export default function JobPrioritiesPage() {
  const { user, ready } = useAuth();
  const [data, setData] = useState<JobPriorities | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [includeClosed, setIncludeClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try { setData(await getJobPriorities({ wMatch: weights.match, wSkills: weights.skills, wRelevance: weights.relevance, wPreference: weights.preference, wUrgency: weights.urgency, includeClosed })); }
    catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, weights, includeClosed]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } const t = setTimeout(load, 150); return () => clearTimeout(t); }, [ready, user, load]);

  if (!ready || (user && loading && !data)) return <div className="max-w-5xl mx-auto px-4 py-10"><SkeletonList /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to prioritise your jobs" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career/jobs", icon: LogIn }} /></div>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><Briefcase className="w-7 h-7 text-indigo-600" /> Job priorities</h1><p className="text-gray-500 mt-1">Your saved job descriptions and tracked applications, ranked by a transparent, adjustable score. Add jobs manually; nothing is applied for you.</p></div>
        <div className="flex gap-2"><Link href="/dashboard/job-descriptions"><Button variant="outline"><Plus className="w-4 h-4 mr-1" /> Save a job</Button></Link><Link href="/dashboard/applications"><Button variant="outline">Track an application</Button></Link></div>
      </div>
      <CareerNav current="/dashboard/career/jobs" />
      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">{error}</div>}
      {data && !data.hasProfile && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">Set target roles in your <Link href="/dashboard/career/profile" className="underline">career profile</Link> so role relevance can be scored.</p>}
      {data && <JobPriorityBoard data={data} weights={weights} onWeights={setWeights} includeClosed={includeClosed} onIncludeClosed={setIncludeClosed} />}
    </div>
  );
}
