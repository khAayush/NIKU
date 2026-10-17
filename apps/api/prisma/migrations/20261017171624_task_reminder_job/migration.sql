-- AlterTable
ALTER TABLE "task" ADD COLUMN     "reminderJobId" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMPTZ(3);
