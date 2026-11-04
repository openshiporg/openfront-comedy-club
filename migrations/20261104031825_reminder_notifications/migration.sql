-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationRecordKindType" ADD VALUE 'show_reminder';
ALTER TYPE "NotificationRecordKindType" ADD VALUE 'lineup_confirmation';

-- AlterEnum
ALTER TYPE "NotificationRecordStatusType" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "NotificationRecord" ADD COLUMN     "sendAfter" TIMESTAMP(3),
ADD COLUMN     "show" TEXT;

-- CreateIndex
CREATE INDEX "NotificationRecord_show_idx" ON "NotificationRecord"("show");

-- AddForeignKey
ALTER TABLE "NotificationRecord" ADD CONSTRAINT "NotificationRecord_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;
