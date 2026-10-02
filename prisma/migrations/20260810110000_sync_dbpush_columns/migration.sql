-- Sync columns that were previously added via `prisma db push` on the old
-- Neon project and therefore missing from the migration history.

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "last_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "city" TEXT;