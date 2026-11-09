-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fullName" TEXT;

-- Backfill (hand-written): copy the existing names
UPDATE "User" SET "fullName" = "name";
