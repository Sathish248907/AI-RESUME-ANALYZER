"use client";

import MilestoneCard from "./MilestoneCard";
import type { TaskActions } from "./LearningTaskCard";
import type { LearningRoadmap } from "@/services/learningRoadmapService";

/** Ordered milestones with a vertical connector; the first unfinished milestone opens by default. */
export default function RoadmapTimeline({ roadmap, actions, readOnly = false, highlightTaskId }: { roadmap: LearningRoadmap; actions: TaskActions; readOnly?: boolean; highlightTaskId?: string | null }) {
  const firstOpen = roadmap.milestones.find((m) => m.status === "in_progress") ?? roadmap.milestones.find((m) => m.status === "not_started");
  return (
    <ol className="relative space-y-4">
      <div aria-hidden className="absolute left-[2.45rem] top-6 bottom-6 w-px bg-gray-200 hidden sm:block" />
      {roadmap.milestones.map((m) => (
        <li key={m.id} className="relative">
          <MilestoneCard milestone={m} actions={actions} readOnly={readOnly} defaultOpen={m.id === firstOpen?.id || m.tasks.some((t) => t.id === highlightTaskId)} highlightTaskId={highlightTaskId} />
        </li>
      ))}
    </ol>
  );
}
