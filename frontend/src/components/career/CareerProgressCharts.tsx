"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import type { CareerDashboard } from "@/services/careerService";

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Readiness trend (line) and interview score trend (line); application pipeline (bar). All from persisted records. */
export function ReadinessTrendChart({ trend }: { trend: CareerDashboard["readiness"]["trend"] }) {
  const data = trend.filter((t) => typeof t.score === "number").map((t) => ({ date: fmt(t.date), score: t.score, role: t.targetRole }));
  if (data.length < 2) return <p className="text-xs text-gray-500">Run at least two assessments to see a trend.</p>;
  return (
    <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number, _n, i) => [`${v}/100`, i.payload.role]} /><Line type="monotone" dataKey="score" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
  );
}

export function InterviewTrendChart({ trend }: { trend: CareerDashboard["interviews"]["trend"] }) {
  const data = trend.map((t) => ({ date: fmt(t.date), score: t.score, type: t.type }));
  if (data.length === 0) return <p className="text-xs text-gray-500">No scored mock interviews yet.</p>;
  return (
    <div className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={(v: number, _n, i) => [`${v}%`, i.payload.type]} /><Line type="monotone" dataKey="score" stroke="#db2777" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
  );
}

const STATUS_COLORS: Record<string, string> = { INTERESTED: "#9ca3af", APPLIED: "#4f46e5", ASSESSMENT: "#0891b2", INTERVIEW: "#d97706", OFFER: "#16a34a", REJECTED: "#dc2626", WITHDRAWN: "#6b7280" };
export function PipelineChart({ byStatus }: { byStatus: Record<string, number> }) {
  const order = ["INTERESTED", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
  const data = order.map((s) => ({ status: s.charAt(0) + s.slice(1).toLowerCase(), key: s, count: byStatus[s] ?? 0 }));
  if (!data.some((d) => d.count)) return <p className="text-xs text-gray-500">No applications tracked yet.</p>;
  return (
    <div className="h-44"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="status" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" radius={[6, 6, 0, 0]}>{data.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}</Bar></BarChart></ResponsiveContainer></div>
  );
}
