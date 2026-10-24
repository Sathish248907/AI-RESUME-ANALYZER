-- Phase 11: ATS readiness, role recommendations and richer AI suggestions.
--
-- Additive only. Existing resume versions, improvements and template
-- preferences keep working: every new column is nullable or has a default, so
-- rows written by Phase 8 remain valid and are backfilled lazily (a suggestion
-- regenerated or created after this migration gets its presentation fields;
-- older ones fall back to the deterministic text computed at read time).

-- AlterTable: richer suggestion cards
ALTER TABLE "api_resume_improvements" ADD COLUMN     "suggestionGroup" TEXT,
                                      ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'medium',
                                      ADD COLUMN     "title" TEXT,
                                      ADD COLUMN     "issue" TEXT,
                                      ADD COLUMN     "benefit" TEXT,
                                      ADD COLUMN     "regenerationCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "api_resume_ats_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "jobDescriptionId" TEXT,
    "mode" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "jobTitle" TEXT,
    "targetRole" TEXT,
    "templateId" TEXT,
    "categories" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "keywordCoverage" JSONB,
    "skills" JSONB,
    "weights" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_resume_ats_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_resume_role_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "roles" JSONB NOT NULL,
    "careerLevel" TEXT,
    "selectedRole" TEXT,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_resume_role_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_resume_ats_assessments_userId_createdAt_idx" ON "api_resume_ats_assessments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_resume_ats_assessments_versionId_mode_createdAt_idx" ON "api_resume_ats_assessments"("versionId", "mode", "createdAt");

-- CreateIndex
CREATE INDEX "api_resume_role_recommendations_userId_createdAt_idx" ON "api_resume_role_recommendations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_resume_role_recommendations_versionId_createdAt_idx" ON "api_resume_role_recommendations"("versionId", "createdAt");

-- AddForeignKey
ALTER TABLE "api_resume_ats_assessments" ADD CONSTRAINT "api_resume_ats_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_ats_assessments" ADD CONSTRAINT "api_resume_ats_assessments_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "api_resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_ats_assessments" ADD CONSTRAINT "api_resume_ats_assessments_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_role_recommendations" ADD CONSTRAINT "api_resume_role_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_resume_role_recommendations" ADD CONSTRAINT "api_resume_role_recommendations_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "api_resume_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
