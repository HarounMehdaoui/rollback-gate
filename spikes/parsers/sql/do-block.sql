-- Hand-written migrations sometimes contain procedural blocks.
DO $$
BEGIN
  UPDATE "users" SET "status" = 'active' WHERE "status" = 'draft';
END
$$;
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'active';
