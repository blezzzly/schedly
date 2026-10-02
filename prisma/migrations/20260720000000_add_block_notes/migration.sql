-- AlterTable: Add block and notes columns to classes table
ALTER TABLE "classes" ADD COLUMN "block" TEXT;
ALTER TABLE "classes" ADD COLUMN "notes" TEXT;
