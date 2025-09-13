const { PrismaClient } = require("@prisma/client");
const { generateSlug } = require("../src/utils/slugGenerator");

const prisma = new PrismaClient();

async function generateSlugsForExistingProducts() {
  try {
    console.log("Starting slug generation for existing products...");

    // Get all products without slugs
    const products = await prisma.product.findMany({
      where: {
        slug: null,
      },
    });

    console.log(`Found ${products.length} products without slugs`);

    for (const product of products) {
      let baseSlug = generateSlug(product.name);
      let slug = baseSlug;
      let counter = 1;

      // Check if slug already exists and make it unique
      while (true) {
        const existing = await prisma.product.findUnique({
          where: { slug },
        });

        if (!existing) {
          break;
        }

        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      // Update product with generated slug
      await prisma.product.update({
        where: { id: product.id },
        data: { slug },
      });

      console.log(`Updated product "${product.name}" with slug: "${slug}"`);
    }

    console.log("Slug generation completed successfully!");
  } catch (error) {
    console.error("Error generating slugs:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
generateSlugsForExistingProducts();
