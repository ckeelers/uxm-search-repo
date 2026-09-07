-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('GREENHOUSE', 'LEVER', 'ASHBY', 'WORKDAY', 'GENERIC');

-- CreateEnum
CREATE TYPE "Track" AS ENUM ('UX_DESIGN_MGR', 'UX_RESEARCH_MGR');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('STAGE1_INCLUDE', 'STAGE2_INCLUDE', 'REVIEW_QUEUE', 'REJECTED');

-- CreateEnum
CREATE TYPE "SiteArrangement" AS ENUM ('ONSITE', 'HYBRID', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RemoteScope" AS ENUM ('ANYWHERE_US', 'STATE_LIST');

-- CreateEnum
CREATE TYPE "SalaryState" AS ENUM ('STATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SavedStatus" AS ENUM ('SAVED', 'APPLIED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "platformId" TEXT,
    "careersUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "rawTitle" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "track" "Track",
    "matchOutcome" "MatchOutcome" NOT NULL,
    "matchReason" TEXT,
    "descriptionText" TEXT NOT NULL,
    "siteStates" TEXT[],
    "siteArrangement" "SiteArrangement",
    "remoteUs" BOOLEAN NOT NULL DEFAULT false,
    "remoteScope" "RemoteScope",
    "remoteStates" TEXT[],
    "rawLocationText" TEXT,
    "salaryState" "SalaryState" NOT NULL,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryMidpoint" INTEGER,
    "compRawText" TEXT,
    "datePosted" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "missedCrawls" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'owner',
    "status" "SavedStatus" NOT NULL DEFAULT 'SAVED',
    "notes" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "jobsSeen" INTEGER NOT NULL DEFAULT 0,
    "jobsNew" INTEGER NOT NULL DEFAULT 0,
    "jobsClosed" INTEGER NOT NULL DEFAULT 0,
    "errorText" TEXT,

    CONSTRAINT "CrawlRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Job_status_track_idx" ON "Job"("status", "track");

-- CreateIndex
CREATE INDEX "Job_status_siteArrangement_idx" ON "Job"("status", "siteArrangement");

-- CreateIndex
CREATE INDEX "Job_datePosted_idx" ON "Job"("datePosted");

-- CreateIndex
CREATE UNIQUE INDEX "Job_companyId_externalId_key" ON "Job"("companyId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_jobId_userId_key" ON "SavedJob"("jobId", "userId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlRun" ADD CONSTRAINT "CrawlRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- GIN index for state-membership filtering on siteStates (plan §6: `:state = ANY(siteStates)`)
CREATE INDEX "Job_siteStates_gin_idx" ON "Job" USING GIN ("siteStates");
