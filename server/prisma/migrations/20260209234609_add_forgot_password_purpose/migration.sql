/*
  Warnings:

  - The values [USER] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `acceptedAt` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `counterAmount` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `counteredAt` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `rejectedAt` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `message` on the `SupportTicket` table. All the data in the column will be lost.
  - You are about to drop the `OfferEvent` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[reference]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paystackRef]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.
  - Made the column `reference` on table `Transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- AlterEnum
ALTER TYPE "InspectionStatus" ADD VALUE 'IN_PROGRESS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OfferStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "OfferStatus" ADD VALUE 'COMPLETED';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('BUYER', 'SELLER', 'INSPECTOR', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'BUYER';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'SALE';
ALTER TYPE "TransactionType" ADD VALUE 'INSPECTION_FEE';
ALTER TYPE "TransactionType" ADD VALUE 'INSPECTION_EARNING';

-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'FORGOT_PASSWORD';

-- DropForeignKey
ALTER TABLE "OfferEvent" DROP CONSTRAINT "OfferEvent_offerId_fkey";

-- DropIndex
DROP INDEX "Offer_buyerId_createdAt_idx";

-- DropIndex
DROP INDEX "Offer_carId_status_idx";

-- DropIndex
DROP INDEX "Offer_sellerId_status_idx";

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "location" TEXT,
ADD COLUMN     "priceType" TEXT DEFAULT 'Fixed',
ALTER COLUMN "price" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "images" SET DATA TYPE TEXT,
ALTER COLUMN "features" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "buyerId" TEXT,
ADD COLUMN     "fee" DECIMAL(65,30),
ALTER COLUMN "reportData" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "InspectorProfile" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "autopay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "officeName" TEXT;

-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "acceptedAt",
DROP COLUMN "counterAmount",
DROP COLUMN "counteredAt",
DROP COLUMN "expiresAt",
DROP COLUMN "notes",
DROP COLUMN "rejectedAt",
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "autopay" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "documents" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "SupportTicket" DROP COLUMN "message",
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "metadata" TEXT,
ADD COLUMN     "paystackRef" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "reference" SET NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "role" SET DEFAULT 'BUYER';

-- DropTable
DROP TABLE "OfferEvent";

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "autopay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewedCar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewedCar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionReport" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "exteriorScore" INTEGER NOT NULL DEFAULT 0,
    "interiorScore" INTEGER NOT NULL DEFAULT 0,
    "engineScore" INTEGER NOT NULL DEFAULT 0,
    "suspensionScore" INTEGER NOT NULL DEFAULT 0,
    "tiresScore" INTEGER NOT NULL DEFAULT 0,
    "lightsScore" INTEGER NOT NULL DEFAULT 0,
    "exteriorStatus" TEXT,
    "interiorStatus" TEXT,
    "engineStatus" TEXT,
    "suspensionStatus" TEXT,
    "tiresStatus" TEXT,
    "lightsStatus" TEXT,
    "recommendations" TEXT,
    "photos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "BuyerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewedCar_userId_carId_key" ON "ViewedCar"("userId", "carId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionReport_inspectionId_key" ON "InspectionReport"("inspectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_reference_key" ON "Transaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_paystackRef_key" ON "Transaction"("paystackRef");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewedCar" ADD CONSTRAINT "ViewedCar_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewedCar" ADD CONSTRAINT "ViewedCar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionReport" ADD CONSTRAINT "InspectionReport_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
