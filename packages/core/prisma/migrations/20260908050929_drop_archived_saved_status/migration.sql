-- Retarget any existing ARCHIVED saved rows before the enum value is removed,
-- otherwise the column cast below fails.
UPDATE "SavedJob" SET "status" = 'SAVED' WHERE "status" = 'ARCHIVED';

-- AlterEnum
BEGIN;
CREATE TYPE "SavedStatus_new" AS ENUM ('SAVED', 'APPLIED');
ALTER TABLE "SavedJob" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "SavedJob" ALTER COLUMN "status" TYPE "SavedStatus_new" USING ("status"::text::"SavedStatus_new");
ALTER TYPE "SavedStatus" RENAME TO "SavedStatus_old";
ALTER TYPE "SavedStatus_new" RENAME TO "SavedStatus";
DROP TYPE "SavedStatus_old";
ALTER TABLE "SavedJob" ALTER COLUMN "status" SET DEFAULT 'SAVED';
COMMIT;
