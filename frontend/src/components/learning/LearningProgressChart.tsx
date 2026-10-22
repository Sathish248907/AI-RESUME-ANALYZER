"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import type { LearningRoadmap } from "@/services/learningRoadmapService";

const COLOR: Record<string, string> = { completed: "#16a34a", in_progress: "#4f46e5", not_started: "#9ca3af", locked: "#d1d5db" };

/** Completion percent per milestone. Derived from task state — no stored aggregate. */
export default function LearningProgressChart({ roadmap }: { roadmap: LearningRoadmap }) {
  const data = roadmap.milestones.map((m) => ({ name: `M${m.sequenceNumber}`, title: m.title, percent: m.progress?.percent ?? 0, status: m.status, done: m.progress?.completedRequired ?? 0, total: m.progress?.requiredTasks ?? 0 }));
  if (!data.length) return null;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
          <Tooltip formatter={(v: number, _n, item) => [`${v}% (${item.payload.done}/${item.payload.total} tasks)`, item.payload.title]} labelFormatter={() => ""} />
          <Bar dataKey="percent" radius={[6, 6, 0, 0]}>
            {data.map((d) => <Cell key={d.name} fill={COLOR[d.status] ?? COLOR.not_started} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
