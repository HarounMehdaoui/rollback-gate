-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "handle" VARCHAR(50) NOT NULL,
    "visits" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
