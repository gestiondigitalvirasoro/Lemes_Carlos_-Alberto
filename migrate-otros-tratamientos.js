import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔄 Agregando columna otros_tratamientos...');
    
    await prisma.$executeRawUnsafe(
      'ALTER TABLE consultas_medicas ADD COLUMN IF NOT EXISTS otros_tratamientos TEXT;'
    );
    
    console.log('✅ Columna otros_tratamientos agregada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
