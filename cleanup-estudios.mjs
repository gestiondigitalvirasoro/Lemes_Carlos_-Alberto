import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient({
  errorFormat: 'pretty'
});

async function cleanup() {
  try {
    console.log('🧹 Iniciando limpieza de estudios duplicados...\n');
    
    // Prueba de conexión
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexión a BD: OK\n');

    // Obtener todas las consultas con estudios
    const estudiosTotal = await prisma.estudioComplementario.count();
    console.log(`📊 Total de estudios antes: ${estudiosTotal}\n`);

    // Buscar duplicados por consulta
    const duplicados = await prisma.$queryRaw`
      SELECT 
        consulta_id,
        tipo_estudio,
        resultado,
        observaciones,
        COUNT(*) as cantidad,
        array_agg(id) as ids
      FROM "estudios_complementarios"
      GROUP BY consulta_id, tipo_estudio, resultado, observaciones
      HAVING COUNT(*) > 1
      ORDER BY cantidad DESC
    `;

    console.log(`🔍 Combinaciones duplicadas encontradas: ${duplicados.length}\n`);

    let totalEliminados = 0;

    for (const dupli of duplicados) {
      console.log(`📋 Consulta ${dupli.consulta_id}:`);
      console.log(`   Tipo: ${dupli.tipo_estudio}`);
      console.log(`   Cantidad: ${dupli.cantidad}`);
      
      const idsArray = dupli.ids;
      const idsAEliminar = idsArray.slice(1); // Mantener el primero

      if (idsAEliminar.length > 0) {
        await prisma.estudioComplementario.deleteMany({
          where: {
            id: { in: idsAEliminar }
          }
        });
        console.log(`   ✅ Eliminados: ${idsAEliminar.length}\n`);
        totalEliminados += idsAEliminar.length;
      }
    }

    const estudiosFinales = await prisma.estudioComplementario.count();
    console.log(`\n✨ LIMPIEZA FINALIZADA`);
    console.log(`   Eliminados: ${totalEliminados}`);
    console.log(`   Estudios antes: ${estudiosTotal}`);
    console.log(`   Estudios después: ${estudiosFinales}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('Código:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
