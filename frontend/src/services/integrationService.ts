/**
 * integrationService.ts — Phase 14: external integrations and workflow
 * automation.
 *
 * Nothing secret passes through here. The browser never sees an access token,
 * a refresh token or a provider secret: connecting returns an authorization URL
 * to navigate to, and the callback is handled entirely by the backend. The only
 * credential-adjacent thing the client ever receives is a short fingerprint,
 * which exists so two connections can be told apart.
 */
import { api } from "./api";

export const INTEGRATION_CATEGORIES = ["calendar", "email", "storage", "jobs"] as const;
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];

/** `available` can connect now · `needs_setup` implemented but not configured. */
export type Readiness = "available" | "needs_setup" | "unavailable";
export type ConnectionStatus = "connected" | "expired" | "disconnected" | "configured";

export interface IntegrationConnection {
  status: ConnectionStatus;
  connectedAt: string | null;
  expiresAt: string | null;
  externalAccountLabel: string | null;
  scopes: string[];
  lastSyncAt: string | null;
  lastError: string | null;
  preferences: Record<string, unknown>;
}

export interface Integration {
  provider: string;
  displayName: string;
  category: IntegrationCategory;
  summary: string;
  kind: "oauth" | "api_key" | "server_config";
  readiness: Readiness;
  /** Why it cannot be connected, in the user's words. */
  blockers: string[];
  missingCredentials: string[];
  scopes: string[];
  scopeExplanations: Record<string, string>;
  features: string[];
  /** Explicit limits, so permissions are not over-read. */
  doesNot: string[];
  setupUrl: string | null;
  setupSteps: string[];
  redirectUri?: string;
  supportsPkce?: boolean;
  connection: IntegrationConnection | null;
  connectable: boolean;
  managedAt?: string;
  transport?: string;
}

export interface EmailStatus {
  method: string;
  transport: "log" | "smtp";
  /** False for the recording transport: recording is not delivering. */
  delivers: boolean;
  from: string | null;
  categories: Array<{ key: string; label: string; description: string; default: boolean }>;
  note: string;
  neverDoes: string[];
}

export interface IntegrationsOverview {
  method: string;
  categories: Array<{ key: IntegrationCategory; label: string }>;
  integrations: Integration[];
  counts: { total: number; available: number; connected: number; needsSetup: number };
  vault: { configured: boolean; note: string };
  redirectUri: string;
  email: EmailStatus;
  calendarEventTypes: Array<{ key: string; label: string; default: boolean; description: string }>;
  emailCategories: EmailStatus["categories"];
  note: string;
}

export interface SyncLogEntry {
  id: string; action: string; status: "ok" | "warning" | "error";
  detail: string | null; externalId: string | null; createdAt: string;
}

export interface CalendarSyncResult {
  method: string; dryRun: boolean; calendarId: string;
  preferences: Record<string, unknown>;
  considered: number; created: number; updated: number; unchanged: number; failed: number;
  results: Array<{ source: { kind: string; id: string; summary: string }; action: string; error?: string }>;
  note: string;
}

// ─── Automation ──────────────────────────────────────────────────────────────

export type Consequence = "in_app" | "external";

export interface WorkflowAction {
  key: string; label: string; consequence: Consequence; description: string;
}

export interface WorkflowConfigField {
  key: string; label: string; type: "number" | "boolean" | "enum";
  min?: number; max?: number; options?: string[]; optionLabels?: Record<string, string>;
  default: unknown; requires?: string;
}

export interface Workflow {
  key: string; name: string; summary: string;
  trigger: string; conditions: string[]; failureBehaviour: string;
  actions: string[]; actionDetail: WorkflowAction[];
  externalActions: string[]; requiresApproval: boolean;
  neverDoes: string[];
  configSchema: WorkflowConfigField[];
  note?: string;
  rule: { id: string | null; isEnabled: boolean; config: Record<string, unknown>; lastRunAt: string | null; lastStatus: string | null };
  /** Options that cannot work yet, and why — so a switch never silently no-ops. */
  unavailableOptions: Array<{ field: string; reason: string }>;
}

