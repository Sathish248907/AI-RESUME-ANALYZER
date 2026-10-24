-- CreateTable
CREATE TABLE "api_career_progress_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "overallScore" INTEGER,
    "dimensions" JSONB NOT NULL,
    "coverage" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_career_progress_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_gamification_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDay" TEXT,
    "notificationPreferences" JSONB,
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_gamification_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_point_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "points" INTEGER NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_user_achievements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progressValue" INTEGER NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "evidence" JSONB,

    CONSTRAINT "api_user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_user_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "goalType" TEXT NOT NULL,
    "linkKey" TEXT,
    "targetValue" INTEGER NOT NULL,
    "baselineValue" INTEGER NOT NULL DEFAULT 0,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'count',
    "targetDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_user_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_activity_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "href" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_progress_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "narrative" JSONB,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "model" TEXT,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_career_progress_snapshots_userId_createdAt_idx" ON "api_career_progress_snapshots"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_career_progress_snapshots_userId_dayKey_key" ON "api_career_progress_snapshots"("userId", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "api_gamification_profiles_userId_key" ON "api_gamification_profiles"("userId");

-- CreateIndex
CREATE INDEX "api_point_transactions_userId_createdAt_idx" ON "api_point_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "api_point_transactions_userId_eventType_idx" ON "api_point_transactions"("userId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "api_point_transactions_userId_eventKey_kind_cycle_key" ON "api_point_transactions"("userId", "eventKey", "kind", "cycle");

-- CreateIndex
CREATE INDEX "api_user_achievements_userId_unlockedAt_idx" ON "api_user_achievements"("userId", "unlockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_user_achievements_userId_achievementKey_key" ON "api_user_achievements"("userId", "achievementKey");

-- CreateIndex
CREATE INDEX "api_user_goals_userId_status_idx" ON "api_user_goals"("userId", "status");

-- CreateIndex
CREATE INDEX "api_user_goals_userId_targetDate_idx" ON "api_user_goals"("userId", "targetDate");

-- CreateIndex
CREATE INDEX "api_activity_events_userId_occurredAt_idx" ON "api_activity_events"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_activity_events_userId_eventKey_key" ON "api_activity_events"("userId", "eventKey");

-- CreateIndex
CREATE INDEX "api_progress_reports_userId_createdAt_idx" ON "api_progress_reports"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_progress_reports_userId_periodType_periodStart_key" ON "api_progress_reports"("userId", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "api_user_notifications_userId_readAt_createdAt_idx" ON "api_user_notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_user_notifications_userId_dedupeKey_key" ON "api_user_notifications"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "api_career_progress_snapshots" ADD CONSTRAINT "api_career_progress_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_gamification_profiles" ADD CONSTRAINT "api_gamification_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_point_transactions" ADD CONSTRAINT "api_point_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_user_achievements" ADD CONSTRAINT "api_user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_user_goals" ADD CONSTRAINT "api_user_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_activity_events" ADD CONSTRAINT "api_activity_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_progress_reports" ADD CONSTRAINT "api_progress_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_user_notifications" ADD CONSTRAINT "api_user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

