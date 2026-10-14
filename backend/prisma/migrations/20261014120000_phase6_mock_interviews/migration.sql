-- AlterTable
ALTER TABLE "api_interview_sessions" ADD COLUMN     "difficulty" TEXT NOT NULL DEFAULT 'intermediate',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "jobDescriptionId" TEXT,
ADD COLUMN     "resumeId" TEXT,
ADD COLUMN     "scoringRubricVersion" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'mock_interview',
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "topics" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "api_interview_questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "questionType" TEXT NOT NULL,
    "evaluationCriteria" JSONB NOT NULL,
    "suggestedTimeSeconds" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_interview_answers" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "programmingLanguage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "evaluationResult" JSONB,
    "score" INTEGER,
    "rubricVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "api_interview_questions_sessionId_idx" ON "api_interview_questions"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "api_interview_questions_sessionId_orderIndex_key" ON "api_interview_questions"("sessionId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "api_interview_answers_questionId_key" ON "api_interview_answers"("questionId");

-- CreateIndex
CREATE INDEX "api_interview_answers_sessionId_status_idx" ON "api_interview_answers"("sessionId", "status");

-- CreateIndex
CREATE INDEX "api_interview_sessions_userId_targetRole_idx" ON "api_interview_sessions"("userId", "targetRole");

-- AddForeignKey
ALTER TABLE "api_interview_questions" ADD CONSTRAINT "api_interview_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "api_interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_interview_answers" ADD CONSTRAINT "api_interview_answers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "api_interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_interview_answers" ADD CONSTRAINT "api_interview_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "api_interview_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

