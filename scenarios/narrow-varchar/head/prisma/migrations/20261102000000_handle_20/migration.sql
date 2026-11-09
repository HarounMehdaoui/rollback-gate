/*
  Warnings:

  - You are about to alter the column `handle` on the `User` table. The data in that column could be lost. The data in that column will be cast from `VarChar(50)` to `VarChar(20)`.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "handle" SET DATA TYPE VARCHAR(20);
