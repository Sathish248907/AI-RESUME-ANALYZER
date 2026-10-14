import { CheckCircle, AlertTriangle, XCircle, Info, Shield } from "lucide-react";
import type { ATSCheck } from "@/services/mockAnalysisService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

interface ATSReadinessCardProps {
  checks: ATSCheck[];
}

const STATUS_META = {
  pass: {
    icon: CheckCircle,
    iconColor: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    label: "Pass",
    labelColor: "text-green-700 bg-green-100",
  },
  warn: {
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    label: "Review",
    labelColor: "text-amber-700 bg-amber-100",
  },
  fail: {
    icon: XCircle,
    iconColor: "text-red-600",
    bg: "bg-red-50",
    border: "border-red-200",
    label: "Issue",
    labelColor: "text-red-700 bg-red-100",
  },
} as const;

export default function ATSReadinessCard({ checks }: ATSReadinessCardProps) {
  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  const overallScore = Math.round(
    ((passed + warned * 0.5) / checks.length) * 100
  );

  const overallColor =
    overallScore >= 80 ? "text-green-600" : overallScore >= 60 ? "text-amber-600" : "text-red-600";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <CardTitle>ATS Readiness</CardTitle>
          </div>
          <div className={cn("text-2xl font-bold tabular-nums", overallColor)}>
            {overallScore}%
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Disclaimer */}
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            These are <strong>estimated checks</strong> based on common ATS patterns. Actual compatibility varies by platform and employer configuration.
          </p>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Passed", value: passed, color: "text-green-700", bg: "bg-green-50 border-green-200" },
            { label: "Review", value: warned, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
            { label: "Issues", value: failed, color: "text-red-700", bg: "bg-red-50 border-red-200" },
          ].map((s) => (
            <div key={s.label} className={cn("rounded-xl border p-3 text-center", s.bg)}>
              <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
              <div className={cn("text-xs font-medium mt-0.5", s.color)}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Check list */}
        <div className="space-y-2 pt-1">
          {checks.map((check) => {
            const meta = STATUS_META[check.status];
            const Icon = meta.icon;
            return (
              <div
                key={check.label}
                className={cn("flex items-start gap-3 rounded-xl border p-3", meta.bg, meta.border)}
              >
                <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", meta.iconColor)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{check.label}</p>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", meta.labelColor)}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{check.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
