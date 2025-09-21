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

  // Create staff user
  console.log("👤 Creating staff user...");
  const staffPassword = await bcrypt.hash("staff123", 12);

  const staffUser = await prisma.user.create({
    data: {
      username: "staff",
      password: staffPassword,
      role: "staff",
    },
  });

  // Create staff profile
  const staffProfile = await prisma.profile.create({
    data: {
      fullName: "Staff Member",
      bio: "Store Staff Member",
      userId: staffUser.id,
    },
  });

  console.log("✅ Staff user created:");
  console.log(`   Username: staff`);
  console.log(`   Password: staff123`);
  console.log(`   Role: staff`);
  console.log(`   Profile ID: ${staffProfile.id}`);

  console.log("🎉 Seed completed successfully!");
  console.log("👤 Admin and Staff users ready to use");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
