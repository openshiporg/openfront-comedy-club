-- CreateEnum
CREATE TYPE "RunStatusType" AS ENUM ('scheduled', 'in_progress', 'closed');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "status" "RunStatusType" DEFAULT 'scheduled';