export interface PlannedAction {
  type: string; label: string; consequence: Consequence; description: string;
  preview: string; skipReason: string | null;
}

export interface AutomationPreview {
  workflow: string;
  fired: boolean;
  reason: string;
  actions: PlannedAction[];
  requiresApproval: boolean;
  externalActions?: Array<{ type: string; preview: string }>;
  note?: string;
  subject?: { kind: string; id: string };
}

export interface ActionResult {
  type: string;
  status: "ok" | "skipped" | "skipped_needs_approval" | "failed";
  detail: string;
  result?: Record<string, unknown>;
  errorCode?: string;
  needsAttention?: boolean;
}

export interface AutomationExecution {
  id: string; ruleId: string;
  status: "planned" | "awaiting_approval" | "succeeded" | "partial" | "failed" | "skipped";
  statusLabel: string;
  trigger: string | null;
  plannedActions: Array<{ type: string; consequence: Consequence; preview: string }>;
  results: ActionResult[];
  approved: boolean;
  retryCount: number;
  nextRetryAt: string | null;
  errorCategory: "transient" | "needs_reconnect" | null;
  retryable: boolean;
  createdAt: string;
}

// ─── Integrations ────────────────────────────────────────────────────────────

export async function listIntegrations(): Promise<IntegrationsOverview> {
  const { data } = await api.get("/api/integrations");
  return data;
}

export async function getIntegrationStatus(provider: string) {
  const { data } = await api.get(`/api/integrations/${encodeURIComponent(provider)}/status`);
  return data;
}

/**
 * Starts the OAuth flow. The backend returns a URL to send the browser to;
 * nothing is connected until the provider redirects back to the callback.
 */
export async function connectIntegration(provider: string, input: { returnTo?: string } = {}) {
  const { data } = await api.post(`/api/integrations/${encodeURIComponent(provider)}/connect`, input);
  return data as {
    authorizationUrl: string; state: string; expiresAt: string;
    scopes: string[]; scopeExplanations: Record<string, string>;
    redirectUri: string; note: string;
  };
}

export async function disconnectIntegration(provider: string) {
  const { data } = await api.post(`/api/integrations/${encodeURIComponent(provider)}/disconnect`);
  return data as { provider: string; revokedAtProvider: boolean; credentialsDeleted: boolean; note: string };
}

export async function syncIntegration(provider: string, input: { dryRun?: boolean } = {}): Promise<CalendarSyncResult> {
  const { data } = await api.post(`/api/integrations/${encodeURIComponent(provider)}/sync`, input);
  return data;
}

export async function getSyncHistory(provider: string, params: { limit?: number } = {}) {
  const { data } = await api.get(`/api/integrations/${encodeURIComponent(provider)}/sync-history`, { params });
  return data as { provider: string; entries: SyncLogEntry[]; note: string };
}

export async function saveCalendarPreferences(input: { interviews?: boolean; deadlines?: boolean; reminders?: boolean; calendarId?: string }) {
  const { data } = await api.put("/api/integrations/google_calendar/preferences", input);
  return data as { provider: string; preferences: Record<string, unknown> };
}

/**
 * Email transport facts plus the user's saved category choices, merged with the
 * defaults by the server. The overview deliberately reports no `connection` for
 * email — it is server configuration, not a linked account — so the saved
 * preferences are read from here.
 */
export async function getEmailSettings() {
  const { data } = await api.get("/api/integrations/email/status");
  return data as EmailStatus & { provider: string; preferences: Record<string, boolean> };
}

export async function saveEmailPreferences(input: Record<string, boolean>) {
  const { data } = await api.put("/api/integrations/email/preferences", input);
  return data as { provider: string; preferences: Record<string, boolean> };
}

