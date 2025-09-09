const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing data
  await prisma.profile.deleteMany();
  await prisma.user.deleteMany();

  console.log("🗑️  Cleared existing data");

  // Create admin user
  console.log("👤 Creating admin user...");
  const adminPassword = await bcrypt.hash("admin123", 12);

  const adminUser = await prisma.user.create({
    data: {
      username: "admin",
      password: adminPassword,
      role: "admin",
    },
  });

  // Create admin profile
  const adminProfile = await prisma.profile.create({
    data: {
      fullName: "Administrator",
      bio: "System Administrator",
      userId: adminUser.id,
    },
  });

  console.log("✅ Admin user created:");
  console.log(`   Username: admin`);
  console.log(`   Password: admin123`);
  console.log(`   Role: admin`);
  console.log(`   Profile ID: ${adminProfile.id}`);

  console.log("🎉 Seed completed successfully!");
  console.log("👤 Admin user ready to use");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
