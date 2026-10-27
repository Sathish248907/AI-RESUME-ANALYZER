-- Phase 12: job discovery and intelligent job matching.
--
-- Additive only: six new tables, no column of an existing table is altered or
-- dropped, so every row written by Phases 1-11 stays valid. Provider listings
-- (api_external_jobs) are cached third-party data and are deliberately not
-- user-scoped; everything a user owns lives in api_saved_jobs,
-- api_job_search_preferences, api_job_match_reports and api_job_alerts, each
-- cascading on user delete. Manually entered jobs reuse api_job_descriptions.

-- CreateTable
CREATE TABLE "api_job_providers" (
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "attribution" TEXT,
    "termsUrl" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "lastJobCount" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_providers_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "api_external_jobs" (
    "id" TEXT NOT NULL,
    "providerSlug" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyLogoUrl" TEXT,
    "location" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "workArrangement" TEXT NOT NULL DEFAULT 'unknown',
    "employmentType" TEXT NOT NULL DEFAULT 'unknown',
    "experienceLevel" TEXT NOT NULL DEFAULT 'unknown',
    "description" TEXT NOT NULL,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryIsEstimate" BOOLEAN NOT NULL DEFAULT false,
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3),
    "postedAtReliable" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "applyUrl" TEXT,
    "tags" JSONB,
    "listingStatus" TEXT NOT NULL DEFAULT 'open',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_external_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_saved_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalJobId" TEXT,
    "jobDescriptionId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'saved',
    "notes" TEXT,
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_job_search_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titles" JSONB NOT NULL DEFAULT '[]',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "locations" JSONB NOT NULL DEFAULT '[]',
    "workArrangements" JSONB NOT NULL DEFAULT '[]',
    "employmentTypes" JSONB NOT NULL DEFAULT '[]',
    "experienceLevel" TEXT,
    "minSalary" INTEGER,
    "salaryCurrency" TEXT,
    "excludedCompanies" JSONB NOT NULL DEFAULT '[]',
    "keywords" TEXT,
    "rankingWeights" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_search_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_job_match_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalJobId" TEXT,
    "jobDescriptionId" TEXT,
    "resumeVersionId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_match_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_job_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'manual',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,
    "lastNewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_external_jobs_fingerprint_idx" ON "api_external_jobs"("fingerprint");

-- CreateIndex
CREATE INDEX "api_external_jobs_listingStatus_postedAt_idx" ON "api_external_jobs"("listingStatus", "postedAt");

-- CreateIndex
CREATE INDEX "api_external_jobs_fetchedAt_idx" ON "api_external_jobs"("fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_external_jobs_providerSlug_externalId_key" ON "api_external_jobs"("providerSlug", "externalId");

-- CreateIndex
CREATE INDEX "api_saved_jobs_userId_state_updatedAt_idx" ON "api_saved_jobs"("userId", "state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_saved_jobs_userId_externalJobId_key" ON "api_saved_jobs"("userId", "externalJobId");

-- CreateIndex
CREATE UNIQUE INDEX "api_saved_jobs_userId_jobDescriptionId_key" ON "api_saved_jobs"("userId", "jobDescriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "api_job_search_preferences_userId_key" ON "api_job_search_preferences"("userId");

-- CreateIndex
CREATE INDEX "api_job_match_reports_userId_updatedAt_idx" ON "api_job_match_reports"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_job_match_reports_userId_externalJobId_resumeVersionId_key" ON "api_job_match_reports"("userId", "externalJobId", "resumeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "api_job_match_reports_userId_jobDescriptionId_resumeVersion_key" ON "api_job_match_reports"("userId", "jobDescriptionId", "resumeVersionId");

-- CreateIndex
CREATE INDEX "api_job_alerts_userId_isActive_idx" ON "api_job_alerts"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "api_job_alerts_userId_name_key" ON "api_job_alerts"("userId", "name");

-- AddForeignKey
ALTER TABLE "api_external_jobs" ADD CONSTRAINT "api_external_jobs_providerSlug_fkey" FOREIGN KEY ("providerSlug") REFERENCES "api_job_providers"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_saved_jobs" ADD CONSTRAINT "api_saved_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_saved_jobs" ADD CONSTRAINT "api_saved_jobs_externalJobId_fkey" FOREIGN KEY ("externalJobId") REFERENCES "api_external_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_saved_jobs" ADD CONSTRAINT "api_saved_jobs_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_saved_jobs" ADD CONSTRAINT "api_saved_jobs_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "api_job_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_search_preferences" ADD CONSTRAINT "api_job_search_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_match_reports" ADD CONSTRAINT "api_job_match_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_match_reports" ADD CONSTRAINT "api_job_match_reports_externalJobId_fkey" FOREIGN KEY ("externalJobId") REFERENCES "api_external_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_match_reports" ADD CONSTRAINT "api_job_match_reports_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_match_reports" ADD CONSTRAINT "api_job_match_reports_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "api_resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_alerts" ADD CONSTRAINT "api_job_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
