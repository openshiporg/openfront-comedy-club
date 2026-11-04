/*
  Warnings:

  - A unique constraint covering the columns `[waitlistEntry]` on the table `InventoryHold` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "NotificationRecordKindType" AS ENUM ('waitlist_offer');

-- CreateEnum
CREATE TYPE "NotificationRecordChannelType" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "NotificationRecordStatusType" AS ENUM ('queued', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "WaitlistEntryStatusType" AS ENUM ('waiting', 'offered', 'converted', 'expired', 'cancelled');

-- AlterTable
ALTER TABLE "InventoryHold" ADD COLUMN     "waitlistEntry" TEXT;

-- CreateTable
CREATE TABLE "NotificationRecord" (
    "id" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL DEFAULT '',
    "kind" "NotificationRecordKindType" DEFAULT 'waitlist_offer',
    "channel" "NotificationRecordChannelType" DEFAULT 'email',
    "toEmail" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "status" "NotificationRecordStatusType" DEFAULT 'queued',
    "sentAt" TIMESTAMP(3),
    "waitlistEntry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL DEFAULT '',
    "show" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "partySize" INTEGER DEFAULT 1,
    "status" "WaitlistEntryStatusType" DEFAULT 'waiting',
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecord_notificationKey_key" ON "NotificationRecord"("notificationKey");

-- CreateIndex
CREATE INDEX "NotificationRecord_waitlistEntry_idx" ON "NotificationRecord"("waitlistEntry");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_entryKey_key" ON "WaitlistEntry"("entryKey");

-- CreateIndex
CREATE INDEX "WaitlistEntry_show_idx" ON "WaitlistEntry"("show");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryHold_waitlistEntry_key" ON "InventoryHold"("waitlistEntry");

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_waitlistEntry_fkey" FOREIGN KEY ("waitlistEntry") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecord" ADD CONSTRAINT "NotificationRecord_waitlistEntry_fkey" FOREIGN KEY ("waitlistEntry") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_show_fkey" FOREIGN KEY ("show") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;