export async function listDriveFolders() {
  const { data } = await api.get("/api/integrations/google_drive/folders");
  return data as { folders: Array<{ id: string; name: string }>; note: string };
}

export async function exportToDrive(input: { sourceKind: "resume_version" | "cover_letter"; sourceId: string; folderId?: string; folderName?: string }) {
  const { data } = await api.post("/api/integrations/google_drive/export", input);
  return data as { action: string; fileId: string; webViewLink: string | null; name: string; note?: string };
}

export async function getEmailHistory(params: { limit?: number } = {}) {
  const { data } = await api.get("/api/integrations/email/history", { params });
  return data as EmailStatus & {
    deliveries: Array<{ id: string; category: string; subject: string; recipient: string; status: string; statusLabel: string; transport: string; preview: string | null; createdAt: string }>;
  };
}

// ─── Automation ──────────────────────────────────────────────────────────────

export async function listWorkflows() {
  const { data } = await api.get("/api/automation/rules");
  return data as {
    workflows: Workflow[];
    anyEnabled: boolean;
    safety: { message: string; externalActionsRequireApproval: boolean };
  };
}

export async function upsertRule(input: { workflowKey: string; isEnabled: boolean; config?: Record<string, unknown> }) {
  const { data } = await api.post("/api/automation/rules", { config: {}, ...input });
  return data.rule as { id: string; workflowKey: string; isEnabled: boolean; config: Record<string, unknown> };
}

export async function updateRule(ruleId: string, input: { isEnabled?: boolean; config?: Record<string, unknown> }) {
  const { data } = await api.patch(`/api/automation/rules/${encodeURIComponent(ruleId)}`, input);
  return data.rule as { id: string; workflowKey: string; isEnabled: boolean; config: Record<string, unknown> };
}

export async function deleteRule(ruleId: string): Promise<void> {
  await api.delete(`/api/automation/rules/${encodeURIComponent(ruleId)}`);
}

export async function pauseAllAutomation() {
  const { data } = await api.post("/api/automation/pause-all");
  return data as { paused: number; note: string };
}

/** Evaluates the trigger and returns the plan. Changes nothing. */
export async function previewRule(ruleId: string): Promise<AutomationPreview> {
  const { data } = await api.get(`/api/automation/rules/${encodeURIComponent(ruleId)}/preview`);
  return data;
}

/** `approved` is required before any action that leaves the app will run. */
export async function runRule(ruleId: string, input: { approved?: boolean } = {}) {
  const { data } = await api.post(`/api/automation/rules/${encodeURIComponent(ruleId)}/run`, input);
  return data as { execution: AutomationExecution; plan: AutomationPreview; ran: boolean; counts: { ok: number; failed: number; skipped: number } | null };
}

export async function listExecutions(params: { ruleId?: string; limit?: number } = {}) {
  const { data } = await api.get("/api/automation/executions", { params });
  return data as { executions: AutomationExecution[]; note: string };
}

export async function retryExecution(executionId: string) {
  const { data } = await api.post(`/api/automation/executions/${encodeURIComponent(executionId)}/retry`);
  return data as { execution: AutomationExecution; counts: { ok: number; failed: number; skipped: number } | null; note: string };
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export const READINESS_LABELS: Record<Readiness, string> = {
  available: "Ready to connect",
  needs_setup: "Needs setup",
  unavailable: "Unavailable",
};

export const STATUS_TONE: Record<string, "emerald" | "amber" | "gray" | "red"> = {
  connected: "emerald",
  configured: "emerald",
  expired: "amber",
  disconnected: "gray",
};

export const ACTION_STATUS_LABELS: Record<ActionResult["status"], string> = {
  ok: "Done",
  skipped: "Skipped",
  skipped_needs_approval: "Waiting for approval",
  failed: "Failed",
};

/** Only ever follow an absolute http(s) URL. */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
