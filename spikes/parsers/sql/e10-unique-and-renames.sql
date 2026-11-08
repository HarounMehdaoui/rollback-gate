
-- DropIndex
DROP INDEX "User_email_key";

-- AlterTable
ALTER TABLE "User" RENAME CONSTRAINT "User_pk_old" TO "User_pk_new";

-- RenameForeignKey
ALTER TABLE "Post" RENAME CONSTRAINT "Post_author_old_fkey" TO "Post_author_new_fkey";

-- RenameIndex
ALTER INDEX "User_name_old_idx" RENAME TO "User_name_new_idx";

