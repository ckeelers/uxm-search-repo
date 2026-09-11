-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- Backfill: treat every job already indexed before this migration as already
-- seen, so the "New!" badge only ever applies to jobs discovered from here on.
UPDATE "Job" SET "viewedAt" = "firstSeen" WHERE "viewedAt" IS NULL;
