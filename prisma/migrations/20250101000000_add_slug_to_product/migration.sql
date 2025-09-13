-- AddSlugToProduct migration
-- This migration adds a slug field to the Product table

-- Add slug column to Product table
ALTER TABLE "Product" ADD COLUMN "slug" TEXT;

-- Create unique index for slug
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- Update existing products with generated slugs
-- Note: This is a placeholder - in production, you would need to generate actual slugs
-- UPDATE "Product" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("name", ' ', '-'), '''', ''), '"', '')) WHERE "slug" IS NULL;

-- Make slug NOT NULL after updating existing records
-- ALTER TABLE "Product" ALTER COLUMN "slug" SET NOT NULL;
