"use client";

import { Star } from "lucide-react";
import type { LevelInfo } from "@/services/progressService";

/** Level + XP bar. Labels are app-activity levels, never a statement of qualification. */
export default function XpProgressBar({ level, compact = false }: { level: LevelInfo; compact?: boolean }) {
  const next = level.nextLevel;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-semibold text-gray-900 inline-flex items-center gap-1.5"><Star className="w-4 h-4 text-amber-500" /> Level {level.level} · {level.name}</p>
        <p className="text-sm text-gray-600 tabular-nums">{level.totalPoints} XP{next ? ` · ${next.pointsNeeded} to level ${next.level}` : ""}</p>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.percentToNext} aria-label="Progress to next level">
        <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all" style={{ width: `${level.percentToNext}%` }} />
      </div>
      {!compact && <p className="text-[11px] text-gray-500">{next ? `${level.levelMinPoints} → ${next.minPoints} XP for ${next.name}. ` : ""}{level.disclaimer}</p>}
    </div>
  );
}
