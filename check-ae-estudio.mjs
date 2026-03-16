import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const estudios = await prisma.estudioComplementario.findMany({
    where: { consulta_id: 2n },
    select: { 
      id: true, 
      tipo_estudio: true, 
      resultado: true, 
      observaciones: true,
      fecha_estudio: true 
    },
    orderBy: { id: 'asc' }
  });
  
  console.log('Estudios en consulta 2:\n');
  estudios.forEach((e, idx) => {
    console.log(`${idx + 1}. ${e.tipo_estudio} | ${e.resultado} | ${e.observaciones}`);
    console.log(`   Fecha: ${e.fecha_estudio} (${typeof e.fecha_estudio})`);
  });
  
  await prisma.$disconnect();
}

main();
