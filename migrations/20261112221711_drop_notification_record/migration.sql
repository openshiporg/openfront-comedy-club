-- DropForeignKey
ALTER TABLE "NotificationRecord" DROP CONSTRAINT "NotificationRecord_show_fkey";

-- DropForeignKey
ALTER TABLE "NotificationRecord" DROP CONSTRAINT "NotificationRecord_waitlistEntry_fkey";

-- DropTable
DROP TABLE "NotificationRecord";

-- DropEnum
DROP TYPE "NotificationRecordChannelType";

-- DropEnum
DROP TYPE "NotificationRecordKindType";

-- DropEnum
DROP TYPE "NotificationRecordStatusType";
