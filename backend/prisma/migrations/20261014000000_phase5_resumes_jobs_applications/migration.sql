-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('INTERESTED', 'APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "api_analyses" ADD COLUMN     "jobDescriptionId" TEXT,
ADD COLUMN     "resumeId" TEXT;

-- CreateTable
CREATE TABLE "api_resumes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL,
    "extractedText" TEXT NOT NULL,
    "targetRole" TEXT,
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_job_descriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "companyName" TEXT,
    "targetRole" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "extractedRequirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_job_applications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobDescriptionId" TEXT,
    "resumeId" TEXT,
    "analysisId" TEXT,
    "companyName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "jobUrl" TEXT,
    "applicationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'INTERESTED',
    "nextFollowUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_interview_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "interviewType" TEXT NOT NULL DEFAULT 'mixed',
    "questionCount" INTEGER NOT NULL,
    "completedQuestionCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "durationSeconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "analysisId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "api_interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_resumes_userId_createdAt_idx" ON "api_resumes"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_resumes_userId_name_idx" ON "api_resumes"("userId", "name");

-- CreateIndex
CREATE INDEX "api_job_descriptions_userId_createdAt_idx" ON "api_job_descriptions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_job_descriptions_userId_targetRole_idx" ON "api_job_descriptions"("userId", "targetRole");

-- CreateIndex
CREATE INDEX "api_job_applications_userId_status_idx" ON "api_job_applications"("userId", "status");

-- CreateIndex
CREATE INDEX "api_job_applications_userId_applicationDate_idx" ON "api_job_applications"("userId", "applicationDate");

-- CreateIndex
CREATE INDEX "api_job_applications_userId_nextFollowUpDate_idx" ON "api_job_applications"("userId", "nextFollowUpDate");

-- CreateIndex
CREATE INDEX "api_job_applications_userId_companyName_idx" ON "api_job_applications"("userId", "companyName");

-- CreateIndex
CREATE INDEX "api_interview_sessions_userId_createdAt_idx" ON "api_interview_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_interview_sessions_userId_status_idx" ON "api_interview_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "api_analyses_userId_matchScore_idx" ON "api_analyses"("userId", "matchScore");

-- CreateIndex
CREATE INDEX "api_analyses_userId_targetRole_idx" ON "api_analyses"("userId", "targetRole");

-- CreateIndex
CREATE INDEX "api_analyses_resumeId_idx" ON "api_analyses"("resumeId");

-- CreateIndex
CREATE INDEX "api_analyses_jobDescriptionId_idx" ON "api_analyses"("jobDescriptionId");

-- AddForeignKey
ALTER TABLE "api_resumes" ADD CONSTRAINT "api_resumes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_descriptions" ADD CONSTRAINT "api_job_descriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_analyses" ADD CONSTRAINT "api_analyses_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "api_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_analyses" ADD CONSTRAINT "api_analyses_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_applications" ADD CONSTRAINT "api_job_applications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_applications" ADD CONSTRAINT "api_job_applications_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "api_job_descriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_applications" ADD CONSTRAINT "api_job_applications_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "api_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_job_applications" ADD CONSTRAINT "api_job_applications_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "api_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_interview_sessions" ADD CONSTRAINT "api_interview_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

