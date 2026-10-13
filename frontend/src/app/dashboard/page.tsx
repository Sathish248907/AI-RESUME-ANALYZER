"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AnalysisRecord } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Badge } from "@/components/common/Badge";
import { formatDate, getScoreColor, getScoreLabel } from "@/lib/utils";
import JobAnalysisHistory from "@/components/job-analysis/JobAnalysisHistory";
import { getJobAnalysisStats, type JobAnalysisStats } from "@/services/jobAnalysisStorage";
import {
  BarChart3,
  FileText,
  TrendingUp,
  Target,
  ArrowRight,
  PlusCircle,
  Briefcase,
  Star,
  FolderSearch,
  SearchCode,
  Layers,
} from "lucide-react";

/** Clearly-labelled placeholder content shown when no job analyses are saved yet. */
const DEMO_JOB_STATS = {
  topSkills: [
    { name: "React", count: 4 },
    { name: "TypeScript", count: 4 },
    { name: "Node.js", count: 3 },
    { name: "AWS", count: 2 },
    { name: "PostgreSQL", count: 2 },
    { name: "Docker", count: 2 },
  ],
  recentRoles: ["Frontend Developer", "Full Stack Developer", "Backend Developer"],
};

export default function DashboardPage() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<JobAnalysisStats | null>(null);

  useEffect(() => {
    setJobStats(getJobAnalysisStats(5));
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setAnalyses(d.analyses ?? []))
      .catch(() => setAnalyses([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <svg className="animate-spin w-6 h-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading dashboard…
      </div>
    );
  }

  const hasResumeAnalyses = analyses.length > 0;
  const avgScore = hasResumeAnalyses ? Math.round(analyses.reduce((sum, a) => sum + a.matchScore, 0) / analyses.length) : 0;
  const best = hasResumeAnalyses ? analyses.reduce((b, a) => (a.matchScore > b.matchScore ? a : b)) : null;
  const allMissing = analyses.flatMap((a) => (Array.isArray(a.result?.missingSkills) ? a.result.missingSkills : []));
  const weakTopics = [...new Set(allMissing)].slice(0, 8);

  // Last 8 analyses for chart, oldest → newest
  const chartData = [...analyses].reverse().slice(-8);

  const jobsSaved = jobStats?.total ?? 0;
  const usingDemoJobStats = jobsSaved === 0;
  const topSkills = usingDemoJobStats ? DEMO_JOB_STATS.topSkills : jobStats!.topSkills.slice(0, 8);
  const recentRoles = usingDemoJobStats ? DEMO_JOB_STATS.recentRoles : jobStats!.recentRoles;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Track your resume performance and the jobs you are targeting.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/job-analyzer"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors text-sm"
          >
            <SearchCode className="w-4 h-4" />
            Analyze Job Description
          </Link>
          <Link
            href="/analyze"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
          >
            <PlusCircle className="w-4 h-4" />
            New Analysis
          </Link>
        </div>
      </div>

      {/* ── Job description analyses (Phase 3) ─────────────────────────────── */}
      <section className="space-y-4" aria-labelledby="job-analyses-heading">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="job-analyses-heading" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-600" /> Job Description Analyses
          </h2>
          <Link href="/dashboard/job-history" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={FolderSearch} label="Saved job descriptions" value={jobsSaved} color="indigo" />
              <StatCard
                icon={Layers}
                label="Distinct skills requested"
                value={usingDemoJobStats ? "—" : jobStats!.topSkills.length}
                color="blue"
              />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent Job Analyses</CardTitle>
                  <span className="text-xs text-gray-400">Demo · rule-based</span>
                </div>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {jobsSaved === 0 ? (
                  <div className="px-6 py-8 text-center">
                    <Briefcase className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">No job descriptions analyzed yet</p>
                    <p className="text-xs text-gray-500 mt-1">Paste a posting to extract its skills, requirements and keywords.</p>
                    <Link href="/dashboard/job-analyzer" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
                      <SearchCode className="w-4 h-4" /> Analyze a Job Description
                    </Link>
                  </div>
                ) : (
                  <JobAnalysisHistory items={jobStats!.recent} compact />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Star className="w-4 h-4 text-amber-500" /> Most Requested Skills</CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  {usingDemoJobStats ? "Example data — analyze a job to see real counts." : "Across your saved job analyses"}
                </p>
              </CardHeader>
              <CardContent>
                {usingDemoJobStats && (
                  <span className="inline-block mb-2 text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Demo example</span>
                )}
                {topSkills.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No technical skills detected yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {topSkills.map((s) => {
                      const max = topSkills[0]?.count || 1;
                      return (
                        <li key={s.name} className="flex items-center gap-3 text-sm">
                          <span className="w-28 truncate text-gray-800">{s.name}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${usingDemoJobStats ? "bg-gray-300" : "bg-indigo-500"}`} style={{ width: `${Math.round((s.count / max) * 100)}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 tabular-nums w-6 text-right">{s.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recently Analyzed Roles</CardTitle>
              </CardHeader>
              <CardContent>
                {usingDemoJobStats && (
                  <span className="inline-block mb-2 text-[10px] uppercase tracking-wide font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Demo example</span>
                )}
                <div className="flex flex-wrap gap-2">
                  {recentRoles.map((r) => (
                    <span key={r} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${usingDemoJobStats ? "bg-gray-50 text-gray-500 border-gray-200" : "bg-indigo-50 text-indigo-800 border-indigo-200"}`}>
                      {r}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Resume analyses (Phase 1 / 2) ──────────────────────────────────── */}
      <section className="space-y-4" aria-labelledby="resume-analyses-heading">
        <h2 id="resume-analyses-heading" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" /> Resume Analyses
        </h2>

        {!hasResumeAnalyses ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <BarChart3 className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">No analyses yet</h3>
              <p className="text-gray-500 mt-2 text-sm">Run your first resume analysis to start tracking your progress here.</p>
              <Link
                href="/analyze"
                className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
              >
                <PlusCircle className="w-4 h-4" />
                Analyze a Resume
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={FileText} label="Total Analyses" value={analyses.length} color="blue" />
              <StatCard icon={TrendingUp} label="Average Score" value={`${avgScore}%`} color={avgScore >= 80 ? "green" : avgScore >= 60 ? "amber" : "red"} />
              <StatCard icon={Target} label="Best Match" value={`${best!.matchScore}%`} color="green" />
              <StatCard icon={BarChart3} label="Skill Gaps" value={weakTopics.length} color="orange" />
            </div>

            {/* Score trend — pure CSS bars */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Score Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3 h-40">
                    {chartData.map((a, i) => {
                      const pct = a.matchScore;
                      const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
                      return (
                        <div key={a.id} className="flex-1 flex flex-col items-center gap-1 group">
                          <span className="text-xs text-gray-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">{pct}%</span>
                          <div className={`w-full rounded-t-md ${color} transition-all duration-700`} style={{ height: `${pct}%` }} title={`${a.jobTitle}: ${pct}%`} />
                          <span className="text-xs text-gray-400">#{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3 flex-wrap">
                    {[
                      { color: "bg-green-500", label: "Strong (≥80%)" },
                      { color: "bg-yellow-500", label: "Moderate (60–79%)" },
                      { color: "bg-red-500", label: "Weak (<60%)" },
                    ].map((l) => (
                      <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-500">
                        <span className={`w-2.5 h-2.5 rounded-sm ${l.color}`} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent analyses + skill gaps */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Recent Analyses</CardTitle>
                      <Link href="/history" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                        View all <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="divide-y divide-gray-100 px-0">
                    {analyses.slice(0, 5).map((a) => (
                      <div key={a.id} className="flex items-center gap-4 px-6 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{a.jobTitle}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {a.resume?.fileName} · {formatDate(a.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <ProgressBar
                            value={a.matchScore}
                            className="w-24"
                            barClassName={a.matchScore >= 80 ? "bg-green-500" : a.matchScore >= 60 ? "bg-yellow-500" : "bg-red-500"}
                          />
                          <span className={`text-sm font-semibold tabular-nums w-10 text-right ${getScoreColor(a.matchScore)}`}>{a.matchScore}%</span>
                          <Badge variant={a.matchScore >= 80 ? "success" : a.matchScore >= 60 ? "warning" : "error"}>{getScoreLabel(a.matchScore)}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Top Skill Gaps</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Missing across all analyses</p>
                </CardHeader>
                <CardContent>
                  {weakTopics.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No gaps detected.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {weakTopics.map((skill) => (
                        <span key={skill} className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-full text-xs font-medium">
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    orange: "bg-orange-100 text-orange-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };

  return (
    <Card>
      <CardContent className="py-5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color] ?? colors.blue}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
