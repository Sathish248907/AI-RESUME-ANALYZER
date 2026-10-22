-- CreateTable
CREATE TABLE "api_learning_roadmaps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "currentSkillLevel" TEXT NOT NULL,
    "weeklyStudyHours" INTEGER NOT NULL,
    "preferredSchedule" TEXT NOT NULL DEFAULT 'flexible',
    "preferredFormat" TEXT NOT NULL DEFAULT 'mixed',
    "targetCompletionDate" TIMESTAMP(3),
    "estimatedHours" INTEGER NOT NULL DEFAULT 0,
    "estimatedWeeks" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "changeSummary" JSONB,
    "skillGapSummary" JSONB,
    "sourceResumeId" TEXT,
    "sourceJobDescriptionId" TEXT,
    "sourceAnalysisId" TEXT,
    "sourceInterviewSessionIds" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_learning_roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_roadmap_milestones" (
    "id" TEXT NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredSkills" JSONB NOT NULL,
    "learningObjectives" JSONB NOT NULL,
    "estimatedHours" INTEGER NOT NULL DEFAULT 0,
    "prerequisiteSequences" JSONB NOT NULL,
    "completionCriteria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_roadmap_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_learning_tasks" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'intermediate',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "scheduledDate" TIMESTAMP(3),
    "completionCriteria" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "actualStudyMinutes" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" JSONB,
    "checkpointAttempts" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_learning_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_learning_resources" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "url" TEXT,
    "urlVerified" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'third_party',
    "description" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'intermediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_learning_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_skill_gaps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roadmapId" TEXT,
    "skillName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "proficiencyStatus" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "evidenceSources" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "targetProficiency" TEXT NOT NULL DEFAULT 'working',
    "relatedTopics" JSONB,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "userNote" TEXT,
    "lastAssessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_skill_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_recommendation_dismissals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationKey" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_recommendation_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_learning_roadmaps_userId_status_idx" ON "api_learning_roadmaps"("userId", "status");

-- CreateIndex
CREATE INDEX "api_learning_roadmaps_userId_createdAt_idx" ON "api_learning_roadmaps"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_roadmap_milestones_roadmapId_status_idx" ON "api_roadmap_milestones"("roadmapId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "api_roadmap_milestones_roadmapId_sequenceNumber_key" ON "api_roadmap_milestones"("roadmapId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "api_learning_tasks_milestoneId_status_idx" ON "api_learning_tasks"("milestoneId", "status");

-- CreateIndex
CREATE INDEX "api_learning_tasks_scheduledDate_idx" ON "api_learning_tasks"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "api_learning_tasks_milestoneId_sequenceNumber_key" ON "api_learning_tasks"("milestoneId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "api_learning_resources_taskId_idx" ON "api_learning_resources"("taskId");

-- CreateIndex
CREATE INDEX "api_skill_gaps_userId_priorityScore_idx" ON "api_skill_gaps"("userId", "priorityScore");

-- CreateIndex
CREATE UNIQUE INDEX "api_skill_gaps_userId_skillName_key" ON "api_skill_gaps"("userId", "skillName");

-- CreateIndex
CREATE UNIQUE INDEX "api_recommendation_dismissals_userId_recommendationKey_key" ON "api_recommendation_dismissals"("userId", "recommendationKey");

-- AddForeignKey
ALTER TABLE "api_learning_roadmaps" ADD CONSTRAINT "api_learning_roadmaps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_roadmap_milestones" ADD CONSTRAINT "api_roadmap_milestones_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "api_learning_roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_learning_tasks" ADD CONSTRAINT "api_learning_tasks_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "api_roadmap_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_learning_resources" ADD CONSTRAINT "api_learning_resources_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "api_learning_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_skill_gaps" ADD CONSTRAINT "api_skill_gaps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_skill_gaps" ADD CONSTRAINT "api_skill_gaps_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "api_learning_roadmaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_recommendation_dismissals" ADD CONSTRAINT "api_recommendation_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

