/*
  Warnings:

  - You are about to drop the column `role` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `star` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Payment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "role",
DROP COLUMN "star",
DROP COLUMN "type";
