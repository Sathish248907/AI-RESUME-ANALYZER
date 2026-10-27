"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Plug } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { SkeletonCard } from "@/components/common/Skeleton";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/hooks/useAuth";
import IntegrationsDashboard from "@/components/integrations/IntegrationsDashboard";

const PROVIDER_NAMES: Record<string, string> = {
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
};

/**
 * The OAuth callback is handled by the backend and redirects the browser back
 * here with the outcome in the query string. Reporting it is all that happens
 * client-side — no code, token or state ever reaches this page.
 */
function CallbackNotice() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const announced = useRef(false);

  const connected = params.get("connected");
  const error = params.get("error");
  const message = params.get("message");
  const partialScopes = params.get("partialScopes");

  useEffect(() => {
    if (announced.current) return;
    if (!connected && !error) return;
    announced.current = true;

    if (connected) {
      const name = PROVIDER_NAMES[connected] ?? connected;
      if (partialScopes === "1") {
        toast.info(`${name} is connected, but not every permission was granted. Some features will stay unavailable until you reconnect and allow them.`);
      } else {
        toast.success(`${name} is connected.`);
      }
    } else if (error) {
      toast.error(message || "The connection could not be completed.");
    }

    // Clear the result from the URL so a refresh does not re-announce it.
    router.replace("/dashboard/integrations");
  }, [connected, error, message, partialScopes, router, toast]);

  return null;
}

export default function IntegrationsPage() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="max-w-4xl mx-auto px-4 py-10 space-y-4"><SkeletonCard lines={8} /></div>;
  }
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <EmptyState
          icon={Lock}
          title="Sign in to manage your integrations"
          description="Connections are tied to your account, and the credentials for them are stored encrypted on the server."
          action={{ label: "Sign in", href: "/auth/login?next=/dashboard/integrations" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <Suspense fallback={null}><CallbackNotice /></Suspense>

      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Plug className="w-6 h-6 text-indigo-600" /> Integrations &amp; automation
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Connect your own calendar, Drive and email, and choose which routine steps this app may take for you.
          Nothing is connected or automated until you turn it on.
        </p>
      </header>

      <IntegrationsDashboard />
    </div>
  );
}
