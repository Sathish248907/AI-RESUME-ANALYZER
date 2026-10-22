-- CreateTable
CREATE TABLE "api_career_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careerLevel" TEXT NOT NULL DEFAULT 'fresher',
    "targetRoles" JSONB NOT NULL,
    "industries" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "locations" JSONB NOT NULL,
    "workMode" TEXT NOT NULL DEFAULT 'any',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "goals" TEXT,
    "learningInterests" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_assessments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "readinessLabel" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "skills" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "missingEvidence" JSONB NOT NULL,
    "nextActions" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_career_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_recommendations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "effortMinutes" INTEGER,
    "href" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_action_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "targetRole" TEXT,
    "summary" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_action_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_action_tasks" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "href" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "dueDate" TIMESTAMP(3),
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sourceKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_action_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_coach_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_coach_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_career_coach_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "factsUsed" JSONB,
    "suggestions" JSONB,
    "links" JSONB,
    "clarifying" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_career_coach_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_career_profiles_userId_key" ON "api_career_profiles"("userId");

-- CreateIndex
CREATE INDEX "api_career_assessments_userId_createdAt_idx" ON "api_career_assessments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_career_assessments_userId_targetRole_idx" ON "api_career_assessments"("userId", "targetRole");

-- CreateIndex
CREATE INDEX "api_career_recommendations_userId_status_priority_idx" ON "api_career_recommendations"("userId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "api_career_recommendations_userId_key_key" ON "api_career_recommendations"("userId", "key");

-- CreateIndex
CREATE INDEX "api_career_action_plans_userId_status_idx" ON "api_career_action_plans"("userId", "status");

-- CreateIndex
CREATE INDEX "api_career_action_plans_userId_weekStart_idx" ON "api_career_action_plans"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "api_career_action_tasks_planId_status_idx" ON "api_career_action_tasks"("planId", "status");

-- CreateIndex
CREATE INDEX "api_career_action_tasks_userId_dueDate_idx" ON "api_career_action_tasks"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "api_career_coach_conversations_userId_updatedAt_idx" ON "api_career_coach_conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "api_career_coach_messages_conversationId_createdAt_idx" ON "api_career_coach_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "api_career_profiles" ADD CONSTRAINT "api_career_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_assessments" ADD CONSTRAINT "api_career_assessments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_recommendations" ADD CONSTRAINT "api_career_recommendations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_recommendations" ADD CONSTRAINT "api_career_recommendations_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "api_career_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_action_plans" ADD CONSTRAINT "api_career_action_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_action_tasks" ADD CONSTRAINT "api_career_action_tasks_planId_fkey" FOREIGN KEY ("planId") REFERENCES "api_career_action_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_action_tasks" ADD CONSTRAINT "api_career_action_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_coach_conversations" ADD CONSTRAINT "api_career_coach_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_career_coach_messages" ADD CONSTRAINT "api_career_coach_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "api_career_coach_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

