import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  try {
    const count = await prisma.CIE10.count();
    console.log(`✅ Total códigos CIE-10 cargados: ${count}`);
    
    const ejemplos = await prisma.CIE10.findMany({ 
      take: 10,
      orderBy: { codigo: 'asc' }
    });
    
    console.log('\n📋 Primeros 10 ejemplos:');
    ejemplos.forEach(item => {
      console.log(`  ${item.codigo} - ${item.descripcion}`);
    });

    // Contar por capítulo
    if (ejemplos[0]?.capitulo) {
      const capítulos = await prisma.CIE10.groupBy({
        by: ['capitulo'],
        _count: true,
      });
      console.log(`\n📚 Distribución por capítulos: ${capítulos.length} capítulos`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
