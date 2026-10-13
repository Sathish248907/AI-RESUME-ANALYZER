import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DemoNoticeProps {
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Amber banner used wherever heuristic (rule-based) results are shown. */
export default function DemoNotice({ title = "Demo analysis.", children, className }: DemoNoticeProps) {
  return (
    <div className={cn("flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3", className)}>
      <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
      <div className="text-sm text-amber-800">
        <span className="font-semibold">{title}</span>{" "}
        {children ?? (
          <>
            Results come from rule-based keyword matching against a built-in dictionary, not from an AI model.
            The parser does not understand every job description — review, correct and add skills as needed.
          </>
        )}
      </div>
    </div>
  );
}
