-- AlterTable
ALTER TABLE "users" ADD COLUMN "widget_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_widget_token_key" ON "users"("widget_token");
