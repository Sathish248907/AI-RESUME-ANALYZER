"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Filter, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import DateRangeFilter from "@/components/progress/DateRangeFilter";
import MetricCard from "@/components/progress/MetricCard";
import { FunnelBars, StatusDoughnut, ActivityBarChart } from "@/components/progress/ProgressCharts";
import { getApplicationAnalytics, type AnalyticsRange, type ApplicationAnalytics } from "@/services/progressService";
import { STATUS_LABELS, type ApplicationStatus } from "@/services/jobApplicationService";

export default function ApplicationFunnelPage() {
  const { user, ready } = useAuth();
  const [range, setRange] = useState<AnalyticsRange>("90d");
  const [data, setData] = useState<ApplicationAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (r: AnalyticsRange) => { if (!user) return; setLoading(true); setError(null); try { setData(await getApplicationAnalytics(r)); } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); } }, [user]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(range); }, [ready, user, load, range]);

  const group = (rows: ApplicationAnalytics["byRole"], title: string) => (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      {rows.length === 0 ? <p className="text-xs text-gray-500">No applications yet.</p> : <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Name</th><th className="text-right">Total</th><th className="text-right">Submitted</th><th className="text-right">Interviews</th><th className="text-right">Offers</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key} className="border-t border-gray-100"><td className="py-1.5 truncate max-w-[200px]">{r.key}</td><td className="text-right tabular-nums">{r.total}</td><td className="text-right tabular-nums">{r.submitted}</td><td className="text-right tabular-nums">{r.interviews}</td><td className="text-right tabular-nums">{r.offers}</td></tr>)}</tbody></table>}
    </CardContent></Card>
  );

  return (
    <ProgressPageShell current="/dashboard/progress/applications" title="Application funnel" description="Where your tracked applications stand, with every rate's denominator spelled out. Active applications are never counted as failures." icon={Filter} loading={loading} error={error} onRetry={() => load(range)} actions={<DateRangeFilter value={range} onChange={setRange} />}>
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Tracked applications" value={data.total} definition="All applications in the tracker, any status." />
            <MetricCard label="Submitted (range)" value={data.submittedInRange.current} comparison={data.submittedInRange} definition="Applications dated in the range whose status moved beyond Interested (withdrawn excluded)." />
            <MetricCard label="Active" value={data.active} definition="Interested, Applied, Assessment, Interview or Offer." tone="emerald" />
            <MetricCard label="Median response time" value={data.responseTime.medianDays} unit=" days" unavailable={data.responseTime.caveat} definition={data.responseTime.caveat} tone="amber" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>Funnel</CardTitle></CardHeader><CardContent><FunnelBars stages={data.funnel} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Conversion rates</CardTitle></CardHeader><CardContent className="space-y-3">
              {!data.rates.available && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-2 inline-flex gap-2"><Info className="w-4 h-4 shrink-0" />{data.rates.definitions.caveat} Currently {data.rates.sampleSize} submitted.</p>}
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Response rate" value={data.rates.responseRate} unit="%" unavailable="Hidden (small sample)" definition={data.rates.definitions.responseRate} />
                <MetricCard label="Interview invitation rate" value={data.rates.interviewRate} unit="%" unavailable="Hidden (small sample)" definition={data.rates.definitions.interviewRate} />
                <MetricCard label="Offer rate" value={data.rates.offerRate} unit="%" unavailable="Hidden (small sample)" definition={data.rates.definitions.offerRate} />
                <MetricCard label="Interview → offer" value={data.rates.interviewToOffer} unit="%" unavailable="Needs 3+ interviews" definition={data.rates.definitions.interviewToOffer} />
              </div>
              <p className="text-[11px] text-gray-500">Denominator for the first three rates: {data.rates.sampleSize} submitted application{data.rates.sampleSize === 1 ? "" : "s"}. Rejections count as responses; incomplete records are never treated as rejections.</p>
            </CardContent></Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <Card><CardHeader><CardTitle>Status distribution</CardTitle></CardHeader><CardContent><StatusDoughnut data={Object.entries(data.byStatus).map(([key, value]) => ({ key, label: STATUS_LABELS[key as ApplicationStatus] ?? key, value }))} /></CardContent></Card>
            <Card><CardHeader><CardTitle>Applications over time</CardTitle></CardHeader><CardContent><ActivityBarChart data={data.overTime.map((w) => ({ ...w, events: w.applications }))} xKey="weekStart" color="#d97706" emptyText="No applications dated in this window." /><p className="text-[11px] text-gray-500 mt-1">Applications by application date, weekly.</p></CardContent></Card>
          </div>
          <div className="grid lg:grid-cols-2 gap-6">{group(data.byRole, "By target role")}{group(data.byCompany, "By company")}</div>
          <Link href="/dashboard/applications" className="text-sm text-indigo-700 hover:underline">Open the application tracker →</Link>
        </>
      )}
    </ProgressPageShell>
  );
}
