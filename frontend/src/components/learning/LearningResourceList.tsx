import { ExternalLink, Search, BookOpen, ShieldCheck } from "lucide-react";
import type { LearningResource } from "@/services/learningRoadmapService";

/**
 * Resources attached to a task. Only verified URLs are rendered as links; anything
 * else is shown as a search suggestion so the UI never points at an invented page.
 */
export default function LearningResourceList({ resources, compact = false }: { resources: LearningResource[]; compact?: boolean }) {
  if (!resources.length) return <p className="text-xs text-gray-400">No resources attached. Use the official documentation for this skill.</p>;
  return (
    <ul className={compact ? "space-y-1" : "space-y-2"}>
      {resources.map((r, i) => (
        <li key={r.id ?? `${r.title}-${i}`} className="flex items-start gap-2 text-sm">
          {r.url && r.urlVerified ? (
            <>
              <BookOpen className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline inline-flex items-center gap-1 break-all">
                  {r.title} <ExternalLink className="w-3 h-3" />
                </a>
                {!compact && r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700"><ShieldCheck className="w-3 h-3" /> {r.provider === "official" ? "Official documentation" : "Curated"} · {r.resourceType.replace(/_/g, " ")}</span>
              </div>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{r.title}</p>
                {!compact && r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                <span className="text-[11px] text-gray-400">Search suggestion — no verified link available</span>
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
