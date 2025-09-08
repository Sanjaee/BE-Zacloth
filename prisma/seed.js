const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

// Helper function to generate random data
const getRandomElement = (array) =>
  array[Math.floor(Math.random() * array.length)];
const getRandomElements = (array, count) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Generate UUID-like string
const generateId = () => crypto.randomUUID();

// Data arrays for generating random products
const brands = [
  "Nike",
  "Adidas",
  "Puma",
  "New Balance",
  "Under Armour",
  "Reebok",
  "Converse",
  "Vans",
];
const categories = ["APPAREL", "FOOTWEAR", "ACCESSORIES"];
const genders = ["MEN", "WOMEN", "UNISEX"];
const subCategories = {
  APPAREL: [
    "Running",
    "Training",
    "Basketball",
    "Football",
    "Lifestyle",
    "Outdoor",
  ],
  FOOTWEAR: [
    "Running",
    "Basketball",
    "Training",
    "Lifestyle",
    "Outdoor",
    "Football",
  ],
  ACCESSORIES: ["Bags", "Hats", "Socks", "Gloves", "Watches", "Sunglasses"],
};
const colors = [
  "Black",
  "White",
  "Red",
  "Blue",
  "Green",
  "Yellow",
  "Orange",
  "Purple",
  "Pink",
  "Gray",
  "Brown",
  "Navy",
  "Royal Blue",
  "Forest Green",
  "Crimson",
];
const sizes = {
  APPAREL: ["XS", "S", "M", "L", "XL", "XXL"],
  FOOTWEAR: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
  ACCESSORIES: ["One Size", "S", "M", "L"],
};

// Product name templates
const productNames = {
  Nike: [
    "Air Max",
    "Air Force",
    "Dri-FIT",
    "React",
    "Zoom",
    "Free",
    "Pegasus",
    "VaporMax",
    "Blazer",
    "Dunk",
    "Jordan",
    "LeBron",
    "Kyrie",
    "KD",
    "PG",
  ],
  Adidas: [
    "Ultraboost",
    "NMD",
    "Stan Smith",
    "Superstar",
    "Gazelle",
    "Samba",
    "Forum",
    "Terrex",
    "Adizero",
    "Predator",
    "Copa",
    "Nemeziz",
  ],
  Puma: [
    "Suede",
    "Clyde",
    "RS-X",
    "Thunder",
    "Cell",
    "Future",
    "Roma",
    "Basket",
    "Cali",
    "Rider",
    "Disc",
    "Ignite",
  ],
  "New Balance": [
    "990",
    "574",
    "327",
    "530",
    "997",
    "1500",
    "2002R",
    "1080",
    "880",
    "FuelCell",
  ],
  "Under Armour": [
    "Charged",
    "HOVR",
    "Micro G",
    "Speedform",
    "HeatGear",
    "ColdGear",
    "Storm",
  ],
  Reebok: [
    "Classic",
    "Club C",
    "Workout",
    "Nano",
    "CrossFit",
    "Zig",
    "Floatride",
  ],
  Converse: [
    "Chuck Taylor",
    "One Star",
    "Jack Purcell",
    "Pro Leather",
    "Fastbreak",
  ],
  Vans: [
    "Old Skool",
    "Sk8-Hi",
    "Authentic",
    "Era",
    "Slip-On",
    "Half Cab",
    "Chukka",
  ],
};

// Generate random product data
const generateProduct = (index) => {
  const brand = getRandomElement(brands);
  const category = getRandomElement(categories);
  const isOnSale = Math.random() < 0.3; // 30% chance of being on sale
  const isNikeByYou = brand === "Nike" && Math.random() < 0.1; // 10% chance for Nike products

  // Generate prices
  const basePrice = Math.floor(Math.random() * 2000000) + 100000; // 100k - 2.1M
  const fullPrice = basePrice;
  const currentPrice = isOnSale
    ? Math.floor(basePrice * (0.7 + Math.random() * 0.2))
    : basePrice;

  // Generate product name
  const nameTemplate = getRandomElement(
    productNames[brand] || productNames.Nike
  );
  const productName = `${brand} ${nameTemplate} ${getRandomElement([
    "Pro",
    "Max",
    "Ultra",
    "Elite",
    "Premium",
    "Sport",
    "Active",
    "Core",
  ])}`;

  // Generate SKU data
  const availableSizes = getRandomElements(
    sizes[category],
    Math.floor(Math.random() * 4) + 2
  );
  const skuData = availableSizes.map((size) => ({
    size,
    sku: generateId(),
    gtin: (
      Math.floor(Math.random() * 90000000000000) + 10000000000000
    ).toString(), // 13-digit GTIN
  }));

  // Generate subcategories
  const productSubCategories = getRandomElements(
    subCategories[category],
    Math.floor(Math.random() * 2) + 1
  );

  // Generate genders
  const productGenders = getRandomElements(
    genders,
    Math.random() < 0.7 ? 1 : 2
  );

  return {
    isOnSale,
    isNikeByYou,
    catalogId: generateId(),
    brand,
    category,
    cloudProductId: generateId(),
    color: getRandomElement(colors),
    country: "id",
    currentPrice,
    fullPrice,
    name: productName,
    prodigyId: (Math.floor(Math.random() * 9000000000) + 1000000000).toString(),
    imageUrl: `https://static.nike.com/a/images/c_limit,w_592,f_auto/t_product_v1/u_126ab356-44d8-4a06-89b4-fcdcc8df0245,c_scale,fl_relative,w_1.0,h_1.0,fl_layer_apply/05fc58ef-342e-4ab4-af06-7b7bf21993d5/M+J+BRK+DRAFT+JKT+AOP.png`,
    skuData,
    subCategories: productSubCategories,
    genders: productGenders,
  };
};

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing data
  await prisma.skuData.deleteMany();
  await prisma.subCategory.deleteMany();
  await prisma.gender.deleteMany();
  await prisma.product.deleteMany();

  console.log("🗑️  Cleared existing data");

  // Generate 100 products
  const products = [];
  for (let i = 0; i < 1000; i++) {
    products.push(generateProduct(i));
  }

  console.log("📦 Generated 1000 products");

  // Insert products with relations
  for (const productData of products) {
    const { skuData, subCategories, genders, ...productInfo } = productData;

    const product = await prisma.product.create({
      data: {
        ...productInfo,
        skuData: {
          create: skuData,
        },
        subCategories: {
          create: subCategories.map((name) => ({ name })),
        },
        genders: {
          create: genders.map((type) => ({ type })),
        },
      },
    });

    console.log(`✅ Created product: ${product.name}`);
  }

  console.log("🎉 Seed completed successfully!");
  console.log(`📊 Created ${products.length} products with all relations`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
