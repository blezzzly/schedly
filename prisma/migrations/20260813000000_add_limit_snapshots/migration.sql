-- CreateTable
CREATE TABLE "limit_snapshots" (
    "service" TEXT NOT NULL,
    "remaining" INTEGER,
    "limit" INTEGER,
    "reset_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "limit_snapshots_pkey" PRIMARY KEY ("service")
);
