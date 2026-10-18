/*
  Warnings:

  - You are about to drop the column `remindAt` on the `task` table. All the data in the column will be lost.
  - You are about to drop the column `reminderJobId` on the `task` table. All the data in the column will be lost.
  - You are about to drop the column `reminderOffsetMinutes` on the `task` table. All the data in the column will be lost.
  - You are about to drop the column `reminderSentAt` on the `task` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "task_remindAt_idx";

-- AlterTable
ALTER TABLE "task" DROP COLUMN "remindAt",
DROP COLUMN "reminderJobId",
DROP COLUMN "reminderOffsetMinutes",
DROP COLUMN "reminderSentAt";

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "reminderHours" INTEGER[] DEFAULT ARRAY[1]::INTEGER[];

-- CreateTable
CREATE TABLE "task_reminder" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "hoursBefore" INTEGER,
    "remindAt" TIMESTAMPTZ(3) NOT NULL,
    "jobId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_reminder_remindAt_idx" ON "task_reminder"("remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_reminder_taskId_hoursBefore_key" ON "task_reminder"("taskId", "hoursBefore");

-- AddForeignKey
ALTER TABLE "task_reminder" ADD CONSTRAINT "task_reminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
