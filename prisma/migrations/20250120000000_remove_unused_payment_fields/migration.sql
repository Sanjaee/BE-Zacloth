/*
  Warnings:

  - You are about to drop the column `snapToken` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "snapToken",
DROP COLUMN "transactionId";
