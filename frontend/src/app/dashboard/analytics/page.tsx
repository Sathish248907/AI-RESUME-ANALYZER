"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, LogIn, Info, TrendingUp, Briefcase, PieChart as PieIcon, Mic, Layers, Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import { getDashboardAnalytics, type AnalyticsRange, type DashboardAnalytics, type PeriodCount } from "@/services/dashboardService";
import { STATUS_LABELS, type ApplicationStatus } from "@/services/jobApplicationService";
import { cn, formatDate } from "@/lib/utils";

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }, { value: "12m", label: "12 months" }, { value: "all", label: "All time" },
];

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  INTERESTED: "#9ca3af", APPLIED: "#3b82f6", ASSESSMENT: "#6366f1", INTERVIEW: "#a855f7", OFFER: "#22c55e", REJECTED: "#ef4444", WITHDRAWN: "#f59e0b",
};

const periodLabel = (p: string) => (p.length === 7 ? new Date(`${p}-01`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : new Date(p).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

export default function AnalyticsPage() {
  const { user, ready } = useAuth();
  const [range, setRange] = useState<AnalyticsRange>("90d");
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getDashboardAnalytics(range));
    } catch (err) {
      setError(toApiClientError(err).message);
    } finally {
      setLoading(false);
    }
  }, [user, range]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setLoading(false); return; }
    load();
  }, [ready, user, load]);

  if (!ready) return <div className="max-w-6xl mx-auto px-4 py-10 grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>;
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState icon={LogIn} title="Sign in to see your career analytics" description="Charts are computed from the analyses, applications and interview practice saved to your account." action={{ label: "Sign in", href: "/auth/login?next=/dashboard/analytics", icon: LogIn }} />
      </div>
    );
  }

  const noData = data && data.sampleSizes.analyses === 0 && data.sampleSizes.applications === 0 && data.interviewActivity.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Career Analytics</h1>
          <p className="text-gray-500 mt-1">Computed from your own records. Nothing is estimated or back-filled.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.value} type="button" role="tab" aria-selected={range === r.value} onClick={() => setRange(r.value)} className={cn("px-3 py-1.5 text-xs font-medium rounded-md", range === r.value ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100")}>{r.label}</button>
          ))}
        </div>
      </div>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex justify-between gap-3"><span>{error}</span><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>}

      {loading || !data ? (
        <div className="grid gap-4 md:grid-cols-2"><SkeletonCard lines={6} /><SkeletonCard lines={6} /><SkeletonCard lines={6} /><SkeletonCard lines={6} /></div>
      ) : noData ? (
        <EmptyState icon={BarChart3} title="Not enough history yet" description={`No analyses, applications or interview sessions in the selected range${range !== "all" ? " — try “All time”" : ""}. Run an AI analysis or add an application to start building your charts.`} action={{ label: "Run an analysis", href: "/dashboard/resume-analyzer" }} />
      ) : (
        <>
          <div className="flex items-start gap-2 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <Info className="w-3.5 h-3.5 mt-0.5 text-amber-600 flex-shrink-0" />
            <span>{data.scoreTrendNote} Demo analyses are excluded from every chart.</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Score trend */}
            <ChartCard icon={TrendingUp} title="Match score trend" subtitle={`${data.sampleSizes.aiAnalyses} AI ${data.sampleSizes.aiAnalyses === 1 ? "analysis" : "analyses"} with a computed score`}>
              {data.scoreTrend.length < 2 ? (
                <Insufficient text={data.scoreTrend.length === 1 ? "One scored analysis — a trend needs at least two." : "No scored AI analyses in this range."} />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.scoreTrend.map((p) => ({ ...p, label: formatDate(p.date) }))} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v: number) => [`${v}%`, "Match score (estimate)"]} labelFormatter={(l, payload) => `${l} · ${payload?.[0]?.payload?.jobTitle ?? ""}`} />
                    <Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Match score" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Applications over time */}
            <ChartCard icon={Briefcase} title="Applications over time" subtitle={`per ${data.granularity} · ${data.sampleSizes.applications} in range`}>
              {data.applicationsOverTime.length === 0 ? <Insufficient text="No applications in this range." /> : <CountBars data={data.applicationsOverTime} color="#3b82f6" name="Applications" />}
            </ChartCard>

            {/* Status distribution */}
            <ChartCard icon={PieIcon} title="Application status distribution" subtitle="All applications in your account">
              {data.statusDistribution.every((s) => s.count === 0) ? <Insufficient text="No applications yet." /> : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={data.statusDistribution.filter((s) => s.count > 0).map((s) => ({ name: STATUS_LABELS[s.status], value: s.count, status: s.status }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {data.statusDistribution.filter((s) => s.count > 0).map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v} application${v === 1 ? "" : "s"}`, n]} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Analysis frequency */}
            <ChartCard icon={Activity} title="Resume analysis frequency" subtitle={`per ${data.granularity} · AI and demo runs saved to your account`}>
              {data.analysesOverTime.length === 0 ? <Insufficient text="No analyses in this range." /> : <CountBars data={data.analysesOverTime} color="#4f46e5" name="Analyses" />}
            </ChartCard>

            {/* Interview practice */}
            <ChartCard icon={Mic} title="Interview practice activity" subtitle={`completed sessions per ${data.granularity}`}>
              {data.interviewActivity.length === 0 ? <Insufficient text="No completed practice sessions in this range. Open an AI analysis → Interview tab → mark questions as practised." /> : <CountBars data={data.interviewActivity} color="#a855f7" name="Sessions" />}
            </ChartCard>

            {/* Skill gaps */}
            <ChartCard icon={Layers} title="Most frequent skill gaps" subtitle="Missing or unverified skills across AI analyses in range">
              {data.skillGaps.length === 0 ? <Insufficient text="No skill gaps recorded in this range." /> : (
                <ResponsiveContainer width="100%" height={Math.max(160, data.skillGaps.length * 26)}>
                  <BarChart data={data.skillGaps} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number, _n, p) => [`${v} analys${v === 1 ? "is" : "es"} (${p.payload.required} as required)`, "Flagged in"]} />
                    <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="Flagged in" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Weekly / monthly summaries */}
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryTable title="Weekly activity (last 90 days)" rows={mergeSeries(data.weekly)} />
            <SummaryTable title="Monthly activity (last 12 months)" rows={mergeSeries(data.monthly)} />
          </div>

          <p className="text-xs text-gray-400">
            Match scores are application-defined estimates, not hiring probabilities. See <Link href="/dashboard/analysis-history" className="text-blue-600 hover:underline">Analysis History</Link> for the per-analysis breakdown.
          </p>
        </>
      )}
    </div>
  );
}

function ChartCard({ icon: Icon, title, subtitle, children }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-600" /> {title}</CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Insufficient({ text }: { text: string }) {
  return <div className="h-40 flex items-center justify-center text-center text-sm text-gray-400 italic px-6">{text}</div>;
}

function CountBars({ data, color, name }: { data: PeriodCount[]; color: string; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data.map((d) => ({ ...d, label: periodLabel(d.period) }))} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => [v, name]} />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} name={name} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function mergeSeries(s: { analyses: PeriodCount[]; applications: PeriodCount[]; interviews: PeriodCount[] }) {
  const periods = [...new Set([...s.analyses, ...s.applications, ...s.interviews].map((p) => p.period))].sort();
  const get = (arr: PeriodCount[], p: string) => arr.find((x) => x.period === p)?.count ?? 0;
  return periods.map((p) => ({ period: p, analyses: get(s.analyses, p), applications: get(s.applications, p), interviews: get(s.interviews, p) })).reverse();
}

function SummaryTable({ title, rows }: { title: string; rows: { period: string; analyses: number; applications: number; interviews: number }[] }) {
  return (
    <Card>
      <CardHeader className="py-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="px-0 py-0">
        {rows.length === 0 ? <p className="px-6 py-6 text-sm text-gray-400 italic">No activity.</p> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50"><tr><th className="text-left px-6 py-2">Period</th><th className="text-right px-4 py-2">Analyses</th><th className="text-right px-4 py-2">Applications</th><th className="text-right px-6 py-2">Interviews</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.slice(0, 12).map((r) => (
                <tr key={r.period}><td className="px-6 py-2 text-gray-700">{r.period.length === 7 ? periodLabel(r.period) : `Week of ${periodLabel(r.period)}`}</td><td className="px-4 py-2 text-right tabular-nums">{r.analyses}</td><td className="px-4 py-2 text-right tabular-nums">{r.applications}</td><td className="px-6 py-2 text-right tabular-nums">{r.interviews}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
