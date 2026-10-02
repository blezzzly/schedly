-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_service_date_key" ON "usage_counters"("service", "date");

-- CreateIndex
CREATE INDEX "usage_counters_service_idx" ON "usage_counters"("service");
