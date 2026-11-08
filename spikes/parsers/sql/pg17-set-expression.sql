ALTER TABLE "users" ALTER COLUMN "full_name" SET EXPRESSION AS (upper("handle"));
