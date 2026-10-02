-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "guest_ai_used" INTEGER NOT NULL DEFAULT 0;
