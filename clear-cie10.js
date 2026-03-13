import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  try {
    const deleted = await prisma.CIE10.deleteMany({});
    console.log(`🧹 Eliminados ${deleted.count} registros antiguos`);
    await prisma.$disconnect();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
