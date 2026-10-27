"use client";

import { X } from "lucide-react";
import CalendarSyncSettings from "./CalendarSyncSettings";
import NotificationPreferences from "./NotificationPreferences";
import DriveExportPanel from "./DriveExportPanel";
import type {
  CalendarSyncResult, EmailStatus, Integration, IntegrationsOverview, SyncLogEntry,
} from "@/services/integrationService";

interface Props {
  integration: Integration;
  overview: IntegrationsOverview;
  calendarHistory: SyncLogEntry[];
  calendarResult: CalendarSyncResult | null;
  emailPreferences: Record<string, boolean>;
  emailStatus: EmailStatus;
  deliveries: Array<{ id: string; subject: string; recipient: string; statusLabel: string; transport: string; createdAt: string }>;
  savingPreferences: boolean;
  syncing: boolean;
  onClose: () => void;
  onSaveCalendarPreferences: (input: Record<string, boolean>) => void;
  onSync: (dryRun: boolean) => void;
  onSaveEmailPreferences: (input: Record<string, boolean>) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

/**
 * The settings for whichever integration the user opened. Each provider gets the
 * controls that actually apply to it rather than a generic form — the calendar
 * gets event types and a dry run, email gets categories, Drive gets a document
 * and a folder — so no switch is shown that the provider cannot honour.
 */
export default function IntegrationSettings({
  integration, overview, calendarHistory, calendarResult, emailPreferences, emailStatus,
  deliveries, savingPreferences, syncing, onClose,
  onSaveCalendarPreferences, onSync, onSaveEmailPreferences, onError, onSuccess,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {integration.displayName} settings
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="text-gray-400 hover:text-gray-700 rounded p-1"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {integration.provider === "google_calendar" && (
        <CalendarSyncSettings
          integration={integration}
          eventTypes={overview.calendarEventTypes}
          preferences={integration.connection?.preferences ?? {}}
          history={calendarHistory}
          lastResult={calendarResult}
          savingPreferences={savingPreferences}
          syncing={syncing}
          onSavePreferences={onSaveCalendarPreferences}
          onSync={onSync}
        />
      )}

      {integration.provider === "email" && (
        <NotificationPreferences
          email={emailStatus}
          preferences={emailPreferences}
          deliveries={deliveries}
          saving={savingPreferences}
          onSave={onSaveEmailPreferences}
        />
      )}

      {integration.provider === "google_drive" && (
        <DriveExportPanel integration={integration} onError={onError} onSuccess={onSuccess} />
      )}
    </div>
  );
}
