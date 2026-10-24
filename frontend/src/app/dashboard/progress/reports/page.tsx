"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileBarChart, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/common/Card";
import Button from "@/components/common/Button";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import { toApiClientError } from "@/services/api";
import ProgressPageShell from "@/components/progress/ProgressPageShell";
import ReportPreview from "@/components/progress/ReportPreview";
import { generateReport, listReports, getReport, downloadReportPdf, type ProgressReport, type ReportSummary } from "@/services/progressService";
import { cn, formatDate } from "@/lib/utils";

export default function ProgressReportsPage() {
  const toast = useToast();
  const { user, ready } = useAuth();
  const params = useSearchParams();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [selected, setSelected] = useState<ProgressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [offset, setOffset] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError(null);
    try {
      const r = await listReports({ limit: 50 }); setReports(r.reports);
      const wanted = params.get("report") ?? r.reports[0]?.id;
      if (wanted) setSelected(await getReport(wanted));
    } catch (err) { setError(toApiClientError(err).message); } finally { setLoading(false); }
  }, [user, params]);
  useEffect(() => { if (!ready) return; if (!user) { setLoading(false); return; } load(); }, [ready, user, load]);

  async function onGenerate(force = false) {
    setGenerating(true);
    try { const { report, reused } = await generateReport({ periodType, offset, force }); setSelected(report); const r = await listReports({ limit: 50 }); setReports(r.reports); toast.success(reused ? "Showing the report already generated for that period." : report.aiUsed ? "Report generated with an AI summary." : "Report generated (AI summary unavailable; rule-based narrative used)."); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setGenerating(false); }
  }
  async function onSelect(id: string) { try { setSelected(await getReport(id)); } catch (err) { toast.error(toApiClientError(err).message); } }
  async function onDownload() {
    if (!selected) return;
    setDownloading(true);
    try { const blob = await downloadReportPdf(selected.id); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `progress-report-${selected.periodType}-${selected.periodStart.slice(0, 10)}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    catch (err) { toast.error(toApiClientError(err).message); } finally { setDownloading(false); }
  }

  return (
    <ProgressPageShell current="/dashboard/progress/reports" title="Progress reports" description="Weekly and monthly summaries computed from your records. The AI only rewrites the metrics into prose; its suggestions are labelled as recommendations." icon={FileBarChart} loading={loading} error={error} onRetry={load}>
      <Card><CardContent className="pt-5 flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="block text-gray-700 mb-1">Period</span><select className="border border-gray-300 rounded-lg px-3 py-2" value={periodType} onChange={(e) => setPeriodType(e.target.value as "weekly" | "monthly")}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className="text-sm"><span className="block text-gray-700 mb-1">Which {periodType === "weekly" ? "week" : "month"}</span><select className="border border-gray-300 rounded-lg px-3 py-2" value={offset} onChange={(e) => setOffset(Number(e.target.value))}><option value={0}>Current (to date)</option><option value={1}>Previous</option><option value={2}>Two back</option><option value={3}>Three back</option></select></label>
        <Button loading={generating} onClick={() => onGenerate(false)}><Sparkles className="w-4 h-4 mr-1" /> Generate report</Button>
        {offset > 0 && <Button variant="outline" loading={generating} onClick={() => onGenerate(true)}><RefreshCw className="w-4 h-4 mr-1" /> Regenerate</Button>}
        <p className="text-[11px] text-gray-500 basis-full">Reports are generated on demand (no scheduled jobs). Generating the current period again refreshes it; previous periods are reused unless you regenerate.</p>
      </CardContent></Card>
      <div className="grid lg:grid-cols-3 gap-6">
        <Card><CardHeader><CardTitle>Previous reports</CardTitle></CardHeader><CardContent>
          {reports.length === 0 ? <p className="text-sm text-gray-500">No reports yet.</p> : <ul className="divide-y divide-gray-100">{reports.map((r) => <li key={r.id}><button type="button" onClick={() => onSelect(r.id)} className={cn("w-full text-left py-2 text-sm", selected?.id === r.id && "text-indigo-800")}><p className="font-medium capitalize">{r.periodType} · {formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</p><p className="text-[11px] text-gray-500 line-clamp-2">{r.summary ?? "—"}</p></button></li>)}</ul>}
        </CardContent></Card>
        <Card className="lg:col-span-2"><CardContent className="pt-5">{selected ? <ReportPreview report={selected} onDownload={onDownload} downloading={downloading} /> : <p className="text-sm text-gray-500">Generate a report to see it here.</p>}</CardContent></Card>
      </div>
    </ProgressPageShell>
  );
}
