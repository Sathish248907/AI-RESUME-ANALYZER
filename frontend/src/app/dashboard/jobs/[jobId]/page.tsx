"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Briefcase, AlertCircle, Lock } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import JobDetails from "@/components/jobs/JobDetails";
import JobMatchReport from "@/components/jobs/JobMatchReport";
import JobInterviewPreparation from "@/components/jobs/JobInterviewPreparation";
import {
  deleteSavedJob, getJob, matchJob, saveJob, startApplication, tailorResumeForJob,
  type JobDetail, type MatchReport, type SavedState, type TailorHandoff,
} from "@/services/jobDiscoveryService";

/**
 * One job: the listing, the match against a chosen resume version, and the
 * preparation built from the user's own records. Actions here feed the existing
 * application tracker and resume builder rather than duplicating them.
 */
export default function JobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = decodeURIComponent((params?.jobId as string) ?? "");
  const toast = useToast();
  const { user, ready } = useAuth();

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [report, setReport] = useState<MatchReport | null>(null);
  const [comparison, setComparison] = useState<TailorHandoff["comparison"] | null>(null);
  const [handoff, setHandoff] = useState<TailorHandoff | null>(null);

  const load = useCallback(async (resumeVersionId?: string) => {
    if (!user || !jobId) return;
    setLoading(true); setError(null);
    try {
      const data = await getJob(jobId, resumeVersionId ? { resumeVersionId } : {});
      setDetail(data);
      setReport(data.match);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, jobId]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  async function recompute(resumeVersionId?: string, compareAll = false) {
    setMatching(true);
    try {
      const r = await matchJob(jobId, { resumeVersionId, compareAllVersions: compareAll });
      setReport(r.match);
      setComparison(r.comparison);
      setDetail((d) => (d ? { ...d, match: r.match, resumeVersion: r.resumeVersion } : d));
      toast.success(r.match.matchScore === null ? "Nothing could be compared for this listing." : `Match ${r.match.matchScore}% (${r.match.label}).`);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setMatching(false);
    }
  }

  async function onSave(state: SavedState) {
    setBusy(true);
    try {
      await saveJob({ jobId, state });
      toast.success(state === "hidden" ? "Hidden from your results." : "Saved.");
      await load(detail?.resumeVersion?.id);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onUnsave() {
    if (!detail?.savedJob) return;
    setBusy(true);
    try {
      await deleteSavedJob(detail.savedJob.id);
      toast.success("Removed from your saved jobs.");
      await load(detail?.resumeVersion?.id);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onStartApplication() {
    if (!detail?.savedJob) return;
    setBusy(true);
    try {
      const r = await startApplication(detail.savedJob.id, { status: "INTERESTED" });
      toast.success(r.note);
      await load(detail?.resumeVersion?.id);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onTailor() {
    setTailoring(true);
    try {
      const r = await tailorResumeForJob(jobId, {});
      setHandoff(r);
      setComparison(r.comparison);
      toast.success(`Best match: ${r.recommendedVersion.name}. Open the resume builder to review suggestions.`);
    } catch (err) {
      toast.error(toApiClientError(err).message);
    } finally {
      setTailoring(false);
    }
  }

  if (!ready || (user && loading)) {
    return <div className="max-w-5xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={6} /><SkeletonCard lines={8} /></div>;
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={Lock} title="Sign in to view this job" action={{ label: "Sign in", href: `/auth/login?next=/dashboard/jobs/${encodeURIComponent(jobId)}` }} />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState
          icon={AlertCircle}
          title="Could not load this job"
          description={error ?? "Not found."}
          action={{ label: "Back to job discovery", href: "/dashboard/jobs" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back to job discovery
      </Link>

      <JobDetails
        detail={detail}
        busy={busy}
        tailoring={tailoring}
        tailorHandoff={handoff}
        onSave={onSave}
        onUnsave={onUnsave}
        onStartApplication={onStartApplication}
        onTailor={onTailor}
      />

      <JobMatchReport
        report={report}
        resumeVersion={detail.resumeVersion}
        versions={detail.availableResumeVersions}
        busy={matching}
        onRecompute={recompute}
        comparison={comparison ?? undefined}
      />

      <JobInterviewPreparation
        preparation={detail.preparation}
        note={detail.preparation ? null : "Interview preparation is built from the gap between this listing and a resume version. Create a resume version first."}
      />

      <p className="text-[11px] text-gray-400 inline-flex items-center gap-1.5">
        <Briefcase className="w-3 h-3" /> Listing supplied by {detail.job.providerName ?? detail.job.providerSlug}.
      </p>
    </div>
  );
}
