-- AlterTable
ALTER TABLE "Show" ADD COLUMN     "group" TEXT;

-- CreateTable
CREATE TABLE "ShowGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "groupKey" TEXT NOT NULL DEFAULT '',
    "sourceShow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShowGroup_groupKey_key" ON "ShowGroup"("groupKey");

-- CreateIndex
CREATE INDEX "ShowGroup_sourceShow_idx" ON "ShowGroup"("sourceShow");

-- CreateIndex
CREATE INDEX "Show_group_idx" ON "Show"("group");

-- AddForeignKey
ALTER TABLE "Show" ADD CONSTRAINT "Show_group_fkey" FOREIGN KEY ("group") REFERENCES "ShowGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowGroup" ADD CONSTRAINT "ShowGroup_sourceShow_fkey" FOREIGN KEY ("sourceShow") REFERENCES "Show"("id") ON DELETE SET NULL ON UPDATE CASCADE;
