/*
  Warnings:

  - You are about to drop the column `notes` on the `Shipped` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Shipped" DROP COLUMN "notes",
ADD COLUMN     "shippingNotes" TEXT,
ADD COLUMN     "userNotes" TEXT;
