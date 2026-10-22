-- CreateTable
CREATE TABLE "api_resume_versions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "jobDescriptionId" TEXT,
    "parentVersionId" TEXT,
    "name" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "isOriginal" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT NOT NULL DEFAULT 'modern',
    "content" JSONB NOT NULL,
    "formatting" JSONB NOT NULL,
    "contentSource" TEXT NOT NULL DEFAULT 'manual',
    "targetJobTitle" TEXT,
    "targetCompany" TEXT,
    "lastQualityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_resume_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_resume_improvements" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "entryId" TEXT,
    "field" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "suggestedText" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmationQuestion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acceptedText" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_resume_improvements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_resume_template_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL DEFAULT 'modern',
    "formatting" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_resume_template_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_resume_versions_userId_updatedAt_idx" ON "api_resume_versions"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "api_resume_versions_resumeId_versionNumber_idx" ON "api_resume_versions"("resumeId", "versionNumber");

-- CreateIndex
CREATE INDEX "api_resume_improvements_versionId_batchId_idx" ON "api_resume_improvements"("versionId", "batchId");

-- CreateIndex
CREATE INDEX "api_resume_improvements_versionId_status_idx" ON "api_resume_improvements"("versionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_resume_template_preferences_userId_key" ON "api_resume_template_preferences"("userId");

-- AddForeignKey
ALTER TABLE "api_resume_versions" ADD CONSTRAINT "api_resume_versions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_versions" ADD CONSTRAINT "api_resume_versions_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "api_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_versions" ADD CONSTRAINT "api_resume_versions_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_improvements" ADD CONSTRAINT "api_resume_improvements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "api_resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_template_preferences" ADD CONSTRAINT "api_resume_template_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

