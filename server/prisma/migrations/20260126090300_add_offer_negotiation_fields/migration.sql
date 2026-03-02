-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "counterAmount" DECIMAL(12,2),
ADD COLUMN     "counteredAt" TIMESTAMP(3),
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_carId_status_idx" ON "Offer"("carId", "status");

-- CreateIndex
CREATE INDEX "Offer_sellerId_status_idx" ON "Offer"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Offer_buyerId_createdAt_idx" ON "Offer"("buyerId", "createdAt");

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
