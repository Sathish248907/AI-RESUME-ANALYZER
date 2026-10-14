import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void; icon?: React.ComponentType<{ className?: string }> };
  children?: ReactNode;
  compact?: boolean;
  className?: string;
}

export default function EmptyState({ icon: Icon, title, description, action, children, compact = false, className }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  const btn = "inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm";
  return (
    <div className={cn("text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50/60", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <div className={cn("bg-white border border-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4", compact ? "w-11 h-11" : "w-14 h-14")}>
        <Icon className={cn("text-gray-400", compact ? "w-5 h-5" : "w-7 h-7")} />
      </div>
      <h3 className={cn("font-semibold text-gray-900", compact ? "text-base" : "text-lg")}>{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">{description}</p>}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link href={action.href} className={btn}>{ActionIcon && <ActionIcon className="w-4 h-4" />}{action.label}</Link>
          ) : (
            <button type="button" onClick={action.onClick} className={btn}>{ActionIcon && <ActionIcon className="w-4 h-4" />}{action.label}</button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
