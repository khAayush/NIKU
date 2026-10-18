-- Reminders are now stored in minutes (to allow "30 minutes before").
-- Rename the columns and convert existing values from hours to minutes, keeping the data.

-- User settings
ALTER TABLE "user" RENAME COLUMN "reminderHours" TO "reminderMinutes";
UPDATE "user" SET "reminderMinutes" = ARRAY(SELECT h * 60 FROM unnest("reminderMinutes") AS h);
ALTER TABLE "user" ALTER COLUMN "reminderMinutes" SET DEFAULT ARRAY[60]::INTEGER[];

-- Scheduled reminders
ALTER TABLE "task_reminder" RENAME COLUMN "hoursBefore" TO "minutesBefore";
UPDATE "task_reminder" SET "minutesBefore" = "minutesBefore" * 60 WHERE "minutesBefore" IS NOT NULL;
ALTER INDEX "task_reminder_taskId_hoursBefore_key" RENAME TO "task_reminder_taskId_minutesBefore_key";
