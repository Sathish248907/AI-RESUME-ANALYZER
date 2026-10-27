-- Phase 13: application workspace, checklist, cover letters, documents,
-- activity timeline, reminders and interview rounds.
--
-- Additive only. Six new tables, plus two nullable columns on
-- api_job_applications ("outcome" and "applicationDeadline"). The
-- ApplicationStatus enum is deliberately NOT extended: the Phase 9 career
-- services and the Phase 10 application funnel enumerate its values, so the
-- workspace maps its extra stages onto the existing ones instead
-- (Preparing / Ready to Apply are derived from checklist completion, and
-- Accepted / Declined are recorded in "outcome").
--
-- No existing column is altered or dropped, so every application, resume and
-- interview row written by Phases 1-12 remains valid.

-- AlterTable
ALTER TABLE "api_job_applications" ADD COLUMN     "applicationDeadline" TIMESTAMP(3),
ADD COLUMN     "outcome" TEXT;

-- CreateTable
CREATE TABLE "api_application_checklist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "completionSource" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_application_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_cover_letters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "jobDescriptionId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "lengthTarget" TEXT NOT NULL DEFAULT 'standard',
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'ai',
    "provider" TEXT,
    "model" TEXT,
    "groundingNotes" JSONB,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_cover_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_application_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'file',
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "storageKey" TEXT,
    "url" TEXT,
    "checksum" TEXT,
    "coverLetterId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_application_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'system',
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_application_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_application_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "interviewId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_application_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_application_interviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "timezone" TEXT,
    "durationMinutes" INTEGER,
    "mode" TEXT NOT NULL DEFAULT 'video',
    "location" TEXT,
    "interviewers" JSONB,
    "preparationNotes" TEXT,
    "mockSessionId" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'scheduled',
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_application_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_application_checklist_items_applicationId_sortOrder_idx" ON "api_application_checklist_items"("applicationId", "sortOrder");

-- CreateIndex
CREATE INDEX "api_application_checklist_items_userId_idx" ON "api_application_checklist_items"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_application_checklist_items_applicationId_key_key" ON "api_application_checklist_items"("applicationId", "key");

-- CreateIndex
CREATE INDEX "api_cover_letters_userId_updatedAt_idx" ON "api_cover_letters"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_cover_letters_applicationId_versionNumber_key" ON "api_cover_letters"("applicationId", "versionNumber");

-- CreateIndex
CREATE INDEX "api_application_documents_applicationId_category_idx" ON "api_application_documents"("applicationId", "category");

-- CreateIndex
CREATE INDEX "api_application_documents_userId_idx" ON "api_application_documents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "api_application_documents_applicationId_checksum_key" ON "api_application_documents"("applicationId", "checksum");

-- CreateIndex
CREATE INDEX "api_application_activities_applicationId_occurredAt_idx" ON "api_application_activities"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "api_application_activities_userId_occurredAt_idx" ON "api_application_activities"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_application_activities_applicationId_dedupeKey_key" ON "api_application_activities"("applicationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "api_application_reminders_userId_status_dueAt_idx" ON "api_application_reminders"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "api_application_reminders_applicationId_idx" ON "api_application_reminders"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "api_application_reminders_userId_dedupeKey_key" ON "api_application_reminders"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "api_application_interviews_userId_scheduledAt_idx" ON "api_application_interviews"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "api_application_interviews_applicationId_idx" ON "api_application_interviews"("applicationId");

-- AddForeignKey
ALTER TABLE "api_application_checklist_items" ADD CONSTRAINT "api_application_checklist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_checklist_items" ADD CONSTRAINT "api_application_checklist_items_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_cover_letters" ADD CONSTRAINT "api_cover_letters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_cover_letters" ADD CONSTRAINT "api_cover_letters_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_cover_letters" ADD CONSTRAINT "api_cover_letters_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "api_resume_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_documents" ADD CONSTRAINT "api_application_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_documents" ADD CONSTRAINT "api_application_documents_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_documents" ADD CONSTRAINT "api_application_documents_coverLetterId_fkey" FOREIGN KEY ("coverLetterId") REFERENCES "api_cover_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_activities" ADD CONSTRAINT "api_application_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_activities" ADD CONSTRAINT "api_application_activities_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_reminders" ADD CONSTRAINT "api_application_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_reminders" ADD CONSTRAINT "api_application_reminders_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_reminders" ADD CONSTRAINT "api_application_reminders_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "api_application_interviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_interviews" ADD CONSTRAINT "api_application_interviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_interviews" ADD CONSTRAINT "api_application_interviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_application_interviews" ADD CONSTRAINT "api_application_interviews_mockSessionId_fkey" FOREIGN KEY ("mockSessionId") REFERENCES "api_interview_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

