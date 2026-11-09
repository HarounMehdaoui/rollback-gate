-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nickname" TEXT,
    "token" TEXT NOT NULL DEFAULT gen_random_uuid()::text,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
