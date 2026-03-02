-- CreateEnum
CREATE TYPE "DriveType" AS ENUM ('REAR_WHEEL', 'FRONT_WHEEL', 'ALL_WHEEL', 'FOUR_WHEEL');

-- AlterTable
ALTER TABLE "Car" ADD COLUMN     "driveType" "DriveType";
