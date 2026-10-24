"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell, PieChart, Pie, Legend } from "recharts";

const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const SERIES_COLORS = ["#4f46e5", "#0891b2", "#d97706", "#16a34a", "#db2777", "#7c3aed", "#64748b"];
export const STATUS_COLORS: Record<string, string> = { INTERESTED: "#9ca3af", APPLIED: "#4f46e5", ASSESSMENT: "#0891b2", INTERVIEW: "#d97706", OFFER: "#16a34a", REJECTED: "#dc2626", WITHDRAWN: "#6b7280" };

/** Score-over-time line (0–100). Shows an explicit message below two points. */
export function TrendChart({ data, color = "#4f46e5", labelKey, emptyText = "Not enough data points for a trend yet.", height = "h-48", domain = [0, 100] as [number, number] }: { data: Array<{ date: string; score: number | null }>; color?: string; labelKey?: string; emptyText?: string; height?: string; domain?: [number, number] }) {
  const rows = data.filter((d) => typeof d.score === "number").map((d) => ({ ...d, label: fmtDate(d.date) }));
  if (rows.length < 2) return <p className="text-xs text-gray-500">{rows.length === 1 ? `One data point (${rows[0].score}). ${emptyText}` : emptyText}</p>;
  return (
    <div className={height} role="img" aria-label="Trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={domain} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, _n, i) => [v, labelKey ? String((i.payload as Record<string, unknown>)[labelKey] ?? "") : "score"]} />
          <Line type="monotone" dataKey="score" stroke={color} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Multi-series line chart for the progress-score history (one line per dimension plus overall). */
export function MultiTrendChart({ rows, series, height = "h-56" }: { rows: Array<Record<string, number | string | null>>; series: Array<{ key: string; label: string; color: string }>; height?: string }) {
  if (rows.length < 2) return <p className="text-xs text-gray-500">The progress score is snapshotted once per day; come back tomorrow to see a trend.</p>;
  return (
    <div className={height} role="img" aria-label="Progress score history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={s.key === "overall" ? 3 : 1.5} dot={false} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Weekly / monthly activity bars. */
export function ActivityBarChart({ data, xKey, color = "#4f46e5", height = "h-44", emptyText = "No activity in this window." }: { data: Array<{ events: number }>; xKey: string; color?: string; height?: string; emptyText?: string }) {
  if (!data.some((d) => d.events > 0)) return <p className="text-xs text-gray-500">{emptyText}</p>;
  return (
    <div className={height} role="img" aria-label="Activity chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickFormatter={(v: string) => (v.length === 7 ? new Date(`${v}-01`).toLocaleDateString(undefined, { month: "short" }) : fmtDate(v))} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip />
          <Bar dataKey="events" name="Activities" fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Doughnut for status distribution. */
export function StatusDoughnut({ data, colors = STATUS_COLORS, height = "h-56" }: { data: Array<{ key: string; label: string; value: number }>; colors?: Record<string, string>; height?: string }) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <p className="text-xs text-gray-500">No applications tracked yet.</p>;
  return (
    <div className={height} role="img" aria-label="Distribution chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={2} isAnimationActive={false}>{rows.map((d, i) => <Cell key={d.key} fill={colors[d.key] ?? SERIES_COLORS[i % SERIES_COLORS.length]} />)}</Pie>
          <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal funnel bars with counts. */
export function FunnelBars({ stages }: { stages: Array<{ stage: string; key: string; count: number; definition: string }> }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => (
        <li key={s.key} className="text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-800">{s.stage}</span><span className="tabular-nums text-gray-700">{s.count}</span></div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden" title={s.definition}><div className="h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }} /></div>
          <p className="text-[11px] text-gray-500">{s.definition}</p>
        </li>
      ))}
    </ol>
  );
}

/** Simple categorical bar chart (e.g. interviews by type). */
export function CategoryBarChart({ data, xKey, valueKey, color = "#0891b2", height = "h-44", emptyText = "No data." }: { data: Array<object>; xKey: string; valueKey: string; color?: string; height?: string; emptyText?: string }) {
  if (!data.length) return <p className="text-xs text-gray-500">{emptyText}</p>;
  return (
    <div className={height} role="img" aria-label="Bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={xKey} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip />
          <Bar dataKey={valueKey} fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
