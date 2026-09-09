-- Retarget any jobs classified as UX_RESEARCH_MGR before the value is removed
-- (research roles are out of scope; they'll be filtered out on the next crawl).
UPDATE "Job" SET "track" = 'UX_DESIGN_MGR' WHERE "track" = 'UX_RESEARCH_MGR';

-- AlterEnum
BEGIN;
CREATE TYPE "Track_new" AS ENUM ('UX_DESIGN_MGR');
ALTER TABLE "Job" ALTER COLUMN "track" TYPE "Track_new" USING ("track"::text::"Track_new");
ALTER TYPE "Track" RENAME TO "Track_old";
ALTER TYPE "Track_new" RENAME TO "Track";
DROP TYPE "Track_old";
COMMIT;
