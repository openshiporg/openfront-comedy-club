-- CreateTable
CREATE TABLE "InventoryHoldLine" (
    "id" TEXT NOT NULL,
    "hold" TEXT,
    "priceTier" TEXT,
    "quantity" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryHoldLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryHoldLine_hold_idx" ON "InventoryHoldLine"("hold");

-- CreateIndex
CREATE INDEX "InventoryHoldLine_priceTier_idx" ON "InventoryHoldLine"("priceTier");

-- AddForeignKey
ALTER TABLE "InventoryHoldLine" ADD CONSTRAINT "InventoryHoldLine_hold_fkey" FOREIGN KEY ("hold") REFERENCES "InventoryHold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHoldLine" ADD CONSTRAINT "InventoryHoldLine_priceTier_fkey" FOREIGN KEY ("priceTier") REFERENCES "PriceTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
