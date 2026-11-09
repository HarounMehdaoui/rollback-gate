-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT;

-- Backfill
UPDATE "User" SET "displayName" = "name";
