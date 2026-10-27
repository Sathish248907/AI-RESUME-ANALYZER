-- Phase 14: external integrations and workflow automation.
--
-- Additive only: eight new tables, and not one column of an existing table is
-- altered or dropped. Every row written by Phases 1-13 stays exactly as it was.
--
-- OAuth credentials are stored in api_external_integrations."credentials" as an
-- AES-256-GCM sealed blob (see services/integrations/tokenVault.js). The
-- plaintext token never reaches the database, and the server refuses to connect
-- an account at all when INTEGRATION_ENCRYPTION_KEY is absent, rather than
-- falling back to storing it in the clear.

-- CreateTable
CREATE TABLE "api_external_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "credentials" TEXT,
    "hasRefreshToken" BOOLEAN NOT NULL DEFAULT false,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "externalAccountLabel" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_external_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_pending_authorizations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "returnTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_pending_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_integration_sync_logs" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_integration_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_external_calendar_events" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalEventId" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "contentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'synced',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_external_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_external_file_exports" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webViewLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_external_file_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_automation_rules" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workflowKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_automation_executions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT,
    "plannedActions" JSONB NOT NULL DEFAULT '[]',
    "results" JSONB NOT NULL DEFAULT '[]',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "retryOfId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "errorCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_email_deliveries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "preview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_external_integrations_userId_status_idx" ON "api_external_integrations"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_external_integrations_userId_provider_key" ON "api_external_integrations"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "api_pending_authorizations_state_key" ON "api_pending_authorizations"("state");

-- CreateIndex
CREATE INDEX "api_pending_authorizations_userId_provider_idx" ON "api_pending_authorizations"("userId", "provider");

-- CreateIndex
CREATE INDEX "api_pending_authorizations_expiresAt_idx" ON "api_pending_authorizations"("expiresAt");

-- CreateIndex
CREATE INDEX "api_integration_sync_logs_integrationId_createdAt_idx" ON "api_integration_sync_logs"("integrationId", "createdAt");

-- CreateIndex
CREATE INDEX "api_integration_sync_logs_userId_createdAt_idx" ON "api_integration_sync_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_external_calendar_events_userId_status_idx" ON "api_external_calendar_events"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_external_calendar_events_integrationId_sourceKind_sourc_key" ON "api_external_calendar_events"("integrationId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "api_external_file_exports_userId_idx" ON "api_external_file_exports"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_external_file_exports_integrationId_sourceKind_sourceId_key" ON "api_external_file_exports"("integrationId", "sourceKind", "sourceId");

-- CreateIndex
CREATE INDEX "api_automation_rules_userId_isEnabled_idx" ON "api_automation_rules"("userId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "api_automation_rules_userId_workflowKey_key" ON "api_automation_rules"("userId", "workflowKey");

-- CreateIndex
CREATE INDEX "api_automation_executions_userId_createdAt_idx" ON "api_automation_executions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_automation_executions_ruleId_createdAt_idx" ON "api_automation_executions"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "api_email_deliveries_userId_createdAt_idx" ON "api_email_deliveries"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_email_deliveries_userId_dedupeKey_key" ON "api_email_deliveries"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "api_external_integrations" ADD CONSTRAINT "api_external_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_pending_authorizations" ADD CONSTRAINT "api_pending_authorizations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integration_sync_logs" ADD CONSTRAINT "api_integration_sync_logs_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "api_external_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_integration_sync_logs" ADD CONSTRAINT "api_integration_sync_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_external_calendar_events" ADD CONSTRAINT "api_external_calendar_events_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "api_external_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_external_calendar_events" ADD CONSTRAINT "api_external_calendar_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_external_file_exports" ADD CONSTRAINT "api_external_file_exports_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "api_external_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_external_file_exports" ADD CONSTRAINT "api_external_file_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_automation_rules" ADD CONSTRAINT "api_automation_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_automation_executions" ADD CONSTRAINT "api_automation_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_automation_executions" ADD CONSTRAINT "api_automation_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "api_automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_email_deliveries" ADD CONSTRAINT "api_email_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

