-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" DROP NOT NULL;

-- Backfill (hand-written): rows R1 wrote during the rollout
UPDATE "User" SET "fullName" = "name" WHERE "fullName" IS NULL;
