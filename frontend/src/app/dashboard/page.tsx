"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import { SkeletonCard, SkeletonStatRow } from "@/components/common/Skeleton";
import EmptyState from "@/components/common/EmptyState";
import Button from "@/components/common/Button";
import JobAnalysisHistory from "@/components/job-analysis/JobAnalysisHistory";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { getDashboardActivity, getDashboardOverview, type DashboardActivity, type DashboardOverview } from "@/services/dashboardService";
import { STATUS_LABELS, STATUS_STYLES } from "@/services/jobApplicationService";
import { getJobAnalysisStats, type JobAnalysisStats } from "@/services/jobAnalysisStorage";
import { getAnalysisMetas, type StoredAnalysisMeta } from "@/services/analysisStorage";
import { cn, formatDate, getScoreColor } from "@/lib/utils";
import { BarChart3, FileText, TrendingUp, Target, ArrowRight, PlusCircle, Briefcase, Star, FolderSearch, SearchCode, Layers, LogIn, Bot, FlaskConical, Bell, Lightbulb, Mic, Upload, BookOpen, LineChart, Map, PenSquare, Compass, Trophy } from "lucide-react";

export default function DashboardPage() {
  const { user, ready } = useAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobStats, setJobStats] = useState<JobAnalysisStats | null>(null);
  const [demoAnalyses, setDemoAnalyses] = useState<StoredAnalysisMeta[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [o, a] = await Promise.all([getDashboardOverview(), getDashboardActivity(5)]);
      setOverview(o);
      setActivity(a);
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setJobStats(getJobAnalysisStats(5));
    setDemoAnalyses(getAnalysisMetas());
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  const jobsSaved = jobStats?.total ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">{user ? `Welcome back${user.name ? `, ${user.name}` : ""}. Everything here is computed from records saved to your account.` : "Sign in to see your saved resumes, analyses and applications."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/job-analyzer" className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 text-sm"><SearchCode className="w-4 h-4" /> Job analyzer</Link>
          <Link href="/dashboard/resume-analyzer" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 text-sm"><PlusCircle className="w-4 h-4" /> New analysis</Link>
        </div>
      </div>

      {/* ── Account dashboard ─────────────────────────────────────────────── */}
      {!ready ? (
        <SkeletonStatRow count={5} />
      ) : !user ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={LogIn} compact title="Your persistent dashboard is one sign-in away" description="Resumes, AI analyses, job applications and interview practice are stored in PostgreSQL and follow you across devices." action={{ label: "Sign in or create an account", href: "/auth/login?next=/dashboard", icon: LogIn }} />
            {demoAnalyses.length > 0 && (
              <p className="text-center text-xs text-gray-500 mt-4">{demoAnalyses.length} demo {demoAnalyses.length === 1 ? "analysis" : "analyses"} are stored in this browser only — see <Link href="/dashboard/analysis-history" className="text-blue-600 hover:underline">Analysis History</Link>.</p>
            )}
          </CardContent>
        </Card>
      ) : error ? (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>Could not load your dashboard: {error}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      ) : loading || !overview || !activity ? (
        <>
          <SkeletonStatRow count={5} />
          <div className="grid gap-6 lg:grid-cols-3"><SkeletonCard lines={5} className="lg:col-span-2" /><SkeletonCard lines={5} /></div>
        </>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard icon={FileText} label="Resumes" value={overview.totals.resumes} color="blue" href="/dashboard/my-resumes" />
            <StatCard icon={Bot} label="AI analyses" value={overview.totals.aiAnalyses} color="indigo" href="/dashboard/analysis-history" sub={overview.totals.demoAnalyses ? `+${overview.totals.demoAnalyses} demo` : undefined} />
            <StatCard icon={TrendingUp} label="Average match" value={overview.averageMatchScore.value === null ? "—" : `${overview.averageMatchScore.value}%`} color={overview.averageMatchScore.value === null ? "gray" : overview.averageMatchScore.value >= 80 ? "green" : overview.averageMatchScore.value >= 60 ? "amber" : "red"} sub={overview.averageMatchScore.sampleSize ? `${overview.averageMatchScore.sampleSize} scored AI` : "no scored analyses"} />
            <StatCard icon={Briefcase} label="Active applications" value={overview.totals.activeApplications} color="purple" href="/dashboard/applications" sub={`${overview.totals.applications} total`} />
            <StatCard icon={Mic} label="Interviews practised" value={overview.totals.interviewsCompleted} color="pink" href="/dashboard/interviews" sub={overview.learningProgress ? `${overview.learningProgress.questionsPracticed} questions` : "none yet"} />
            <StatCard icon={Bell} label="Follow-ups due" value={overview.followUps.dueSoon} color={overview.followUps.overdue ? "red" : "amber"} href="/dashboard/applications" sub={overview.followUps.overdue ? `${overview.followUps.overdue} overdue` : "next 14 days"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent analyses */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent analyses</CardTitle>
                  <Link href="/dashboard/analysis-history" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {activity.recentAnalyses.length === 0 ? (
                  <div className="px-6 py-6"><EmptyState compact icon={Bot} title="No analyses yet" description="Run an AI analysis to see it here." action={{ label: "Run analysis", href: "/dashboard/resume-analyzer" }} /></div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {activity.recentAnalyses.map((a) => (
                      <li key={a.id}>
                        <Link href={`/dashboard/resume-analysis/${a.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
                          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", a.analysisMode === "ai" ? "bg-indigo-100 text-indigo-700" : "bg-amber-100 text-amber-700")}>{a.analysisMode === "ai" ? <Bot className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">{a.jobTitle}{a.companyName ? ` · ${a.companyName}` : ""}</p>
                            <p className="text-xs text-gray-400">{a.resumeName ?? a.fileName ?? "resume"} · {formatDate(a.createdAt)} · {a.skillCounts.matched} matched / {a.skillCounts.missing} missing or unverified</p>
                          </div>
                          <span className={cn("font-bold tabular-nums", getScoreColor(a.matchScore))}>{a.scoreAvailable ? `${a.matchScore}%` : "—"}</span>
                          <Badge variant={a.analysisMode === "ai" ? "info" : "warning"}>{a.analysisMode === "ai" ? "AI" : "Demo"}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recommended actions */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="w-4 h-4 text-amber-500" /> Recommended next actions</CardTitle></CardHeader>
              <CardContent>
                {overview.recommendedActions.length === 0 ? <p className="text-sm text-gray-400 italic">You&apos;re all caught up.</p> : (
                  <ul className="space-y-3">
                    {overview.recommendedActions.map((a) => (
                      <li key={a.key}>
                        <Link href={a.href} className="block rounded-lg border border-gray-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/40">
                          <p className="text-sm font-medium text-gray-900">{a.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.detail}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent applications */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Recent applications</CardTitle>
                  <Link href="/dashboard/applications" className="text-sm text-blue-600 hover:underline flex items-center gap-1">Tracker <ArrowRight className="w-3 h-3" /></Link>
                </div>
              </CardHeader>
              <CardContent className="px-0 py-0">
                {activity.recentApplications.length === 0 ? (
                  <div className="px-6 py-6"><EmptyState compact icon={Briefcase} title="No applications tracked" description="Add the jobs you're pursuing to track status and follow-ups." action={{ label: "Add application", href: "/dashboard/applications" }} /></div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {activity.recentApplications.map((a) => (
                      <li key={a.id} className="flex items-center gap-4 px-6 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{a.companyName} · <span className="text-gray-600 font-normal">{a.jobTitle}</span></p>
                          <p className="text-xs text-gray-400">applied {formatDate(a.applicationDate)}{a.matchScore !== null && <> · <span className={getScoreColor(a.matchScore)}>{a.matchScore}% match</span></>}</p>
                        </div>
                        <span className={cn("text-xs font-medium rounded-full border px-2 py-0.5", STATUS_STYLES[a.status])}>{STATUS_LABELS[a.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Follow-ups + skill gaps */}
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="w-4 h-4 text-amber-500" /> Upcoming follow-ups</CardTitle></CardHeader>
                <CardContent>
                  {activity.upcomingFollowUps.length === 0 ? <p className="text-sm text-gray-400 italic">No follow-ups scheduled.</p> : (
                    <ul className="space-y-2">
                      {activity.upcomingFollowUps.map((f) => (
                        <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-gray-800">{f.companyName} · <span className="text-gray-500">{f.jobTitle}</span></span>
                          <span className={cn("text-xs whitespace-nowrap", f.overdue ? "text-red-600 font-semibold" : "text-gray-500")}>{formatDate(f.nextFollowUpDate)}{f.overdue && " · overdue"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Frequent skill gaps</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">Missing or unverified across your AI analyses</p>
                </CardHeader>
                <CardContent>
                  {overview.skillGaps.length === 0 ? <p className="text-sm text-gray-400 italic">No gaps recorded yet.</p> : (
                    <div className="flex flex-wrap gap-2">
                      {overview.skillGaps.map((g) => <span key={g.name} className="px-2.5 py-1 bg-red-50 text-red-800 border border-red-200 rounded-full text-xs font-medium" title={`${g.count} analyses · ${g.required} as required`}>{g.name} <span className="text-red-400">×{g.count}</span></span>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/dashboard/my-resumes" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><Upload className="w-4 h-4" /> Manage resumes</Link>
            <Link href="/dashboard/job-descriptions" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><BookOpen className="w-4 h-4" /> Saved job descriptions ({overview.totals.jobDescriptions})</Link>
            <Link href="/dashboard/analytics" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><LineChart className="w-4 h-4" /> Career analytics</Link>
            <Link href="/dashboard/interviews/new" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"><Mic className="w-4 h-4" /> Start a mock interview</Link>
            <Link href="/dashboard/learning" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"><Map className="w-4 h-4" /> Learning roadmap</Link>
            <Link href="/dashboard/resume-builder" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"><PenSquare className="w-4 h-4" /> Resume builder</Link>
            <Link href="/dashboard/career" className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl hover:bg-indigo-100"><Compass className="w-4 h-4" /> Career coach</Link>
            <Link href="/dashboard/progress" className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl hover:bg-amber-100"><Trophy className="w-4 h-4" /> Progress &amp; achievements</Link>
          </div>
        </>
      )}

      {/* ── Local job description analyses (Phase 3, browser only) ─────────── */}
      <section className="space-y-4" aria-labelledby="job-analyses-heading">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 id="job-analyses-heading" className="text-lg font-semibold text-gray-900 flex items-center gap-2"><FolderSearch className="w-5 h-5 text-indigo-600" /> Rule-based job analyses <span className="text-xs font-normal text-gray-400">(demo · stored in this browser)</span></h2>
          <Link href="/dashboard/job-history" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardContent className="px-0 py-0">
              {jobsSaved === 0 ? (
                <div className="px-6 py-6"><EmptyState compact icon={Briefcase} title="No job descriptions analysed locally" description="The rule-based job analyzer extracts skills and requirements without AI." action={{ label: "Analyze a job description", href: "/dashboard/job-analyzer" }} /></div>
              ) : (
                <JobAnalysisHistory items={jobStats!.recent} compact />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Star className="w-4 h-4 text-amber-500" /> Most requested skills</CardTitle></CardHeader>
            <CardContent>
              {jobsSaved === 0 || !jobStats || jobStats.topSkills.length === 0 ? <p className="text-sm text-gray-400 italic">Analyze a job description to see counts.</p> : (
                <ul className="space-y-2">
                  {jobStats.topSkills.slice(0, 8).map((s) => (
                    <li key={s.name} className="flex items-center gap-3 text-sm">
                      <span className="w-28 truncate text-gray-800">{s.name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.round((s.count / (jobStats.topSkills[0]?.count || 1)) * 100)}%` }} /></div>
                      <span className="text-xs text-gray-500 tabular-nums w-6 text-right">{s.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
      <span className="hidden"><BarChart3 /><Target /><Layers /></span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string; sub?: string; href?: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-700", purple: "bg-purple-100 text-purple-700", pink: "bg-pink-100 text-pink-700", gray: "bg-gray-100 text-gray-600",
  };
  const body = (
    <CardContent className="py-5">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-3", colors[color] ?? colors.blue)}><Icon className="w-5 h-5" /></div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </CardContent>
  );
  return href ? <Link href={href}><Card hover>{body}</Card></Link> : <Card>{body}</Card>;
}
