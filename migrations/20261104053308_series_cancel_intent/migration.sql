-- AlterTable
ALTER TABLE "ShowGroup" ADD COLUMN     "cancelReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "cancelRequestedBy" TEXT,
ADD COLUMN     "cancelShowIds" JSONB;

-- CreateIndex
CREATE INDEX "ShowGroup_cancelRequestedBy_idx" ON "ShowGroup"("cancelRequestedBy");

-- AddForeignKey
ALTER TABLE "ShowGroup" ADD CONSTRAINT "ShowGroup_cancelRequestedBy_fkey" FOREIGN KEY ("cancelRequestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
