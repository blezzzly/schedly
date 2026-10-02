-- AlterTable
ALTER TABLE "users" ADD COLUMN "client_type" TEXT,
ADD COLUMN "last_seen_at" TIMESTAMP(3);
