"use client";

import { useEffect, useState } from "react";
import { MessageSquare, LogIn } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import { getBackendHealth } from "@/services/resumeAnalysisService";
import CareerCoachChat from "@/components/career/CareerCoachChat";
import CareerNav from "@/components/career/CareerNav";

export default function CareerCoachChatPage() {
  const { user, ready } = useAuth();
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => { if (user) getBackendHealth().then((h) => setAiConfigured(Boolean(h?.ai.configured))).catch(() => setAiConfigured(null)); }, [user]);
  if (!ready) return <div className="max-w-6xl mx-auto px-4 py-10"><SkeletonCard lines={8} /></div>;
  if (!user) return <div className="max-w-2xl mx-auto px-4 py-16"><EmptyState icon={LogIn} title="Sign in to chat with the career coach" action={{ label: "Sign in", href: "/auth/login?next=/dashboard/career/coach", icon: LogIn }} /></div>;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
      <div><h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2"><MessageSquare className="w-7 h-7 text-indigo-600" /> Career coach chat</h1><p className="text-gray-500 mt-1">Grounded in your own records. Facts and suggestions are kept separate; nothing is invented.</p></div>
      <CareerNav current="/dashboard/career/coach" />
      {aiConfigured === false && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">The backend has no AI provider key configured, so the coach cannot reply right now.</p>}
      <CareerCoachChat aiConfigured={aiConfigured} />
    </div>
  );
}
