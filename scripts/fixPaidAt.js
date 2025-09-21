const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixPaidAt() {
  try {
    console.log("Starting to fix paidAt fields...");

    // Find all payments with SUCCESS status but null paidAt
    const paymentsToFix = await prisma.payment.findMany({
      where: {
        status: "SUCCESS",
        paidAt: null,
      },
    });

    console.log(`Found ${paymentsToFix.length} payments to fix`);

    // Update each payment with the createdAt date as paidAt
    for (const payment of paymentsToFix) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          paidAt: payment.createdAt, // Use createdAt as the paid date
        },
      });
      console.log(`Fixed payment ${payment.orderId}`);
    }

    console.log("All payments fixed successfully!");
  } catch (error) {
    console.error("Error fixing paidAt fields:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPaidAt();
