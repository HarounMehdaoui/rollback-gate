-- Hand-written conversion
ALTER TABLE "User" ALTER COLUMN "visits" TYPE TEXT USING ("visits"::text);
