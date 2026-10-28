-- Phase 16: first-run onboarding progress.
--
-- Additive only: one new table, no existing table altered, nothing dropped.
-- The onboarding *answers* are not stored here — they already live on
-- api_career_profiles (Phase 9) and api_resumes / api_resume_versions.

CREATE TABLE "api_user_onboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'profile',
    "completedSteps" JSONB NOT NULL,
    "skippedSteps" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_user_onboarding_pkey" PRIMARY KEY ("id")
);

-- One row per user; the upsert in onboardingRepository relies on this.
CREATE UNIQUE INDEX "api_user_onboarding_userId_key" ON "api_user_onboarding"("userId");

ALTER TABLE "api_user_onboarding"
    ADD CONSTRAINT "api_user_onboarding_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
