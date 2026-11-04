-- AlterEnum
ALTER TYPE "NotificationRecordKindType" ADD VALUE 'ticket_transfer';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "holderEmail" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "transferredFromCode" TEXT NOT NULL DEFAULT '';
