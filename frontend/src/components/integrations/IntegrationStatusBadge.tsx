"use client";

import { CheckCircle2, AlertTriangle, Plug, CircleSlash, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionStatus, Readiness } from "@/services/integrationService";

interface Props {
  readiness: Readiness;
  status?: ConnectionStatus | null;
  className?: string;
}

/**
 * The one place connection state is rendered, so "connected" always means the
 * same thing. The distinction that matters is between *connected* (a working
 * grant exists), *ready to connect* (the server could complete the flow) and
 * *needs setup* (it could not) — a card that says "needs setup" never offers a
 * connect button.
 */
export default function IntegrationStatusBadge({ readiness, status, className }: Props) {
  const view = status === "connected" || status === "configured"
    ? { icon: CheckCircle2, label: "Connected", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" }
    : status === "expired"
      ? { icon: Clock, label: "Reconnect needed", cls: "bg-amber-50 text-amber-800 border-amber-200" }
      : readiness === "available"
        ? { icon: Plug, label: "Ready to connect", cls: "bg-sky-50 text-sky-800 border-sky-200" }
        : readiness === "needs_setup"
          ? { icon: AlertTriangle, label: "Needs setup", cls: "bg-gray-100 text-gray-700 border-gray-200" }
          : { icon: CircleSlash, label: "Unavailable", cls: "bg-gray-100 text-gray-500 border-gray-200" };

  const Icon = view.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", view.cls, className)}>
      <Icon className="w-3.5 h-3.5" /> {view.label}
    </span>
  );
}
