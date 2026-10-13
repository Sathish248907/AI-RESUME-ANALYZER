-- CreateTable
CREATE TABLE "api_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_analyses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "companyName" TEXT,
    "fileName" TEXT,
    "analysisMode" TEXT NOT NULL DEFAULT 'ai',
    "matchScore" INTEGER NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "result" JSONB NOT NULL,
    "jobDescription" TEXT NOT NULL,
    "resumeText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_users_email_key" ON "api_users"("email");

-- CreateIndex
CREATE INDEX "api_analyses_userId_createdAt_idx" ON "api_analyses"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "api_analyses" ADD CONSTRAINT "api_analyses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "api_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

