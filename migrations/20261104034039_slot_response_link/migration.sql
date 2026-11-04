-- AlterEnum
ALTER TYPE "NotificationRecordKindType" ADD VALUE 'lineup_invite';

-- AlterTable
ALTER TABLE "LineupSlot" ADD COLUMN     "responseTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "responseTokenHash" TEXT NOT NULL DEFAULT '';
